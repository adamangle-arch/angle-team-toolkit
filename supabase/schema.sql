-- Angle Team Toolkit — Supabase schema
-- Run this whole file in the Supabase SQL Editor (Project > SQL Editor > New query).
--
-- This version adds email/password accounts: every team member's data is
-- private to them. Re-running this file DROPS AND RECREATES every app
-- table (any test data you already entered will be cleared) so the new
-- per-user shape and permissions are applied cleanly.

create extension if not exists "pgcrypto";

-- ============================================================
-- Admin override
-- Change the email below to whichever Supabase Auth account should be
-- able to see and manage every team member's data. Everyone else only
-- ever sees their own rows through the app.
-- ============================================================
create or replace function public.is_app_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = lower('adamangle@icloud.com');
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
-- Story Share — 3+ of 4 done counts as a streak day.
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

alter table profiles enable row level security;

drop policy if exists "select_own_or_admin" on profiles;
create policy "select_own_or_admin" on profiles for select
using (id = auth.uid() or public.is_app_admin());

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
      'streak_days', 'assistant_messages'
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
