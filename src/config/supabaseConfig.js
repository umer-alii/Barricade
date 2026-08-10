/**
 * Supabase project configuration (client side).
 *
 * Fill these in with your project's values from
 * Supabase Dashboard → Project Settings → API.
 * The anon key is safe to ship to the browser (RLS protects the data).
 *
 * When left empty, all account features (login, friends, chat, ranked,
 * live leaderboard) gracefully disable themselves and the game runs
 * exactly as before: local / ai / puzzle / casual online.
 */

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
