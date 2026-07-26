-- Angle Team Toolkit — Supabase schema
-- Run this whole file in the Supabase SQL Editor (Project > SQL Editor > New query).
--
-- This version adds email/password accounts: every team member's data is
-- private to them. Re-running this file DROPS AND RECREATES every app
-- table (any test data you already entered will be cleared) so the new
-- per-user shape and permissions are applied cleanly.

create extension if not exists "pgcrypto";

-- ============================================================
-- Primary users (admin override)
-- These accounts can see and manage every team member's data, and get
-- the "Teams" breakdown view. Keep this list in sync with PRIMARY_EMAILS
-- in lib/constants.ts. Everyone else only ever sees their own rows.
-- ============================================================
create or replace function public.is_app_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any(
    array['adamangle@icloud.com', 'alexangle@me.com']
  );
$$;

-- ============================================================
-- Drop sections that are no longer part of the app, and drop the old
-- table shapes so they can be recreated with user_id ownership below.
-- ============================================================
drop table if exists call_log cascade;
drop table if exists checklist_tasks cascade;
drop table if exists checklist_settings cascade;
drop table if exists quarterly_goals cascade;
drop table if exists goals cascade;
drop table if exists streak_days cascade;
drop table if exists recognition_log cascade;
drop table if exists contacts cascade;
drop table if exists candidates cascade;
drop table if exists pipeline_periods cascade;

-- ============================================================
-- 1. PIPELINE TRACKER (one set of buckets per user)
-- ============================================================
create table pipeline_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_start date not null,
  questions int not null default 0,
  yeses int not null default 0,
  qi1 int not null default 0,
  qi2 int not null default 0,
  is1 int not null default 0,
  fu1 int not null default 0,
  is2 int not null default 0,
  fu2 int not null default 0,
  questionnaire int not null default 0,
  launches int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_type, period_start)
);

-- ============================================================
-- 2. CANDIDATE ROADMAP
-- current_step is an index (0-9) into the 10 roadmap steps defined in
-- lib/constants.ts (step 0 is "Yes," before a QI1 is booked). A
-- candidate only counts as "active in the pipeline" once current_step
-- >= ACTIVE_PIPELINE_MIN_STEP (1, i.e. QI1 booked or beyond). A candidate
-- can end up Launched or Filtered Out; both are independent flags so
-- either can be reversed later.
-- ============================================================
create table candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  current_step int not null default 0 check (current_step between 0 and 9),
  notes text not null default '',
  connected_date date not null default current_date,
  launched boolean not null default false,
  filtered_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Additive: lets a re-run of this section pick up connected_date on a
-- table that already existed before it was added.
alter table candidates add column if not exists connected_date date not null default current_date;

-- ============================================================
-- 3. A/B CONTACT LIST
-- ============================================================
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('A', 'B')),
  status text not null default 'Not yet asked',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. CORE RUN STREAK
-- One row per calendar day per user. Read / Listen / Daily Update /
-- Story Share — all 4 done counts as a streak day.
-- ============================================================
create table streak_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  read boolean not null default false,
  listen boolean not null default false,
  daily_update boolean not null default false,
  story_share boolean not null default false,
  read_what text not null default '',
  read_amount text not null default '',
  listen_what text not null default '',
  listen_count int not null default 0,
  listen_items text[] not null default '{}'::text[],
  story_shares int not null default 0,
  questions int not null default 0,
  yeses int not null default 0,
  meetings int not null default 0,
  meeting_items text[] not null default '{}'::text[],
  read_minutes int not null default 0,
  depth_texts int not null default 0,
  unique (user_id, day)
);

-- Additive: richer detail behind the same 4 qualifying flags above. The
-- app sets read/listen/story_share from these (non-empty amount, count
-- > 0) instead of a manual toggle — the booleans stay the actual streak
-- source of truth, so this doesn't touch qualifying logic or historical
-- streak continuity. questions/yeses/meetings are pure daily activity
-- counts with no bearing on the streak itself.
alter table streak_days add column if not exists read_what text not null default '';
alter table streak_days add column if not exists read_amount text not null default '';
alter table streak_days add column if not exists listen_what text not null default '';
alter table streak_days add column if not exists listen_count int not null default 0;
-- Individual audios logged for the day, added/removed one at a time in
-- the UI instead of one messy free-text field. listen_what/listen_count
-- are kept in sync (joined text / array length) purely so existing
-- readers (get_public_profile, the daily update summary) keep working
-- unchanged.
alter table streak_days add column if not exists listen_items text[] not null default '{}'::text[];
alter table streak_days add column if not exists story_shares int not null default 0;
alter table streak_days add column if not exists questions int not null default 0;
alter table streak_days add column if not exists yeses int not null default 0;
alter table streak_days add column if not exists meetings int not null default 0;
-- Same one-at-a-time pattern as listen_items: each entry is a free-text
-- detail of a meeting held that day (who/what), so the Daily Update
-- summary can show more than a bare count. meetings stays in sync as
-- the array length.
alter table streak_days add column if not exists meeting_items text[] not null default '{}'::text[];
-- Numeric minutes-read counter alongside the existing free-text
-- read_what/read_amount, so a reading goal can be a real trackable
-- number instead of unparseable free text. Superseded read_pages
-- (never widely used) with read_minutes to match how the Goals feature
-- actually phrases the reading goal ("Reading 20 minutes+").
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'streak_days' and column_name = 'read_pages'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'streak_days' and column_name = 'read_minutes'
  ) then
    alter table streak_days rename column read_pages to read_minutes;
  elsif not exists (
    select 1 from information_schema.columns
    where table_name = 'streak_days' and column_name = 'read_minutes'
  ) then
    alter table streak_days add column read_minutes int not null default 0;
  end if;
end $$;
-- Free-standing counter with no other existing analog in the app.
alter table streak_days add column if not exists depth_texts int not null default 0;

-- ============================================================
-- 4b. PERSONAL CIRCLE PV
-- One row per calendar month per user, self-reported. Core 300 means
-- 300+ PV for that month.
-- ============================================================
create table if not exists monthly_pv (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_start date not null,
  pv int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);

-- Additive: how much of that month's PV came through a Ditto order on
-- day 1 of the month. 100+ gets recognized on the Leaderboard.
alter table monthly_pv add column if not exists day1_ditto_pv int not null default 0;

