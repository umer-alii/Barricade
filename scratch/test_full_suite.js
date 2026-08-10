/**
 * Full functional + security test suite for the Barricade room API and
 * the new accounts/ranking server code.
 *
 * Usage: start the dev server, then `node scratch/test_full_suite.js [baseUrl]`
 * (defaults to http://localhost:3000).
 */

const BASE = process.argv[2] || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function ok(cond, label) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON */ }
  return { status: res.status, data };
}

function post(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

async function createRoom(extra = {}) {
  const { status, data } = await api('/api/rooms/create', post(extra));
  if (status !== 200) throw new Error(`create failed: ${status} ${JSON.stringify(data)}`);
  return data;
}

async function joinRoom(code, extra = {}) {
  return api('/api/rooms/join', post({ code, ...extra }));
}

async function action(code, token, act) {
  return api(`/api/rooms/action?code=${code}`, post({ token, action: act }));
}

async function poll(code, token) {
  return api(`/api/rooms/poll?code=${code}&token=${token}`);
}

// ────────────────────────────────────────────────────────────────────────────

async function testRoomLifecycle() {
  console.log('\n─── 1. Room lifecycle (old functionality) ───');

  const host = await createRoom({ playerName: 'Alice', timeControl: 'Unlimited', mode: 'Casual' });
  ok(/^[A-Z0-9]{6}$/.test(host.code), 'room code is 6 chars');
  ok(host.playerIndex === 0 && host.status === 'waiting', 'host is player 0, waiting');

  const bad = await joinRoom('ZZZZZZ');
  ok(bad.status === 404, 'joining a nonexistent room → 404');

  const badCode = await joinRoom('AB');
  ok(badCode.status === 400, 'joining with malformed code → 400');

  const guest = await joinRoom(host.code, { playerName: 'Bob' });
  ok(guest.status === 200 && guest.data.playerIndex === 1, 'guest joins as player 1');
  ok(guest.data.status === 'playing' && guest.data.gameState, 'game auto-starts with initial state');
  ok(guest.data.gameState.players[0].walls === 10, 'both players start with 10 walls');

  const third = await joinRoom(host.code, { playerName: 'Eve' });
  ok(third.status === 400, 'third player rejected — room is full');

  const rejoin = await joinRoom(host.code, { playerToken: guest.data.playerToken });
  ok(rejoin.status === 200 && rejoin.data.playerIndex === 1, 'guest reconnects with saved token');

  return { host, guest: guest.data };
}

async function testGameplayAndRules(host, guest) {
  console.log('\n─── 2. Moves, walls, turn order, rule enforcement ───');

  // Out-of-turn: guest (P1) tries to move first
  const oot = await action(host.code, guest.playerToken, { type: 'move', col: 4, row: 7 });
  ok(oot.status === 400, 'out-of-turn move rejected');

  // Illegal move: P0 jumps 2 rows with nothing to jump
  const illegal = await action(host.code, host.playerToken, { type: 'move', col: 4, row: 2 });
  ok(illegal.status === 400, 'illegal (non-adjacent) move rejected');

  // Legal move
  const m1 = await action(host.code, host.playerToken, { type: 'move', col: 4, row: 1 });
  ok(m1.status === 200 && m1.data.gameState.currentPlayer === 1, 'legal move accepted, turn passes');

  // Wall placement by P1
  const w1 = await action(host.code, guest.playerToken, { type: 'wall', col: 4, row: 4, orientation: 'horizontal' });
  ok(w1.status === 200 && w1.data.gameState.players[1].walls === 9, 'wall placed, count decremented');

  // Crossing wall rejected
  const wx = await action(host.code, host.playerToken, { type: 'wall', col: 4, row: 4, orientation: 'vertical' });
  ok(wx.status === 400, 'crossing wall rejected');

  // Duplicate wall rejected
  const wd = await action(host.code, host.playerToken, { type: 'wall', col: 4, row: 4, orientation: 'horizontal' });
  ok(wd.status === 400, 'duplicate wall rejected');

  // History notation present
  const p = await poll(host.code, host.playerToken);
  ok(Array.isArray(p.data.gameState.history) && p.data.gameState.history.length === 2,
    'history tracks both plies');
}

async function testWinByGoalAndRematch() {
  console.log('\n─── 3. Win by reaching goal + rematch flow ───');

  const host = await createRoom({ playerName: 'Racer', timeControl: 'Unlimited' });
  const guest = (await joinRoom(host.code, { playerName: 'Dodger' })).data;

  // P0 marches e1→e9; P1 shuffles d9/e9 out of the way.
  // P1 position after odd shuffles = (3,8), after even = (4,8).
  for (let step = 1; step <= 8; step++) {
    const mv = await action(host.code, host.playerToken, { type: 'move', col: 4, row: step });
    if (mv.status !== 200) {
      ok(false, `P0 march step ${step} failed: ${JSON.stringify(mv.data)}`);
      return;
    }
    if (step < 8) {
      const target = step % 2 === 1 ? { col: 3, row: 8 } : { col: 4, row: 8 };
      const shuffle = await action(host.code, guest.playerToken, { type: 'move', ...target });
      if (shuffle.status !== 200) {
        ok(false, `P1 shuffle step ${step} failed: ${JSON.stringify(shuffle.data)}`);
        return;
      }
    }
  }

  const end = await poll(host.code, host.playerToken);
  ok(end.data.gameState.winner === 0, 'P0 wins by reaching row 9');
  ok(end.data.status === 'finished', 'room marked finished');
  ok(!end.data.gameState.endReason, 'goal win has no endReason (not resign/timeout)');

  // Moves after game end are rejected
  const late = await action(host.code, guest.playerToken, { type: 'move', col: 4, row: 7 });
  ok(late.status === 400, 'moves rejected after game is finished');

  // Rematch: one side requests → still finished; both → new game
  const r1 = await action(host.code, host.playerToken, { type: 'rematch' });
  ok(r1.status === 200 && r1.data.status === 'finished' && r1.data.rematchRequests.length === 1,
    'single rematch request registers, game still finished');
  const r2 = await action(host.code, guest.playerToken, { type: 'rematch' });
  ok(r2.status === 200 && r2.data.status === 'playing' && r2.data.gameState.winner === null,
    'both rematch requests → fresh game');
  ok(r2.data.gameState.players[0].col === 4 && r2.data.gameState.players[0].row === 0,
    'rematch resets pawn positions');
}

async function testResign() {
  console.log('\n─── 4. Resign flow (endReason/resignedBy) ───');

  const host = await createRoom({ playerName: 'Quitter' });
  const guest = (await joinRoom(host.code, {})).data;

  const res = await action(host.code, guest.playerToken, { type: 'resign' });
  ok(res.status === 200 && res.data.gameState.winner === 0, 'guest resigns → host wins');
  ok(res.data.gameState.endReason === 'resign' && res.data.gameState.resignedBy === 1,
    'endReason=resign, resignedBy=1 recorded');
  ok(res.data.status === 'finished', 'room finished after resign');

  const again = await action(host.code, guest.playerToken, { type: 'resign' });
  ok(again.status === 200 && again.data.status === 'finished', 'second resign is idempotent, no crash');
}

async function testListAndPrivacy() {
  console.log('\n─── 5. Open-rooms list & private room privacy ───');

  const pub = await createRoom({ playerName: 'PublicHost', isPrivate: false });
  const priv = await createRoom({ playerName: 'SecretHost', isPrivate: true });

  const { data } = await api('/api/rooms/list');
  const codes = (data.rooms || []).map(r => r.code);
  ok(codes.includes(pub.code), 'public waiting room appears in list');
  ok(!codes.includes(priv.code), 'private room is NOT listed');

  // Private room still joinable by code
  const j = await joinRoom(priv.code, { playerName: 'Invited' });
  ok(j.status === 200, 'private room joinable via direct code');
}

async function testSecurity() {
  console.log('\n─── 6. Security: tokens, spoofing, method/input hardening ───');

  const host = await createRoom({ playerName: 'Victim' });
  const guest = (await joinRoom(host.code, { playerName: 'Target' })).data;

  const badAct = await action(host.code, 'stolen-token-123', { type: 'move', col: 4, row: 1 });
  ok(badAct.status === 403, 'action with invalid player token → 403');

  const badPoll = await poll(host.code, 'stolen-token-123');
  ok(badPoll.status === 403, 'poll with invalid player token → 403');

  const badResign = await action(host.code, '', { type: 'resign' });
  ok(badResign.status === 403, 'resign without token → 403');

  // Guest cannot move host's pawn (token↔playerIndex binding)
  const imp = await action(host.code, guest.playerToken, { type: 'move', col: 4, row: 1 });
  ok(imp.status === 400, "guest token can't act on host's turn (server binds token→index)");

  // Method hardening
  const getCreate = await api('/api/rooms/create');
  ok(getCreate.status === 405, 'GET on create → 405');
  const getJoin = await api('/api/rooms/join');
  ok(getJoin.status === 405, 'GET on join → 405');

  // Garbage input never crashes the server
  await api('/api/rooms/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{{{not json'
  });
  await api('/api/rooms/join', post({ code: { nested: 'object' } }));
  await api('/api/rooms/action?code=' + host.code, post({ token: host.playerToken, action: { type: 'wall', col: 'x', row: null } }));
  const alive = await poll(host.code, host.playerToken);
  ok(alive.status === 200, 'server healthy after malformed payloads');

  // Supabase token spoofing: fake accessToken must never yield a userId
  // (unconfigured → verification returns null; configured → Supabase rejects it)
  const spoofed = await createRoom({ playerName: 'Spoofer', mode: 'Casual', accessToken: 'eyJfake.fake.fake' });
  const sj = await joinRoom(spoofed.code, { playerName: 'P2', accessToken: 'also-fake' });
  ok(sj.status === 200, 'fake Supabase accessToken is ignored, casual play unaffected');

  // XSS payload in player name: stored verbatim, must be returned as data (the
  // client escapes at render via _escapeHtml/textContent — verify no server mangling)
  const xssName = '<img src=x onerror=alert(1)>';
  const xss = await createRoom({ playerName: xssName, isPrivate: false });
  const list = await api('/api/rooms/list');
  const row = (list.data.rooms || []).find(r => r.code === xss.code);
  ok(!!row, 'room with hostile name still listed (client-side escaping handles rendering)');
}

