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
-- The church's real discipleship path — "Come and Follow Me" (Jesus).
-- Five stages, each with sub-lessons the pastor is recording video for one
-- at a time; a lesson_item with no content_url yet just shows its title
-- with no "Open" link until one's added (see the course detail page).
-- ============================================================================

-- Clears out the placeholder curriculum this schema shipped with, if it's
-- still there (cascades to its lesson_items and any completions on them).
delete from courses where slug in ('foundations-of-faith', 'prayer-and-the-word', 'church-and-community', 'living-on-mission');

insert into courses (slug, title, description, icon, color_theme, order_index, completion_message) values
  ('meet-jesus', 'Meet Jesus', 'The starting point of the path — who Jesus is, and what it means to follow him.', 'cross', 'amber', 1, 'You''ve taken the first steps. Welcome to the path.'),
  ('know-jesus', 'Know Jesus', 'Going deeper into who you are in Christ and the everyday practices that grow your walk with him.', 'book-open', 'sky', 2, 'You''re building a real foundation. Keep going deeper.'),
  ('be-like-jesus', 'Be Like Jesus', 'Growing in character, being led by the Spirit, and learning to lead yourself well.', 'heart', 'emerald', 3, 'Christ is being formed in you. That''s the whole point.'),
  ('freedom-in-jesus', 'Freedom in Jesus', 'Walking in the freedom Jesus already won for you — healed, whole, and free.', 'flame', 'rose', 4, 'Whatever held you back, you don''t have to carry it anymore.'),
  ('serve-jesus', 'Serve Jesus', 'Living out your calling — sharing your faith, leading others, and serving well.', 'users', 'violet', 5, 'You''ve walked the whole path. Now go make disciples.')
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  color_theme = excluded.color_theme,
  order_index = excluded.order_index,
  completion_message = excluded.completion_message;

insert into lesson_items (course_id, type, title, order_index) values
  ((select id from courses where slug = 'meet-jesus'), 'video', 'What is the Gospel?', 1),
  ((select id from courses where slug = 'meet-jesus'), 'video', 'Water Baptism', 2),
  ((select id from courses where slug = 'meet-jesus'), 'video', 'Who is God?', 3),
  ((select id from courses where slug = 'meet-jesus'), 'video', 'The Baptism of the Holy Spirit', 4),
  ((select id from courses where slug = 'meet-jesus'), 'video', 'Community: The Church', 5),

  ((select id from courses where slug = 'know-jesus'), 'video', 'The Cross and Your Truest Identity', 1),
  ((select id from courses where slug = 'know-jesus'), 'video', 'Communion', 2),
  ((select id from courses where slug = 'know-jesus'), 'video', 'How to Read the Bible', 3),
  ((select id from courses where slug = 'know-jesus'), 'video', 'How to Pray', 4),
  ((select id from courses where slug = 'know-jesus'), 'video', 'Worship: That Thing We Do', 5),
  ((select id from courses where slug = 'know-jesus'), 'video', 'The Kingdom of God', 6),
  ((select id from courses where slug = 'know-jesus'), 'video', 'Foundational Beliefs', 7),

  ((select id from courses where slug = 'be-like-jesus'), 'video', 'Love One Another', 1),
  ((select id from courses where slug = 'be-like-jesus'), 'video', 'The Fruit of the Spirit', 2),
  ((select id from courses where slug = 'be-like-jesus'), 'video', 'The Secret to a Powerful Life', 3),
  ((select id from courses where slug = 'be-like-jesus'), 'video', 'Being Led by the Spirit', 4),
  ((select id from courses where slug = 'be-like-jesus'), 'video', 'Leading Yourself Well', 5),

  ((select id from courses where slug = 'freedom-in-jesus'), 'video', 'Inner Healing', 1),
  ((select id from courses where slug = 'freedom-in-jesus'), 'video', 'Deliverance', 2),
  ((select id from courses where slug = 'freedom-in-jesus'), 'video', 'Physical Healing', 3),
  ((select id from courses where slug = 'freedom-in-jesus'), 'video', 'Spiritual Warfare', 4),

  ((select id from courses where slug = 'serve-jesus'), 'video', 'Finding Your S.H.A.P.E.', 1),
  ((select id from courses where slug = 'serve-jesus'), 'video', 'Sharing Your Faith', 2),
  ((select id from courses where slug = 'serve-jesus'), 'video', 'Walking in Power and Authority', 3),
  ((select id from courses where slug = 'serve-jesus'), 'video', 'Making Disciples', 4),
  ((select id from courses where slug = 'serve-jesus'), 'video', 'The Servant as Leader', 5),
  ((select id from courses where slug = 'serve-jesus'), 'video', 'Leaving a Legacy', 6)
