/**
 * Ranked match settlement — the single server-side place where match
 * outcomes turn into rating changes (mirrors the "shared rule logic"
 * convention: nothing rating-related is ever computed or written client-side).
 *
 * The authoritative Elo math + writes happen atomically inside the
 * settle_ranked_match() Postgres function (see supabase/schema.sql).
 * computeElo() below is a reference implementation of the same formula
 * for tests/preview UI.
 */

import { isSupabaseAdminConfigured, rpcServiceRole } from './supabaseAdmin.js';

export const ELO_K_FACTOR = 32;
export const ELO_FLOOR = 100;

/**
 * Standard Elo. scoreA is 1 if player A won, 0 if lost.
 * Mirrors the SQL in settle_ranked_match() — keep in sync.
 */
export function computeElo(ratingA, ratingB, scoreA, k = ELO_K_FACTOR) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const newA = Math.max(ELO_FLOOR, Math.round(ratingA + k * (scoreA - expectedA)));
  const newB = Math.max(ELO_FLOOR, Math.round(ratingB + k * ((1 - scoreA) - (1 - expectedA))));
  return { newA, newB, deltaA: newA - ratingA, deltaB: newB - ratingB };
}

/**
 * Settle a finished ranked room: updates both players' Elo/wins/losses,
 * records the match and rating history. Idempotent per room via the
 * room.ratingSettled flag (caller persists the room afterwards).
 *
 * Best-effort: failures are logged but never break the game-end response.
 * Returns the settlement result or null if not applicable.
 */
export async function settleRankedRoom(room) {
  try {
    if (!room || room.ratingSettled) return null;
    if ((room.mode || 'Casual') !== 'Ranked') return null;
    if (!room.gameState || room.gameState.winner === null || room.gameState.winner === undefined) return null;

    const p0 = room.players?.[0];
    const p1 = room.players?.[1];
    if (!p0?.userId || !p1?.userId || p0.userId === p1.userId) return null;
    if (!isSupabaseAdminConfigured()) return null;

    const winnerUserId = room.gameState.winner === 0 ? p0.userId : p1.userId;

    const result = await rpcServiceRole('settle_ranked_match', {
      p_room_code: room.code,
      p_player0: p0.userId,
      p_player1: p1.userId,
      p_winner: winnerUserId,
      p_time_control: room.timeControl || null,
      p_ended_reason: room.gameState.endReason || null,
      p_k: ELO_K_FACTOR
    });

    room.ratingSettled = true;
    return result;
  } catch (err) {
    console.error(`Ranked settlement failed for room ${room?.code}:`, err.message);
    return null;
  }
}
