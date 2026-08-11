/**
 * Public Supabase config for the browser (anon key only — safe to expose).
 * Set these in Vercel → Settings → Environment Variables:
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 */
import { jsonResponse, handleCors } from '../roomUtils.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  return jsonResponse(res, 200, {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  });
}
