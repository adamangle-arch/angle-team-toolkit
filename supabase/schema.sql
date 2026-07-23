-- Angle Team Toolkit — Supabase schema
-- Run this whole file once in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / ON CONFLICT.

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PIPELINE TRACKER
-- One row per week/month "bucket". A new row is created automatically
-- by the app the first time it sees a new week or month, which is how
-- the tracker "auto-resets" while keeping history of past periods.
-- ============================================================
create table if not exists pipeline_periods (
  id uuid primary key default gen_random_uuid(),
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
  unique (period_type, period_start)
);

-- ============================================================
-- 2. CANDIDATE ROADMAP
-- current_step is an index (0-8) into the 9 roadmap steps defined in
-- lib/constants.ts: QI1, QI2, Audio & Reading, Info Session 1, FU1,
-- Audio & Reading, Info Session 2, FU2, Offer Call.
-- ============================================================
create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  current_step int not null default 0 check (current_step between 0 and 8),
  notes text not null default '',
  launched boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3. FIRST 30 DAYS CHECKLIST
-- checklist_settings is a singleton row holding the program start date.
-- checklist_tasks holds the 15 fixed tasks (5 categories x 3 tasks),
-- seeded below.
-- ============================================================
create table if not exists checklist_settings (
  id int primary key default 1 check (id = 1),
  start_date date not null default current_date
);

insert into checklist_settings (id, start_date)
values (1, current_date)
on conflict (id) do nothing;

create table if not exists checklist_tasks (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  task_key text not null,
  label text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  sort_order int not null default 0,
  unique (category, task_key)
);

insert into checklist_tasks (category, task_key, label, sort_order) values
  ('Build Your List', 'list_1', 'Write down 30+ names, no pre-judging', 1),
  ('Build Your List', 'list_2', 'Add contacts to your CRM / contact list', 2),
  ('Build Your List', 'list_3', 'Ask 3 people for referrals', 3),
  ('Upline Communication', 'upline_1', 'Schedule a weekly call with your upline', 4),
  ('Upline Communication', 'upline_2', 'Share your list with your upline for feedback', 5),
  ('Upline Communication', 'upline_3', 'Ask your upline to 3-way your first calls', 6),
  ('Attend Events', 'events_1', 'Attend a local team meeting', 7),
  ('Attend Events', 'events_2', 'Attend a company call or webinar', 8),
  ('Attend Events', 'events_3', 'Register for the next major event', 9),
  ('Listen & Read', 'listen_1', 'Listen to the recommended audio series', 10),
  ('Listen & Read', 'listen_2', 'Read the recommended book/chapter', 11),
  ('Listen & Read', 'listen_3', 'Listen to a testimonial call', 12),
  ('Try the Products', 'products_1', 'Personally use the core product(s)', 13),
  ('Try the Products', 'products_2', 'Share your personal results with 3 people', 14),
  ('Try the Products', 'products_3', 'Order/organize your product samples', 15)
on conflict (category, task_key) do nothing;

-- ============================================================
-- 4. A/B CONTACT LIST
-- ============================================================
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('A', 'B')),
  status text not null default 'Not yet asked',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 5. CALL LOG
-- ============================================================
create table if not exists call_log (
  id uuid primary key default gen_random_uuid(),
  candidate_name text not null,
  call_type text not null,
  score int not null check (score between 1 and 10),
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. SELF-EDUCATION STREAK
-- One row per calendar day.
-- ============================================================
create table if not exists streak_days (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  read boolean not null default false,
  listen boolean not null default false,
  associate boolean not null default false,
  events boolean not null default false
);

-- ============================================================
-- 7. RECOGNITION LOG
-- ============================================================
create table if not exists recognition_log (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  event_date date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 8. GOALS
-- goals is a singleton row for the 10-year vision text.
-- quarterly_goals is a checkable list.
-- ============================================================
create table if not exists goals (
  id int primary key default 1 check (id = 1),
  vision text not null default '',
  updated_at timestamptz not null default now()
);

insert into goals (id, vision)
values (1, '')
on conflict (id) do nothing;

create table if not exists quarterly_goals (
  id uuid primary key default gen_random_uuid(),
  quarter text not null,
  text text not null,
  completed boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- This app has no login screen — it's a private tool used with the
-- public "anon" key. RLS is enabled with a permissive policy so the
-- anon key can read/write. Anyone who has your Supabase URL + anon key
-- can use the app, so don't publish those values outside your own
-- deployment. If you need real per-user access control later, add
-- Supabase Auth and tighten these policies.
-- ============================================================
alter table pipeline_periods enable row level security;
alter table candidates enable row level security;
alter table checklist_settings enable row level security;
alter table checklist_tasks enable row level security;
alter table contacts enable row level security;
alter table call_log enable row level security;
alter table streak_days enable row level security;
alter table recognition_log enable row level security;
alter table goals enable row level security;
alter table quarterly_goals enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'pipeline_periods', 'candidates', 'checklist_settings', 'checklist_tasks',
      'contacts', 'call_log', 'streak_days', 'recognition_log', 'goals', 'quarterly_goals'
    ])
  loop
    execute format(
      'drop policy if exists "anon_full_access" on %I;
       create policy "anon_full_access" on %I for all using (true) with check (true);',
      t, t
    );
  end loop;
end $$;
