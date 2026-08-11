# Deploying Barricade

Works on any host. Vercel specifics are called out where relevant.

## Project layout

| Path | Role |
|---|---|
| `api/rooms/[endpoint].js` | The **only** serverless function — routes every `/api/rooms/*` request |
| `server/` | All server logic (handlers, room store, rules, ranking). Outside `api/` on purpose |
| `src/`, `index.html`, `styles/` | Static client, served as-is |
| `scripts/dev-server.js` | Local/self-hosted server (static + API in one process) |

### Why one function

Vercel turns **every file inside `api/`** into a serverless function, and the
Hobby plan allows a maximum of **12**. An earlier layout had 7 endpoints plus 6
helper modules under `api/lib/` = 13 files, so deployment was rejected with:

> No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.

All logic now lives in top-level `server/`, and `api/` holds a single dynamic
route. `/api/rooms/create` resolves to `[endpoint].js` with
`req.query.endpoint === 'create'`.

## Environment variables

Set these on your host (Vercel: Settings → Environment Variables). Locally,
copy `.env.example` to `.env` — `scripts/dev-server.js` loads it automatically.

| Variable | Required for |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Online multiplayer |
| `UPSTASH_REDIS_REST_TOKEN` | Online multiplayer |
| `SUPABASE_URL` | Login, friends, chat, ranked, leaderboard |
| `SUPABASE_ANON_KEY` | Same (public key — served to the browser via `/api/rooms/config`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ranked Elo settlement (server only — never sent to the browser) |

After changing environment variables on Vercel you must **redeploy** for them to
take effect.

### Why multiplayer needs Redis in production

Locally the room store keeps games in memory in a single process. On Vercel each
request may hit a different serverless instance with its own memory, so a room
created on one instance is invisible to the next — players get "room not found".
Upstash Redis gives every instance the same shared store
(`server/roomStore.js` switches automatically when the two Upstash variables are
present).

## Deploy

### Vercel
Push to the connected branch, or click **Redeploy**. No build step runs; the
static files are served directly and `api/rooms/[endpoint].js` becomes the
function.

### Railway / Render / Fly.io / Docker / VPS
Set the same environment variables and run:

```bash
npm install
node scripts/dev-server.js   # honours PORT, defaults to 3000
```

This serves the static client and the API from one Node process — no serverless
function limits apply.

## Verifying a deployment

```bash
curl https://YOUR-SITE/api/rooms/list     # → {"rooms":[]}
curl https://YOUR-SITE/api/rooms/config   # → {"url":"...","anonKey":"..."} when Supabase is set
```

Run the full suite against any host:

```bash
node scratch/test_full_suite.js https://YOUR-SITE
```
