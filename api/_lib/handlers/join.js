import { getRoom, setRoom } from '../roomStore.js';
import { generateToken, createInitialGameState, jsonResponse, handleCors } from '../roomUtils.js';
import { verifySupabaseUser, isSupabaseAdminConfigured } from '../supabaseAdmin.js';

const joinLocks = new Set();

async function acquireLock(code) {
  while (joinLocks.has(code)) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  joinLocks.add(code);
}

function releaseLock(code) {
  joinLocks.delete(code);
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  const { code, playerName } = req.body || {};
  const normalizedCode = (code || '').toUpperCase().trim();

  if (!normalizedCode || normalizedCode.length !== 6) {
    return jsonResponse(res, 400, { error: 'Invalid room code' });
  }

  await acquireLock(normalizedCode);

  try {
    const room = await getRoom(normalizedCode);
    if (!room) {
      return jsonResponse(res, 404, { error: 'Room not found' });
    }

    if (room.status === 'finished') {
      return jsonResponse(res, 400, { error: 'This game has already ended' });
    }

    // Check if guest slot is taken
    if (room.players[1] !== null) {
      // Allow reconnection with same token
      const existingToken = req.body.playerToken;
      if (existingToken && room.players[1].token === existingToken) {
        room.players[1].connected = true;
        room.players[1].lastSeen = Date.now();
        room.lastActivity = Date.now();
        await setRoom(normalizedCode, room);
        return jsonResponse(res, 200, {
          code: normalizedCode,
          playerToken: existingToken,
          playerIndex: 1,
          status: room.status,
          gameState: room.gameState,
          version: room.version,
          players: room.players.map(p => p ? { name: p.name, index: p.index, connected: p.connected } : null),
          timeControl: room.timeControl || '15+10 (Rapid)',
          mode: room.mode || 'Casual',
          isPrivate: !!room.isPrivate
        });
      }
      return jsonResponse(res, 400, { error: 'Room is full' });
    }

    // Verify identity server-side; ranked rooms require a signed-in account
    const userId = await verifySupabaseUser(req.body.accessToken);
    if ((room.mode || 'Casual') === 'Ranked' && isSupabaseAdminConfigured()) {
      if (!userId) {
        return jsonResponse(res, 401, { error: 'Ranked play requires a signed-in account' });
      }
      if (room.players[0]?.userId && room.players[0].userId === userId) {
        return jsonResponse(res, 400, { error: 'You cannot play a ranked match against yourself' });
      }
    }

    const guestToken = generateToken();
    room.players[1] = {
      token: guestToken,
      name: playerName || 'Player 2',
      index: 1,
      connected: true,
      lastSeen: Date.now()
    };
    if (userId) room.players[1].userId = userId;

    // Auto-start game when both players are present
    room.status = 'playing';
    room.gameState = createInitialGameState(room.timeControl || '15+10 (Rapid)');
    room.version += 1;
    room.lastActivity = Date.now();

    await setRoom(normalizedCode, room);

    return jsonResponse(res, 200, {
      code: normalizedCode,
      playerToken: guestToken,
      playerIndex: 1,
      status: room.status,
      gameState: room.gameState,
      version: room.version,
      players: room.players.map(p => p ? { name: p.name, index: p.index, connected: p.connected } : null),
      timeControl: room.timeControl || '15+10 (Rapid)',
      mode: room.mode || 'Casual',
      isPrivate: !!room.isPrivate
    });
  } catch (err) {
    console.error('Join room error:', err);
    return jsonResponse(res, 500, { error: 'Internal server error' });
  } finally {
    releaseLock(normalizedCode);
  }
}
