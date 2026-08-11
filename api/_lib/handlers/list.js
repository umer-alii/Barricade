import { listRooms } from '../roomStore.js';
import { jsonResponse, handleCors } from '../roomUtils.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const rooms = await listRooms();
    return jsonResponse(res, 200, { rooms });
  } catch (err) {
    console.error('List rooms error:', err);
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
}
