import { getRoom, setRoom } from '../lib/roomStore.js';
import { findPlayerByToken, jsonResponse, handleCors, createInitialGameState } from '../lib/roomUtils.js';
import { applyAction } from '../lib/gameActions.js';
import { settleRankedRoom } from '../lib/ranking.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  const code = (req.query.code || '').toUpperCase().trim();
  if (!code) {
    return jsonResponse(res, 400, { error: 'Room code required' });
  }

  try {
    const room = await getRoom(code);
    if (!room) {
      return jsonResponse(res, 404, { error: 'Room not found' });
    }

    const { token, action } = req.body || {};
    const player = findPlayerByToken(room, token);
    if (!player) {
      return jsonResponse(res, 403, { error: 'Invalid player token' });
    }

    if (action && action.type === 'rematch') {
      if (room.status === 'playing') {
        return jsonResponse(res, 200, {
          success: true,
          version: room.version,
          status: room.status,
          gameState: room.gameState,
          rematchRequests: room.rematchRequests || []
        });
      }

      if (room.status !== 'finished') {
        return jsonResponse(res, 400, { error: 'Game is not finished yet' });
      }

      room.rematchRequests = room.rematchRequests || [];
      if (!room.rematchRequests.includes(player.index)) {
        room.rematchRequests.push(player.index);
      }

      if (room.rematchRequests.length === 2) {
        room.status = 'playing';
        room.gameState = createInitialGameState(room.timeControl || '15+10 (Rapid)');
        room.rematchRequests = [];
        room.ratingSettled = false; // new game, new settlement
      }

      room.version += 1;
      room.lastActivity = Date.now();
      await setRoom(code, room);

      return jsonResponse(res, 200, {
        success: true,
        version: room.version,
        status: room.status,
        gameState: room.gameState,
        rematchRequests: room.rematchRequests || []
      });
    }

    if (action && action.type === 'resign') {
      if (room.status === 'finished') {
        return jsonResponse(res, 200, {
          success: true,
          version: room.version,
          status: room.status,
          gameState: room.gameState
        });
      }
    }

    if (room.status !== 'playing') {
      return jsonResponse(res, 400, { error: 'Game has not started yet or has finished' });
    }

    player.lastSeen = Date.now();
    player.connected = true;

    const result = applyAction(room.gameState, player.index, action);

    if (result.error) {
      return jsonResponse(res, 400, { error: result.error });
    }

    room.gameState = result.gameState;
    room.version += 1;
    room.lastActivity = Date.now();

    if (result.gameState.winner !== null) {
      room.status = 'finished';
      // Ranked rooms: settle Elo/stats server-side (idempotent, best-effort)
      const settlement = await settleRankedRoom(room);
      if (settlement) room.ratingResult = settlement;
    }

    await setRoom(code, room);

    return jsonResponse(res, 200, {
      success: true,
      version: room.version,
      status: room.status,
      gameState: room.gameState,
      rematchRequests: room.rematchRequests || []
    });
  } catch (err) {
    console.error('Action error:', err);
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
}