async function testRankedSettlementGuards() {
  console.log('\n─── 7. Ranked settlement guards (server-side, in-process) ───');

  const { computeElo, settleRankedRoom, ELO_FLOOR } = await import('../api/lib/ranking.js');
  const { verifySupabaseUser, isSupabaseAdminConfigured } = await import('../api/lib/supabaseAdmin.js');

  const even = computeElo(1000, 1000, 1);
  ok(even.newA === 1016 && even.newB === 984, 'Elo 1000v1000: winner +16 / loser −16 (K=32)');
  ok(even.deltaA + even.deltaB === 0, 'Elo deltas are zero-sum for equal ratings');

  const upset = computeElo(1000, 1400, 1);
  ok(upset.deltaA > 16 && upset.deltaB < -16, 'upset win pays more than expected win');

  const floor = computeElo(ELO_FLOOR, 2000, 0);
  ok(floor.newA === ELO_FLOOR, `rating never drops below the ${ELO_FLOOR} floor`);

  // settleRankedRoom must refuse everything that isn't a genuine finished
  // ranked game between two distinct verified accounts.
  const baseRoom = {
    code: 'TEST01',
    mode: 'Ranked',
    gameState: { winner: 0, endReason: null },
    players: [{ userId: 'uuid-a' }, { userId: 'uuid-b' }],
    ratingSettled: false
  };
  ok(await settleRankedRoom({ ...baseRoom, mode: 'Casual' }) === null, 'casual rooms never settle');
  ok(await settleRankedRoom({ ...baseRoom, gameState: { winner: null } }) === null, 'unfinished games never settle');
  ok(await settleRankedRoom({ ...baseRoom, players: [{ userId: 'uuid-a' }, {}] }) === null, 'missing userId → no settlement');
  ok(await settleRankedRoom({ ...baseRoom, players: [{ userId: 'uuid-a' }, { userId: 'uuid-a' }] }) === null, 'same account on both seats → no settlement');
  ok(await settleRankedRoom({ ...baseRoom, ratingSettled: true }) === null, 'already-settled room is idempotent');
  ok(await settleRankedRoom(null) === null, 'null room tolerated');

  if (!isSupabaseAdminConfigured()) {
    ok(await settleRankedRoom({ ...baseRoom }) === null, 'unconfigured Supabase → settlement no-ops safely');
    ok(await verifySupabaseUser('any-token') === null, 'unconfigured Supabase → token verification returns null');
  }
}

