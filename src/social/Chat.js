/**
 * Chat: 1:1 DMs between friends + per-room chat during online matches.
 * Delivery is via Supabase Realtime (independent of the 800ms game poll).
 */

import { getSupabase, getUserId } from '../network/SupabaseClient.js';

export const MAX_MESSAGE_LENGTH = 500;

/**
 * Pluggable profanity filter. Replace via setProfanityFilter() with a real
 * implementation (return the cleaned string, or throw to reject the message).
 * Default: pass-through.
 */
let profanityFilter = (text) => text;

export function setProfanityFilter(fn) {
  if (typeof fn === 'function') profanityFilter = fn;
}

function prepareContent(content) {
  const text = (content || '').trim();
  if (!text) throw new Error('Message is empty');
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters`);
  }
  return profanityFilter(text);
}

// ─── Direct messages ─────────────────────────────────────────────────────────

export async function sendDirectMessage(receiverId, content) {
  const sb = await getSupabase();
  const uid = getUserId();
  if (!sb || !uid) throw new Error('Sign in to chat');
  const { error } = await sb.from('messages').insert({
    sender_id: uid,
    receiver_id: receiverId,
    content: prepareContent(content)
  });
  if (error) throw new Error(error.message);
}

/** Fetch the DM history between me and one friend (chronological). */
export async function fetchDirectMessages(friendId, limit = 50) {
  const sb = await getSupabase();
  const uid = getUserId();
  if (!sb || !uid) return [];
  const { data, error } = await sb
    .from('messages')
    .select('id, sender_id, receiver_id, content, created_at')
    .is('room_code', null)
    .or(`and(sender_id.eq.${uid},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${uid})`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('fetchDirectMessages:', error.message);
    return [];
  }
  return (data || []).reverse();
}

/** Realtime: all DMs addressed to me. Returns an unsubscribe function. */
export async function subscribeDirectMessages(onMessage) {
  const sb = await getSupabase();
  const uid = getUserId();
  if (!sb || !uid) return () => {};
  const channel = sb
    .channel(`dm-${uid}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${uid}` },
      (payload) => onMessage(payload.new))
    .subscribe();
  return () => sb.removeChannel(channel);
}

// ─── Room chat (during an online match) ──────────────────────────────────────

export async function sendRoomMessage(roomCode, content) {
  const sb = await getSupabase();
  const uid = getUserId();
  if (!sb || !uid) throw new Error('Sign in to chat');
  const { error } = await sb.from('messages').insert({
    sender_id: uid,
    room_code: roomCode.toUpperCase(),
    content: prepareContent(content)
  });
  if (error) throw new Error(error.message);
}

export async function fetchRoomMessages(roomCode, limit = 50) {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('messages')
    .select('id, sender_id, room_code, content, created_at')
    .eq('room_code', roomCode.toUpperCase())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('fetchRoomMessages:', error.message);
    return [];
  }
  return (data || []).reverse();
}

/** Realtime: messages in one match room. Returns an unsubscribe function. */
export async function subscribeRoomMessages(roomCode, onMessage) {
  const sb = await getSupabase();
  if (!sb) return () => {};
  const code = roomCode.toUpperCase();
  const channel = sb
    .channel(`room-chat-${code}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_code=eq.${code}` },
      (payload) => onMessage(payload.new))
    .subscribe();
  return () => sb.removeChannel(channel);
}