on conflict (course_id, order_index) do nothing;

-- Catches an environment that already ran the earlier "be-free-in-jesus"
-- naming before the church confirmed "Freedom in Jesus" as the real title.
update courses set slug = 'freedom-in-jesus', title = 'Freedom in Jesus' where slug = 'be-free-in-jesus';

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

-- No seed row here on purpose: the Courses page's "Today" card only shows
-- up when a devotionals row exists for the current date, so an empty
-- table just means no card - the right default for real members, rather
-- than showing placeholder filler text. Add today's (or a week's worth of)
-- real verse/reflection any time from the Supabase table editor:
--
--   insert into devotionals (devotional_date, verse_reference, verse_text, reflection)
--   values (current_date, 'John 3:16', 'For God so loved the world...', 'Write your reflection here.');

-- A rotating pool of verses shown as a full-screen overlay on every app
-- open (see VerseOverlay.tsx) - distinct from `devotionals`, which is one
-- specific date-keyed card. Add as many rows as you like from the table
-- editor; one is picked at random client-side each time the app opens.
create table if not exists verses (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table verses enable row level security;

-- Lets the real-verse seed below use "on conflict (reference) do nothing"
-- so re-running this file doesn't duplicate rows.
create unique index if not exists verses_reference_key on verses (reference);

drop policy if exists verses_select on verses;
create policy verses_select on verses
  for select
  using (true);

drop policy if exists verses_write on verses;
create policy verses_write on verses
  for all
  using (is_admin())
  with check (is_admin());

-- Placeholder - replace with real verses from the table editor. Add more
-- rows any time; the overlay rotates through whatever is in this table.
insert into verses (reference, text)
select 'Add a real verse here', 'Add your own verse text from the Supabase table editor — this placeholder just shows what the overlay looks like.'
where not exists (select 1 from verses);

delete from verses where reference = 'Add a real verse here';

-- 50 verses in the New International Version, at the church's request for
-- readability. They replaced an earlier King James set: the delete below
-- removes those KJV rows by reference (a few NIV picks extend to the next
-- verse so they end on a full sentence, which changed their reference).
-- Rows the church added themselves are left alone. Re-running this file
-- refreshes the NIV text in place.
--
-- The NIV is copyrighted. Biblica allows quoting up to 500 verses without
-- written permission, with "NIV" shown after each quotation; VerseOverlay
-- shows that and the full notice. Stay well under that limit if the pool
-- grows.
delete from verses where reference in (
  'Proverbs 3:5', 'Ephesians 2:8', 'James 1:2', 'Colossians 3:23',
  'Lamentations 3:22', 'Ephesians 3:20', 'Nahum 1:7'
);

insert into verses (reference, text) values
('John 3:16', 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.'),
('Romans 8:28', 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.'),
('Philippians 4:13', 'I can do all this through him who gives me strength.'),
('Jeremiah 29:11', '"For I know the plans I have for you," declares the LORD, "plans to prosper you and not to harm you, plans to give you hope and a future."'),
('Psalm 23:1', 'The LORD is my shepherd, I lack nothing.'),
('Proverbs 3:5-6', 'Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.'),
('Isaiah 41:10', 'So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand.'),
('Matthew 6:33', 'But seek first his kingdom and his righteousness, and all these things will be given to you as well.'),
('Joshua 1:9', 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go.'),
('2 Corinthians 5:17', 'Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!'),
('Psalm 46:1', 'God is our refuge and strength, an ever-present help in trouble.'),
('Romans 12:2', 'Do not conform to the pattern of this world, but be transformed by the renewing of your mind. Then you will be able to test and approve what God''s will is—his good, pleasing and perfect will.'),
('Galatians 2:20', 'I have been crucified with Christ and I no longer live, but Christ lives in me. The life I now live in the body, I live by faith in the Son of God, who loved me and gave himself for me.'),
('Ephesians 2:8-9', 'For it is by grace you have been saved, through faith—and this is not from yourselves, it is the gift of God—not by works, so that no one can boast.'),
('Hebrews 11:1', 'Now faith is confidence in what we hope for and assurance about what we do not see.'),
('James 1:2-3', 'Consider it pure joy, my brothers and sisters, whenever you face trials of many kinds, because you know that the testing of your faith produces perseverance.'),
('1 Peter 5:7', 'Cast all your anxiety on him because he cares for you.'),
('1 John 4:19', 'We love because he first loved us.'),
('Psalm 119:105', 'Your word is a lamp for my feet, a light on my path.'),
('Matthew 11:28', 'Come to me, all you who are weary and burdened, and I will give you rest.'),
('Romans 5:8', 'But God demonstrates his own love for us in this: While we were still sinners, Christ died for us.'),
('2 Timothy 1:7', 'For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline.'),
('Philippians 4:6', 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.'),
('Psalm 27:1', 'The LORD is my light and my salvation—whom shall I fear? The LORD is the stronghold of my life—of whom shall I be afraid?'),
('Isaiah 40:31', 'But those who hope in the LORD will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.'),
('Deuteronomy 31:6', 'Be strong and courageous. Do not be afraid or terrified because of them, for the LORD your God goes with you; he will never leave you nor forsake you.'),
('Psalm 34:18', 'The LORD is close to the brokenhearted and saves those who are crushed in spirit.'),
('Romans 15:13', 'May the God of hope fill you with all joy and peace as you trust in him, so that you may overflow with hope by the power of the Holy Spirit.'),
('Colossians 3:23-24', 'Whatever you do, work at it with all your heart, as working for the Lord, not for human masters, since you know that you will receive an inheritance from the Lord as a reward. It is the Lord Christ you are serving.'),
('Matthew 5:16', 'In the same way, let your light shine before others, that they may see your good deeds and glorify your Father in heaven.'),
('John 14:6', 'Jesus answered, "I am the way and the truth and the life. No one comes to the Father except through me."'),
('John 8:32', 'Then you will know the truth, and the truth will set you free.'),
('Psalm 139:14', 'I praise you because I am fearfully and wonderfully made; your works are wonderful, I know that full well.'),
('Proverbs 16:3', 'Commit to the LORD whatever you do, and he will establish your plans.'),
('Isaiah 26:3', 'You will keep in perfect peace those whose minds are steadfast, because they trust in you.'),
('Lamentations 3:22-23', 'Because of the LORD''s great love we are not consumed, for his compassions never fail. They are new every morning; great is your faithfulness.'),
('Zephaniah 3:17', 'The LORD your God is with you, the Mighty Warrior who saves. He will take great delight in you; in his love he will no longer rebuke you, but will rejoice over you with singing.'),
('Psalm 37:4', 'Take delight in the LORD, and he will give you the desires of your heart.'),
('Ephesians 3:20-21', 'Now to him who is able to do immeasurably more than all we ask or imagine, according to his power that is at work within us, to him be glory in the church and in Christ Jesus throughout all generations, for ever and ever! Amen.'),
('Philippians 1:6', 'Being confident of this, that he who began a good work in you will carry it on to completion until the day of Christ Jesus.'),
('1 Corinthians 10:13', 'No temptation has overtaken you except what is common to mankind. And God is faithful; he will not let you be tempted beyond what you can bear. But when you are tempted, he will also provide a way out so that you can endure it.'),
('Hebrews 4:16', 'Let us then approach God''s throne of grace with confidence, so that we may receive mercy and find grace to help us in our time of need.'),
('James 4:8', 'Come near to God and he will come near to you. Wash your hands, you sinners, and purify your hearts, you double-minded.'),
('1 Thessalonians 5:16-18', 'Rejoice always, pray continually, give thanks in all circumstances; for this is God''s will for you in Christ Jesus.'),
('Psalm 91:1', 'Whoever dwells in the shelter of the Most High will rest in the shadow of the Almighty.'),
('Micah 6:8', 'He has shown you, O mortal, what is good. And what does the LORD require of you? To act justly and to love mercy and to walk humbly with your God.'),
('Galatians 5:22-23', 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control. Against such things there is no law.'),
('Romans 8:38-39', 'For I am convinced that neither death nor life, neither angels nor demons, neither the present nor the future, nor any powers, neither height nor depth, nor anything else in all creation, will be able to separate us from the love of God that is in Christ Jesus our Lord.'),
('Psalm 16:11', 'You make known to me the path of life; you will fill me with joy in your presence, with eternal pleasures at your right hand.'),
('Psalm 121:1-2', 'I lift up my eyes to the mountains—where does my help come from? My help comes from the LORD, the Maker of heaven and earth.')
on conflict (reference) do update set text = excluded.text;
