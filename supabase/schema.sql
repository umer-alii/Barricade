-- ============================================================================
-- Barricade — Supabase schema: accounts, friends, chat, matches, ratings
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Idempotent where practical.
-- ============================================================================

-- ─── profiles ───────────────────────────────────────────────────────────────
-- One row per auth user, created client-side on first login via
-- create_profile_with_stats() RPC (allows one-time localStorage stats import).

create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text not null unique
                  check (char_length(username) between 2 and 16),
  player_id       text not null unique
                  check (player_id ~ '^[A-Z2-9]{6}$'),
  avatar_url      text,
  elo_rating      integer not null default 1000,
  wins            integer not null default 0,
  losses          integer not null default 0,
  matches_played  integer not null default 0,
  created_at      timestamptz not null default now()
);

-- ─── friendships ────────────────────────────────────────────────────────────

create table if not exists public.friendships (
  id            bigint generated always as identity primary key,
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'blocked')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- One relationship per unordered pair, regardless of direction
create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id),
                         greatest(requester_id, addressee_id));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists friendships_touch on public.friendships;
create trigger friendships_touch before update on public.friendships
  for each row execute function public.touch_updated_at();

-- ─── messages ───────────────────────────────────────────────────────────────
-- DM  : receiver_id set, room_code null
-- Room: room_code set, receiver_id null

create table if not exists public.messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  receiver_id  uuid references public.profiles (id) on delete cascade,
  room_code    text check (room_code is null or room_code ~ '^[A-Z2-9]{6}$'),
  content      text not null check (char_length(content) between 1 and 500),
  created_at   timestamptz not null default now(),
  constraint messages_has_target check (receiver_id is not null or room_code is not null)
);

create index if not exists messages_dm_idx
  on public.messages (receiver_id, sender_id, created_at desc)
  where receiver_id is not null;

create index if not exists messages_room_idx
  on public.messages (room_code, created_at desc)
  where room_code is not null;

-- ─── matches & rating_history (written ONLY by the server settlement fn) ────

create table if not exists public.matches (
  id            uuid primary key default gen_random_uuid(),
  room_code     text,
  player0_id    uuid references public.profiles (id) on delete set null,
  player1_id    uuid references public.profiles (id) on delete set null,
  winner_id     uuid references public.profiles (id) on delete set null,
  mode          text not null default 'Ranked',
  time_control  text,
  ended_reason  text,               -- null = goal reached | 'resign' | 'timeout'
  created_at    timestamptz not null default now()
);

create table if not exists public.rating_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  match_id    uuid not null references public.matches (id) on delete cascade,
  old_rating  integer not null,
  new_rating  integer not null,
  delta       integer not null,
  created_at  timestamptz not null default now()
);

create index if not exists rating_history_user_idx
  on public.rating_history (user_id, created_at desc);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles       enable row level security;
alter table public.friendships    enable row level security;
alter table public.messages       enable row level security;
alter table public.matches        enable row level security;
alter table public.rating_history enable row level security;

-- profiles: public fields readable by everyone (leaderboard works logged-out)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (true);

-- Users may update ONLY their own row; column grants below restrict WHICH
-- columns (never the rating/stat columns).
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Inserts happen exclusively through create_profile_with_stats() below
-- (SECURITY DEFINER), so no insert policy for authenticated users.

-- Column-level privileges: the client can never touch rating/stat columns.
revoke insert, update on public.profiles from anon, authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;

-- friendships
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert with check (auth.uid() = requester_id and status = 'pending');

-- Only the addressee resolves a request (accept / block)
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update using (auth.uid() = addressee_id)
  with check (status in ('accepted', 'blocked'));

-- Either side can remove the relationship (decline = delete by addressee)
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- messages
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (auth.uid() = sender_id);

-- DMs visible to the two parties. Room-chat rows are visible to any
-- authenticated user (room membership lives in Redis, not Postgres — room
-- codes are short-lived and unlisted for private rooms; see docs).
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    auth.uid() = sender_id
    or auth.uid() = receiver_id
    or (room_code is not null and auth.role() = 'authenticated')
  );

