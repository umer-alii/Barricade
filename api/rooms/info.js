import { getRoom } from '../lib/roomStore.js';
import { jsonResponse, handleCors } from '../lib/roomUtils.js';
import { parseTimeControl } from '../lib/timeControl.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  const code = (req.query.code || '').toUpperCase().trim();
  if (!code || code.length !== 6) {
    return jsonResponse(res, 400, { error: 'Invalid room code' });
  }

  try {
    const room = await getRoom(code);
    if (!room) {
      return jsonResponse(res, 404, { error: 'Room not found' });
    }

    const timeControl = room.timeControl || '15+10 (Rapid)';
    const parsed = parseTimeControl(timeControl);

    return jsonResponse(res, 200, {
      code,
      status: room.status,
      hostName: room.players[0]?.name || 'Anonymous',
      timeControl,
      timeControlLabel: parsed.label,
      mode: room.mode || 'Casual',
      isPrivate: !!room.isPrivate,
      isFull: room.players[1] !== null
    });
  } catch (err) {
    console.error('Room info error:', err);
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
}
