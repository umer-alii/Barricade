# Quick Start — full game on any host

Barricade runs on **any host** (your laptop, Vercel, Railway, Fly.io, a VPS, Docker).
No build step. Two free services power online features:

| Service | Free tier | Powers |
|---|---|---|
| [Upstash Redis](https://console.upstash.com) | Yes | Online multiplayer rooms |
| [Supabase](https://supabase.com) | Yes | Login, friends, chat, ranked, leaderboard |

Local/AI/puzzle modes work **without any setup**.

---

## 5-minute full setup (local)

### 1. Install & run

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000. At any point, check what's actually enabled:

```bash
npm run check                                  # local
node scripts/check-deploy.js https://your-site # a deployment
```

### 2. Upstash (online multiplayer)

1. Create a Redis database at [console.upstash.com](https://console.upstash.com)
2. Copy **REST URL** and **REST Token** into `.env`:
   ```
   UPSTASH_REDIS_REST_URL=https://...
   UPSTASH_REDIS_REST_TOKEN=...
   ```
3. Restart the dev server

### 3. Supabase (accounts, friends, chat, ranked)

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** → paste and run the entire `supabase/schema.sql`
3. Go to **Project Settings → API**, copy URL and **anon** key into `.env`:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...   # service_role key — server only
   ```
4. **Authentication → Providers**: enable Email, Google, Discord as needed
5. **Authentication → URL Configuration**: set Site URL to `http://localhost:3000`
6. Restart the dev server

**Alternative for local only** (skip .env for Supabase):
```bash
cp src/config/supabase.local.example.js src/config/supabase.local.js
# edit the file with your URL + anon key
```

### 4. Verify

- Click **Sign In / Register** → email or Google/Discord login works
- Create a ranked room → requires login
- Friends card appears after login
- Leaderboard shows real players

---

## Deploy anywhere

Set the **same environment variables** on your host:

```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

The client loads Supabase config automatically from `/api/rooms/config` (reads env vars).
No Vercel-specific steps required.

### Vercel

Either add them by hand in Project → Settings → Environment Variables, or push
your finished `.env` up in one command:

```bash
npx vercel login
npx vercel link          # pick the existing Barricade project
npm run sync:vercel      # copies .env to production, preview and development
npx vercel --prod        # redeploy so the new values take effect
```

Environment variables only apply to **new** deployments, so the redeploy is
required. Then confirm:

```bash
node scripts/check-deploy.js https://your-site.vercel.app
```

Finally, in Supabase → **Authentication → URL Configuration**, set the Site URL
to your deployed origin and add it to Redirect URLs, otherwise Google/Discord
logins bounce back to localhost.

### Render (free, and simpler than Vercel)

`render.yaml` is already in the repo, so: render.com → **New → Blueprint** →
pick this repo → add the env vars in the **Environment** tab → deploy.

Render runs **one persistent Node process**, so rooms live in memory and
**Upstash is not required** — only Supabase, and only if you want accounts.
The free tier sleeps after ~15 minutes idle, so the first request afterwards
takes roughly a minute to wake.

### Railway / Fly.io / Docker / VPS

A `Dockerfile` is included:

```bash
docker build -t barricade .
docker run -p 3000:3000 --env-file .env barricade
```

Without Docker, set the env vars and run `node scripts/dev-server.js`. It honours
`PORT` and binds all interfaces, which is what these platforms expect.

---

## What works without accounts

| Mode | Needs setup? |
|---|---|
| Local 2-player | No |
| vs Computer (AI) | No |
| Daily Puzzles | No |
| Casual online | Upstash only |
| Ranked / Friends / Chat / Leaderboard | Upstash + Supabase |

See `docs/ACCOUNTS_SETUP.md` for OAuth provider details and security notes.
