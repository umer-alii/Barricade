/**
 * Supabase configuration — loaded at runtime.
 *
 * Priority:
 *  1. Values baked into this file (fine for local dev)
 *  2. /api/rooms/config (reads Vercel env vars in production)
 *
 * The anon key is public; RLS protects the data.
 */

// Optional local overrides — leave empty to use server env on Vercel
const FILE_URL = '';
const FILE_ANON_KEY = '';

let url = FILE_URL;
let anonKey = FILE_ANON_KEY;
let loadPromise = null;

export function getSupabaseUrl() { return url; }
export function getSupabaseAnonKey() { return anonKey; }

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

/** Fetch public Supabase config from the server (Vercel env vars). */
export async function loadSupabaseConfig() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (!url || !anonKey) {
      try {
        const res = await fetch('/api/rooms/config');
        if (res.ok) {
          const data = await res.json();
          if (data.url) url = data.url;
          if (data.anonKey) anonKey = data.anonKey;
        }
      } catch (err) {
        console.warn('Could not load Supabase config from server:', err.message);
      }
    }
    return isSupabaseConfigured();
  })();
  return loadPromise;
}
