/**
 * Live leaderboard: real query over profiles ordered by Elo.
 * Rank tier is DERIVED from the rating (never stored), so it can't drift.
 */

import { getSupabase } from '../network/SupabaseClient.js';

export const LEADERBOARD_PAGE_SIZE = 10;

/** Derive a display tier from an Elo rating. */
export function tierForRating(elo) {
  if (elo >= 1500) return { name: 'Diamond', icon: '💎' };
  if (elo >= 1300) return { name: 'Gold', icon: '🥇' };
  if (elo >= 1100) return { name: 'Silver', icon: '🥈' };
  return { name: 'Bronze', icon: '🥉' };
}

/**
 * Fetch one page of the leaderboard.
 * Returns { rows, total } — rows carry a computed absolute `rank`.
 */
export async function fetchLeaderboard(page = 0, pageSize = LEADERBOARD_PAGE_SIZE) {
  const sb = await getSupabase();
  if (!sb) return { rows: [], total: 0 };
  const from = page * pageSize;
  const { data, error, count } = await sb
    .from('profiles')
    .select('id, username, player_id, avatar_url, elo_rating, wins, losses, matches_played', { count: 'exact' })
    .order('elo_rating', { ascending: false })
    .order('created_at', { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) {
    console.error('fetchLeaderboard:', error.message);
    return { rows: [], total: 0 };
  }
  return {
    rows: (data || []).map((row, i) => ({ ...row, rank: from + i + 1 })),
    total: count || 0
  };
}

/**
 * Realtime: refresh whenever any profile's rating changes.
 * Returns an unsubscribe function.
 */
export async function subscribeLeaderboard(onChange) {
  const sb = await getSupabase();
  if (!sb) return () => {};
  const channel = sb
    .channel('leaderboard')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles' },
      onChange)
    .subscribe();
  return () => sb.removeChannel(channel);
}
