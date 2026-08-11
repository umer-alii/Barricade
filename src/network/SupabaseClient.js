/**
 * Supabase client core: lazy SDK load, auth, session, profile lifecycle.
 *
 * The SDK is loaded on demand from a CDN (project has no build step).
 * If Supabase isn't configured or the CDN is unreachable, every helper
 * resolves to null/no-op so the rest of the game is unaffected.
 */

import { getSupabaseUrl, getSupabaseAnonKey, isSupabaseConfigured } from '../config/supabaseConfig.js';

const SDK_URL = 'https://esm.sh/@supabase/supabase-js@2';

// player_id alphabet: no 0/O/1/I to keep codes easy to share verbally
const PLAYER_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let clientPromise = null;
let currentSession = null;
let currentProfile = null;
const authListeners = new Set();

/** Resolves to the supabase client, or null if unconfigured/unreachable. */
export function getSupabase() {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import(SDK_URL)
      .then(({ createClient }) => createClient(getSupabaseUrl(), getSupabaseAnonKey()))
      .catch(err => {
        console.error('Failed to load Supabase SDK:', err);
        clientPromise = null;
        return null;
      });
  }
  return clientPromise;
}

/**
 * Initialize auth: restore session, watch for changes.
 * Fires listener(session, profile) on every auth state change.
 */
export async function initAuth() {
  const sb = await getSupabase();
  if (!sb) return null;

  const { data } = await sb.auth.getSession();
  currentSession = data?.session || null;
  if (currentSession) currentProfile = await fetchMyProfile();

  sb.auth.onAuthStateChange(async (_event, session) => {
    const wasUser = currentSession?.user?.id;
    currentSession = session;
    if (session?.user?.id !== wasUser) {
      currentProfile = session ? await fetchMyProfile() : null;
    }
    notifyAuthListeners();
  });

  notifyAuthListeners();
  return currentSession;
}

export function onAuthChange(listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function notifyAuthListeners() {
  for (const fn of authListeners) {
    try { fn(currentSession, currentProfile); } catch (err) { console.error(err); }
  }
}

export function getSession() { return currentSession; }
export function getProfile() { return currentProfile; }
export function isLoggedIn() { return Boolean(currentSession?.user); }
export function getAccessToken() { return currentSession?.access_token || null; }
export function getUserId() { return currentSession?.user?.id || null; }

// ─── Auth flows ──────────────────────────────────────────────────────────────

export async function signUpEmail(email, password) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Accounts are not configured');
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) throw error;
  return data;
}

export async function signInEmail(email, password) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Accounts are not configured');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** provider: 'google' | 'discord' — redirects the page */
export async function signInOAuth(provider) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Accounts are not configured');
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Accounts are not configured');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Accounts are not configured');
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  currentProfile = null;
}

// ─── Profile lifecycle ───────────────────────────────────────────────────────

export async function fetchMyProfile() {
  const sb = await getSupabase();
  const uid = currentSession?.user?.id;
  if (!sb || !uid) return null;
  const { data, error } = await sb
    .from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) {
    console.error('fetchMyProfile:', error.message);
    return null;
  }
  currentProfile = data || null;
  return currentProfile;
}

export async function fetchProfileByPlayerId(playerId) {
  const sb = await getSupabase();
  if (!sb || !playerId) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('id, username, player_id, avatar_url, elo_rating, wins, losses, matches_played')
    .eq('player_id', playerId.toUpperCase().trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}

function generatePlayerId() {
  let id = '';
  const rnd = new Uint8Array(6);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < 6; i++) id += PLAYER_ID_ALPHABET[rnd[i] % PLAYER_ID_ALPHABET.length];
  return id;
}

/**
 * First-login profile creation. Imports pre-login localStorage stats once
 * (server-side function sanity-caps them), retries on player_id collisions.
 */
export async function createMyProfile(username) {
  const sb = await getSupabase();
  if (!sb || !currentSession) throw new Error('Not signed in');

  // One-time migration of anonymous local stats into the new account
  let wins = 0;
  let losses = 0;
  const migrated = localStorage.getItem('barricade_stats_migrated_v1');
  if (!migrated) {
    try {
      const raw = JSON.parse(localStorage.getItem('barricade_stats_v1') || '{}');
      wins = Number(raw.wins) || 0;
      losses = Number(raw.losses) || 0;
    } catch (_) { /* ignore */ }
  }

  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await sb.rpc('create_profile_with_stats', {
      p_username: username,
      p_player_id: generatePlayerId(),
      p_wins: wins,
      p_losses: losses
    });
    if (!error) {
      localStorage.setItem('barricade_stats_migrated_v1', '1');
      currentProfile = data;
      notifyAuthListeners();
      return data;
    }
    lastError = error;
    // 23505 = unique violation; retry only for player_id collisions
    if (!/player_id/.test(error.message || '')) break;
  }
  if (/username/.test(lastError?.message || '')) {
    throw new Error('That username is already taken');
  }
  throw new Error(lastError?.message || 'Failed to create profile');
}

export async function updateMyUsername(username) {
  const sb = await getSupabase();
  const uid = currentSession?.user?.id;
  if (!sb || !uid) throw new Error('Not signed in');
  const { data, error } = await sb
    .from('profiles').update({ username }).eq('id', uid).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('That username is already taken');
    throw error;
  }
  currentProfile = data;
  notifyAuthListeners();
  return data;
}