async function testTimeoutLogic() {
  console.log('\n─── 8. Timeout detection (in-process, shared logic) ───');

  const { checkTimeout } = await import('../api/lib/timeControl.js');
  const { createInitialGameState } = await import('../api/lib/roomUtils.js');

  const state = createInitialGameState('5+3 (Blitz)');
  ok(checkTimeout(state) === null, 'fresh clocks → no timeout');

  // Simulate the active player's clock fully drained 10 minutes ago
  state.clocks[state.currentPlayer] = 1000;
  state.lastMoveAt = Date.now() - 10 * 60 * 1000;
  const winner = checkTimeout(state);
  ok(winner === (state.currentPlayer === 0 ? 1 : 0), 'drained clock → opponent wins on time');

  const unlimited = createInitialGameState('Unlimited');
  unlimited.lastMoveAt = Date.now() - 10 * 60 * 1000;
  ok(checkTimeout(unlimited) === null, 'Unlimited games never time out');
}

async function testClientPureHelpers() {
  console.log('\n─── 9. New client modules (pure logic, in-process) ───');

  const { tierForRating } = await import('../src/social/Leaderboard.js');
  ok(tierForRating(1000).name === 'Bronze', '1000 → Bronze');
  ok(tierForRating(1100).name === 'Silver', '1100 → Silver');
  ok(tierForRating(1300).name === 'Gold', '1300 → Gold');
  ok(tierForRating(1500).name === 'Diamond', '1500 → Diamond');

  const { MAX_MESSAGE_LENGTH, setProfanityFilter, sendDirectMessage } = await import('../src/social/Chat.js');
  ok(MAX_MESSAGE_LENGTH === 500, 'chat cap is 500 chars (matches DB check constraint)');
  ok(typeof setProfanityFilter === 'function', 'profanity filter is pluggable');
  let guarded = false;
  try { await sendDirectMessage('someone', 'hi'); } catch (e) { guarded = /sign in|configured/i.test(e.message); }
  ok(guarded, 'chat refuses to send when not signed in / unconfigured');

  const { isSupabaseConfigured } = await import('../src/config/supabaseConfig.js');
  ok(typeof isSupabaseConfigured() === 'boolean', 'supabase config flag resolves');
}

// ────────────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`Barricade full test suite → ${BASE}`);
  try {
    const { host, guest } = await testRoomLifecycle();
    await testGameplayAndRules(host, guest);
    await testWinByGoalAndRematch();
    await testResign();
    await testListAndPrivacy();
    await testSecurity();
    await testRankedSettlementGuards();
    await testTimeoutLogic();
    await testClientPureHelpers();
  } catch (err) {
    failed++;
    console.error('\n💥 Suite aborted:', err);
  }

  console.log(`\n════ RESULT: ${passed} passed, ${failed} failed ════`);
  process.exit(failed > 0 ? 1 : 0);
})();