-- matches / rating_history: readable by all, writable only via service role
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches for select using (true);

drop policy if exists rating_history_select on public.rating_history;
create policy rating_history_select on public.rating_history for select using (true);

revoke insert, update, delete on public.matches        from anon, authenticated;
revoke insert, update, delete on public.rating_history from anon, authenticated;

-- ============================================================================
-- RPC: first-login profile creation (+ one-time localStorage stats import)
-- ============================================================================

create or replace function public.create_profile_with_stats(
  p_username  text,
  p_player_id text,
  p_wins      integer default 0,
  p_losses    integer default 0
) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Profile already exists';
  end if;

  insert into profiles (id, username, player_id, wins, losses)
  values (
    auth.uid(),
    p_username,
    upper(p_player_id),
    least(greatest(coalesce(p_wins, 0), 0), 500),   -- sanity-cap imported stats
    least(greatest(coalesce(p_losses, 0), 0), 500)
  )
  returning * into v_row;

  return v_row;
end $$;

revoke execute on function public.create_profile_with_stats from public;
grant execute on function public.create_profile_with_stats to authenticated;

-- ============================================================================
-- RPC: ranked match settlement (SERVICE ROLE ONLY — called by api/lib/ranking.js)
-- Atomic: Elo for both players + wins/losses + matches row + rating_history.
-- ============================================================================

create or replace function public.settle_ranked_match(
  p_room_code    text,
  p_player0      uuid,
  p_player1      uuid,
  p_winner       uuid,
  p_time_control text default null,
  p_ended_reason text default null,
  p_k            integer default 32
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_r0 integer; v_r1 integer;
  v_e0 numeric; v_s0 numeric;
  v_new0 integer; v_new1 integer;
  v_match_id uuid;
begin
  if p_winner is distinct from p_player0 and p_winner is distinct from p_player1 then
    raise exception 'Winner must be one of the two players';
  end if;

  -- Lock both rows to make concurrent settlements safe
  select elo_rating into v_r0 from profiles where id = p_player0 for update;
  select elo_rating into v_r1 from profiles where id = p_player1 for update;
  if v_r0 is null or v_r1 is null then
    raise exception 'Both players must have profiles';
  end if;

  -- Standard Elo
  v_e0 := 1.0 / (1.0 + power(10.0, (v_r1 - v_r0) / 400.0));
  v_s0 := case when p_winner = p_player0 then 1.0 else 0.0 end;
  v_new0 := greatest(100, round(v_r0 + p_k * (v_s0 - v_e0))::integer);
  v_new1 := greatest(100, round(v_r1 + p_k * ((1.0 - v_s0) - (1.0 - v_e0)))::integer);

  insert into matches (room_code, player0_id, player1_id, winner_id, mode, time_control, ended_reason)
  values (p_room_code, p_player0, p_player1, p_winner, 'Ranked', p_time_control, p_ended_reason)
  returning id into v_match_id;

  update profiles set
    elo_rating = v_new0,
    wins = wins + case when p_winner = p_player0 then 1 else 0 end,
    losses = losses + case when p_winner = p_player0 then 0 else 1 end,
    matches_played = matches_played + 1
  where id = p_player0;

  update profiles set
    elo_rating = v_new1,
    wins = wins + case when p_winner = p_player1 then 1 else 0 end,
    losses = losses + case when p_winner = p_player1 then 0 else 1 end,
    matches_played = matches_played + 1
  where id = p_player1;

  insert into rating_history (user_id, match_id, old_rating, new_rating, delta) values
    (p_player0, v_match_id, v_r0, v_new0, v_new0 - v_r0),
    (p_player1, v_match_id, v_r1, v_new1, v_new1 - v_r1);

  return json_build_object(
    'match_id', v_match_id,
    'player0', json_build_object('old', v_r0, 'new', v_new0),
    'player1', json_build_object('old', v_r1, 'new', v_new1)
  );
end $$;

-- Service role only — clients can never settle matches themselves
revoke execute on function public.settle_ranked_match from public, anon, authenticated;

-- ============================================================================
-- Realtime: broadcast row changes for live friends list & chat
-- ============================================================================

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
