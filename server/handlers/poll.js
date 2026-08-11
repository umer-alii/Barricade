import { getRoom, setRoom } from '../roomStore.js';
import { findPlayerByToken, jsonResponse, handleCors } from '../roomUtils.js';
import { checkTimeout } from '../timeControl.js';
import { settleRankedRoom } from '../ranking.js';

const DISCONNECT_THRESHOLD_MS = 30000;

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const code = (req.query.code || '').toUpperCase().trim();
  const token = req.query.token || '';

  if (!code) {
    return jsonResponse(res, 400, { error: 'Room code required' });
  }

  if (req.method === 'GET') {
    try {
      const room = await getRoom(code);
      if (!room) {
        return jsonResponse(res, 404, { error: 'Room not found' });
      }

      const player = findPlayerByToken(room, token);
      if (!player) {
        return jsonResponse(res, 403, { error: 'Invalid player token' });
      }

      // Update heartbeat
      player.lastSeen = Date.now();
      player.connected = true;
      room.lastActivity = Date.now();

      // Check opponent connection status
      const now = Date.now();
      const playersInfo = room.players.map(p => {
        if (!p) return null;
        const isConnected = (now - p.lastSeen) < DISCONNECT_THRESHOLD_MS;
        p.connected = isConnected;
        return { name: p.name, index: p.index, connected: isConnected };
      });

      if (room.status === 'playing' && room.gameState) {
        const timeoutWinner = checkTimeout(room.gameState);
        if (timeoutWinner !== null) {
          room.gameState.winner = timeoutWinner;
          room.gameState.endReason = 'timeout';
          room.status = 'finished';
          room.version += 1;
          const settlement = await settleRankedRoom(room);
          if (settlement) room.ratingResult = settlement;
        }
      }

      await setRoom(code, room);

      return jsonResponse(res, 200, {
        code: room.code,
        status: room.status,
        version: room.version,
        gameState: room.gameState,
        players: playersInfo,
        playerIndex: player.index,
        timeControl: room.timeControl || '15+10 (Rapid)',
        mode: room.mode || 'Casual',
        isPrivate: !!room.isPrivate,
        rematchRequests: room.rematchRequests || []
      });
    } catch (err) {
      console.error('Poll room error:', err);
      return jsonResponse(res, 500, { error: 'Internal server error' });
    }
  }

  return jsonResponse(res, 405, { error: 'Method not allowed' });
}
