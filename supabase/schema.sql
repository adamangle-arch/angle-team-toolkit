-- Angle Team Toolkit — Supabase schema
-- Run this whole file in the Supabase SQL Editor (Project > SQL Editor > New query).
--
-- Safe to re-run in full any time (e.g. to pick up a new feature) -
-- every table uses `create table if not exists` and every column/policy
-- change is additive (`add column if not exists`, `drop/create policy`,
-- `drop/add constraint`), so existing rows are never touched. The only
-- `drop table` statements left are for features that were fully removed
-- from the app (see the block right below) - nothing with live data is
-- ever dropped.

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
    array['adamangle@icloud.com', 'alexangle@me.com', 'laurasangle@gmail.com']
  );
$$;

-- ============================================================
-- Drop sections that are no longer part of the app at all (never
-- recreated below, so there's nothing live left referencing them).
--
-- IMPORTANT: pipeline_periods, candidates, contacts, streak_days, and
-- goals used to be dropped-and-recreated here too, back when this file
-- was only ever run against empty/test data. Once real teams had real
-- data in those tables, every full re-run of this file was silently
-- wiping Pipeline Tracker, Candidate History, Contacts, Core Run Streak,
-- and Goals for every user. They're never dropped here anymore -
-- `create table if not exists` further down is what makes it safe to
-- re-run this whole file for future features without touching existing
-- rows.
-- ============================================================
drop table if exists call_log cascade;
drop table if exists checklist_tasks cascade;
drop table if exists checklist_settings cascade;
drop table if exists quarterly_goals cascade;
drop table if exists recognition_log cascade;

-- ============================================================
-- 1. PIPELINE TRACKER (one set of buckets per user)
-- ============================================================
create table if not exists pipeline_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_type text not null,
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

-- A device with a wrong clock/timezone can compute an invalid "current
-- week/month" locally (e.g. treat a Sunday as if it were the Monday
-- week-start) and silently write a "weekly"/"monthly" row under that bad
-- date - a real incident: it creates a second, permanently-orphaned row
-- for what should be one continuous period, since every other device
-- (with a correct clock) keeps reading/writing the correctly-dated row
-- and never sees the stray one. One-time repair first (merges any
-- existing bad row's numbers into the period it should have been,
-- summing rather than losing them, then removes the bad row), then a
-- permanent guard so this exact corruption can never be written again by
-- any client, regardless of that client's clock.
do $$
declare
  r record;
  v_correct_start date;
begin
  for r in
    select * from pipeline_periods
    where (period_type = 'weekly' and extract(isodow from period_start) <> 1)
       or (period_type = 'monthly' and extract(day from period_start) <> 1)
  loop
    v_correct_start := case r.period_type
      when 'weekly' then date_trunc('week', r.period_start)::date
      else date_trunc('month', r.period_start)::date
    end;

    insert into pipeline_periods (
      user_id, period_type, period_start, questions, yeses, qi1, qi2, is1,
      fu1, is2, fu2, questionnaire, launches
    )
    values (
      r.user_id, r.period_type, v_correct_start, r.questions, r.yeses,
      r.qi1, r.qi2, r.is1, r.fu1, r.is2, r.fu2, r.questionnaire, r.launches
    )
    on conflict (user_id, period_type, period_start) do update set
      questions = pipeline_periods.questions + excluded.questions,
      yeses = pipeline_periods.yeses + excluded.yeses,
      qi1 = pipeline_periods.qi1 + excluded.qi1,
      qi2 = pipeline_periods.qi2 + excluded.qi2,
      is1 = pipeline_periods.is1 + excluded.is1,
      fu1 = pipeline_periods.fu1 + excluded.fu1,
      is2 = pipeline_periods.is2 + excluded.is2,
      fu2 = pipeline_periods.fu2 + excluded.fu2,
      questionnaire = pipeline_periods.questionnaire + excluded.questionnaire,
      launches = pipeline_periods.launches + excluded.launches,
      updated_at = now();

    delete from pipeline_periods where id = r.id;
  end loop;
end $$;

alter table pipeline_periods drop constraint if exists pipeline_periods_weekly_monday_check;
alter table pipeline_periods add constraint pipeline_periods_weekly_monday_check
  check (period_type <> 'weekly' or extract(isodow from period_start) = 1);

alter table pipeline_periods drop constraint if exists pipeline_periods_monthly_first_check;
alter table pipeline_periods add constraint pipeline_periods_monthly_first_check
  check (period_type <> 'monthly' or extract(day from period_start) = 1);

