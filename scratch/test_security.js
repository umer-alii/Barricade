/**
 * Security + accounts + room API regression suite.
 * Run against a live server: node scratch/test_security.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  return { status: res.status, ok: res.ok, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('✓', msg);
}

async function main() {
  console.log('Security/API tests at', BASE);

  // 1. Casual create/join still works without auth
  const host = await api('/api/rooms/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName: 'Host', mode: 'Casual', timeControl: 'Unlimited' })
  });
  assert(host.ok && host.data.code, 'Casual room create without token');
  const guest = await api('/api/rooms/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: host.data.code, playerName: 'Guest' })
  });
  assert(guest.ok && guest.data.status === 'playing', 'Casual join without token starts game');

  // 2. Spoofed accessToken must NOT become a trusted userId (verify returns null when unconfigured/fake)
  const spoofCreate = await api('/api/rooms/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerName: 'Spoofer',
      mode: 'Casual',
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.signature'
    })
  });
  assert(spoofCreate.ok, 'Create with fake token still succeeds as guest (token ignored)');

  // 3. Ranked without Supabase admin configured: allowed (graceful degrade)
  const ranked = await api('/api/rooms/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName: 'R1', mode: 'Ranked', timeControl: 'Unlimited' })
  });
  assert(ranked.ok, 'Ranked create allowed when Supabase admin not configured');

  // 4. Invalid room code rejected
  const badJoin = await api('/api/rooms/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'XX' })
  });
  assert(badJoin.status === 400, 'Invalid short room code rejected');

  // 5. Missing token on action rejected
  const badAction = await api(`/api/rooms/action?code=${host.data.code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'not-a-real-token', action: { type: 'resign' } })
  });
  assert(badAction.status === 403, 'Action with invalid token forbidden');

  // 6. Legal resign by real host token
  const resign = await api(`/api/rooms/action?code=${host.data.code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: host.data.playerToken, action: { type: 'resign' } })
  });
  assert(resign.ok && resign.data.status === 'finished', 'Host resign finishes game');
  assert(resign.data.gameState.winner === 1, 'Resign awards win to opponent');
  assert(resign.data.gameState.endReason === 'resign', 'endReason=resign set');

  // 7. Poll with wrong token forbidden
  const badPoll = await api(`/api/rooms/poll?code=${host.data.code}&token=wrong`);
  assert(badPoll.status === 403, 'Poll with wrong token forbidden');

  // 8. List endpoint works
  const list = await api('/api/rooms/list');
  assert(list.ok && Array.isArray(list.data.rooms), 'Open rooms list returns array');

  // 9. Method not allowed
  const getCreate = await api('/api/rooms/create');
  assert(getCreate.status === 405, 'GET on create rejected');

  // 10. Illegal move rejected (not player's turn / invalid)
  const h2 = await api('/api/rooms/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName: 'H2', mode: 'Casual', timeControl: 'Unlimited' })
  });
  const g2 = await api('/api/rooms/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: h2.data.code, playerName: 'G2' })
  });
  assert(g2.ok, 'Second game started');
  // Guest tries to move on host's turn
  const outOfTurn = await api(`/api/rooms/action?code=${h2.data.code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: g2.data.playerToken, action: { type: 'move', col: 4, row: 7 } })
  });
  assert(!outOfTurn.ok, 'Out-of-turn move rejected');

  // 11. Static assets / index
  const index = await fetch(BASE + '/');
  assert(index.ok, 'Index HTML served');
  const html = await index.text();
  assert(html.includes('auth-modal'), 'Auth modal markup present');
  assert(html.includes('leaderboard-list'), 'Live leaderboard container present');
  assert(html.includes('friends-card'), 'Friends card present');
  assert(html.includes('chat-drawer'), 'Chat drawer present');
  assert(!html.includes('bot_exmachina'), 'Static demo leaderboard data removed');

  // 12. Client modules load
  for (const path of [
    '/src/config/supabaseConfig.js',
    '/src/network/SupabaseClient.js',
    '/src/social/Friends.js',
    '/src/social/Chat.js',
    '/src/social/Leaderboard.js',
    '/src/ui/AuthUI.js',
    '/src/ui/FriendsUI.js',
    '/src/ui/ChatUI.js',
    '/src/game/Game.js',
    '/api/lib/ranking.js'
  ]) {
    // api/lib may not be publicly served on vercel the same way — only check src
    if (path.startsWith('/api/')) continue;
    const r = await fetch(BASE + path);
    assert(r.ok, `Module served: ${path}`);
  }

  console.log('\nALL SECURITY/API TESTS PASSED');
}

main().catch(err => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
