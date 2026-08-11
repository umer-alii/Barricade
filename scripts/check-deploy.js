#!/usr/bin/env node
/**
 * Report which features are live on a deployment.
 *
 *   node scripts/check-deploy.js https://your-site.vercel.app
 *   node scripts/check-deploy.js                 # defaults to localhost:3000
 */
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

async function get(pathname) {
  try {
    const res = await fetch(BASE + pathname, { headers: { Accept: 'application/json' } });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* non-JSON response */ }
    return { status: res.status, data, text };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

function line(label, pass, detail) {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

async function post(pathname, body) {
  try {
    const res = await fetch(BASE + pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

async function main() {
  console.log(`\nChecking ${BASE}\n`);
  const results = [];

  const page = await get('/');
  results.push(line('site reachable', page.status === 200, page.error || `HTTP ${page.status}`));

  const list = await get('/api/rooms/list');
  results.push(line('API function responding', list.status === 200 && Array.isArray(list.data?.rooms),
    list.status === 200 ? `${list.data?.rooms?.length ?? 0} open room(s)` : `HTTP ${list.status}`));

  const unknown = await get('/api/rooms/definitely-not-a-route');
  results.push(line('unknown endpoint returns 404', unknown.status === 404, `HTTP ${unknown.status}`));

  const bad = await post('/api/rooms/join', { code: { not: 'a string' } });
  results.push(line('malformed input rejected cleanly', bad.status === 400, `HTTP ${bad.status}`));

  // Create in one request, read back in another. On serverless without a shared
  // store the second request can land on a cold instance and 404 — which is
  // exactly the "room not found" bug players would hit.
  const room = await post('/api/rooms/create', { playerName: 'healthcheck', timeControl: 'Unlimited' });
  if (room.status === 200 && room.data?.code) {
    const info = await get(`/api/rooms/info?code=${room.data.code}`);
    results.push(line('room survives across requests', info.status === 200,
      info.status === 200 ? 'shared store working' : 'set UPSTASH_REDIS_REST_URL / _TOKEN'));
    await post('/api/rooms/delete', { code: room.data.code, token: room.data.playerToken });
  } else {
    results.push(line('room survives across requests', false, `create returned HTTP ${room.status}`));
  }

  const cfg = await get('/api/rooms/config');
  const supabaseOn = Boolean(cfg.data?.url && cfg.data?.anonKey);
  line('Supabase configured (login/friends/chat/ranked)', supabaseOn,
    supabaseOn ? new URL(cfg.data.url).host : 'SUPABASE_URL / SUPABASE_ANON_KEY not set');

  const allPass = results.every(Boolean);
  console.log(
    allPass
      ? '\nCore game and API are healthy.'
      : '\nCore checks failed — the deployment is not serving the API correctly.'
  );
  if (!supabaseOn) {
    console.log('Accounts are off: local, AI, puzzle and casual online still work.');
    console.log('To enable them, see QUICKSTART.md.');
  }
  process.exit(allPass ? 0 : 1);
}

main();
