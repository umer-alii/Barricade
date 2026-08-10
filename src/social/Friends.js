/**
 * Friends: search by player_id, request/accept/decline/remove, live updates.
 * All access is via the Supabase JS client — RLS enforces that users only
 * see/modify their own relationships (see supabase/schema.sql).
 */

import { getSupabase, getUserId } from '../network/SupabaseClient.js';

const PROFILE_FIELDS = 'id, username, player_id, avatar_url, elo_rating, wins, losses';

/** Find a profile by its short in-game player ID (e.g. "AB12CD"). */
export async function searchByPlayerId(playerId) {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('player_id', (playerId || '').toUpperCase().trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Send a friend request to another user (by their profile id). */
export async function sendFriendRequest(addresseeId) {
  const sb = await getSupabase();
  const uid = getUserId();
  if (!sb || !uid) throw new Error('Sign in to add friends');
  if (addresseeId === uid) throw new Error("You can't add yourself");
  const { error } = await sb.from('friendships').insert({
    requester_id: uid,
    addressee_id: addresseeId,
    status: 'pending'
  });
  if (error) {
    if (error.code === '23505') throw new Error('A friend request already exists between you');
    throw new Error(error.message);
  }
}

export async function acceptFriendRequest(friendshipId) {
  const sb = await getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
  if (error) throw new Error(error.message);
}

/** Decline (or cancel your own outgoing request / unfriend). */
export async function removeFriendship(friendshipId) {
  const sb = await getSupabase();
  if (!sb) return;
  const { error } = await sb.from('friendships').delete().eq('id', friendshipId);
  if (error) throw new Error(error.message);
}

/**
 * Load all my relationships, grouped for the UI.
 * Returns { friends, incoming, outgoing } — each item carries the
 * friendship id plus the OTHER user's profile.
 */
export async function listRelationships() {
  const sb = await getSupabase();
  const uid = getUserId();
  const empty = { friends: [], incoming: [], outgoing: [] };
  if (!sb || !uid) return empty;

  const { data, error } = await sb
    .from('friendships')
    .select(`id, requester_id, addressee_id, status, created_at,
      requester:profiles!friendships_requester_id_fkey(${PROFILE_FIELDS}),
      addressee:profiles!friendships_addressee_id_fkey(${PROFILE_FIELDS})`)
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
    .neq('status', 'blocked')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listRelationships:', error.message);
    return empty;
  }

  const result = { friends: [], incoming: [], outgoing: [] };
  for (const row of data || []) {
    const iAmRequester = row.requester_id === uid;
    const other = iAmRequester ? row.addressee : row.requester;
    const item = { friendshipId: row.id, profile: other, since: row.created_at };
    if (row.status === 'accepted') result.friends.push(item);
    else if (iAmRequester) result.outgoing.push(item);
    else result.incoming.push(item);
  }
  return result;
}

/**
 * Realtime: fire callback whenever any of my friendship rows change.
 * Returns an unsubscribe function.
 */
export async function subscribeFriendships(onChange) {
  const sb = await getSupabase();
  const uid = getUserId();
  if (!sb || !uid) return () => {};

  const channel = sb
    .channel(`friendships-${uid}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${uid}` },
      onChange)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${uid}` },
      onChange)
    .subscribe();

  return () => sb.removeChannel(channel);
}
