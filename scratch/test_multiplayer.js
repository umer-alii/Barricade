/**
 * Automated multiplayer API test — simulates two players playing several moves.
 * Run: node scratch/test_multiplayer.js [baseUrl]
 */

const BASE = process.argv[2] || 'http://localhost:3000';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  console.log('Testing multiplayer at', BASE);

  const host = await api('/api/rooms/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  console.log('✓ Room created:', host.code);

  const guest = await api('/api/rooms/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: host.code })
  });
  console.log('✓ Guest joined, version:', guest.version);

  // Host move: e2
  let state = await api(`/api/rooms/action?code=${host.code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: host.playerToken, action: { type: 'move', col: 4, row: 1 } })
  });
  console.log('✓ Host move e2, version:', state.version, 'turn:', state.gameState.currentPlayer);

  // Guest polls
  let poll = await api(`/api/rooms/poll?code=${host.code}&token=${guest.playerToken}`);
  if (poll.gameState.players[0].row !== 1) throw new Error('Guest poll did not see host move');
  console.log('✓ Guest sees host move via poll');

  // Guest move: e8
  state = await api(`/api/rooms/action?code=${host.code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: guest.playerToken, action: { type: 'move', col: 4, row: 7 } })
  });
  console.log('✓ Guest move e8, version:', state.version, 'turn:', state.gameState.currentPlayer);

  // Host polls
  poll = await api(`/api/rooms/poll?code=${host.code}&token=${host.playerToken}`);
  if (poll.gameState.players[1].row !== 7) throw new Error('Host poll did not see guest move');
  console.log('✓ Host sees guest move via poll');

  // Host move: e3
  state = await api(`/api/rooms/action?code=${host.code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: host.playerToken, action: { type: 'move', col: 4, row: 2 } })
  });
  console.log('✓ Host move e3, history:', state.gameState.history.join(', '));

  poll = await api(`/api/rooms/poll?code=${host.code}&token=${guest.playerToken}`);
  if (poll.gameState.history.length !== 3) throw new Error('Guest missing moves in history');
  console.log('✓ Guest sees full history:', poll.gameState.history.join(', '));

  console.log('\nAll multiplayer API tests passed!');
}

main().catch(err => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
