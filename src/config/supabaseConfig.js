/**
 * Supabase configuration — works on any host (local, Vercel, VPS, etc.)
 *
 * Loaded automatically at startup, in this order:
 *  1. src/config/supabase.local.js  (copy from supabase.local.example.js)
 *  2. GET /api/rooms/config         (reads process.env / .env on the server)
 *
 * Setup (pick one):
 *  • Local:  cp .env.example .env  → fill in keys → npm run dev:local
 *  • Local:  cp src/config/supabase.local.example.js src/config/supabase.local.js
 *  • Any host: set SUPABASE_URL + SUPABASE_ANON_KEY as environment variables
 */

let url = '';
let anonKey = '';
let loadPromise = null;

export function getSupabaseUrl() { return url; }
export function getSupabaseAnonKey() { return anonKey; }

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

export async function loadSupabaseConfig() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    // 1. Optional local file (gitignored — good for dev)
    try {
      const local = await import('./supabase.local.js');
      if (local.SUPABASE_URL) url = local.SUPABASE_URL;
      if (local.SUPABASE_ANON_KEY) anonKey = local.SUPABASE_ANON_KEY;
    } catch (_) { /* file not created yet — normal */ }

    // 2. Server env (works on Vercel, Railway, local dev-server with .env, etc.)
    if (!url || !anonKey) {
      try {
        const res = await fetch('/api/rooms/config');
        if (res.ok) {
          const data = await res.json();
          if (data.url) url = data.url;
          if (data.anonKey) anonKey = data.anonKey;
        }
      } catch (_) { /* no API server — static-only hosting */ }
    }

    return isSupabaseConfigured();
  })();
  return loadPromise;
}
