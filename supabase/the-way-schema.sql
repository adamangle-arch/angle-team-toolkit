-- ============================================================================
-- "The Way" — discipleship course platform
-- ============================================================================
-- This schema is deliberately self-contained: it is meant to be run against
-- its OWN, separate Supabase project (its own auth users, its own tables),
-- not appended to angle-team-toolkit's existing supabase/schema.sql. The two
-- apps share nothing — no users, no data — they only share this repo's
-- Next.js/Tailwind scaffolding and coding conventions.
--
-- Run this once, top to bottom, in a fresh Supabase project's SQL editor
-- (or via `supabase db push` / the CLI migration flow).
--
-- ----------------------------------------------------------------------------
-- Page structure this schema supports (see app/the-way/**):
--
--   /the-way                       redirects to /the-way/courses
--   /the-way/courses               Courses list — one card per course, with
--                                   a progress readout, gated by the
--                                   one-time Welcome Video
--   /the-way/courses/[courseId]    Course detail — ordered lesson items with
--                                   checkboxes; checking one off writes a
--                                   lesson_completions row and drives the
--                                   parent course's progress bar
--   /the-way/mentor                (not built) — a mentor's assigned
--                                   members with each one's course progress
--
-- Every published course is open to every member from the start - no
-- sequential unlock gating in the app. profiles.unlocked_through and the
-- mentor_set_unlock()/mentor_grant_all() RPCs below still exist and are
-- harmless to leave as-is (nothing reads them), kept only so gating can be
-- turned back on later by wiring the UI back up to them, without another
-- schema change.
--
-- Courses/lesson items are real tables (not a hardcoded constants array):
-- a pastor/mentor editing the curriculum (new lesson, reworded description,
-- reordering) is expected to be a routine, non-technical, fairly frequent
-- edit for a church — a real table lets that happen from a future admin
-- screen (or the Supabase table editor in the meantime) with no code
-- deploy, at the cost of one extra join versus a constants file.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles — one row per auth.users member, created on demand by
-- ensure_profile() (see below) the same way angle-team-toolkit's own
-- AuthGate falls back to its ensure_profile() RPC for an account whose
-- signup trigger row is missing.
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('member', 'mentor', 'admin')),
  -- Assigned mentor/pastor for the mentor dashboard's "my members" list and
  -- for is_mentor_of() below. Null until a mentor/admin assigns one.
  mentor_id uuid references profiles (id) on delete set null,
  -- How many courses (by order_index) this member can currently see/open.
  -- Course 1 is open the moment someone signs up (no waiting on a mentor
  -- action for every new member); course 2+ requires a mentor/admin to
  -- advance this via mentor_set_unlock(). role='admin' effectively ignores
  -- this value in the UI (treated as "everything unlocked").
  unlocked_through integer not null default 1,
  welcome_video_watched_at timestamptz,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- ----------------------------------------------------------------------------
-- courses
-- ----------------------------------------------------------------------------
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  -- A short icon key the frontend maps to a lucide-react icon component
  -- (see lib/way/theme.ts) — kept as a constrained string rather than
  -- letting content authors paste arbitrary markup/SVG.
  icon text not null default 'book-open',
  -- Same idea for the banner gradient — one of a fixed palette rather than
  -- a free-form hex value, so a mentor editing content later can't end up
  -- with an unreadable or off-brand banner.
  color_theme text not null default 'amber' check (
    color_theme in ('amber', 'indigo', 'emerald', 'rose', 'sky', 'violet', 'fuchsia', 'teal')
  ),
  order_index integer not null unique,
  is_published boolean not null default true,
  -- Optional short message shown in the completion celebration when a
  -- member finishes every lesson in this course - falls back to a plain
  -- generic message in the UI when null, so setting this per course is
  -- optional, not required content.
  completion_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe to re-run on an already-provisioned project: adds the column
-- above if this database predates it.
alter table courses add column if not exists completion_message text;

alter table courses enable row level security;

-- ----------------------------------------------------------------------------
-- lesson_items — the ordered readings/videos/audio/worksheets/discussion
-- questions inside a course.
-- ----------------------------------------------------------------------------
create table if not exists lesson_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  type text not null check (type in ('reading', 'video', 'audio', 'worksheet', 'discussion')),
  title text not null,
  description text,
  -- Optional external link or embed URL (a video/audio host, a worksheet
  -- PDF, a discussion-guide doc). Null for e.g. a plain discussion prompt
  -- that's just the title/description with no attachment.
  content_url text,
  order_index integer not null,
  created_at timestamptz not null default now(),
  unique (course_id, order_index)
);

alter table lesson_items enable row level security;

-- ----------------------------------------------------------------------------
-- lesson_completions — one row per (user, lesson item) checked off. Course
-- progress ("X/Y done") is just a count of these per course, computed by the
-- client rather than stored redundantly.
-- ----------------------------------------------------------------------------
create table if not exists lesson_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  lesson_item_id uuid not null references lesson_items (id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (user_id, lesson_item_id)
);

alter table lesson_completions enable row level security;

create index if not exists lesson_completions_user_idx on lesson_completions (user_id);
create index if not exists lesson_items_course_idx on lesson_items (course_id, order_index);

-- ============================================================================
-- Helper functions (security definer — RLS policies below call these
-- instead of duplicating the role/mentor checks in every policy)
-- ============================================================================

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_mentor_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('mentor', 'admin')
  );
$$;

-- True if the caller is p_member_id's assigned mentor, or an admin (admins
-- can act on anyone — "pastoral staff" per the product brief).
create or replace function is_mentor_of(p_member_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_admin()
    or exists (
      select 1 from profiles
      where id = p_member_id and mentor_id = auth.uid()
    );
$$;

-- Idempotent — creates this account's profile row if the normal signup path
-- somehow didn't (matches angle-team-toolkit's own ensure_profile() escape
-- hatch for the PGRST116 "no rows" case). Safe to call on every login.
create or replace function ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email)
  values (auth.uid(), (select email from auth.users where id = auth.uid()))
  on conflict (id) do nothing;
end;
$$;

create or replace function mark_welcome_video_watched()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
  set welcome_video_watched_at = now()
  where id = auth.uid() and welcome_video_watched_at is null;
$$;

-- Advance OR roll back how far a specific member has unlocked. Clamped to
-- [0, published course count] so a typo can't unlock nonexistent courses or
-- go negative.
create or replace function mentor_set_unlock(p_member_id uuid, p_level integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
begin
  if not is_mentor_of(p_member_id) then
    raise exception 'Not authorized to change this member''s unlock level';
  end if;

  select count(*) into v_max from courses where is_published;

  update profiles
  set unlocked_through = greatest(0, least(p_level, v_max))
  where id = p_member_id;
end;
$$;

-- "Grant all" override — pastoral staff (admins) only, per the product
-- brief; a mentor without the admin role cannot use this shortcut, only
-- mentor_set_unlock() one course at a time.
create or replace function mentor_grant_all(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only pastoral staff can grant all courses at once';
  end if;

  update profiles
  set unlocked_through = (select count(*) from courses where is_published)
  where id = p_member_id;
end;
$$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists courses_set_updated_at on courses;
create trigger courses_set_updated_at
  before update on courses
  for each row execute function set_updated_at();

-- Column-level guard for profiles: role/mentor_id/unlocked_through must stay
-- untouched on a plain self-UPDATE (renaming yourself, marking the welcome
-- video watched) — only mentor_set_unlock()/mentor_grant_all() above (or an
-- admin acting directly) may change them. Postgres RLS is row-level, not
-- column-level, so this is enforced with a trigger rather than a policy.
create or replace function protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_admin() then
    return new;
  end if;

  new.role = old.role;
  new.mentor_id = old.mentor_id;
  new.unlocked_through = old.unlocked_through;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on profiles;
create trigger profiles_protect_privileged_columns
  before update on profiles
  for each row execute function protect_profile_privileged_columns();

-- ============================================================================
-- RLS policies
-- ============================================================================

-- profiles: see your own row, your mentees' rows (mentor/admin), or
-- everyone's (admin, for the mentor dashboard's org-wide view).
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select
  using (
    id = auth.uid()
    or is_admin()
    or mentor_id = auth.uid()
  );

-- Anyone can update their own row (the trigger above strips out the
-- privileged columns for non-admins); the mentor RPCs use security definer
-- to bypass this for the unlock fields specifically.
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles
  for insert
  with check (id = auth.uid());

-- courses / lesson_items: readable by any signed-in member once published;
-- writes are admin-only (a future admin content screen, or the Supabase
-- table editor today).
drop policy if exists courses_select on courses;
create policy courses_select on courses
  for select
  using (is_published or is_admin());

drop policy if exists courses_write on courses;
create policy courses_write on courses
  for all
  using (is_admin())
  with check (is_admin());

drop policy if exists lesson_items_select on lesson_items;
create policy lesson_items_select on lesson_items
  for select
  using (
    is_admin()
    or exists (
      select 1 from courses
      where courses.id = lesson_items.course_id and courses.is_published
    )
  );

drop policy if exists lesson_items_write on lesson_items;
create policy lesson_items_write on lesson_items
  for all
  using (is_admin())
  with check (is_admin());

-- lesson_completions: a member can check/uncheck their own items; mentors
-- and admins can read (not write) their mentees' completions to compute
-- progress on the mentor dashboard.
drop policy if exists lesson_completions_select on lesson_completions;
create policy lesson_completions_select on lesson_completions
  for select
  using (user_id = auth.uid() or is_mentor_of(user_id));

drop policy if exists lesson_completions_insert on lesson_completions;
create policy lesson_completions_insert on lesson_completions
  for insert
  with check (user_id = auth.uid());

drop policy if exists lesson_completions_delete on lesson_completions;
create policy lesson_completions_delete on lesson_completions
  for delete
  using (user_id = auth.uid());

-- ============================================================================
-- Bootstrapping the first admin
-- ============================================================================
-- role defaults to 'member' for every new signup, on purpose — there is no
-- public way to self-promote. After the first pastor/admin signs up once
-- through the app, promote that one account by hand from the SQL editor:
--
--   update profiles set role = 'admin' where email = 'pastor@example.com';
--
-- From there, that admin can promote others as mentors/admins directly
-- (RLS above lets any admin update any profile row).

-- ============================================================================
-- Example seed data — replace with your church's real curriculum, or leave
-- as a starting point and edit from the Supabase table editor.
-- ============================================================================

insert into courses (slug, title, description, icon, color_theme, order_index) values
  ('foundations-of-faith', 'Foundations of Faith', 'What we believe and why it matters for how you live.', 'book-open', 'amber', 1),
  ('prayer-and-the-word', 'Prayer & the Word', 'Building a daily rhythm of prayer and Scripture.', 'compass', 'sky', 2),
  ('church-and-community', 'Church & Community', 'Why the local church matters and how to belong to one.', 'users', 'emerald', 3),
  ('living-on-mission', 'Living on Mission', 'Sharing your faith and serving others in everyday life.', 'flame', 'rose', 4)
on conflict (slug) do nothing;

-- Example completion messages - edit these, or set your own per course
-- from the Supabase table editor. Safe to re-run.
update courses set completion_message = 'You now have a foundation to build the rest of your walk on. Well done.' where slug = 'foundations-of-faith' and completion_message is null;
update courses set completion_message = 'A daily rhythm of prayer and Scripture is one of the best gifts you can give yourself. Keep it going.' where slug = 'prayer-and-the-word' and completion_message is null;
update courses set completion_message = 'You were not meant to walk this out alone. Glad you are more connected to this church now.' where slug = 'church-and-community' and completion_message is null;
update courses set completion_message = 'You are ready to take what you have learned and share it. Someone needs what you have.' where slug = 'living-on-mission' and completion_message is null;

insert into lesson_items (course_id, type, title, description, order_index) values
  ((select id from courses where slug = 'foundations-of-faith'), 'reading', 'Who is God?', 'A short reading on the character of God.', 1),
  ((select id from courses where slug = 'foundations-of-faith'), 'video', 'The Gospel in Four Words', 'A 10-minute teaching video.', 2),
  ((select id from courses where slug = 'foundations-of-faith'), 'discussion', 'Discuss with your mentor', 'What stood out to you this week? What questions do you still have?', 3),
  ((select id from courses where slug = 'prayer-and-the-word'), 'reading', 'How to Read the Bible', 'A practical guide to daily Bible reading.', 1),
  ((select id from courses where slug = 'prayer-and-the-word'), 'audio', 'A Model for Prayer', 'A short audio teaching you can listen to on the go.', 2),
  ((select id from courses where slug = 'prayer-and-the-word'), 'worksheet', 'Your Prayer Journal', 'Fill out this worksheet for the week.', 3),
  ((select id from courses where slug = 'church-and-community'), 'reading', 'Why the Church?', 'What the Bible says about belonging to a local church.', 1),
  ((select id from courses where slug = 'church-and-community'), 'discussion', 'Discuss with your mentor', 'Where could you take a next step to get more connected?', 2),
  ((select id from courses where slug = 'living-on-mission'), 'reading', 'Your Story Matters', 'How to share your own faith story simply.', 1),
  ((select id from courses where slug = 'living-on-mission'), 'worksheet', 'Serve Somewhere', 'Pick one way to serve this month and write it down.', 2)
on conflict (course_id, order_index) do nothing;

-- ============================================================================
-- Phase 2 — personal spiritual practice: daily devotional, prayer
-- journal, gratitude log.
-- ============================================================================

-- One row per calendar date - content is entirely yours to write and
-- manage (Supabase table editor, or a future admin screen), on purpose:
-- verse text/translation choice is a pastoral and licensing decision for
-- your church to make, not something to hardcode here. The seed row
-- below is a placeholder, not real content.
create table if not exists devotionals (
  id uuid primary key default gen_random_uuid(),
  devotional_date date not null unique,
  verse_reference text,
  verse_text text,
  reflection text not null,
  created_at timestamptz not null default now()
);

alter table devotionals enable row level security;

drop policy if exists devotionals_select on devotionals;
create policy devotionals_select on devotionals
  for select
  using (true);

drop policy if exists devotionals_write on devotionals;
create policy devotionals_write on devotionals
  for all
  using (is_admin())
  with check (is_admin());

-- Prayer requests and gratitude notes - strictly private to the person
-- who wrote them, not visible to mentors/admins (unlike lesson_completions,
-- there's no select policy for is_mentor_of() here on purpose; a personal
-- journal is a different kind of private than course progress).
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  entry_type text not null check (entry_type in ('prayer', 'gratitude')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table journal_entries enable row level security;

create index if not exists journal_entries_user_idx on journal_entries (user_id, created_at desc);

drop policy if exists journal_entries_select on journal_entries;
create policy journal_entries_select on journal_entries
  for select
  using (user_id = auth.uid());

drop policy if exists journal_entries_insert on journal_entries;
create policy journal_entries_insert on journal_entries
  for insert
  with check (user_id = auth.uid());

drop policy if exists journal_entries_delete on journal_entries;
create policy journal_entries_delete on journal_entries
  for delete
  using (user_id = auth.uid());

-- Placeholder - replace with today's real verse/reflection, or set up a
-- week's worth ahead of time from the table editor.
insert into devotionals (devotional_date, reflection) values
  (current_date, 'Add your own verse and reflection here from the Supabase table editor — this placeholder just shows what the card looks like.')
on conflict (devotional_date) do nothing;