-- ============================================================
-- 4c. CUSTOMER SALES LOG
-- A running log of customer sales/notes per month, shown on the Volume
-- tab. Not scored or aggregated anywhere — just a personal record.
-- ============================================================
create table if not exists customer_sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_start date not null,
  description text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. PROFILES
-- A directory of every signed-up account (just id + email), so the
-- admin can see who's on the team. Populated automatically by a
-- trigger whenever someone signs up, plus a backfill below for
-- accounts created before this table existed.
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- Additive: name + team fields. Existing accounts get prompted to fill
-- these in the next time they log in (see ProfileGate in the app).
alter table profiles add column if not exists first_name text;
alter table profiles add column if not exists last_name text;
alter table profiles add column if not exists team text;

-- Keep this list in sync with TEAMS in lib/constants.ts.
alter table profiles drop constraint if exists profiles_team_check;
alter table profiles add constraint profiles_team_check check (
  team is null or team in (
    'Angle Team', 'AA2 Team', 'Tucker Team', 'Scheerer Team', 'Abbott Team',
    'TX Team', 'Rodgers Team', 'Jones Team', 'Koebel Team'
  )
);

-- Additive: the public-facing profile shown when someone's name is
-- tapped on the Leaderboard. Optional and skippable — profile_prompted
-- just tracks whether the one-time "fill this in" screen has been shown
-- (either filled in or skipped) so it doesn't nag on every login.
alter table profiles add column if not exists photo_url text;
alter table profiles add column if not exists hometown text;
alter table profiles add column if not exists background text;
alter table profiles add column if not exists favorite_audio_1 text;
alter table profiles add column if not exists favorite_audio_2 text;
alter table profiles add column if not exists favorite_audio_3 text;
alter table profiles add column if not exists favorite_book_1 text;
alter table profiles add column if not exists favorite_book_2 text;
alter table profiles add column if not exists favorite_book_3 text;
alter table profiles add column if not exists team_impact text;
alter table profiles add column if not exists profile_prompted boolean not null default false;

-- Additive: household linking for a spouse/co-owner on the same business.
-- When set, this person's shared business tables (pipeline, candidates,
-- contacts, PV, customer sales — everything except Core Run Streak and
-- the profile itself) read/write against the linked partner's rows
-- instead of their own, so the two logins share one set of numbers.
-- Self-service via link_spouse() below; only one side ever sets this
-- (the side that "defers" to the other), so there's no cycle to resolve.
-- Additive: onboarding session gating. Session 1 is available to everyone
-- from signup; unlocking further sessions requires an explicit grant from
-- an upline (any level) or admin via grant_next_onboarding_session()
-- below — it's a manual approval step, not automatic on completion.
alter table profiles add column if not exists onboarding_unlocked_through int not null default 1;

alter table profiles add column if not exists household_id uuid references auth.users(id);
alter table profiles drop constraint if exists profiles_household_not_self;
alter table profiles add constraint profiles_household_not_self check (household_id is null or household_id <> id);

-- Additive: upline visibility. Every profile gets a short account_number
-- to hand out to recruits; a downline enters their upline's number
-- (link_upline() below) to set their own upline_id, which — unlike
-- household linking — is read-only visibility, not shared data. An
-- upline sees every level of their downline (recursive via is_upline_of),
-- same as a primary user sees everyone, including Assistant chat history.
alter table profiles add column if not exists account_number text;
alter table profiles add column if not exists upline_id uuid references auth.users(id);
alter table profiles drop constraint if exists profiles_upline_not_self;
alter table profiles add constraint profiles_upline_not_self check (upline_id is null or upline_id <> id);

create or replace function public.generate_account_number()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(floor(random() * 1000000)::text, 6, '0');
    exit when not exists (select 1 from profiles where account_number = candidate);
  end loop;
  return candidate;
end;
$$;

update profiles set account_number = public.generate_account_number() where account_number is null;

alter table profiles drop constraint if exists profiles_account_number_unique;
alter table profiles add constraint profiles_account_number_unique unique (account_number);

-- True if p_viewer is anywhere in p_target's upline chain (any level).
-- Security definer so it can walk the full profiles table regardless of
-- who's calling — the depth cap is just a safety net against a bad
-- upline_id cycle from manual data edits.
create or replace function public.is_upline_of(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, upline_id, 0 as depth from profiles where id = p_target
    union all
    select pr.id, pr.upline_id, c.depth + 1
    from profiles pr
    join chain c on pr.id = c.upline_id
    where c.depth < 20
  )
  select coalesce(p_viewer in (select upline_id from chain where upline_id is not null), false);
$$;

alter table profiles enable row level security;

drop policy if exists "select_own_or_admin" on profiles;
create policy "select_own_or_admin" on profiles for select
using (id = auth.uid() or public.is_upline_of(auth.uid(), id) or public.is_app_admin());

