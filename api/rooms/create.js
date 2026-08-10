import { getRoom, setRoom } from '../_lib/roomStore.js';
import {
  generateRoomCode,
  generateToken,
  createRoomObject,
  jsonResponse,
  handleCors
} from '../_lib/roomUtils.js';
import { verifySupabaseUser, isSupabaseAdminConfigured } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { playerName, timeControl, mode, isPrivate, accessToken } = req.body || {};

    // Verify identity server-side (token can't be spoofed into a userId).
    // Ranked rooms require a real account when accounts are configured.
    const userId = await verifySupabaseUser(accessToken);
    if (mode === 'Ranked' && isSupabaseAdminConfigured() && !userId) {
      return jsonResponse(res, 401, { error: 'Ranked play requires a signed-in account' });
    }

    const hostToken = generateToken();
    let code;
    let attempts = 0;

    // Ensure unique room code
    do {
      code = generateRoomCode();
      attempts++;
      if (attempts > 20) {
        return jsonResponse(res, 500, { error: 'Failed to generate room code' });
      }
    } while (await getRoom(code));

    const room = createRoomObject(code, hostToken, playerName || 'Player 1');
    room.timeControl = timeControl || '15+10 (Rapid)';
    room.mode = mode || 'Casual';
    room.isPrivate = !!isPrivate;
    if (userId) room.players[0].userId = userId;
    await setRoom(code, room);

    return jsonResponse(res, 200, {
      code,
      playerToken: hostToken,
      playerIndex: 0,
      status: 'waiting',
      timeControl: room.timeControl,
      mode: room.mode,
      isPrivate: room.isPrivate
    });
  } catch (err) {
    console.error('Create room error:', err);
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
}
