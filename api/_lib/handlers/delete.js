import { getRoom, deleteRoom } from '../roomStore.js';
import { findPlayerByToken, jsonResponse, handleCors } from '../roomUtils.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  const { code, token } = req.body || {};
  const normalizedCode = (code || '').toUpperCase().trim();

  if (!normalizedCode) {
    return jsonResponse(res, 400, { error: 'Room code required' });
  }

  try {
    const room = await getRoom(normalizedCode);
    if (!room) {
      // Room already gone or doesn't exist, treat as success
      return jsonResponse(res, 200, { success: true });
    }

    const player = findPlayerByToken(room, token);
    if (!player) {
      return jsonResponse(res, 403, { error: 'Invalid player token' });
    }

    // Only allow host (player 0) to delete the room if it's waiting
    await deleteRoom(normalizedCode);

    return jsonResponse(res, 200, { success: true });
  } catch (err) {
    console.error('Delete room error:', err);
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
}