drop policy if exists "update_own" on profiles;
create policy "update_own" on profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- Self-service spouse linking (My Profile > Linked Spouse). Looks up the
-- partner by email (profiles.email isn't otherwise readable across users)
-- and, if valid, sets the caller's own household_id — the caller's
-- shared business tables then read/write against the partner's rows.
-- Unlinking is just a normal `update profiles set household_id = null`,
-- already covered by the update_own policy above.
create or replace function public.link_spouse(p_partner_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_household uuid;
  my_household uuid;
begin
  select id, household_id into target_id, target_household
  from profiles
  where lower(email) = lower(p_partner_email);

  if target_id is null then
    raise exception 'No account found with that email.';
  end if;

  if target_id = auth.uid() then
    raise exception 'You can''t link to your own account.';
  end if;

  if target_household is not null then
    raise exception 'That account is already linked to someone else.';
  end if;

  select household_id into my_household from profiles where id = auth.uid();
  if my_household is not null then
    raise exception 'You''re already linked to someone. Unlink first.';
  end if;

  update profiles set household_id = target_id where id = auth.uid();
end;
$$;

grant execute on function public.link_spouse(text) to authenticated;

-- Self-service upline linking (My Profile > My Upline). Looks up the
-- upline by their account_number and sets the caller's own upline_id —
-- read-only visibility for the upline going forward, not shared data.
-- Changing/removing your upline later is just a normal
-- `update profiles set upline_id = ...`, already covered by update_own.
create or replace function public.link_upline(p_account_number text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  select id into target_id from profiles where account_number = p_account_number;

  if target_id is null then
    raise exception 'No account found with that number.';
  end if;

  if target_id = auth.uid() then
    raise exception 'You can''t set yourself as your own upline.';
  end if;

  if public.is_upline_of(auth.uid(), target_id) then
    raise exception 'That would create a loop — they''re already in your downline.';
  end if;

  update profiles set upline_id = target_id where id = auth.uid();
end;
$$;

grant execute on function public.link_upline(text) to authenticated;

-- Admin or upline (any level) can permanently delete a downline's entire
-- account — for when someone quits the business. Deletes from
-- auth.users, which cascades to profiles and every table that
-- references it (pipeline, candidates, contacts, streak, PV, sales,
-- assistant messages) via "on delete cascade". Irreversible.
create or replace function public.delete_downline_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id = auth.uid() then
    raise exception 'Use account settings to delete your own account.';
  end if;

  if not (public.is_app_admin() or public.is_upline_of(auth.uid(), p_user_id)) then
    raise exception 'Not authorized to delete this account.';
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.delete_downline_account(uuid) to authenticated;

-- Unlocks the next Onboarding session for a downline member. Only their
-- upline (any level) or an admin can do this — it's a manual approval
-- step, never automatic. There's no upper bound checked here (the total
-- session count only lives in the app's ONBOARDING_SESSIONS constant);
-- the client clamps display so an extra grant past the last session is
-- harmless.
create or replace function public.grant_next_onboarding_session(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_app_admin() or public.is_upline_of(auth.uid(), p_user_id)) then
    raise exception 'Not authorized to grant onboarding access for this account.';
  end if;

  update profiles
  set onboarding_unlocked_through = onboarding_unlocked_through + 1
  where id = p_user_id;
end;
$$;

grant execute on function public.grant_next_onboarding_session(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, account_number)
  values (new.id, new.email, public.generate_account_number())
  on conflict (id) do nothing;

  -- Standing company-wide events (see section 15, COMPANY EVENTS) are a
  -- recurring rule, not a one-time backfill - anyone who signs up after
  -- an event was added still gets it on their calendar automatically, as
  -- long as it hasn't already passed.
  insert into public.calendar_events (user_id, creator_id, title, notes, event_at, scope)
  select new.id, coalesce(ce.created_by, new.id), ce.title, ce.notes, ce.event_at, 'downline'
  from public.company_events ce
  where ce.event_at >= now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ============================================================
-- 5b. PROFILE PHOTOS (STORAGE)
-- A public bucket for profile photos — public so teammates can view
-- each other's photo on the Leaderboard/profile page without a signed
-- URL, but uploads are restricted to a user's own folder
-- (avatars/<user_id>/...).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects for delete
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Current Core Run Streak length (consecutive qualifying days, counting
-- back from today or yesterday if today isn't done yet) — same logic as
-- the client-side streak calculation, just server-side so it can be
-- surfaced on a public profile. Security definer since streak_days is
-- otherwise only visible to the owner, their upline, or an admin.
create or replace function public.get_current_streak(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with recursive start_day as (
    select case when exists (
      select 1 from streak_days sd
      where sd.user_id = p_user_id and sd.day = current_date
        and sd.read and sd.listen and sd.daily_update and sd.story_share
    ) then current_date else current_date - 1 end as day
  ),
  w(day, ok, n) as (
    select
      s.day,
      exists (
        select 1 from streak_days sd
        where sd.user_id = p_user_id and sd.day = s.day
          and sd.read and sd.listen and sd.daily_update and sd.story_share
      ),
      0
    from start_day s
    union all
    select
      w.day - 1,
      exists (
        select 1 from streak_days sd
        where sd.user_id = p_user_id and sd.day = w.day - 1
          and sd.read and sd.listen and sd.daily_update and sd.story_share
      ),
      w.n + 1
    from w
    where w.ok and w.n < 3650
  )
  select coalesce(count(*) filter (where ok), 0)::int from w;
$$;

grant execute on function public.get_current_streak(uuid) to authenticated;

-- Longest Core Run Streak ever hit (gaps-and-islands over qualifying
-- days) — this is what milestone badges (1 week, 30/90 days, etc.) are
-- based on, so a badge earned once stays earned even after a streak
-- later resets.
create or replace function public.get_longest_streak(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with qualifying as (
    select day from streak_days
    where user_id = p_user_id
      and read and listen and daily_update and story_share
  ),
  islands as (
    select day - (row_number() over (order by day))::int * interval '1 day' as grp
    from qualifying
  )
  select coalesce(max(cnt), 0)::int
  from (select count(*) as cnt from islands group by grp) t;
$$;

grant execute on function public.get_longest_streak(uuid) to authenticated;

-- Public-safe profile view for the "tap a name on the Leaderboard" page.
-- Security definer so it can read any profile row, but only ever returns
-- the fields meant to be shared — never email or anything private.
-- Also surfaces what they're currently reading/listening to and their
-- Core Run Streak, pulled live from streak_days (still never exposes
-- their full day-by-day history, just the latest entry + two counts).
drop function if exists public.get_public_profile(uuid);

create or replace function public.get_public_profile(p_user_id uuid)
returns table (
  first_name text,
  last_name text,
  team text,
  photo_url text,
  hometown text,
  background text,
  favorite_audio_1 text,
  favorite_audio_2 text,
  favorite_audio_3 text,
  favorite_book_1 text,
  favorite_book_2 text,
  favorite_book_3 text,
  team_impact text,
  current_streak int,
  longest_streak int,
  last_read_what text,
  last_read_amount text,
  last_listen_what text,
  last_listen_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.first_name, pr.last_name, pr.team, pr.photo_url, pr.hometown, pr.background,
    pr.favorite_audio_1, pr.favorite_audio_2, pr.favorite_audio_3,
    pr.favorite_book_1, pr.favorite_book_2, pr.favorite_book_3, pr.team_impact,
    public.get_current_streak(p_user_id),
    public.get_longest_streak(p_user_id),
    (select sd.read_what from streak_days sd
      where sd.user_id = p_user_id and sd.read_amount <> ''
      order by sd.day desc limit 1),
    (select sd.read_amount from streak_days sd
      where sd.user_id = p_user_id and sd.read_amount <> ''
      order by sd.day desc limit 1),
    (select sd.listen_what from streak_days sd
      where sd.user_id = p_user_id and sd.listen_count > 0
      order by sd.day desc limit 1),
    (select sd.listen_count from streak_days sd
      where sd.user_id = p_user_id and sd.listen_count > 0
      order by sd.day desc limit 1)
  from profiles pr
  where pr.id = p_user_id;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;

-- Recently joined members, for a "new to the team" spotlight on the
-- Leaderboard — visible to everyone (not just admin/upline), same as
-- everything else there. Only surfaces name + team, and only once
-- they've completed the name/team profile gate.
create or replace function public.get_new_members(p_days int default 14)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  team text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, first_name, last_name, team, created_at
  from profiles
  where created_at >= now() - (p_days || ' days')::interval
    and first_name is not null
    and team is not null
  order by created_at desc;
$$;

grant execute on function public.get_new_members(int) to authenticated;

-- Recent Core Run Streak milestone hits (1 week, 30/90 days, 6 months, 1
-- year — must match STREAK_MILESTONES in lib/constants.ts), for a
-- "just hit it!" spotlight on the Leaderboard. A user matches while
-- their current streak is within 2 days of crossing a threshold, so it
-- naturally shows for a few days around the moment they hit it without
-- needing to store a separate "reached_at" date anywhere.
create or replace function public.get_recent_milestones()
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  team text,
  milestone_days int,
  current_streak int
)
language sql
stable
security definer
set search_path = public
as $$
  with streaks as (
    select p.id, p.first_name, p.last_name, p.team, public.get_current_streak(p.id) as streak
    from profiles p
    where p.team is not null
  )
  select s.id, s.first_name, s.last_name, s.team, t.d, s.streak
  from streaks s
  cross join unnest(array[7, 30, 90, 182, 365]) as t(d)
  where s.streak >= t.d and s.streak <= t.d + 2
  order by s.streak desc;
$$;

grant execute on function public.get_recent_milestones() to authenticated;

-- ============================================================
-- 6. ASSISTANT CHAT HISTORY
-- One row per chat message with the Angle Team AI Assistant, per user.
-- ============================================================
create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  image_data text,
  created_at timestamptz not null default now()
);

-- Additive: lets a re-run of this section pick up image_data on a table
-- that already existed before screenshot support was added.
alter table assistant_messages add column if not exists image_data text;

-- ============================================================
-- 7. TEAM PIPELINE TOTALS & LEADERBOARD
-- Every member's individual pipeline_periods row stays private via RLS
-- (below). These two functions are the only way to see across members:
-- both are SECURITY DEFINER so they can read every row, but each only
-- ever returns an aggregate or a name + QI1 count — never a member's
-- full private stage breakdown. Both are callable by any signed-in
-- user, since the Leaderboard is visible to the whole team.
-- ============================================================
create or replace function public.get_team_pipeline_totals(
  p_period_type text,
  p_period_start date
)
returns table (
  team text,
  member_count int,
  questions int,
  yeses int,
  qi1 int,
  qi2 int,
  is1 int,
  fu1 int,
  is2 int,
  fu2 int,
  questionnaire int,
  launches int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.team,
    count(distinct pr.id)::int as member_count,
    coalesce(sum(pp.questions), 0)::int as questions,
    coalesce(sum(pp.yeses), 0)::int as yeses,
    coalesce(sum(pp.qi1), 0)::int as qi1,
    coalesce(sum(pp.qi2), 0)::int as qi2,
    coalesce(sum(pp.is1), 0)::int as is1,
    coalesce(sum(pp.fu1), 0)::int as fu1,
    coalesce(sum(pp.is2), 0)::int as is2,
    coalesce(sum(pp.fu2), 0)::int as fu2,
    coalesce(sum(pp.questionnaire), 0)::int as questionnaire,
    coalesce(sum(pp.launches), 0)::int as launches
  from profiles pr
  left join pipeline_periods pp
    on pp.user_id = pr.id
   and pp.period_type = p_period_type
   and pp.period_start = p_period_start
  where pr.team is not null
  group by pr.team;
$$;

grant execute on function public.get_team_pipeline_totals(text, date) to authenticated;

-- Superseded by get_individual_leaders below (recognizes every category,
-- not just QI1).
drop function if exists public.get_qi1_leaderboard(text, date, int);

-- Individual leader(s) per category (every pipeline stage except
-- questions), for the given period. Ties are all returned rather than
-- picking an arbitrary winner.
create or replace function public.get_individual_leaders(
  p_period_type text,
  p_period_start date
)
returns table (
  category text,
  first_name text,
  last_name text,
  team text,
  value int,
  user_id uuid,
  partner_user_id uuid,
  partner_first_name text,
  partner_last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with periods as (
    select pp.*, pr.first_name, pr.last_name, pr.team,
           partner.id as partner_user_id,
           partner.first_name as partner_first_name,
           partner.last_name as partner_last_name
    from pipeline_periods pp
    join profiles pr on pr.id = pp.user_id
    left join profiles partner on partner.household_id = pr.id
    where pp.period_type = p_period_type
      and pp.period_start = p_period_start
  ),
  maxes as (
    select
      max(yeses) as yeses,
      max(qi1) as qi1,
      max(qi2) as qi2,
      max(is1) as is1,
      max(fu1) as fu1,
      max(is2) as is2,
      max(fu2) as fu2,
      max(questionnaire) as questionnaire,
      max(launches) as launches
    from periods
  )
  select 'yeses', p.first_name, p.last_name, p.team, p.yeses, p.user_id, p.partner_user_id, p.partner_first_name, p.partner_last_name
  from periods p, maxes m where p.yeses = m.yeses and m.yeses > 0
  union all
  select 'qi1', p.first_name, p.last_name, p.team, p.qi1, p.user_id, p.partner_user_id, p.partner_first_name, p.partner_last_name
  from periods p, maxes m where p.qi1 = m.qi1 and m.qi1 > 0
  union all
  select 'qi2', p.first_name, p.last_name, p.team, p.qi2, p.user_id, p.partner_user_id, p.partner_first_name, p.partner_last_name
  from periods p, maxes m where p.qi2 = m.qi2 and m.qi2 > 0
  union all
  select 'is1', p.first_name, p.last_name, p.team, p.is1, p.user_id, p.partner_user_id, p.partner_first_name, p.partner_last_name
  from periods p, maxes m where p.is1 = m.is1 and m.is1 > 0
  union all
  select 'fu1', p.first_name, p.last_name, p.team, p.fu1, p.user_id, p.partner_user_id, p.partner_first_name, p.partner_last_name
  from periods p, maxes m where p.fu1 = m.fu1 and m.fu1 > 0
  union all
  select 'is2', p.first_name, p.last_name, p.team, p.is2, p.user_id, p.partner_user_id, p.partner_first_name, p.partner_last_name
  from periods p, maxes m where p.is2 = m.is2 and m.is2 > 0
  union all
  select 'fu2', p.first_name, p.last_name, p.team, p.fu2, p.user_id, p.partner_user_id, p.partner_first_name, p.partner_last_name
  from periods p, maxes m where p.fu2 = m.fu2 and m.fu2 > 0
  union all
  select 'questionnaire', p.first_name, p.last_name, p.team, p.questionnaire, p.user_id, p.partner_user_id, p.partner_first_name, p.partner_last_name
  from periods p, maxes m where p.questionnaire = m.questionnaire and m.questionnaire > 0
  union all
  select 'launches', p.first_name, p.last_name, p.team, p.launches, p.user_id, p.partner_user_id, p.partner_first_name, p.partner_last_name
  from periods p, maxes m where p.launches = m.launches and m.launches > 0;
$$;

grant execute on function public.get_individual_leaders(text, date) to authenticated;

-- Everyone currently on a Core Run Streak (all 4 activities, every day,
-- ending today or yesterday) and how many consecutive days it's been.
create or replace function public.get_streak_leaderboard()
returns table (
  first_name text,
  last_name text,
  team text,
  streak_days int,
  user_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive qualifying as (
    select user_id, day
    from streak_days
    where read and listen and daily_update and story_share
  ),
  walk(user_id, day, streak_days) as (
    select q.user_id, q.day, 1
    from qualifying q
    where q.day = current_date or q.day = current_date - 1
    union all
    select w.user_id, q.day, w.streak_days + 1
    from walk w
    join qualifying q on q.user_id = w.user_id and q.day = w.day - 1
  ),
  best_per_user as (
    select user_id, max(streak_days) as streak_days
    from walk
    group by user_id
  )
  select pr.first_name, pr.last_name, pr.team, b.streak_days::int, pr.id
  from best_per_user b
  join profiles pr on pr.id = b.user_id
  order by b.streak_days desc;
$$;

grant execute on function public.get_streak_leaderboard() to authenticated;

-- Everyone at Core 300 (300+ personal circle PV) for the given month,
-- ranked by PV.
create or replace function public.get_core300_leaderboard(
  p_period_start date
)
returns table (
  first_name text,
  last_name text,
  team text,
  pv int,
  user_id uuid,
  partner_user_id uuid,
  partner_first_name text,
  partner_last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.first_name, pr.last_name, pr.team, mp.pv, pr.id,
         partner.id, partner.first_name, partner.last_name
  from monthly_pv mp
  join profiles pr on pr.id = mp.user_id
  left join profiles partner on partner.household_id = pr.id
  where mp.period_start = p_period_start
    and mp.pv >= 300
  order by mp.pv desc;
$$;

grant execute on function public.get_core300_leaderboard(date) to authenticated;

-- Everyone currently running 5+ active candidates through the roadmap
-- (not launched, not filtered out, and a QI1 has actually been booked —
-- current_step >= 1), ranked by how many.
create or replace function public.get_active_candidates_leaderboard()
returns table (
  first_name text,
  last_name text,
  team text,
  active_count int,
  user_id uuid,
  partner_user_id uuid,
  partner_first_name text,
  partner_last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.first_name, pr.last_name, pr.team, cc.active_count, pr.id,
         partner.id, partner.first_name, partner.last_name
  from (
    select user_id, count(*)::int as active_count
    from candidates
    where launched = false and filtered_out = false and current_step >= 1
    group by user_id
    having count(*) >= 5
  ) cc
  join profiles pr on pr.id = cc.user_id
  left join profiles partner on partner.household_id = pr.id
  order by cc.active_count desc;
$$;

grant execute on function public.get_active_candidates_leaderboard() to authenticated;

-- Everyone at or above a QI1 threshold for the period (2+/week, 8+/month
-- are the rhythms we recognize), ranked highest to lowest.
create or replace function public.get_qi1_rhythm_leaderboard(
  p_period_type text,
  p_period_start date,
  p_min_qi1 int
)
returns table (
  first_name text,
  last_name text,
  team text,
  qi1 int,
  user_id uuid,
  partner_user_id uuid,
  partner_first_name text,
  partner_last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.first_name, pr.last_name, pr.team, pp.qi1, pr.id,
         partner.id, partner.first_name, partner.last_name
  from pipeline_periods pp
  join profiles pr on pr.id = pp.user_id
  left join profiles partner on partner.household_id = pr.id
  where pp.period_type = p_period_type
    and pp.period_start = p_period_start
    and pp.qi1 >= p_min_qi1
  order by pp.qi1 desc;
$$;

grant execute on function public.get_qi1_rhythm_leaderboard(text, date, int) to authenticated;

-- Everyone with 100+ PV from a day-1 Ditto order for the given month,
-- ranked by that amount.
create or replace function public.get_ditto_leaderboard(
  p_period_start date
)
returns table (
  first_name text,
  last_name text,
  team text,
  day1_ditto_pv int,
  user_id uuid,
  partner_user_id uuid,
  partner_first_name text,
  partner_last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.first_name, pr.last_name, pr.team, mp.day1_ditto_pv, pr.id,
         partner.id, partner.first_name, partner.last_name
  from monthly_pv mp
  join profiles pr on pr.id = mp.user_id
  left join profiles partner on partner.household_id = pr.id
  where mp.period_start = p_period_start
    and mp.day1_ditto_pv > 100
  order by mp.day1_ditto_pv desc;
$$;

grant execute on function public.get_ditto_leaderboard(date) to authenticated;

-- ============================================================
-- Row Level Security
--
-- Personal tables (streak_days, assistant_messages): never shared with a
-- linked spouse — Core Run Streak and assistant chat history stay
-- individual even for a linked household. They ARE visible read-only to
-- an upline (any level) or admin, same as the business tables below —
-- that's the whole point of upline linking, seeing a downline's numbers
-- AND their Assistant conversations. (calendar_events, added later in
-- this file, follows the exact same shape but gets its own explicit
-- policies there instead of joining this loop, since it's defined after
-- this point runs.)
-- ============================================================
do $$
declare
  t text;
begin
  for t in
    select unnest(array['streak_days', 'assistant_messages'])
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists "select_own_or_admin" on %I;', t);
    execute format(
      'create policy "select_own_or_admin" on %I for select using (user_id = auth.uid() or public.is_upline_of(auth.uid(), user_id) or public.is_app_admin());',
      t
    );

    execute format('drop policy if exists "insert_own" on %I;', t);
    execute format(
      'create policy "insert_own" on %I for insert with check (user_id = auth.uid());',
      t
    );

    execute format('drop policy if exists "update_own_or_admin" on %I;', t);
    execute format(
      'create policy "update_own_or_admin" on %I for update using (user_id = auth.uid() or public.is_app_admin()) with check (user_id = auth.uid() or public.is_app_admin());',
      t
    );

    execute format('drop policy if exists "delete_own_or_admin" on %I;', t);
    execute format(
      'create policy "delete_own_or_admin" on %I for delete using (user_id = auth.uid() or public.is_app_admin());',
      t
    );
  end loop;
end $$;

-- ============================================================
-- Household-shareable tables: pipeline, candidates, contacts, PV, and
-- customer sales are the "same business" data — a user_id here can be
-- either the caller's own id OR the id they've linked to via
-- link_spouse() (household_id), so a linked pair reads/writes one
-- shared set of rows instead of two separate ones. Also readable
-- (read-only) by an upline at any level, or admin.
-- ============================================================
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'pipeline_periods', 'candidates', 'contacts', 'monthly_pv', 'customer_sales'
    ])
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists "select_own_or_admin" on %I;', t);
    execute format(
      'create policy "select_own_or_admin" on %I for select using (user_id = auth.uid() or user_id = (select household_id from profiles where id = auth.uid()) or public.is_upline_of(auth.uid(), user_id) or public.is_app_admin());',
      t
    );

    execute format('drop policy if exists "insert_own" on %I;', t);
    execute format(
      'create policy "insert_own" on %I for insert with check (user_id = auth.uid() or user_id = (select household_id from profiles where id = auth.uid()));',
      t
    );

    execute format('drop policy if exists "update_own_or_admin" on %I;', t);
    execute format(
      'create policy "update_own_or_admin" on %I for update using (user_id = auth.uid() or user_id = (select household_id from profiles where id = auth.uid()) or public.is_app_admin()) with check (user_id = auth.uid() or user_id = (select household_id from profiles where id = auth.uid()) or public.is_app_admin());',
      t
    );

    execute format('drop policy if exists "delete_own_or_admin" on %I;', t);
    execute format(
      'create policy "delete_own_or_admin" on %I for delete using (user_id = auth.uid() or user_id = (select household_id from profiles where id = auth.uid()) or public.is_app_admin());',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 8. LEADERBOARD LIKES
-- Anyone can "like" a specific leaderboard ranking so the team can cheer
-- each other on — likes are visible to everyone, same as the Leaderboard
-- itself. entry_key is a client-built string identifying one specific
-- ranking row (e.g. "streak:<user_id>" or
-- "individual:weekly:2026-07-20:yeses"), not a foreign key to anything,
-- since leaderboard rows are computed on the fly rather than stored.
-- ============================================================
create table if not exists leaderboard_likes (
  id uuid primary key default gen_random_uuid(),
  entry_key text not null,
  liker_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (entry_key, liker_id)
);

alter table leaderboard_likes enable row level security;

drop policy if exists "leaderboard_likes_select_all" on leaderboard_likes;
create policy "leaderboard_likes_select_all" on leaderboard_likes
for select using (true);

drop policy if exists "leaderboard_likes_insert_own" on leaderboard_likes;
create policy "leaderboard_likes_insert_own" on leaderboard_likes
for insert with check (liker_id = auth.uid());

drop policy if exists "leaderboard_likes_delete_own" on leaderboard_likes;
create policy "leaderboard_likes_delete_own" on leaderboard_likes
for delete using (liker_id = auth.uid());

-- Resolves liker_id -> display name for the "who liked this" list, since
-- ordinary profile RLS wouldn't let a random teammate read someone else's
-- name directly.
-- ============================================================
-- 9. PUSH SUBSCRIPTIONS
-- One row per device/browser a user has enabled Daily Reminders on. The
-- cron-triggered /api/push/send-reminders route reads across everyone's
-- rows using the service role key (bypasses RLS); ordinary app usage
-- only ever touches your own row via these policies.
-- ============================================================
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on push_subscriptions;
create policy "push_subscriptions_select_own" on push_subscriptions
for select using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on push_subscriptions;
create policy "push_subscriptions_insert_own" on push_subscriptions
for insert with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_update_own" on push_subscriptions;
create policy "push_subscriptions_update_own" on push_subscriptions
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on push_subscriptions;
create policy "push_subscriptions_delete_own" on push_subscriptions
for delete using (user_id = auth.uid());

-- ============================================================
-- 10. DIAMOND RUN (mini-game)
-- One row per user tracking their best score. The game itself is
-- entirely client-side (canvas), so this is purely for the fun
-- high-score leaderboard — no anti-cheat, same trust level as any other
-- self-reported number in this app.
-- ============================================================
create table if not exists game_high_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  best_score int not null default 0,
  updated_at timestamptz not null default now()
);

alter table game_high_scores enable row level security;

drop policy if exists "game_high_scores_select_all" on game_high_scores;
create policy "game_high_scores_select_all" on game_high_scores
for select using (true);

drop policy if exists "game_high_scores_insert_own" on game_high_scores;
create policy "game_high_scores_insert_own" on game_high_scores
for insert with check (user_id = auth.uid());

drop policy if exists "game_high_scores_update_own" on game_high_scores;
create policy "game_high_scores_update_own" on game_high_scores
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.get_game_leaderboard()
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  best_score int
)
language sql
stable
security definer
set search_path = public
as $$
  select g.user_id, p.first_name, p.last_name, g.best_score
  from game_high_scores g
  join profiles p on p.id = g.user_id
  order by g.best_score desc
  limit 20;
$$;

grant execute on function public.get_game_leaderboard() to authenticated;

-- ============================================================
-- 11. DIAMOND CHASE (mini-game)
-- Same shape/pattern as game_high_scores above (Diamond Run) - a
-- second, independent mini-game's best-score table. Also client-side
-- only, same no-anti-cheat trust level.
-- ============================================================
create table if not exists snake_high_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  best_score int not null default 0,
  updated_at timestamptz not null default now()
);

alter table snake_high_scores enable row level security;

drop policy if exists "snake_high_scores_select_all" on snake_high_scores;
create policy "snake_high_scores_select_all" on snake_high_scores
for select using (true);

drop policy if exists "snake_high_scores_insert_own" on snake_high_scores;
create policy "snake_high_scores_insert_own" on snake_high_scores
for insert with check (user_id = auth.uid());

drop policy if exists "snake_high_scores_update_own" on snake_high_scores;
create policy "snake_high_scores_update_own" on snake_high_scores
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.get_snake_leaderboard()
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  best_score int
)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, p.first_name, p.last_name, s.best_score
  from snake_high_scores s
  join profiles p on p.id = s.user_id
  order by s.best_score desc
  limit 20;
$$;

grant execute on function public.get_snake_leaderboard() to authenticated;

-- ============================================================
-- 12. TRIVIA (mini-game)
-- Redesigned as a daily challenge rather than unlimited-play survival
-- mode: everyone gets the same 5 questions on a given calendar day
-- (picked deterministically from TRIVIA_QUESTIONS by lib/trivia-data.ts
-- using the date as a seed, so no server-side "today's questions"
-- state is needed). Gated behind completing that day's Core Run (same
-- streak_days check as Diamond Run). One attempt per day - getting a
-- question wrong or finishing all 5 both end the attempt; the
-- (user_id, day) primary key below is what actually enforces "no
-- do-overs" even if a client tried to bypass the UI. The streak is
-- consecutive calendar days with a perfect 5/5, computed the same way
-- as Core Run Streak (get_current_streak) rather than stored, so it
-- can never drift out of sync with the underlying rows.
-- ============================================================
drop table if exists trivia_high_scores cascade;

create table if not exists trivia_daily_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  correct_count int not null default 0,
  total_count int not null default 5,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table trivia_daily_results enable row level security;

drop policy if exists "trivia_daily_results_select_own_or_admin" on trivia_daily_results;
create policy "trivia_daily_results_select_own_or_admin" on trivia_daily_results
for select using (
  user_id = auth.uid()
  or public.is_upline_of(auth.uid(), user_id)
  or public.is_app_admin()
);

drop policy if exists "trivia_daily_results_insert_own" on trivia_daily_results;
create policy "trivia_daily_results_insert_own" on trivia_daily_results
for insert with check (user_id = auth.uid());

-- Consecutive perfect (correct_count = total_count) days, counting back
-- from today (or yesterday if today isn't a perfect result yet) - same
-- recursive-CTE shape as get_current_streak for Core Run Streak.
create or replace function public.get_trivia_streak(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with recursive start_day as (
    select case when exists (
      select 1 from trivia_daily_results t
      where t.user_id = p_user_id and t.day = current_date
        and t.total_count > 0 and t.correct_count = t.total_count
    ) then current_date else current_date - 1 end as day
  ),
  w(day, ok, n) as (
    select
      s.day,
      exists (
        select 1 from trivia_daily_results t
        where t.user_id = p_user_id and t.day = s.day
          and t.total_count > 0 and t.correct_count = t.total_count
      ),
      0
    from start_day s
    union all
    select
      w.day - 1,
      exists (
        select 1 from trivia_daily_results t
        where t.user_id = p_user_id and t.day = w.day - 1
          and t.total_count > 0 and t.correct_count = t.total_count
      ),
      w.n + 1
    from w
    where w.ok and w.n < 3650
  )
  select coalesce(count(*) filter (where ok), 0)::int from w;
$$;

grant execute on function public.get_trivia_streak(uuid) to authenticated;

create or replace function public.get_trivia_streak_leaderboard()
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  best_score int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, public.get_trivia_streak(p.id) as streak
  from profiles p
  where p.team is not null
    and public.get_trivia_streak(p.id) > 0
  order by streak desc
  limit 20;
$$;

grant execute on function public.get_trivia_streak_leaderboard() to authenticated;

create or replace function public.get_likers(p_entry_keys text[])
returns table (
  entry_key text,
  user_id uuid,
  first_name text,
  last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.entry_key, l.liker_id, p.first_name, p.last_name
  from leaderboard_likes l
  join profiles p on p.id = l.liker_id
  where l.entry_key = any(p_entry_keys);
$$;

grant execute on function public.get_likers(text[]) to authenticated;

-- ============================================================
-- 13. GOALS ("Your goal today/this week/this month is...")
-- Individual, same as Core Run Streak (not household-shared) - one
-- target number per metric per period (daily/weekly/monthly), each
-- staying the same until manually changed. No live actual-vs-target
-- display (that caused repeated confusion and was dropped) - this is
-- purely a goal-setting list: Reading minutes, Audios, Conversations,
-- Story Shares, Questions, Yeses (Depth Texts dropped from Goals - it's
-- still tracked as its own counter on Core Run Streak, just not
-- goal-settable).
-- ============================================================
drop table if exists goals cascade;

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  metric text not null check (
    metric in (
      'read_minutes', 'audios', 'conversations', 'story_shares', 'questions', 'yeses', 'qi1s'
    )
  ),
  period text not null check (period in ('daily', 'weekly', 'monthly')),
  target int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, metric, period)
);

alter table goals enable row level security;

drop policy if exists "goals_select_own_or_upline_or_admin" on goals;
create policy "goals_select_own_or_upline_or_admin" on goals
for select using (
  user_id = auth.uid()
  or public.is_upline_of(auth.uid(), user_id)
  or public.is_app_admin()
);

drop policy if exists "goals_insert_own" on goals;
create policy "goals_insert_own" on goals
for insert with check (user_id = auth.uid());

drop policy if exists "goals_update_own" on goals;
create policy "goals_update_own" on goals
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "goals_delete_own" on goals;
create policy "goals_delete_own" on goals
for delete using (user_id = auth.uid());

-- ============================================================
-- 14. CALENDAR
-- One system for both personal reminders (e.g. "follow up with this
-- candidate in 3 months") and team-wide events (meetings, info
-- sessions, master classes, conferences) - `scope` just labels which
-- kind an event is for display, RLS treats every row the same way as
-- the other personal tables above (own + upline + admin can read).
-- `user_id` is whose calendar the row shows on; `creator_id` is who
-- actually made it, so a broadcast row shows who sent it.
-- ============================================================
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creator_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  notes text not null default '',
  event_at timestamptz not null,
  candidate_id uuid references candidates(id) on delete set null,
  scope text not null default 'private' check (scope in ('private', 'downline')),
  created_at timestamptz not null default now()
);

-- Same shape as the "personal tables" policies above (streak_days,
-- assistant_messages) - own + upline + admin can read, only the owner
-- (or admin) can write. Written out explicitly rather than joining that
-- loop since this table doesn't exist yet at the point it runs.
alter table calendar_events enable row level security;

drop policy if exists "calendar_events_select_own_or_admin" on calendar_events;
create policy "calendar_events_select_own_or_admin" on calendar_events
for select using (
  user_id = auth.uid()
  or public.is_upline_of(auth.uid(), user_id)
  or public.is_app_admin()
);

drop policy if exists "calendar_events_insert_own" on calendar_events;
create policy "calendar_events_insert_own" on calendar_events
for insert with check (user_id = auth.uid());

drop policy if exists "calendar_events_update_own_or_admin" on calendar_events;
create policy "calendar_events_update_own_or_admin" on calendar_events
for update using (user_id = auth.uid() or public.is_app_admin())
with check (user_id = auth.uid() or public.is_app_admin());

drop policy if exists "calendar_events_delete_own_or_admin" on calendar_events;
create policy "calendar_events_delete_own_or_admin" on calendar_events
for delete using (user_id = auth.uid() or public.is_app_admin());

-- All of a user's downline (any level), for the broadcast function
-- below - is_upline_of only answers "is A upline of B", so this wraps
-- it into "give me every B for this A." Excludes a linked spouse even
-- if they also happen to satisfy is_upline_of (e.g. they entered this
-- person's account number as their own upline when they signed up) -
-- their business data resolves to the exact same owner as this
-- account's own, so they're not really "downline."
create or replace function public.get_downline_user_ids(p_user_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles
  where public.is_upline_of(p_user_id, id)
    and coalesce(household_id, id) <> coalesce(
      (select household_id from profiles where id = p_user_id), p_user_id
    );
$$;

grant execute on function public.get_downline_user_ids(uuid) to authenticated;

-- Inserts one copy of the event per downline member (any level), each
-- owned by that member so it shows on their own calendar too, not just
-- the creator's. Security definer because the normal insert_own RLS
-- policy would otherwise only allow inserting rows for yourself.
create or replace function public.broadcast_event_to_downline(
  p_title text,
  p_notes text,
  p_event_at timestamptz,
  p_candidate_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into calendar_events (user_id, creator_id, title, notes, event_at, candidate_id, scope)
  select d.user_id, auth.uid(), p_title, p_notes, p_event_at, p_candidate_id, 'downline'
  from public.get_downline_user_ids(auth.uid()) d;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.broadcast_event_to_downline(text, text, timestamptz, uuid) to authenticated;

-- ============================================================
-- 15. COMPANY EVENTS (standing, recurring team events)
--
-- Unlike broadcast_event_to_downline (a one-time push to whoever is
-- currently in your downline), a company event is a standing rule: it
-- goes out to every current member right away, AND handle_new_user()
-- above copies every still-upcoming company event onto any new
-- signup's calendar automatically, from here on.
-- ============================================================
create table if not exists company_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text not null default '',
  event_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (title, event_at)
);

alter table company_events enable row level security;

drop policy if exists "company_events_select_all" on company_events;
create policy "company_events_select_all" on company_events
for select using (true);

drop policy if exists "company_events_insert_admin" on company_events;
create policy "company_events_insert_admin" on company_events
for insert with check (public.is_app_admin());

drop policy if exists "company_events_update_admin" on company_events;
create policy "company_events_update_admin" on company_events
for update using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "company_events_delete_admin" on company_events;
create policy "company_events_delete_admin" on company_events
for delete using (public.is_app_admin());

-- Admin-only: records the standing rule (company_events, for future
-- signups) AND immediately broadcasts it to every current member's
-- calendar (on conflict do nothing, so re-running with the same
-- title+time never double-books anyone).
create or replace function public.add_company_event(
  p_title text,
  p_notes text,
  p_event_at timestamptz
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_app_admin() then
    raise exception 'Only an admin can add a company event.';
  end if;

  insert into company_events (title, notes, event_at, created_by)
  values (p_title, p_notes, p_event_at, auth.uid())
  on conflict (title, event_at) do update set notes = excluded.notes;

  insert into calendar_events (user_id, creator_id, title, notes, event_at, scope)
  select p.id, auth.uid(), p_title, p_notes, p_event_at, 'downline'
  from profiles p
  where not exists (
    select 1 from calendar_events e
    where e.user_id = p.id and e.title = p_title and e.event_at = p_event_at
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.add_company_event(text, text, timestamptz) to authenticated;

-- Admin-only: removes the standing rule so future signups stop getting
-- it. Does not retroactively pull it off anyone's calendar who already
-- has it (they can remove their own copy the same way as any other
-- event, via the existing delete button).
create or replace function public.remove_company_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Only an admin can remove a company event.';
  end if;

  delete from company_events where id = p_id;
end;
$$;

grant execute on function public.remove_company_event(uuid) to authenticated;
