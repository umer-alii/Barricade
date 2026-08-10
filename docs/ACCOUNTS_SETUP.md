# Barricade Accounts Setup (Supabase)

Persistent accounts, social login, friends, chat, and real Elo ranking are built
on **Supabase** (Postgres + Auth + Realtime). The **Upstash Redis room store is
unchanged** — it remains the system of record for *live match state*; Supabase
is the system of record for *persistent identity data*.

Everything degrades gracefully: if Supabase is not configured, the game runs
exactly as before (local / AI / puzzle / casual online, localStorage nickname
and stats), with account features hidden or disabled.

---

## 1. Create the project & apply the schema

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the whole of [`supabase/schema.sql`](../supabase/schema.sql).
   It creates `profiles`, `friendships`, `messages`, `matches`,
   `rating_history`, all RLS policies, the `create_profile_with_stats()` RPC
   (first-login profile + one-time stats migration) and the
   `settle_ranked_match()` RPC (server-only Elo settlement), and adds the
   tables to the Realtime publication.

## 2. Client configuration

Copy the values from **Project Settings → API** into
[`src/config/supabaseConfig.js`](../src/config/supabaseConfig.js):

```js
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';  // anon/public key — safe in browser
```

The Supabase JS SDK is loaded on demand from `esm.sh` (no build step needed).

## 3. Server environment variables (Vercel / local dev)

Set these wherever the `api/` routes run (Vercel dashboard, or your shell for
`scripts/dev-server.js`):

| Variable                    | Value                                    |
|-----------------------------|------------------------------------------|
| `SUPABASE_URL`              | `https://YOUR-PROJECT-REF.supabase.co`   |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role secret (**never** shipped to the client) |

Used by `api/lib/supabaseAdmin.js` for two things only:

- verifying client access tokens on room create/join (so a `user_id` cannot be spoofed),
- calling `settle_ranked_match()` when a ranked game ends.

## 4. Auth providers

### Email/password (works out of the box)
**Authentication → Providers → Email**: leave *Confirm email* enabled.
Set **Authentication → URL Configuration → Site URL** to your deployment URL
(email verification + password reset links redirect there).

### Google
1. In [Google Cloud Console](https://console.cloud.google.com), create OAuth
   2.0 credentials (*Web application*).
2. Authorized redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
3. Paste client ID + secret into **Authentication → Providers → Google** and enable it.

### Discord
1. In the [Discord Developer Portal](https://discord.com/developers/applications),
   create an application → **OAuth2**.
2. Add redirect: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
3. Paste client ID + secret into **Authentication → Providers → Discord** and enable it.

## 5. How it fits the existing game

### Login boundary (explicit)
| Feature | Account required? |
|---|---|
| Local / AI / puzzle play | No |
| Casual online play | No (guests keep working as before) |
| **Ranked** online play | **Yes — both players** (client gates it, server enforces it) |
| Friends, chat, live leaderboard identity | Yes |

### Room/session model
The anonymous `code/token/playerIndex` triple in sessionStorage is unchanged.
When logged in, the client also sends its Supabase `accessToken` on
create/join; the server verifies it and stamps `players[i].userId` on the room
object in Redis. Ranked settlement uses those verified IDs.

### Ranked settlement flow
Game end is detected where it always was — `api/rooms/action.js` (goal/resign)
and `api/rooms/poll.js` (timeout). Both now call
`settleRankedRoom(room)` (`api/lib/ranking.js`), which invokes the atomic
`settle_ranked_match()` Postgres function once per game
(`room.ratingSettled` flag; reset on rematch). K-factor: 32 (configurable
via `ELO_K_FACTOR`). Rating math lives in ONE authoritative place (the SQL
function), mirrored by `computeElo()` in `ranking.js` for reference/tests —
same convention as `gameActions.js` mirroring `src/` rules.

### localStorage persistence changes
| Key | Before | Now |
|---|---|---|
| `barricade_game_state_v1` (local/ai game) | client-only | unchanged, client-only |
| `barricade_theme` | client-only | unchanged |
| `barricade_puzzle_progress_v1` | client-only | unchanged |
| `barricade_nickname` | identity | still used for guests; ignored when signed in (profile `username` wins) |
| `barricade_stats_v1` | only stats | still the guest/local cache; **migrated once** into `profiles.wins/losses` at first profile creation (capped at 500 each), then `barricade_stats_migrated_v1` marks it done. Signed-in UI shows DB stats. |

Conflict resolution on login: pre-login stats are imported exactly once at
profile creation; afterwards the DB is the source of truth and local stats
only back the logged-out view.

### Static data that was replaced
- **Lobby leaderboard**: the five hardcoded `leaderboard-item` rows in
  `index.html` are gone. `#leaderboard-list` is now populated by
  `src/social/Leaderboard.js` (profiles ordered by `elo_rating desc`,
  paginated, realtime-refreshed). Tier (Bronze/Silver/Gold/Diamond) is derived
  from Elo by `tierForRating()` — never stored.
- **`Ranked` mode label**: now a real mode — requires login on both sides and
  triggers Elo settlement. `Casual` mode behavior is untouched.

### Security summary
- RLS on every table; rating/stat columns are excluded from the client's
  column-level UPDATE grant, so only `settle_ranked_match()` (service role)
  can write them.
- Friend requests can only be created as yourself; only the addressee can
  accept; either side can remove.
- Messages can only be inserted as yourself; DMs are readable only by the two
  parties. Room-chat rows are readable by any *authenticated* user who knows
  the room code (room membership lives in Redis, so Postgres can't check it —
  codes are short-lived and private rooms are unlisted).
- Message length capped at 500 chars (client + DB check constraint). Profanity
  filter is pluggable via `setProfanityFilter()` in `src/social/Chat.js`
  (default: pass-through).

## 6. New/changed files

```
supabase/schema.sql              — full schema + RLS + RPCs
docs/ACCOUNTS_SETUP.md           — this file
api/lib/supabaseAdmin.js         — token verify + service-role RPC (fetch-based, no dep)
api/lib/ranking.js               — settleRankedRoom() + reference Elo
api/rooms/create.js, join.js     — verified userId on players, ranked gating
api/rooms/action.js, poll.js     — settlement on game end, reset on rematch
src/config/supabaseConfig.js     — URL + anon key (fill in)
src/network/SupabaseClient.js    — SDK loader, auth, session, profile lifecycle
src/social/Friends.js            — friendships CRUD + realtime
src/social/Chat.js               — DM + room chat + realtime + filter hook
src/social/Leaderboard.js        — live leaderboard query + tier derivation
src/ui/AuthUI.js                 — auth modal, username picker, account state
src/ui/FriendsUI.js              — friends card (add/accept/chat/invite)
src/ui/ChatUI.js                 — chat drawer + floating button
src/network/RoomClient.js        — accessToken param on create/join
src/game/Game.js                 — wiring (gating, leaderboard, chat, stats)
index.html, styles/style.css     — markup + styles
```