-- Same pattern as profiles_team_check: re-runnable so "daily" (or any
-- future period) can be added without dropping (and wiping) this table.
alter table pipeline_periods drop constraint if exists pipeline_periods_period_type_check;
alter table pipeline_periods add constraint pipeline_periods_period_type_check check (
  period_type in ('daily', 'weekly', 'monthly')
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
create table if not exists candidates (
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

-- Additive: who actually added this candidate, as opposed to user_id
-- (the shared household owner the row's business data is attributed to -
-- see the household-linking notes elsewhere in this file). For a linked
-- couple these differ: candidates.user_id resolves to whichever partner
-- is the canonical owner, but the "sent by {name}" greeting on /prospect
-- should show whoever actually texted the candidate their code, not
-- necessarily their spouse. Same user_id/creator_id split calendar_events
-- already uses for the same reason. Nullable-then-backfilled rather than
-- NOT NULL DEFAULT auth.uid() outright, since auth.uid() evaluates to
-- null with no JWT context (e.g. running this file by hand in the SQL
-- editor) and would fail NOT NULL on every existing row during the
-- ADD COLUMN itself.
alter table candidates add column if not exists creator_id uuid default auth.uid() references auth.users(id) on delete set null;
update candidates set creator_id = user_id where creator_id is null;
alter table candidates alter column creator_id set not null;

-- Additive: lets a re-run of this section pick up connected_date on a
-- table that already existed before it was added.
alter table candidates add column if not exists connected_date date not null default current_date;

-- Superseded below by the access-code approach - a candidate never gets
-- a real account pre-launch, so there's nothing to link and nothing to
-- auto-unlock. Drops are safe no-ops if this was never applied.
drop trigger if exists on_candidate_launched on candidates;
drop function if exists public.handle_candidate_launched();
drop function if exists public.get_candidate_invite_info(uuid);
alter table candidates drop column if exists linked_user_id;

-- Prospect access: rather than a full account, a candidate gets a short
-- shareable code (Candidate Roadmap -> reveal/copy on their card) that
-- unlocks a read-only, unauthenticated view of whatever resources are
-- assigned to their current step (see get_candidate_by_access_code()
-- below and CANDIDATE_STEP_RESOURCES in lib/constants.ts) - no email,
-- no password, nothing to sign up for until they're actually Launched,
-- at which point they create a real account the normal way (plain
-- signup, no auto-linking - see app/prospect/page.tsx).
alter table candidates add column if not exists access_code text;

-- Excludes visually-ambiguous characters (0/O, 1/I/L) since this gets
-- read off a phone screen and typed back in by hand.
create or replace function public.generate_candidate_access_code()
returns text
language plpgsql
as $$
declare
  chars text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from candidates where access_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.set_candidate_access_code()
returns trigger
language plpgsql
as $$
begin
  if new.access_code is null then
    new.access_code := public.generate_candidate_access_code();
  end if;
  return new;
end;
$$;

drop trigger if exists on_candidate_insert_access_code on candidates;
create trigger on_candidate_insert_access_code
  before insert on candidates
  for each row execute function public.set_candidate_access_code();

-- One-time backfill for candidates added before this existed.
update candidates set access_code = public.generate_candidate_access_code() where access_code is null;

alter table candidates drop constraint if exists candidates_access_code_key;
alter table candidates add constraint candidates_access_code_key unique (access_code);

-- Powers /prospect - callable by the anon role since nobody's
-- authenticated at that point. Returns just enough to render their
-- resources view (name, step, launched) plus the inviter's name for a
-- "sent by {name}" greeting - nothing private. Dropped first: this same
-- function gets redefined further down with a wider return shape (adds
-- IS1/IS2 columns), and `create or replace` can't change a function's
-- return type - without this drop, re-running the whole file a second
-- time fails with "cannot change return type of existing function"
-- (42P13) as soon as it hits this first, narrower definition.
drop function if exists public.get_candidate_by_access_code(text);
create or replace function public.get_candidate_by_access_code(p_code text)
returns table (
  candidate_id uuid,
  candidate_name text,
  current_step int,
  launched boolean,
  inviter_first_name text,
  inviter_last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.current_step, c.launched, p.first_name, p.last_name
  from candidates c
  join profiles p on p.id = c.creator_id
  where upper(c.access_code) = upper(p_code);
$$;

grant execute on function public.get_candidate_by_access_code(text) to anon, authenticated;

-- Per-IBO customization of the prospect-resources defaults
-- (CANDIDATE_STEP_RESOURCES in lib/constants.ts) - the default set is a
-- team-wide baseline, but a specific IBO may want to swap in something
-- different for their own candidates at a given step. Same
-- household-shareable pattern as candidates/contacts (see the RLS loop
-- further down) - user_id is the household owner, not necessarily
-- whoever clicked the button. action='remove' hides a default resource
-- for this owner (label must match that default's exact label);
-- action='add' is a resource this owner is adding on top of the
-- defaults, using label/detail/url as-is.
create table if not exists candidate_resource_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  step int not null check (step between 0 and 8),
  action text not null check (action in ('add', 'remove')),
  label text not null,
  detail text not null default '',
  url text,
  created_at timestamptz not null default now()
);

-- Additive: carries a resource's estimated read/listen time through when
-- an "add" override was created by picking from the shared Optional
-- Resources library (see optional_resources further down) - null for a
-- freehand-typed add, same as a default CANDIDATE_STEP_RESOURCES entry
-- with no estimate.
alter table candidate_resource_overrides add column if not exists estimate text;

-- Powers /prospect's resource list - callable by anon for the same
-- reason get_candidate_by_access_code is. Returns every override for
-- the candidate's owner so the client can merge adds/removes into
-- CANDIDATE_STEP_RESOURCES per step. Dropped first since the return
-- shape changed (added estimate).
drop function if exists public.get_candidate_resource_overrides(text);
create or replace function public.get_candidate_resource_overrides(p_code text)
returns table (
  step int,
  action text,
  label text,
  detail text,
  url text,
  estimate text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.step, o.action, o.label, o.detail, o.url, o.estimate
  from candidate_resource_overrides o
  join candidates c on c.user_id = o.user_id
  where upper(c.access_code) = upper(p_code)
  order by o.step;
$$;

grant execute on function public.get_candidate_resource_overrides(text) to anon, authenticated;

-- A one-off resource sent to one specific candidate, as opposed to
-- candidate_resource_overrides above (which applies to every candidate an
-- IBO has at a given step). Always shows in that candidate's /prospect
-- view regardless of their current_step, since sending it is a
-- deliberate, right-now action, not something to gate behind reaching a
-- step. Keyed off candidate_id rather than a household owner's user_id -
-- RLS below checks permission via a join back to the candidate's own
-- row, which is what lets an upline (any level, not just the person who
-- actually invited the candidate) send a resource to a downline's
-- prospect, the same "upline can act on a downline's behalf" principle
-- pipeline_periods already uses for filling in numbers.
create table if not exists candidate_specific_resources (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  label text not null,
  detail text not null default '',
  url text,
  sent_by uuid not null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Additive: carries a resource's estimated read/listen time through when
-- this one-off send was picked from the shared Optional Resources
-- library (see optional_resources further down) rather than typed in by
-- hand - null for a freehand send.
alter table candidate_specific_resources add column if not exists estimate text;

alter table candidate_specific_resources enable row level security;

drop policy if exists "select_own_or_upline_or_admin" on candidate_specific_resources;
create policy "select_own_or_upline_or_admin" on candidate_specific_resources for select using (
  exists (
    select 1 from candidates c
    where c.id = candidate_specific_resources.candidate_id
      and (
        c.user_id = auth.uid()
        or c.user_id = (select household_id from profiles where id = auth.uid())
        or public.is_upline_of(auth.uid(), c.user_id)
        or public.is_app_admin()
      )
  )
);

drop policy if exists "insert_own_or_upline_or_admin" on candidate_specific_resources;
create policy "insert_own_or_upline_or_admin" on candidate_specific_resources for insert with check (
  exists (
    select 1 from candidates c
    where c.id = candidate_specific_resources.candidate_id
      and (
        c.user_id = auth.uid()
        or c.user_id = (select household_id from profiles where id = auth.uid())
        or public.is_upline_of(auth.uid(), c.user_id)
        or public.is_app_admin()
      )
  )
);

drop policy if exists "delete_own_or_upline_or_admin" on candidate_specific_resources;
create policy "delete_own_or_upline_or_admin" on candidate_specific_resources for delete using (
  exists (
    select 1 from candidates c
    where c.id = candidate_specific_resources.candidate_id
      and (
        c.user_id = auth.uid()
        or c.user_id = (select household_id from profiles where id = auth.uid())
        or public.is_upline_of(auth.uid(), c.user_id)
        or public.is_app_admin()
      )
  )
);

-- Powers /prospect's "Just For You" section - callable by anon for the
-- same reason get_candidate_by_access_code is. Dropped first since the
-- return shape changed (added estimate).
drop function if exists public.get_candidate_specific_resources(text);
create or replace function public.get_candidate_specific_resources(p_code text)
returns table (
  id uuid,
  label text,
  detail text,
  url text,
  estimate text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.label, r.detail, r.url, r.estimate
  from candidate_specific_resources r
  join candidates c on c.id = r.candidate_id
  where upper(c.access_code) = upper(p_code)
  order by r.created_at;
$$;

grant execute on function public.get_candidate_specific_resources(text) to anon, authenticated;

-- Per-IBO customization of the onboarding-resources defaults
-- (ONBOARDING_SESSIONS in lib/constants.ts) - same "team-wide baseline,
-- freely edited per-IBO" pattern as candidate_resource_overrides above:
-- action='remove' hides a default resource for this owner (matched by
-- its exact label), action='add' is a resource this owner tacked on
-- beyond the defaults for that session - either typed by hand or picked
-- from the shared Optional Resources library (estimate carries through
-- either way). Same household-shareable pattern as
-- candidate_resource_overrides (see the RLS loop further down). No anon
-- RPC needed here (unlike the candidate-resources tables above) - the
-- Onboarding page is authenticated, so it reads this table directly
-- under normal RLS.
create table if not exists onboarding_resource_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session int not null check (session between 1 and 5),
  action text not null check (action in ('add', 'remove')),
  label text not null,
  detail text not null default '',
  url text,
  estimate text,
  created_at timestamptz not null default now()
);

-- member_resources (a one-off resource sent directly to an already-
-- onboarded team member) is defined further down, right after
-- is_upline_of() - its RLS policies call that function directly (not
-- inside a dynamic execute format() block like the loop below), so it
-- has to come after is_upline_of actually exists.

-- ============================================================
-- 3. A/B CONTACT LIST
-- ============================================================
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  status text not null default 'Not yet asked',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same pattern as profiles_team_check: re-runnable so 'Customer' (the
-- separate customer list, alongside the A/B networking list) can be
-- added without dropping (and wiping) this table.
alter table contacts drop constraint if exists contacts_category_check;
alter table contacts add constraint contacts_category_check check (
  category in ('A', 'B', 'Customer')
);

-- Additive: optional "how do you know them" memory-jogger tags (Family,
-- Friend, Coworkers, Gym, Church, Neighbor, College, High School, Social
-- Media), picked when adding a contact - purely descriptive, no bearing
-- on category/status.
alter table contacts add column if not exists connection_tags text[] not null default '{}'::text[];

-- Additive: optional "best way to reconnect" (Text, Instagram, Facebook,
-- Snapchat, Other) - purely descriptive, same as connection_tags above.
alter table contacts add column if not exists reconnect_method text not null default '';

-- ============================================================
-- 4. CORE RUN STREAK
-- One row per calendar day per user. Read / Listen / Daily Update /
-- Story Share — all 4 done counts as a streak day.
-- ============================================================
create table if not exists streak_days (
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

-- Some people log a conversation under Questions instead of Story
-- Shares even though it was really the same "shared your story" moment
-- - app/streak/page.tsx now derives story_share from either count being
-- positive, not just story_shares. One-time backfill so already-saved
-- days retroactively qualify too (streak continuity shouldn't depend on
-- which counter someone happened to tap) - safe to re-run, it's a no-op
-- once every affected row is already true.
update streak_days set story_share = true where story_share = false and questions > 0;
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
-- A running log of customer sales per month, shown on the Volume tab.
-- `description` is the customer's name; category + amount back the
-- "total customers / orders / largest order" stats shown above the log.
-- ============================================================
create table if not exists customer_sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_start date not null,
  description text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Additive: quick-pick product line(s) and PV amount per sale, so
-- "logging a sale" is a couple of taps + a number instead of only free
-- text, and the monthly stats (customers/orders/largest order) plus the
-- daily Today's Sales leaderboard below have something real to
-- aggregate. `amount` is PV, not dollars - numeric(10,2) is just the
-- column type (from before that was decided), the app always
-- writes/reads it as a whole number.
alter table customer_sales add column if not exists category text not null default 'Other';
alter table customer_sales add column if not exists amount numeric(10,2) not null default 0;

-- `categories` (plural, an array) replaced the original single-select
-- `category` column so more than one product line can be picked per
-- sale - `category` is left in place, unused, rather than dropped, so
-- no historical data is ever destroyed; existing rows get backfilled
-- into `categories` below (guarded so re-running this doesn't clobber
-- categories someone has already picked).
alter table customer_sales add column if not exists categories text[] not null default '{}'::text[];
update customer_sales set categories = array[category] where categories = '{}'::text[];
alter table customer_sales drop constraint if exists customer_sales_categories_check;
alter table customer_sales add constraint customer_sales_categories_check check (
  categories <@ array['XS', 'Nutrilite', 'Artistry', 'Amway Home', 'Satinique', 'G&H', 'Glister', 'iCook', 'Other']::text[]
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

-- Additive: self-reported reading checkbox required (alongside the 50+
-- A/B contact requirement) before Session 4 unlocks. Self-service — the
-- existing "update_own" policy below already covers this, no new RLS
-- needed.
alter table profiles add column if not exists thinking_big_chapters_confirmed boolean not null default false;

-- Additive: free-form "big picture" dreams (5 year / 10 year / lifetime) -
-- deliberately unstructured text, not a metric with a target, so someone
-- can write whatever actually matters to them rather than fill in a form.
-- Self-service via the existing "update_own" policy below (no new RLS
-- needed); visible to upline via the existing select policy, same as
-- every other profile field, so an upline can see the goals/dreams of
-- everyone in their downline without a separate visibility mechanism.
alter table profiles add column if not exists dream_5_year text not null default '';
alter table profiles add column if not exists dream_10_year text not null default '';
alter table profiles add column if not exists dream_lifetime text not null default '';

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

-- Additive: latch for the "downline hit 5+ active pipeline candidates"
-- push notification (see try_claim_pipeline_threshold_notification below).
-- Persisted rather than tracked client-side so it survives page reloads
-- and isn't fooled by every device recomputing the count independently -
-- flips back to false once the count drops below 5, so crossing up again
-- later notifies again.
alter table profiles add column if not exists notified_5plus_pipeline boolean not null default false;

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
--
-- A linked household (spouse, via link_spouse) is treated as the same
-- unit here, same as it already is for shared business data - a couple
-- running one business together only has ONE actual sponsor line, but a
-- recruit may have entered either partner's account number as their
-- upline depending on who they actually talked to. Without this, only
-- whichever partner the recruit happened to pick would ever see them as
-- downline - the other partner would see nothing despite genuinely
-- running the same business.
--
-- This function is called with both argument orders across the app
-- (profiles' select policy alone does `is_upline_of(auth.uid(), id) or
-- is_upline_of(id, auth.uid())`, and the same is true wherever else it's
-- used), so both p_viewer and p_target are expanded to their household
-- unit - not just p_viewer - otherwise only whichever argument position
-- happened to carry the household would actually widen anything, and
-- the "am I upline of my spouse's downline" direction would silently
-- keep failing. household_id is only ever stored on the "deferring"
-- side, so each *_unit CTE checks both directions of that pointer.
create or replace function public.is_upline_of(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive target_unit as (
    select p_target as id
    union
    select household_id from profiles where id = p_target and household_id is not null
    union
    select id from profiles where household_id = p_target
  ),
  chain as (
    select id, upline_id, 0 as depth from profiles where id in (select id from target_unit)
    union all
    select pr.id, pr.upline_id, c.depth + 1
    from profiles pr
    join chain c on pr.id = c.upline_id
    where c.depth < 20
  ),
  viewer_unit as (
    select p_viewer as id
    union
    select household_id from profiles where id = p_viewer and household_id is not null
    union
    select id from profiles where household_id = p_viewer
  )
  select exists (
    select 1 from chain c join viewer_unit u on u.id = c.upline_id
  );
$$;

-- A one-off resource sent directly to a team member who's already
-- onboarded and active - not tied to a candidate or an onboarding
-- session, just "here's something I want you to see," any time. Keyed
-- to the recipient's own auth id rather than a household id -
-- onboarding progress (like account_number, first_name) is tracked
-- per-person even inside a linked household, so a send is to one
-- specific person, not their whole household. Only an upline (any
-- level) or admin can send one; the recipient, any upline of the
-- recipient, or an admin can see and remove it. Defined here (rather
-- than alongside the other resource tables further up) because its
-- policies call is_upline_of() directly and need it to already exist.
create table if not exists member_resources (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  detail text not null default '',
  url text,
  estimate text,
  sent_by uuid not null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table member_resources enable row level security;

drop policy if exists "select_recipient_or_upline_or_admin" on member_resources;
create policy "select_recipient_or_upline_or_admin" on member_resources for select using (
  recipient_id = auth.uid()
  or public.is_upline_of(auth.uid(), recipient_id)
  or public.is_app_admin()
);

drop policy if exists "insert_upline_or_admin" on member_resources;
create policy "insert_upline_or_admin" on member_resources for insert with check (
  public.is_upline_of(auth.uid(), recipient_id)
  or public.is_app_admin()
);

drop policy if exists "delete_recipient_or_upline_or_admin" on member_resources;
create policy "delete_recipient_or_upline_or_admin" on member_resources for delete using (
  recipient_id = auth.uid()
  or public.is_upline_of(auth.uid(), recipient_id)
  or public.is_app_admin()
);

alter table profiles enable row level security;

-- Visibility is intentionally symmetric along your own sponsorship line
-- only, never sideways: is_upline_of(auth.uid(), id) covers your downline
-- (any level), is_upline_of(id, auth.uid()) covers your upline (any
-- level, in sponsoring order once queried client-side) - a cousin
-- branch (someone else's downline who isn't yours, or your upline's
-- other downline who isn't you) matches neither clause and stays
-- invisible, same as before. This only affects the `profiles` row
-- itself (name, team, join date, account number) - it does not grant
-- visibility into anyone's business data (pipeline, candidates,
-- contacts, etc.), which stays governed by each table's own policy.
drop policy if exists "select_own_or_admin" on profiles;
create policy "select_own_or_admin" on profiles for select
using (
  id = auth.uid()
  or public.is_upline_of(auth.uid(), id)
  or public.is_upline_of(id, auth.uid())
  or public.is_app_admin()
);

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

-- household_id is only ever stored on the "deferring" side of a spouse
-- link, so there's no plain column read that answers "who's my spouse"
-- from the *other* side. This checks both directions and hands back
-- whichever id isn't the caller's own - used client-side (Team tab) to
-- fold a linked partner's own upline/downline tree into "My Tree"/"My
-- Upline", which - unlike the Members list - are built by literally
-- walking upline_id starting from one specific account, so they'd
-- otherwise still miss a partner's line even after is_upline_of's
-- household-aware widening above.
create or replace function public.get_household_partner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select household_id from profiles where id = auth.uid()),
    (select id from profiles where household_id = auth.uid())
  );
$$;

grant execute on function public.get_household_partner_id() to authenticated;

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

-- Same authorization as grant_next_onboarding_session, but jumps straight
-- to fully unlocked - for someone who isn't actually new (e.g. already
-- experienced elsewhere in the business) instead of clicking "Unlock
-- Next" four times. The session count (5) only lives in the app's
-- ONBOARDING_SESSIONS constant - bump this literal too if that list ever
-- grows.
create or replace function public.grant_all_onboarding_sessions(p_user_id uuid)
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
  set onboarding_unlocked_through = 5
  where id = p_user_id;
end;
$$;

grant execute on function public.grant_all_onboarding_sessions(uuid) to authenticated;

-- Same authorization as grant_next_onboarding_session, but walks back
-- down a session instead of up - for when an upline/admin changes their
-- mind about having unlocked something. Floored at 1: Session 1 is
-- always available from signup, never lockable.
create or replace function public.lock_previous_onboarding_session(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_app_admin() or public.is_upline_of(auth.uid(), p_user_id)) then
    raise exception 'Not authorized to change onboarding access for this account.';
  end if;

  update profiles
  set onboarding_unlocked_through = greatest(1, onboarding_unlocked_through - 1)
  where id = p_user_id;
end;
$$;

grant execute on function public.lock_previous_onboarding_session(uuid) to authenticated;

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

-- Self-heal for an auth account with no matching profiles row (the
-- trigger above failing partway, or any other edge case that skips the
-- insert) - AuthGate calls this if its profile select comes back with
-- zero rows, so a broken account isn't a permanent dead end. Same insert
-- handle_new_user() does, just callable directly by the affected user
-- instead of only running at signup time.
create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, account_number)
  select u.id, u.email, public.generate_account_number()
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

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

-- Members who signed up today, for a "new to the team" spotlight on the
-- Leaderboard's Daily tab only - visible to everyone (not just
-- admin/upline), same as everything else there. Only surfaces name +
-- team, and only once they've completed the name/team profile gate.
-- Was a rolling 14-day window; narrowed to just their signup day so the
-- spotlight naturally disappears the next day instead of lingering.
drop function if exists public.get_new_members(int);

create or replace function public.get_new_members()
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
  where created_at::date = current_date
    and first_name is not null
    and team is not null
  order by created_at desc;
$$;

grant execute on function public.get_new_members() to authenticated;

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
-- 6b. CALL RATINGS
-- A rep pastes a QI1/QI2/FU1/FU2/Questionnaire call transcript and the
-- Assistant rates it against that stage's vetting rubric. Readable by the
-- rep's upline (any level) or admin, same as assistant_messages above, so
-- an upline gets a "folder" of their downline's ratings on the Team page.
-- ============================================================
create table if not exists call_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  call_type text not null default 'QI1' check (call_type in ('QI1', 'QI2', 'FU1', 'FU2', 'Questionnaire')),
  candidate_id uuid references candidates(id) on delete set null,
  candidate_name text not null default '',
  transcript text not null,
  analysis text not null,
  overall_score numeric,
  created_at timestamptz not null default now()
);

-- Additive: lets a re-run of this section pick up candidate_id on a
-- call_ratings table that already existed before candidate linking (and
-- therefore cross-meeting memory) was added.
alter table call_ratings add column if not exists candidate_id uuid references candidates(id) on delete set null;

-- Additive: widens the call_type check for a call_ratings table that
-- already existed when only QI1/QI2 were supported.
alter table call_ratings drop constraint if exists call_ratings_call_type_check;
alter table call_ratings add constraint call_ratings_call_type_check
  check (call_type in ('QI1', 'QI2', 'FU1', 'FU2', 'Questionnaire'));

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

-- Powers the Today dashboard's "My Active Pipeline" / "Downline Active"
-- pills - same "active" definition as the leaderboard above (not
-- launched, not filtered out, a QI1 has actually been booked). My own
-- count resolves through the household owner (candidates are
-- household-shared); the downline count sums every downline member's own
-- candidates via is_upline_of, same "your personal sponsorship chain"
-- meaning as the Team tab's My Tree (not "whole company", even for an
-- admin).
create or replace function public.get_my_active_pipeline_summary()
returns table (
  my_active_count int,
  downline_active_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)::int
      from candidates c
      where c.user_id = coalesce((select household_id from profiles where id = auth.uid()), auth.uid())
        and c.launched = false and c.filtered_out = false and c.current_step >= 1
    ) as my_active_count,
    (
      select count(*)::int
      from candidates c
      join profiles pr on pr.id = c.user_id
      where public.is_upline_of(auth.uid(), pr.id)
        and c.launched = false and c.filtered_out = false and c.current_step >= 1
    ) as downline_active_count;
$$;

grant execute on function public.get_my_active_pipeline_summary() to authenticated;

-- Atomically flips the notified_5plus_pipeline latch and reports whether
-- *this* call is the one that just crossed the threshold - the caller
-- (app/pipeline/page.tsx, after any mutation that could change the active
-- count) only sends the "downline hit 5+ pipeline" push when this
-- returns true, so the notification fires once per crossing rather than
-- once per page load. Resolves through the household owner, same as
-- get_my_active_pipeline_summary, so either spouse's login can trip it.
create or replace function public.try_claim_pipeline_threshold_notification()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := coalesce((select household_id from profiles where id = auth.uid()), auth.uid());
  v_count int;
  v_already boolean;
begin
  select count(*)::int into v_count
  from candidates
  where user_id = v_owner and launched = false and filtered_out = false and current_step >= 1;

  select notified_5plus_pipeline into v_already from profiles where id = v_owner;

  if v_count >= 5 and not coalesce(v_already, false) then
    update profiles set notified_5plus_pipeline = true where id = v_owner;
    return true;
  elsif v_count < 5 and coalesce(v_already, false) then
    update profiles set notified_5plus_pipeline = false where id = v_owner;
    return false;
  else
    return false;
  end if;
end;
$$;

grant execute on function public.try_claim_pipeline_threshold_notification() to authenticated;

-- Detail lists behind the two pills above - tapping one shows exactly
-- the candidates that make up that count. Kept as their own functions
-- (rather than reusing plain RLS-scoped table selects) so the list
-- always matches the summary count exactly, including for an admin,
-- where a plain "select * from candidates" would return literally
-- everyone (is_app_admin() bypass) instead of just the admin's own
-- sponsorship chain.
create or replace function public.get_my_active_candidates()
returns table (
  id uuid,
  name text,
  current_step int,
  connected_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.current_step, c.connected_date
  from candidates c
  where c.user_id = coalesce((select household_id from profiles where id = auth.uid()), auth.uid())
    and c.launched = false and c.filtered_out = false and c.current_step >= 1
  order by c.current_step desc, c.connected_date asc;
$$;

grant execute on function public.get_my_active_candidates() to authenticated;

create or replace function public.get_downline_active_candidates()
returns table (
  id uuid,
  name text,
  current_step int,
  connected_date date,
  rep_first_name text,
  rep_last_name text,
  rep_team text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.current_step, c.connected_date,
         pr.first_name, pr.last_name, pr.team
  from candidates c
  join profiles pr on pr.id = c.user_id
  where public.is_upline_of(auth.uid(), pr.id)
    and c.launched = false and c.filtered_out = false and c.current_step >= 1
  order by pr.first_name, pr.last_name, c.current_step desc;
$$;

grant execute on function public.get_downline_active_candidates() to authenticated;

-- Powers the Today dashboard's "Downline Today" numbers on the same
-- card as your own stats - your personal sponsorship chain's pipeline
-- stage counts for the given period, summed into one row (not broken
-- out per person). Same is_upline_of scoping as everything else here:
-- "your downline", not "everyone" even for an admin.
create or replace function public.get_downline_pipeline_totals(
  p_period_type text,
  p_period_start date
)
returns table (
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
    coalesce(sum(pp.questions), 0)::int,
    coalesce(sum(pp.yeses), 0)::int,
    coalesce(sum(pp.qi1), 0)::int,
    coalesce(sum(pp.qi2), 0)::int,
    coalesce(sum(pp.is1), 0)::int,
    coalesce(sum(pp.fu1), 0)::int,
    coalesce(sum(pp.is2), 0)::int,
    coalesce(sum(pp.fu2), 0)::int,
    coalesce(sum(pp.questionnaire), 0)::int,
    coalesce(sum(pp.launches), 0)::int
  from pipeline_periods pp
  join profiles pr on pr.id = pp.user_id
  where public.is_upline_of(auth.uid(), pr.id)
    and pp.period_type = p_period_type
    and pp.period_start = p_period_start;
$$;

grant execute on function public.get_downline_pipeline_totals(text, date) to authenticated;

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

-- Superseded by get_daily_sales_feed below (per-sale feed with category,
-- instead of one aggregated total per person).
drop function if exists public.get_daily_sales_leaderboard();

-- Every individual customer sale logged today, newest first - each sale
-- is its own "posted" row (name, categories, PV), not aggregated per
-- person, so the categories are actually meaningful per row. No
-- period_start param needed - always "today," recomputed fresh on every
-- page load, same as the Milestone Alerts / New to the Team spotlights
-- above.
--
-- Dropped first because its return shape changed (category text ->
-- categories text[]) - Postgres won't let create or replace change an
-- existing function's return type.
drop function if exists public.get_daily_sales_feed();

create or replace function public.get_daily_sales_feed()
returns table (
  sale_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  team text,
  categories text[],
  amount int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select cs.id, pr.id, pr.first_name, pr.last_name, pr.team, cs.categories, cs.amount::int, cs.created_at
  from customer_sales cs
  join profiles pr on pr.id = cs.user_id
  where cs.created_at::date = current_date
  order by cs.created_at desc;
$$;

grant execute on function public.get_daily_sales_feed() to authenticated;

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
    select unnest(array['streak_days', 'assistant_messages', 'call_ratings'])
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
-- Household-shareable tables: candidates, contacts, PV, customer sales,
-- and candidate resource overrides are the "same business" data — a
-- user_id here can be either the caller's own id OR the id they've
-- linked to via link_spouse()
-- (household_id), so a linked pair reads/writes one shared set of rows
-- instead of two separate ones. Also readable (read-only) by an upline
-- at any level, or admin. (pipeline_periods used to be in this loop too
-- - it now gets its own explicit block below, since an upline can WRITE
-- it, not just read it - see "Pipeline Tracker: upline fill-in".)
-- ============================================================
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'candidates', 'contacts', 'monthly_pv', 'customer_sales',
      'candidate_resource_overrides', 'onboarding_resource_overrides'
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
-- Pipeline Tracker: upline fill-in
-- pipeline_periods is household-shareable like the tables above, but an
-- upline (any level) can also INSERT/UPDATE a downline member's rows
-- directly, not just read them - "an upline should be able to fill in
-- for their downline" (e.g. the downline forgot to log their numbers).
-- Delete stays owner/household/admin only - filling in isn't deleting.
-- ============================================================
alter table pipeline_periods enable row level security;

drop policy if exists "select_own_or_admin" on pipeline_periods;
create policy "select_own_or_admin" on pipeline_periods for select using (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
  or public.is_upline_of(auth.uid(), user_id)
  or public.is_app_admin()
);

drop policy if exists "insert_own" on pipeline_periods;
drop policy if exists "insert_own_or_upline" on pipeline_periods;
create policy "insert_own_or_upline" on pipeline_periods for insert with check (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
  or public.is_upline_of(auth.uid(), user_id)
  or public.is_app_admin()
);

drop policy if exists "update_own_or_admin" on pipeline_periods;
drop policy if exists "update_own_or_upline_or_admin" on pipeline_periods;
create policy "update_own_or_upline_or_admin" on pipeline_periods for update using (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
  or public.is_upline_of(auth.uid(), user_id)
  or public.is_app_admin()
) with check (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
  or public.is_upline_of(auth.uid(), user_id)
  or public.is_app_admin()
);

drop policy if exists "delete_own_or_admin" on pipeline_periods;
create policy "delete_own_or_admin" on pipeline_periods for delete using (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
  or public.is_app_admin()
);

-- Applies a delta to a single Daily Tally stage AND rolls the same delta
-- up into that day's week and month totals, so logging something once
-- on Daily is enough - Weekly and Monthly no longer need re-entering by
-- hand. date_trunc('week', ...) is Monday-start in Postgres, matching
-- lib/dates.ts's getWeekStart() convention exactly, so the week bucket
-- this lands in is always the same one the app's own UI would compute.
-- Same authorization as the update/insert policies above (own household,
-- upline filling in for a downline, or admin) since this bypasses RLS as
-- security definer. p_stage is checked against a fixed allowlist before
-- ever reaching dynamic SQL, so there's no injection surface despite the
-- column name being interpolated.
create or replace function public.bump_pipeline_stage(
  p_owner_id uuid,
  p_period_start date,
  p_stage text,
  p_delta int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date := date_trunc('week', p_period_start)::date;
  v_month_start date := date_trunc('month', p_period_start)::date;
begin
  if p_stage not in (
    'questions', 'yeses', 'qi1', 'qi2', 'is1', 'fu1', 'is2', 'fu2', 'questionnaire', 'launches'
  ) then
    raise exception 'Invalid pipeline stage: %', p_stage;
  end if;

  if not (
    p_owner_id = auth.uid()
    or p_owner_id = (select household_id from profiles where id = auth.uid())
    or p_owner_id = (select id from profiles where household_id = auth.uid())
    or public.is_upline_of(auth.uid(), p_owner_id)
    or public.is_app_admin()
  ) then
    raise exception 'Not authorized to log pipeline stats for this account.';
  end if;

  execute format(
    'insert into pipeline_periods (user_id, period_type, period_start, %1$I)
     values ($1, $2, $3, greatest(0, $4))
     on conflict (user_id, period_type, period_start)
     do update set %1$I = greatest(0, pipeline_periods.%1$I + $4), updated_at = now()',
    p_stage
  ) using p_owner_id, 'daily', p_period_start, p_delta;

  execute format(
    'insert into pipeline_periods (user_id, period_type, period_start, %1$I)
     values ($1, $2, $3, greatest(0, $4))
     on conflict (user_id, period_type, period_start)
     do update set %1$I = greatest(0, pipeline_periods.%1$I + $4), updated_at = now()',
    p_stage
  ) using p_owner_id, 'weekly', v_week_start, p_delta;

  execute format(
    'insert into pipeline_periods (user_id, period_type, period_start, %1$I)
     values ($1, $2, $3, greatest(0, $4))
     on conflict (user_id, period_type, period_start)
     do update set %1$I = greatest(0, pipeline_periods.%1$I + $4), updated_at = now()',
    p_stage
  ) using p_owner_id, 'monthly', v_month_start, p_delta;
end;
$$;

grant execute on function public.bump_pipeline_stage(uuid, date, text, int) to authenticated;

-- The other half of the Pipeline <-> Core Run Streak sync: logging a
-- Question or Yes on the Daily Tally also bumps that same day's Core Run
-- Streak "Today's Activity" counter, and - since asking the question (or
-- getting a yes) is itself a story-sharing moment - Story Shares goes up
-- by the same amount too, on top of the existing story_share boolean
-- already being satisfied by either count (see the OR below). Always
-- targets the caller's own streak_days regardless of whose pipeline row
-- was touched, since story-sharing is inherently personal - the caller
-- only invokes this for their own Daily Tally edits, never while filling
-- in for a downline.
create or replace function public.mirror_pipeline_stage_to_streak(
  p_period_start date,
  p_stage text,
  p_delta int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_stage not in ('questions', 'yeses') then
    raise exception 'Invalid streak-mirror stage: %', p_stage;
  end if;

  execute format(
    'insert into streak_days (user_id, day, %1$I, story_shares)
     values ($1, $2, greatest(0, $3), greatest(0, $3))
     on conflict (user_id, day)
     do update set %1$I = greatest(0, streak_days.%1$I + $3),
                   story_shares = greatest(0, streak_days.story_shares + $3)',
    p_stage
  ) using auth.uid(), p_period_start, p_delta;

  update streak_days
  set story_share = (story_shares > 0 or questions > 0)
  where user_id = auth.uid() and day = p_period_start;
end;
$$;

grant execute on function public.mirror_pipeline_stage_to_streak(date, text, int) to authenticated;

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
-- 9b. SENT NOTIFICATIONS
-- A log of every push notification actually sent, so the app can show a
-- history page. Broadcast notifications (the daily/weekly/monthly stat
-- leaders digest) have user_id null and are visible to everyone; personal
-- ones (the Core Run reminder) have user_id set and are only visible to
-- that recipient. Only ever written by the cron routes via the service
-- role key - there is deliberately no insert policy for authenticated
-- users.
-- ============================================================
create table if not exists sent_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (
    kind in ('daily_stat_leaders', 'weekly_stat_leaders', 'monthly_stat_leaders', 'core_run_reminder')
  ),
  title text not null,
  body text not null,
  period_type text,
  period_start date,
  user_id uuid references profiles(id) on delete cascade,
  recipient_count int not null default 0
);

-- Same re-runnable-constraint pattern as goals_metric_check - a new kind
-- can be added without dropping (and wiping) this table.
alter table sent_notifications drop constraint if exists sent_notifications_kind_check;
alter table sent_notifications add constraint sent_notifications_kind_check check (
  kind in (
    'daily_stat_leaders', 'weekly_stat_leaders', 'monthly_stat_leaders', 'core_run_reminder',
    'calendar_reminder', 'calendar_event_added', 'call_rating_submitted', 'core_run_completed',
    'pipeline_5plus', 'onboarding_unlocked', 'games_unlocked'
  )
);

create index if not exists sent_notifications_user_id_idx on sent_notifications(user_id);
create index if not exists sent_notifications_created_at_idx on sent_notifications(created_at desc);

alter table sent_notifications enable row level security;

drop policy if exists "sent_notifications_select_own_or_broadcast" on sent_notifications;
create policy "sent_notifications_select_own_or_broadcast" on sent_notifications
for select using (user_id is null or user_id = auth.uid());

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
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  metric text not null,
  period text not null,
  target int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, metric, period)
);

-- Same pattern as profiles_team_check: a re-runnable constraint instead
-- of baked into the create table, so a future metric can be added
-- without dropping (and wiping) this table.
alter table goals drop constraint if exists goals_metric_check;
alter table goals add constraint goals_metric_check check (
  metric in ('read_minutes', 'audios', 'conversations', 'story_shares', 'questions', 'yeses', 'qi1s')
);
alter table goals drop constraint if exists goals_period_check;
alter table goals add constraint goals_period_check check (period in ('daily', 'weekly', 'monthly'));

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

-- Additive: whether the push reminder has already gone out for this
-- event, so send-calendar-reminders' polling query doesn't re-notify the
-- same event on every run within its matching window.
alter table calendar_events add column if not exists reminder_sent boolean not null default false;

-- Additive: which category this event is (drives the color dot on each
-- card so candidate meetings, team events, and personal reminders are
-- tellable apart at a glance) and how long before it to send a push
-- reminder - null means no reminder for this specific event. The column
-- DEFAULT backfills existing rows to 30 (Postgres populates existing
-- rows from an ADD COLUMN ... DEFAULT without a separate UPDATE), which
-- matches the fixed-30-minutes behavior every already-scheduled event
-- had before this became per-event configurable.
alter table calendar_events add column if not exists event_type text not null default 'other';
alter table calendar_events drop constraint if exists calendar_events_event_type_check;
alter table calendar_events add constraint calendar_events_event_type_check check (
  event_type in ('meeting', 'team', 'reminder', 'other')
);
alter table calendar_events add column if not exists reminder_minutes_before int default 30;

-- Unlike the "personal tables" above (streak_days, assistant_messages,
-- call_ratings — deliberately never shared with a linked spouse),
-- calendar_events IS household-shareable: a married couple wants one
-- shared calendar, not two separate ones. Checked in both directions
-- (household_id lookup either way) rather than the one-directional
-- pattern the other household-shareable tables use, because those
-- tables always write through a single canonicalized owner id
-- (candidates/contacts/pipeline_periods all resolve to `ownerId`
-- client-side) so a row's user_id is never the deferring spouse's own
-- raw id - calendar_events predates that convention and has existing
-- rows under either spouse's own id, so both directions need checking
-- for those legacy rows to stay visible. New rows from either spouse
-- now insert under the shared ownerId going forward (see
-- app/calendar/page.tsx), same as the other shared tables.
alter table calendar_events enable row level security;

drop policy if exists "calendar_events_select_own_or_admin" on calendar_events;
create policy "calendar_events_select_own_or_admin" on calendar_events
for select using (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
  or user_id = (select id from profiles where household_id = auth.uid())
  or public.is_upline_of(auth.uid(), user_id)
  or public.is_app_admin()
);

drop policy if exists "calendar_events_insert_own" on calendar_events;
create policy "calendar_events_insert_own" on calendar_events
for insert with check (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
);

drop policy if exists "calendar_events_update_own_or_admin" on calendar_events;
create policy "calendar_events_update_own_or_admin" on calendar_events
for update using (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
  or user_id = (select id from profiles where household_id = auth.uid())
  or public.is_app_admin()
)
with check (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
  or user_id = (select id from profiles where household_id = auth.uid())
  or public.is_app_admin()
);

drop policy if exists "calendar_events_delete_own_or_admin" on calendar_events;
create policy "calendar_events_delete_own_or_admin" on calendar_events
for delete using (
  user_id = auth.uid()
  or user_id = (select household_id from profiles where id = auth.uid())
  or user_id = (select id from profiles where household_id = auth.uid())
  or public.is_app_admin()
);

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

-- The mirror of get_downline_user_ids: every upline (any level) of
-- p_user_id, for the "notify my upline about X" push notifications -
-- same household exclusion for the same reason (a linked spouse isn't
-- really "upline," even if they also happen to satisfy is_upline_of).
create or replace function public.get_upline_user_ids(p_user_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles
  where public.is_upline_of(id, p_user_id)
    and coalesce(household_id, id) <> coalesce(
      (select household_id from profiles where id = p_user_id), p_user_id
    );
$$;

grant execute on function public.get_upline_user_ids(uuid) to authenticated;

-- Inserts one copy of the event per downline member (any level), each
-- owned by that member so it shows on their own calendar too, not just
-- the creator's. Security definer because the normal insert_own RLS
-- policy would otherwise only allow inserting rows for yourself.
--
-- Dropped and recreated (rather than a bare create or replace) since the
-- parameter list changed - Postgres treats a different signature as a
-- new overload, not a true replacement, which would leave the old
-- 4-argument version callable and stale.
drop function if exists public.broadcast_event_to_downline(text, text, timestamptz, uuid);

create or replace function public.broadcast_event_to_downline(
  p_title text,
  p_notes text,
  p_event_at timestamptz,
  p_candidate_id uuid default null,
  p_event_type text default 'other',
  p_reminder_minutes_before int default 30
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into calendar_events (
    user_id, creator_id, title, notes, event_at, candidate_id, scope,
    event_type, reminder_minutes_before
  )
  select
    d.user_id, auth.uid(), p_title, p_notes, p_event_at, p_candidate_id, 'downline',
    p_event_type, p_reminder_minutes_before
  from public.get_downline_user_ids(auth.uid()) d;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.broadcast_event_to_downline(text, text, timestamptz, uuid, text, int) to authenticated;

-- Same idea as broadcast_event_to_downline, but to a caller-chosen subset
-- of their downline instead of all of it ("select a specific downline or
-- multiple specific downline" on the Add Event form). Filters
-- p_recipient_ids against get_downline_user_ids(auth.uid()) rather than
-- trusting the array outright - a tampered request can only ever narrow
-- to ids that are already legitimately this caller's downline, never
-- reach outside it.
create or replace function public.send_event_to_recipients(
  p_title text,
  p_notes text,
  p_event_at timestamptz,
  p_recipient_ids uuid[],
  p_candidate_id uuid default null,
  p_event_type text default 'other',
  p_reminder_minutes_before int default 30
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into calendar_events (
    user_id, creator_id, title, notes, event_at, candidate_id, scope,
    event_type, reminder_minutes_before
  )
  select
    d.user_id, auth.uid(), p_title, p_notes, p_event_at, p_candidate_id, 'downline',
    p_event_type, p_reminder_minutes_before
  from public.get_downline_user_ids(auth.uid()) d
  where d.user_id = any(p_recipient_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.send_event_to_recipients(text, text, timestamptz, uuid[], uuid, text, int) to authenticated;

-- Powers the "Upcoming" section of /prospect - any calendar_events row
-- tagged with this candidate (the existing "linked candidate" picker on
-- the Add Event form, unchanged) shows up automatically in their
-- code-gated view, same as scheduling it in the app today already shows
-- it on the rep's own calendar. Callable by anon, same reasoning as
-- get_candidate_by_access_code above - nothing here is private to a
-- specific meeting time and a candidate's own first name.
create or replace function public.get_candidate_upcoming_events(p_code text)
returns table (
  event_id uuid,
  title text,
  notes text,
  event_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.notes, e.event_at
  from calendar_events e
  join candidates c on c.id = e.candidate_id
  where upper(c.access_code) = upper(p_code)
    and e.event_at >= now()
  order by e.event_at asc;
$$;

grant execute on function public.get_candidate_upcoming_events(text) to anon, authenticated;

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

-- ============================================================
-- 16. TEAM EVENT ALBUMS (photo/video gallery for past events)
-- Deliberately independent of company_events above (which are
-- upcoming/standing calendar events an admin schedules ahead of time) -
-- an album is something an admin creates AFTER an event has already
-- happened, purely to hang a photo/video gallery off of, with its own
-- title and date. Visible to everyone; only an admin can create albums
-- or upload/remove media.
--
-- event_photos (photo-only, tied to company_events) never shipped to
-- any real database, so it's dropped outright rather than migrated -
-- nothing to preserve.
-- ============================================================
drop table if exists event_photos;

create table if not exists team_event_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table team_event_albums enable row level security;

drop policy if exists "team_event_albums_select_all" on team_event_albums;
create policy "team_event_albums_select_all" on team_event_albums
for select using (true);

drop policy if exists "team_event_albums_insert_admin" on team_event_albums;
create policy "team_event_albums_insert_admin" on team_event_albums
for insert with check (public.is_app_admin());

drop policy if exists "team_event_albums_update_admin" on team_event_albums;
create policy "team_event_albums_update_admin" on team_event_albums
for update using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "team_event_albums_delete_admin" on team_event_albums;
create policy "team_event_albums_delete_admin" on team_event_albums
for delete using (public.is_app_admin());

-- One row per uploaded photo or video, tied to an album. storage_path is
-- kept alongside media_url so a delete can clean up the actual storage
-- object, not just the row.
create table if not exists event_media (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references team_event_albums(id) on delete cascade,
  storage_path text not null,
  media_url text not null,
  media_type text not null default 'photo',
  caption text not null default '',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table event_media drop constraint if exists event_media_media_type_check;
alter table event_media add constraint event_media_media_type_check check (
  media_type in ('photo', 'video')
);

alter table event_media enable row level security;

drop policy if exists "event_media_select_all" on event_media;
create policy "event_media_select_all" on event_media
for select using (true);

drop policy if exists "event_media_insert_admin" on event_media;
create policy "event_media_insert_admin" on event_media
for insert with check (public.is_app_admin());

drop policy if exists "event_media_update_admin" on event_media;
create policy "event_media_update_admin" on event_media
for update using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "event_media_delete_admin" on event_media;
create policy "event_media_delete_admin" on event_media
for delete using (public.is_app_admin());

-- Public-read storage bucket for the actual photo/video files, same
-- pattern as the avatars bucket - but uploads/deletes are admin-only
-- here rather than per-user-folder, since only an admin manages this
-- gallery.
insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;

-- Drop-if-exists guards for the previous (photo-only, company_events-
-- linked) version of this feature's bucket policies, in case that SQL
-- was ever run against a real database before this redesign.
drop policy if exists "event_photos_bucket_public_read" on storage.objects;
drop policy if exists "event_photos_bucket_insert_admin" on storage.objects;
drop policy if exists "event_photos_bucket_delete_admin" on storage.objects;

drop policy if exists "event_media_bucket_public_read" on storage.objects;
create policy "event_media_bucket_public_read" on storage.objects for select
using (bucket_id = 'event-media');

drop policy if exists "event_media_bucket_insert_admin" on storage.objects;
create policy "event_media_bucket_insert_admin" on storage.objects for insert
with check (bucket_id = 'event-media' and public.is_app_admin());

drop policy if exists "event_media_bucket_delete_admin" on storage.objects;
create policy "event_media_bucket_delete_admin" on storage.objects for delete
using (bucket_id = 'event-media' and public.is_app_admin());

-- ============================================================
-- Info Session (IS1/IS2): in person vs. virtual, and if virtual,
-- picking one of a fixed set of recurring weekly webinar slots (see
-- VIRTUAL_WEBINAR_SLOTS in lib/constants.ts) and marking it watched.
-- IS1 and IS2 are two separate real-world sessions a candidate attends
-- at two different points in the process, so each gets its own
-- independent set of columns rather than sharing one.
-- ============================================================
alter table candidates add column if not exists is1_session_mode text check (is1_session_mode in ('in_person', 'virtual'));
alter table candidates add column if not exists is1_webinar_slot text;
alter table candidates add column if not exists is1_webinar_selected_at timestamptz;
alter table candidates add column if not exists is1_watched boolean not null default false;
alter table candidates add column if not exists is1_watched_at timestamptz;

alter table candidates add column if not exists is2_session_mode text check (is2_session_mode in ('in_person', 'virtual'));
alter table candidates add column if not exists is2_webinar_slot text;
alter table candidates add column if not exists is2_webinar_selected_at timestamptz;
alter table candidates add column if not exists is2_watched boolean not null default false;
alter table candidates add column if not exists is2_watched_at timestamptz;

-- get_candidate_by_access_code now also returns IS1/IS2 state so
-- /prospect can render the right card - dropped first since the return
-- table shape is changing.
drop function if exists public.get_candidate_by_access_code(text);
create or replace function public.get_candidate_by_access_code(p_code text)
returns table (
  candidate_id uuid,
  candidate_name text,
  current_step int,
  launched boolean,
  inviter_first_name text,
  inviter_last_name text,
  is1_session_mode text,
  is1_webinar_slot text,
  is1_watched boolean,
  is2_session_mode text,
  is2_webinar_slot text,
  is2_watched boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.current_step, c.launched, p.first_name, p.last_name,
    c.is1_session_mode, c.is1_webinar_slot, c.is1_watched,
    c.is2_session_mode, c.is2_webinar_slot, c.is2_watched
  from candidates c
  join profiles p on p.id = c.creator_id
  where upper(c.access_code) = upper(p_code);
$$;

grant execute on function public.get_candidate_by_access_code(text) to anon, authenticated;

-- Choosing in-person vs. virtual, and which specific webinar, is the
-- IBO's call (they're the one who knows how the actual conversation
-- with the candidate went) - made directly on the Candidate Roadmap as
-- a normal authenticated update to their own candidates row, covered by
-- the existing candidates RLS (owner/household/admin), no RPC needed.
-- These two anon RPCs from an earlier version of this feature (where
-- the candidate picked their own mode/webinar in /prospect) are no
-- longer used - dropped here in case that version was ever run.
drop function if exists public.set_candidate_info_session_mode(text, text, text);
drop function if exists public.select_candidate_virtual_webinar(text, text, text);

-- Candidate self-service: marking it watched is the one part only the
-- candidate can honestly report, so this stays anon-callable and scoped
-- purely by access_code, same as the other /prospect RPCs.
create or replace function public.mark_candidate_virtual_watched(p_code text, p_step text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_step = 'is1' then
    update candidates set is1_watched = true, is1_watched_at = coalesce(is1_watched_at, now())
    where upper(access_code) = upper(p_code);
  elsif p_step = 'is2' then
    update candidates set is2_watched = true, is2_watched_at = coalesce(is2_watched_at, now())
    where upper(access_code) = upper(p_code);
  else
    raise exception 'invalid step';
  end if;
end;
$$;

grant execute on function public.mark_candidate_virtual_watched(text, text) to anon, authenticated;

-- A permanent library of Info Session speaker flyers - each speaker's
-- graphic is uploaded once, ever, and stays saved here so a new week
-- with a repeat speaker is just picking their name again, not
-- re-uploading the same image. Admin-managed since it's one shared
-- library for the whole team, not per-IBO.
create table if not exists info_session_speakers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  image_url text not null,
  created_at timestamptz not null default now()
);

alter table info_session_speakers enable row level security;

drop policy if exists "info_session_speakers_read_all" on info_session_speakers;
create policy "info_session_speakers_read_all" on info_session_speakers for select using (true);

drop policy if exists "info_session_speakers_insert_admin" on info_session_speakers;
create policy "info_session_speakers_insert_admin" on info_session_speakers
for insert with check (public.is_app_admin());

drop policy if exists "info_session_speakers_update_admin" on info_session_speakers;
create policy "info_session_speakers_update_admin" on info_session_speakers
for update using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "info_session_speakers_delete_admin" on info_session_speakers;
create policy "info_session_speakers_delete_admin" on info_session_speakers
for delete using (public.is_app_admin());

-- Single admin-managed "who's speaking this week" pointer into the
-- library above - one shared row for the whole team (not per-IBO),
-- since it's one physical weekly event. Was previously its own
-- image_url/speaker_name pair uploaded fresh every week; now it's just
-- a pointer, so picking the speaker is the only weekly action.
create table if not exists info_session_flyer (
  id boolean primary key default true,
  speaker_id uuid references info_session_speakers(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint info_session_flyer_singleton check (id)
);

alter table info_session_flyer drop column if exists image_url;
alter table info_session_flyer drop column if exists speaker_name;
alter table info_session_flyer add column if not exists speaker_id uuid references info_session_speakers(id) on delete set null;

insert into info_session_flyer (id) values (true) on conflict (id) do nothing;

alter table info_session_flyer enable row level security;

drop policy if exists "info_session_flyer_read_all" on info_session_flyer;
create policy "info_session_flyer_read_all" on info_session_flyer for select using (true);

drop policy if exists "info_session_flyer_update_admin" on info_session_flyer;
create policy "info_session_flyer_update_admin" on info_session_flyer
for update using (public.is_app_admin()) with check (public.is_app_admin());

-- Powers /prospect's in-person flyer card - callable by anon. Return
-- shape is unchanged from the old per-week version, so nothing on the
-- reading side needed to change, only how the image gets there.
create or replace function public.get_current_info_session_flyer()
returns table (image_url text, speaker_name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.image_url, s.name
  from info_session_flyer f
  join info_session_speakers s on s.id = f.speaker_id
  where f.id = true;
$$;

grant execute on function public.get_current_info_session_flyer() to anon, authenticated;

-- Public-read storage bucket for speaker flyer images, admin-only
-- upload - same pattern as event-media.
insert into storage.buckets (id, name, public)
values ('info-session-flyer', 'info-session-flyer', true)
on conflict (id) do nothing;

drop policy if exists "info_session_flyer_bucket_public_read" on storage.objects;
create policy "info_session_flyer_bucket_public_read" on storage.objects for select
using (bucket_id = 'info-session-flyer');

drop policy if exists "info_session_flyer_bucket_insert_admin" on storage.objects;
create policy "info_session_flyer_bucket_insert_admin" on storage.objects for insert
with check (bucket_id = 'info-session-flyer' and public.is_app_admin());

drop policy if exists "info_session_flyer_bucket_update_admin" on storage.objects;
create policy "info_session_flyer_bucket_update_admin" on storage.objects for update
using (bucket_id = 'info-session-flyer' and public.is_app_admin());

drop policy if exists "info_session_flyer_bucket_delete_admin" on storage.objects;
create policy "info_session_flyer_bucket_delete_admin" on storage.objects for delete
using (bucket_id = 'info-session-flyer' and public.is_app_admin());

-- ============================================================
-- Candidate resource completion tracking: lets the candidate check off
-- each resource (default step resources, per-IBO overrides, and
-- candidate-specific sends alike) as they finish it, so both they and
-- their IBO can see what's actually been done vs. still outstanding.
-- Keyed by the resource's label rather than a foreign key, since
-- default/override resources aren't rows in any table (they're plain
-- data in lib/constants.ts) - label is already the unique identifier
-- candidate_resource_overrides' own "remove" matching relies on, so
-- reusing it here doesn't introduce a new assumption.
-- ============================================================
create table if not exists candidate_resource_completions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  resource_label text not null,
  completed_at timestamptz not null default now(),
  unique (candidate_id, resource_label)
);

alter table candidate_resource_completions enable row level security;

-- Read-only for the IBO/upline/admin side - same self/household/upline/
-- admin visibility as candidate_specific_resources, via a join back to
-- the candidate's own row.
drop policy if exists "select_own_or_upline_or_admin" on candidate_resource_completions;
create policy "select_own_or_upline_or_admin" on candidate_resource_completions for select using (
  exists (
    select 1 from candidates c
    where c.id = candidate_resource_completions.candidate_id
      and (
        c.user_id = auth.uid()
        or c.user_id = (select household_id from profiles where id = auth.uid())
        or public.is_upline_of(auth.uid(), c.user_id)
        or public.is_app_admin()
      )
  )
);

-- Powers /prospect's checkboxes - callable by anon for the same reason
-- every other /prospect RPC is.
create or replace function public.get_candidate_resource_completions(p_code text)
returns table (resource_label text)
language sql
stable
security definer
set search_path = public
as $$
  select r.resource_label
  from candidate_resource_completions r
  join candidates c on c.id = r.candidate_id
  where upper(c.access_code) = upper(p_code);
$$;

grant execute on function public.get_candidate_resource_completions(text) to anon, authenticated;

-- Toggles one resource on/off for this candidate - unlike Info Session's
-- "watched" flag, this is meant to stay correctable (a candidate can
-- un-check something they clicked by mistake), so it's a plain toggle
-- rather than a one-way lock. Returns the resource's new completed
-- state so the client doesn't need a second round trip to confirm it.
create or replace function public.toggle_candidate_resource_completion(p_code text, p_label text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_id uuid;
  v_existed boolean;
begin
  select id into v_candidate_id from candidates where upper(access_code) = upper(p_code);
  if v_candidate_id is null then
    raise exception 'invalid code';
  end if;

  select exists(
    select 1 from candidate_resource_completions
    where candidate_id = v_candidate_id and resource_label = p_label
  ) into v_existed;

  if v_existed then
    delete from candidate_resource_completions
    where candidate_id = v_candidate_id and resource_label = p_label;
    return false;
  else
    insert into candidate_resource_completions (candidate_id, resource_label)
    values (v_candidate_id, p_label);
    return true;
  end if;
end;
$$;

grant execute on function public.toggle_candidate_resource_completion(text, text) to anon, authenticated;

-- ============================================================
-- Optional Resources: a shared, admin-managed library of podcasts/
-- articles/etc. that any IBO can choose to send - either as a one-off to
-- a specific candidate (candidate_specific_resources) or added to their
-- own automatic per-step defaults (candidate_resource_overrides) - so
-- picking one is a couple of taps instead of retyping the title/detail/
-- link from scratch every time. Read-only for every IBO; only an admin
-- manages what's actually in the library.
-- ============================================================
create table if not exists optional_resources (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  detail text not null default '',
  url text,
  estimate text,
  created_at timestamptz not null default now()
);

alter table optional_resources enable row level security;

drop policy if exists "optional_resources_read_all" on optional_resources;
create policy "optional_resources_read_all" on optional_resources for select using (true);

drop policy if exists "optional_resources_insert_admin" on optional_resources;
create policy "optional_resources_insert_admin" on optional_resources
for insert with check (public.is_app_admin());

drop policy if exists "optional_resources_update_admin" on optional_resources;
create policy "optional_resources_update_admin" on optional_resources
for update using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "optional_resources_delete_admin" on optional_resources;
create policy "optional_resources_delete_admin" on optional_resources
for delete using (public.is_app_admin());

-- One-time seed so this doesn't have to be re-typed in the app - safe to
-- re-run (the whole point of this file), since it only inserts when a
-- row with this exact label doesn't already exist. Feel free to delete
-- this block once it's landed, or add more the same way, or just use the
-- Optional Resources Library card in the app going forward.
insert into optional_resources (label, detail, url, estimate)
select
  'New Emeralds - Kopecky',
  '',
  'https://www.dropbox.com/scl/fi/4p8rkrsgsyjt4d87mq64m/New-Emeralds-Kopecky-S07-1054-AUD.mp3?rlkey=w6uqbsw3wfdzbog8j9pfgfdt3&st=dejo2pdp&dl=0',
  '38:48'
where not exists (
  select 1 from optional_resources where label = 'New Emeralds - Kopecky'
);
