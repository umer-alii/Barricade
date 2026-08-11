/**
 * Local Supabase config (optional alternative to .env)
 *
 * 1. Copy this file:  cp src/config/supabase.local.example.js src/config/supabase.local.js
 * 2. Fill in your Supabase project URL and anon key
 *    (Supabase Dashboard → Project Settings → API)
 * 3. Restart the dev server
 *
 * supabase.local.js is gitignored — safe to put your keys here for local dev.
 * On production, use environment variables instead (see .env.example).
 */

export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...your-anon-key...';
