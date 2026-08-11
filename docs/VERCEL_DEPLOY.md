# Vercel deployment

## Why deployment failed (Hobby plan)

Vercel Hobby allows **max 12 serverless functions** per deployment. The old layout counted **13**:

| Endpoint | Count |
|---|---|
| `api/rooms/create`, `join`, `poll`, `action`, `list`, `info`, `delete` | 7 |
| `api/lib/gameActions`, `roomStore`, `roomUtils`, etc. (helpers mistaken for endpoints) | 6 |
| **Total** | **13 → rejected** |

**Fix:** helpers live in `api/_lib/` (ignored by Vercel), and all room routes share **one** function: `api/rooms/[endpoint].js`.

## Why multiplayer works locally but not on Vercel

Locally, rooms are stored **in memory + a disk file** on one Node process — fine for dev.

On Vercel, each API request may hit a **different serverless instance** with its own memory. Without shared storage, Player A creates a room on instance 1 and Player B joins on instance 2 → **room not found**.

### Required: Upstash Redis (free tier)

1. Create a database at [console.upstash.com](https://console.upstash.com)
2. In Vercel → **Project → Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | From Upstash dashboard → REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | From Upstash dashboard → REST token |
| `SUPABASE_URL` | Supabase project URL (enables login, friends, chat, leaderboard) |
| `SUPABASE_ANON_KEY` | Supabase **anon/public** key (safe for browser — loaded via `/api/rooms/config`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only — ranked Elo settlement |

3. **Redeploy** after saving env vars.

The app auto-detects these and uses Redis instead of in-memory storage (`api/_lib/roomStore.js`).

## Deploy steps

```bash
git push origin main
```

Vercel redeploys automatically if the repo is connected. Or click **Redeploy** in the dashboard.

Your URLs (from the Vercel project):

- `https://barricade-git-main-lazy-buds1.vercel.app`
- Production alias shown under **Domains** in the deployment

## Optional env vars (accounts / ranked)

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Server-side auth verify + Elo settlement |
| `SUPABASE_SERVICE_ROLE_KEY` | Same (never expose to browser) |

Client-side Supabase: edit `src/config/supabaseConfig.js`.
