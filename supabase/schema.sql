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
-- current_step is an index (0-8) into the 9 roadmap steps defined in
-- lib/constants.ts. A candidate can end up Launched or Filtered Out;
-- both are independent flags so either can be reversed later.
-- ============================================================
create table candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  current_step int not null default 0 check (current_step between 0 and 8),
  notes text not null default '',
  launched boolean not null default false,
  filtered_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  unique (user_id, day)
);

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

alter table profiles enable row level security;

drop policy if exists "select_own_or_admin" on profiles;
create policy "select_own_or_admin" on profiles for select
using (id = auth.uid() or public.is_app_admin());

drop policy if exists "update_own" on profiles;
create policy "update_own" on profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
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
  value int
)
language sql
stable
security definer
set search_path = public
as $$
  with periods as (
    select pp.*, pr.first_name, pr.last_name, pr.team
    from pipeline_periods pp
    join profiles pr on pr.id = pp.user_id
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
  select 'yeses', p.first_name, p.last_name, p.team, p.yeses
  from periods p, maxes m where p.yeses = m.yeses and m.yeses > 0
  union all
  select 'qi1', p.first_name, p.last_name, p.team, p.qi1
  from periods p, maxes m where p.qi1 = m.qi1 and m.qi1 > 0
  union all
  select 'qi2', p.first_name, p.last_name, p.team, p.qi2
  from periods p, maxes m where p.qi2 = m.qi2 and m.qi2 > 0
  union all
  select 'is1', p.first_name, p.last_name, p.team, p.is1
  from periods p, maxes m where p.is1 = m.is1 and m.is1 > 0
  union all
  select 'fu1', p.first_name, p.last_name, p.team, p.fu1
  from periods p, maxes m where p.fu1 = m.fu1 and m.fu1 > 0
  union all
  select 'is2', p.first_name, p.last_name, p.team, p.is2
  from periods p, maxes m where p.is2 = m.is2 and m.is2 > 0
  union all
  select 'fu2', p.first_name, p.last_name, p.team, p.fu2
  from periods p, maxes m where p.fu2 = m.fu2 and m.fu2 > 0
  union all
  select 'questionnaire', p.first_name, p.last_name, p.team, p.questionnaire
  from periods p, maxes m where p.questionnaire = m.questionnaire and m.questionnaire > 0
  union all
  select 'launches', p.first_name, p.last_name, p.team, p.launches
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
  streak_days int
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
  select pr.first_name, pr.last_name, pr.team, b.streak_days::int
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
  pv int
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.first_name, pr.last_name, pr.team, mp.pv
  from monthly_pv mp
  join profiles pr on pr.id = mp.user_id
  where mp.period_start = p_period_start
    and mp.pv >= 300
  order by mp.pv desc;
$$;

grant execute on function public.get_core300_leaderboard(date) to authenticated;

-- Everyone currently running 5+ active candidates (not launched, not
-- filtered out) through the roadmap, ranked by how many.
create or replace function public.get_active_candidates_leaderboard()
returns table (
  first_name text,
  last_name text,
  team text,
  active_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.first_name, pr.last_name, pr.team, cc.active_count
  from (
    select user_id, count(*)::int as active_count
    from candidates
    where launched = false and filtered_out = false
    group by user_id
    having count(*) >= 5
  ) cc
  join profiles pr on pr.id = cc.user_id
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
  qi1 int
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.first_name, pr.last_name, pr.team, pp.qi1
  from pipeline_periods pp
  join profiles pr on pr.id = pp.user_id
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
  day1_ditto_pv int
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.first_name, pr.last_name, pr.team, mp.day1_ditto_pv
  from monthly_pv mp
  join profiles pr on pr.id = mp.user_id
  where mp.period_start = p_period_start
    and mp.day1_ditto_pv > 100
  order by mp.day1_ditto_pv desc;
$$;

grant execute on function public.get_ditto_leaderboard(date) to authenticated;

-- ============================================================
-- Row Level Security
-- Every table: a user can only read/write their own rows. The admin
-- (is_app_admin() above) can additionally read, update, or delete every
-- row, for oversight — but inserts always attribute to whoever is
-- actually logged in, admin included.
-- ============================================================
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'pipeline_periods', 'candidates', 'contacts',
      'streak_days', 'assistant_messages', 'monthly_pv', 'customer_sales'
    ])
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists "select_own_or_admin" on %I;', t);
    execute format(
      'create policy "select_own_or_admin" on %I for select using (user_id = auth.uid() or public.is_app_admin());',
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
