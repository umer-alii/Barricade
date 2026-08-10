/**
 * Server-side Supabase helpers (service role).
 *
 * Uses plain fetch against the Supabase REST/Auth APIs so no SDK dependency
 * is needed on the server. Reads config from environment variables:
 *
 *   SUPABASE_URL              — https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service-role secret (NEVER exposed to client)
 *
 * When these are not set (e.g. plain local dev), everything degrades
 * gracefully: token verification returns null and RPCs no-op.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function isSupabaseAdminConfigured() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

/**
 * Verify a client-supplied Supabase access token and return the auth user id,
 * or null if invalid/unconfigured. This prevents clients from spoofing a
 * user_id on room create/join (which would let them manipulate ratings).
 */
export async function verifySupabaseUser(accessToken) {
  if (!isSupabaseAdminConfigured() || !accessToken) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    return user?.id || null;
  } catch (err) {
    console.error('Supabase token verification failed:', err.message);
    return null;
  }
}

/**
 * Call a Postgres function with the service role (bypasses RLS; used only
 * for settle_ranked_match). Returns parsed JSON result or throws.
 */
export async function rpcServiceRole(fnName, args) {
  if (!isSupabaseAdminConfigured()) {
    throw new Error('Supabase admin is not configured');
  }
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`RPC ${fnName} failed (${resp.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}
