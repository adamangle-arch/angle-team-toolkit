# Angle Team Toolkit

A mobile-friendly activity tracker for a network marketing team, built with
Next.js (App Router) and Supabase. Tabs for each part of the day-to-day
workflow: Pipeline Tracker (which also holds the active Candidate Roadmap),
a separate Candidate History tab, Contacts, Core Run Streak, Volume, a
Leaderboard, a Role-Play Coach for practicing A-list/B-list/C-list
conversations, and a Resources hub (Products, Scripts & FAQ, Process Guide,
Leaders, Customers, Audio & Book Library). Everyone signs in with their own
email/password account, picks their team on first login, and each person's
individual data is private to them. Tapping a name anywhere on the
Leaderboard opens that person's public profile (photo, hometown,
background, favorite audios/books, and how the team has impacted them) —
see "Public profiles" below. All data is stored in Supabase (Postgres), so
it persists across sessions and devices.

### Today (dashboard / landing page)

The app now opens straight to a **Today** dashboard (`app/dashboard/page.tsx`,
`/dashboard` — the root `/` redirects here, and it's the first item in the
bottom nav) instead of dropping you into Pipeline Tracker or Goals. It pulls
together everything that's scoped to "today" but previously lived in
separate tabs, so logging in tells you what actually needs attention without
checking five different places:

- **🔥 Core Run Streak** — current streak length (`get_current_streak()`,
  the same function the Leaderboard and public profiles use) plus
  checkmarks for whether Read/Listen/Daily Update/Story Share are done yet
  today, from today's `streak_days` row.
- **🎯 Today's Goals** — whatever daily targets are set on the Goals page,
  read straight from `goals` where `period = 'daily'`. Only shows metrics
  that actually have a target set; if none are set yet, it says so and
  links to Goals.
- **📅 Today's Calendar** — anything on your personal calendar with an
  `event_at` today, from `calendar_events`.
- **📊 Today's Stats** — non-zero stage counts from today's
  `pipeline_periods` row (`period_type = 'daily'`), across every stage
  (`PIPELINE_STAGES` — Questions through Launches, not just a hand-picked
  few), plus the meeting count from today's Core Run Streak row
  (`streak_days.meetings`) — the one thing on this card that isn't
  actually pipeline data, since meetings are logged on the Run Streak
  page, not Pipeline Tracker, but still belong on the "everything that
  happened today" card. Originally called "Today's Pipeline" before
  meetings were folded in. Only stages with a nonzero count show up
  (`.filter((s) => s.value > 0)`) — a stage nobody touched today stays
  off the card entirely rather than cluttering it with "QI1: 0".

  A second row, **Downline Today**, sums the same stage counts across
  your entire downline for today (`get_downline_pipeline_totals()`,
  `is_upline_of`-scoped like everything else "your downline" means in
  this app) and shows up right underneath your own numbers, same
  zero-filtering rule. If neither you nor your downline has logged
  anything yet, the card just says so; if only one side has, only that
  row shows.

  Two more pills round this card out, and neither is actually "today"
  data — they're a live snapshot rather than something logged today, but
  this is the most useful place to glance at them: **My Active Pipeline**
  (your own candidates currently in progress — a QI1 booked, not launched,
  not filtered out) and **Downline Active** (the same count summed across
  your entire downline). Both come from a new
  `get_my_active_pipeline_summary()` function, using the exact same
  "active" definition as the Leaderboard's Active Candidates ranking
  (`launched = false and filtered_out = false and current_step >= 1`).
  "Downline Active" means your personal sponsorship chain (`is_upline_of`)
  — the same "your tree, not the whole company" meaning as the Team tab's
  My Tree view, not literally everyone even for an admin.

  Both pills are tappable — a modal lists the actual candidates behind the
  number, each with their current step (e.g. "QI2", "FU1") via the same
  `CANDIDATE_STEPS` labels used elsewhere, so you can see exactly who's
  where without leaving Today. Backed by two more functions,
  `get_my_active_candidates()` and `get_downline_active_candidates()`
  (the latter also returns each candidate's rep name/team, grouped in the
  modal by rep) — these exist as their own security-definer functions
  rather than a plain RLS-scoped `select * from candidates`, so the list
  always matches the summary count exactly, including for an admin, where
  a plain select would return literally everyone (`is_app_admin()`
  bypass) instead of just the admin's own sponsorship chain. The
  Today's Stats card itself changed from one big `<Link>` to a `<div>`
  wrapping a smaller `<Link>` (just the today-scoped numbers) alongside
  the two independently-tappable pill buttons, since nesting a button
  inside a `<Link>`'s rendered `<a>` tag is invalid HTML that browsers
  silently "fix" by breaking out of the anchor, which would have made the
  pills unreliable to tap.

Every card is read-only and links to the real page to make changes — the
dashboard doesn't duplicate any editing logic, it just surfaces what's
already there.

**Opening the app always lands on Today**, regardless of whatever URL the
browser/PWA happens to resume at (a bookmark, an iOS home-screen launch
resuming its last page, a stale tab) — not just when the URL is literally
`/`. `AuthGate` redirects to `/dashboard` the first time the fully
authenticated app shell mounts in a given tab session (tracked via a
`sessionStorage` flag, so it fires once per app open, not on every
in-app navigation or manual reload of the same tab).

### Bottom nav cleanup

The bottom nav had grown to 14 tabs (13 plus Today), which meant scrolling
horizontally to find anything near the end — an earlier pass trimmed that
to 11 by moving Resources/Assistant/Onboarding/Games behind **More**, but
11 still needed horizontal scrolling to reach Team at the end, and
swiping sideways through a tab bar to find something isn't an intuitive
pattern for everyone using this app (it skews toward younger, app-fluent
users; a lot of people won't think to try it). The main bar
(`components/BottomNav.tsx`) is now just the 5 tabs used every single
day — **Today, Pipeline, Contacts, Run Streak, Team** — plus **More**,
short enough to never need scrolling on a phone screen. Everything else
(Goals, Calendar, Candidate History, Volume, Leaderboard, plus the
existing Resources/Assistant/Onboarding/Games/Team Events) lives behind
More (`app/more/page.tsx`), one tap away. The More tab's icon still lights
up whenever you're actually on one of its pages, same as before, so it
never looks like you've navigated away to nowhere.

**Swapped again since**: the main bar is now **Today, Pipeline, Calendar,
Run Streak, Leaderboard**, with **Contacts** and **Team** moved behind
More instead — a better fit for what actually gets checked constantly
(a live calendar and rankings) versus what's more of an occasional
lookup (a specific contact, a downline member's page). Same 5-tabs-plus-More
shape, just which 5.

**Label shortened since**: the Core Run Streak tab's nav label was "Run
Streak," which wraps to two lines on the tab bar while every sibling tab
stays on one — shortened to **Core Run** to match.

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **Authentication > Sign In / Providers > Email** and turn **off**
   "Confirm email" (unless you want teammates to click an email link before
   their first login — off is simpler for a small internal team).
3. In the Supabase dashboard, open **SQL Editor > New query**, paste the
   contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it.
   This creates every table the app needs with per-user Row Level Security.
   Every statement in the file is written to be safe to re-run in full any
   time it changes (`create table if not exists`, `create or replace
   function`, etc.) — re-running the whole file never drops or wipes
   existing data, so pulling a new copy after a feature update and running
   it again is always safe. Always paste and run the **entire** file, never
   a fragment.
4. Near the top of `supabase/schema.sql`, the `is_app_admin()` function is
   hardcoded to a list of email addresses — change it to whichever accounts
   should be able to see/manage everyone's data, then re-run the file.
5. Open **Authentication > URL Configuration** and add your app's URL(s) to
   **Redirect URLs** — `http://localhost:3000/reset-password` for local
   dev, and your production URL's `/reset-password` once deployed (e.g.
   `https://your-app.vercel.app/reset-password`). This is what lets the
   "Forgot password?" email link land back in the app instead of being
   rejected by Supabase.
6. Go to **Project Settings > API** and copy:
   - **Project URL**
   - **anon / public** key

## 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the values:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

The first two come from Supabase (step 1). The last one powers the
**Role-Play Coach** tab — get it from [console.anthropic.com](https://console.anthropic.com)
(Settings > API Keys) after creating an account and adding billing. This is a
metered, pay-per-use API, not free — see "Notes on the AI Assistant" below.

## 3. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll land on a
sign-in screen; use "Need an account? Sign up" to create the first login.

### Forgot password

"Forgot password?" on the sign-in screen (`components/LoginForm.tsx`) switches
to an email-only form that calls Supabase's
`auth.resetPasswordForEmail(email, { redirectTo: ".../reset-password" })`.
The confirmation message ("If that email has an account, a reset link is on
its way") is the same whether or not the address actually has one — Supabase
doesn't error either way, so there's nothing to branch on, and confirming
existence one way but not the other would leak who has an account.

The emailed link lands on a new standalone `/reset-password` page
(`app/reset-password/page.tsx`) — standalone the same way `/prospect` is:
`AuthGate` renders it outside the normal sign-in wall, since arriving there
means following a short-lived recovery link, not being already signed in.
An already fully-onboarded account clicking the link would otherwise just
get dropped straight into the app instead of ever seeing the password form.
The page waits for Supabase to parse the recovery token out of the URL
(`onAuthStateChange`'s `PASSWORD_RECOVERY` event, alongside a plain
`getSession()` check in case that event already fired before the listener
was attached), then submits the new password via `auth.updateUser({
password })` and sends them back to `/` to fall into the app normally.

This requires one manual Supabase dashboard step per environment (see step 5
under "Set up Supabase" above) — the redirect URL has to be allow-listed
under **Authentication > URL Configuration**, or Supabase silently ignores
`redirectTo` and sends the email link to the project's default Site URL
instead.

## Deploying to Vercel

See the deployment steps the assistant gave you in chat, or in short:

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Add all three env vars above (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`) in the Vercel
   project's **Settings > Environment Variables**. `ANTHROPIC_API_KEY` must
   **not** be marked "expose to browser" / prefixed with `NEXT_PUBLIC_` — it
   should only ever be readable by the server.
4. Deploy.

## Notes on privacy & security

Every table has Row Level Security scoped to `user_id = auth.uid()`, so
signed-in users only ever see their own rows through the app — Pipeline,
Candidates, Contacts, and Streak are all private per person. The exception is
the primary-user emails hardcoded in `is_app_admin()` (see
`supabase/schema.sql`): those accounts get an extra **Team** tab in the app
with two views — **Members** (every signed-up member's individual data, same
as before) and **Teams** (each of the 9 teams' pipeline numbers added
together) — and can also read, update, or delete any row via direct Supabase
access (e.g. the dashboard's **Table Editor**, which always has full access
regardless of RLS since it runs as the project owner). New rows are always
attributed to whoever is actually logged in, primary users included —
there's no "post as someone else." The primary-user email list is duplicated
in two places — `is_app_admin()` in `supabase/schema.sql` and
`PRIMARY_EMAILS` in `lib/constants.ts` — change both together if it ever
needs to be a different set of accounts.

The **Team** tab depends on a `profiles` table that's populated by a
database trigger whenever someone signs up (see the "PROFILES" section in
`supabase/schema.sql`). If you already ran the schema before this was added,
run just that section again — it's additive and won't touch your existing
data.

### Names, teams, and the Leaderboard

`profiles` also carries `first_name`, `last_name`, and `team` — the fixed
list of teams (`TEAMS` in `lib/constants.ts`, matching a check constraint in
`supabase/schema.sql`) is currently: Angle Team, AA2 Team, Tucker Team,
Scheerer Team, Abbott Team, TX Team, Rodgers Team, Jones Team, Koebel Team.
Every user is prompted to fill these in — once, via a blocking "Finish your
profile" screen — the first time they log in after this feature shipped, and
new signups get the same prompt right after creating their account. If
you're adding this to a project that already ran an earlier version of
`schema.sql`, just re-run the file (it's additive here — the new columns and
policy use `if not exists` / safe drops-and-recreates that don't touch
existing table data).

Four SQL functions do the cross-member aggregation for the Teams view and
the Leaderboard — `get_team_pipeline_totals`, `get_individual_leaders`,
`get_streak_leaderboard`, and `get_core300_leaderboard`. All four are
`security definer` so they can read every member's private rows, but each
only ever returns an aggregate or a name + single stat — never a member's
full private breakdown — and all are callable by any signed-in user (`grant
execute ... to authenticated`), since the Leaderboard is intentionally
visible to everyone, not just primary users.

**Changing your team after signup** — a "My Team" card at the top of **My
Profile** lets anyone pick a different team from the same fixed `TEAMS`
list, for whoever picked the wrong one by accident when they first signed
up. This is a client-side-only feature and needed no schema changes:
`team` is never duplicated onto `pipeline_periods`, `candidates`, or any
other data table — every leaderboard/stat/team-totals function above
joins against `profiles.team` live, at query time. So updating that one
field is the entire fix; every one of that person's existing numbers
reads as belonging to the new team on the very next query, with nothing
to migrate or re-enter. Already covered by the existing `update_own` RLS
policy on `profiles` (`id = auth.uid()`), same as every other
self-editable profile field.

### Teams view: browsing past weeks/months

The Team tab's admin-only **Teams** view (per-team pipeline totals) used
to only ever show the current week or month, with no way to look back or
compare periods. `get_team_pipeline_totals(p_period_type, p_period_start)`
already took an arbitrary period start with no "current period" assumption
baked in — the limitation was purely client-side, so no schema changes
were needed. `app/team/page.tsx` now has a `‹`/`›` navigator next to a
Daily/Weekly/Monthly toggle (Daily added later, same treatment as
Weekly/Monthly): `‹` steps one period further back, `›` steps forward
again (disabled once you're back at the current period — no peeking into
the future), with the label showing a date, a week range
("Jul 20 - 26, 2026"), or a month name depending on the toggle, plus a
"(current)" tag when you're looking at today's period. Switching between
Daily/Weekly/Monthly resets back to the current period, since a "3 days
back" offset, a "3 weeks back" offset, and a "3 months back" offset
aren't the same thing. Helpers in `lib/dates.ts`: `getDateOffset(daysBack)`,
`getWeekStartOffset(weeksBack)`, `getMonthStartOffset(monthsBack)`, and
`formatWeekRangeLabel`.

**Real bug found here, not a timezone quirk on anyone's device:** a rep
in US Eastern reported "current week" was showing a Sunday-Saturday range
instead of Monday-Sunday — e.g. "Jul 26 - Aug 1" instead of the correct
"Jul 27 - Aug 2." Confirmed live and root-caused: `getWeekStartOffset()`
computed today's Monday via `getWeekStart()` (correct, returns a plain
`"YYYY-MM-DD"` string), then round-tripped that string through
`new Date(thatString)` to subtract whole weeks from it. A bare date-only
string like `"2026-07-27"` is parsed as **UTC midnight**, not local
midnight — in any timezone behind UTC (all of the US), converting that
UTC instant back to local time for the subsequent `.setDate()`/`.getDate()`
calls lands on the *previous* calendar day. This wasn't intermittent or
device-specific — it silently shifted the "current week" back by one full
day for every single person west of UTC, every time, until caught. Fixed
by never round-tripping through a string: `getWeekStartOffset` now builds
the shifted date directly from `new Date()` and asks `getWeekStart()` for
*that* date's Monday, the same safe pattern every other date helper in
`lib/dates.ts` already used (they all explicitly append `T00:00:00` when
parsing a date-only string back into a `Date`, precisely to avoid this).
`getMonthStartOffset` and `getDateOffset` were never affected — neither
one round-trips through a string at all.

### Members view: same Daily/Weekly/Monthly + back-navigation as your own Pipeline Tracker

The **Members** view's per-person detail panel (available to any upline,
not just admins) used to show a single downline member's Pipeline card
pulled via "whichever `pipeline_periods` row was updated most recently" —
no way to pick Daily vs. Weekly vs. Monthly, and no way to look back at a
past period, even though the rep's own Pipeline Tracker (and the
admin-only Teams view above) both already had exactly that. Now it reuses
the same `periodType`/`periodOffset` state and `‹`/`›` navigator already
on this page for Teams, just also rendered (and query-driving) inside the
Members detail panel. The pipeline fetch changed from "most recently
updated row" to an exact `period_type` + `period_start` match against
whatever's currently selected, same as the rep's own Tally tab; a period
with nothing logged shows real zeros across every stage (with a small
"Nothing logged for this period" note) rather than either a stale
different-period row or a blanket "no activity yet" message. No RLS or
schema changes needed — the existing `pipeline_periods` select policy
already covers any of a downline's rows regardless of date, the
limitation was purely which single row the client happened to ask for.

`formatWeekRangeLabel` originally showed a broken label for a same-month
week ("Jul 19 - 2026 (day: 25)" instead of "Jul 19 - 25, 2026") — it asked
`Intl.DateTimeFormat` for `year` + `day` with no `month`, which is an
invalid combination; some engines (Node/V8 among them) fall back to that
literal "(day: N)" text instead of erroring. Fixed by never asking Intl
for that combination at all — the same-month case is now built by hand
(`${startLabel} - ${end.getDate()}, ${year}`) instead of trying to get
Intl to omit the repeated month.

The Leaderboard recognizes every pipeline stage except Questions, for both
teams and individuals, plus who's currently on a Core Run Streak (all 4
activities every day — not 3 of 4 — counted back from today or yesterday),
who's running 5+ active candidates through the roadmap at once, and who's
hitting the QI1 "rhythm" — 2+ QI1s in the week or 8+ in the month, ranked
highest to lowest. Weeks run Monday–Sunday and months reset on the calendar
month, not a rolling 30 days; the monthly view can page back up to 12
months to see past numbers.

### Candidate Roadmap

The active Candidate Roadmap lives on the **Pipeline Tracker** tab,
underneath the pipeline counters. A new candidate starts at step 0, **Yes**
(they said yes, but no QI1 is booked yet) — advancing them to step 1, QI1,
is what makes them count as "active in the pipeline." That count shows at
the top of the Candidate Roadmap section — the same threshold
(`ACTIVE_PIPELINE_MIN_STEP` in `lib/constants.ts`) is what the Leaderboard's
5+ Active Candidates section uses.

The active roadmap list is sorted **furthest-along-first** (highest
`current_step` at the top), not just newest-added-first — the people
closest to launching are the ones who most need attention, so they're
the first thing you see instead of being buried under whoever was added
most recently. Candidates on the same step keep their existing
newest-first relative order (`Array.prototype.sort` is stable).

**Each candidate is a single-line row, collapsed by default** — name and
current step/status, nothing else — with ← and → icon buttons right on
that row for Back/Advance, since moving someone forward is by far the
most common action here. Tapping the row (anywhere except those two
buttons) expands it in place for the less-frequent stuff: the access
code, Connected date, Mark Launched/Filtered Out (or Restore), and notes.
A roster of 20+ active candidates used to mean scrolling past everyone's
full notes and buttons to find one name — now it's 20 one-line rows,
expand only the one you're actually working on.

A horizontally-scrolling row of pills above the active list — All, then
each of the 9 roadmap steps by name ("1. Yes", "2. QI1", …) — narrows it
down to one step, so finding everyone stuck at a specific point in the
process doesn't mean scrolling past everyone else. It only shows up once
there's at least one active candidate.

Marking a candidate "Filtered Out" removes them from the active roadmap
board immediately — they're not deleted from the database, just hidden
from the working list. Every candidate you've ever added (active,
launched, or filtered out, and exactly which step they filtered out at)
lives on its own **Candidate History** tab, with a Restore option for
anything settled by mistake.

Candidate History is divided by month (by `connected_date`), one month at
a time, with ← → arrows to page back up to 12 months — same bounded
pattern as the Leaderboard's monthly view (`getMonthStartOffset`), so
older history doesn't turn into one endless scrolling table. Each
candidate row also has a **Delete** button (alongside Restore) for
permanently removing a row entirely — unlike Filtered Out (reversible,
meant for a candidate who genuinely didn't pan out), this is a real,
confirmed, unrecoverable delete meant for a test/fake entry that
shouldn't exist in the history at all.

**Upgrading an existing project:** three one-time data migrations (not
part of the reusable schema.sql patches) as the roadmap steps have
changed shape over time:
```sql
-- 1. Made room for the new "Yes" step at index 0.
update candidates set current_step = current_step + 1;

-- 2. Removed the two "Audio & Reading" entries (they were homework
-- reminders, not real process steps) - shifts everyone after them down
-- and merges anyone who was sitting on one forward into the IS1/IS2
-- that followed it.
update candidates set current_step = case current_step
  when 3 then 3
  when 4 then 3
  when 5 then 4
  when 6 then 5
  when 7 then 5
  when 8 then 6
  when 9 then 7
  else current_step
end;

-- 3. Added Questionnaire between FU2 and Offer Call - only Offer Call
-- (the last step) needs to move, everyone else's index is unaffected.
update candidates set current_step = 8 where current_step = 7;
```
Run whichever of these your existing data hasn't already gone through —
if you're setting this up fresh, skip all three.

### Contact Builder (was "A/B Contact List")

The **Contacts** tab (`app/contacts/page.tsx`) is now **Contact Builder**,
with a toggle at the top separating two genuinely different lists sharing
the same `contacts` table (new `'Customer'` value alongside `'A'`/`'B'` on
`category`):

- **Networking List** — your prospecting list, split into **🟢 A-List
  Connections** and **🔵 B-List Connections**. A **List Builder** meter
  tracks total names toward a goal of 100, with milestone marks at 🟢20,
  🟡40, 🔴60, 🔵80, and 🏆100 — the classic "build a list of 100" exercise,
  not to be confused with the Volume tab's Core 300 PV meter.
- **Customer List** — a separate list of actual customers, with a simpler
  two-status field (Not yet asked / Contacted) instead of the full
  networking pipeline (Asked → QI1 → ... → Launched), since a customer
  isn't walking through the business pipeline.

A short tip under the toggle reminds people of the typical (not rigid —
always exceptions) demographic split: networking prospects tend to be in
their 20s–30s, while customers tend to be 35+ and already spending money
on a household.

Both lists show **Contacted** and **Left to Contact** counts, derived live
from each contact's status (`"Not yet asked"` = not yet contacted, anything
else = contacted) — not a separately-tracked number, so it can't drift out
of sync with the actual list.

Adding a contact also has an optional "How do you know them?" quick-pick —
Family, Friend, Coworkers, Gym, Church, Neighbor, College, High School,
Social Media (`contacts.connection_tags`, a `text[]`, additive) — shown as
pills on the contact card once set, plus a single-pick "Best way to
reconnect?" — Text, Instagram, Facebook, Snapchat, Other
(`contacts.reconnect_method`, a plain `text`, additive) — editable later
from a dropdown on the contact card itself. Underneath the Add Contact button, a
rotating memory-jogger prompt cycles every few seconds to help surface
names that don't come to mind right away — purely a display prompt with
nothing stored. The two lists get different prompts, matching their
different typical demographic (see the tip above): Networking gets
relationship-based prompts ("Who cuts your hair?", "Who was in your
wedding?") plus a few aimed at ambitious/driven people specifically
("Who's the most successful friend you have?", "Who was prom king or
queen at your school?"); Customer List gets prompts aimed at people
likely to actually buy products ("Who values organic or natural
ingredients?", "Who's willing to spend more for quality over
quantity?") — both full lists are in `lib/contact-questions-data.ts`.

**Add Contact** used to silently swallow a failed insert (same class of
bug found and fixed in Rate a Call and elsewhere) — if the insert failed
for any reason, the name field still cleared as if it had worked, but no
contact ever appeared in the list, with no error shown anywhere. Now the
insert's `error` is checked and surfaced as a message under the form, and
the typed name isn't cleared on failure so nothing is lost.

Personal Circle PV lives on its own **Volume** tab: each person self-reports
their own current-month PV there (stored in the additive `monthly_pv`
table, same owner-or-primary-user RLS pattern as everything else), with
their last 6 months shown underneath for reference. Anyone at 300+ PV for
the month shows up in the Leaderboard's **Core 300** ranking, visible to
everyone and sorted by PV.

The Volume tab also has a **Day 1 Ditto** field (`day1_ditto_pv` on the same
`monthly_pv` row) — anyone over 100 PV there shows up in the Leaderboard's
**Day 1 Ditto 100+** ranking — and a **Customer Sales** log (`customer_sales`
table) where people log customer sales with a quick-pick product line and a
dollar amount for the month. See "Core 300 Meter," "Day 1 Ditto Meter," and
"Customer Sales" further down for the full Volume tab layout.

By default Supabase requires email confirmation on signup; see step 2 above
if you want teammates to be able to log in immediately after creating an
account.

### Public profiles

After the mandatory name/team screen, every user sees a one-time, skippable
prompt ("Tell the team about you") for a photo, hometown, background, top 3
favorite audios, top 3 favorite books, and one way being on this team has
positively impacted them. It's genuinely optional — hitting "Skip for now"
marks `profiles.profile_prompted` true and moves on; nobody is ever blocked
from using the app over it. Anyone can fill it in (or edit it) anytime from
**My Profile**, linked from every page's header.

Tapping a name anywhere on the Leaderboard opens that person's profile at
`/profile/[id]` — a read-only view built from `get_public_profile(user_id)`,
a `security definer` function that only ever returns the fields meant to be
shared (never email or anything private), so it's safe to expose to any
signed-in user, not just primary users.

Photos upload to a public Supabase Storage bucket called `avatars`, one
file per user at `avatars/<user_id>/photo.<ext>` — public read (so
teammates can actually see the photo) but restricted to each user only
being able to upload/replace/delete their own file.

### Linked spouses (same business, one set of numbers)

A husband and wife running the same business can link their two logins
from **My Profile** — enter your spouse's email and, once linked, your
Pipeline Tracker, Candidate Roadmap/History, Contacts, and Volume (PV,
Day 1 Ditto, Customer Sales) all read and write the *same* rows as your
spouse's login, instead of two separate sets. Core Run Streak and the
profile itself (photo, background, favorites, team impact) stay
individual on purpose — each person keeps their own streak, and a linked
couple still shows up as two separate, tappable profiles wherever the
Leaderboard shows a combined "First & First Last" entry.

Mechanically: `profiles.household_id` (self-service via the
`link_spouse(email)` function) lets one side "defer" to the other's
account. Every app page reads/writes the shared tables using a resolved
`ownerId` (`household_id ?? your own id`) instead of your raw user id, and
RLS on those five tables allows a row if `user_id` matches either your own
id or your linked household_id. Only one side ever sets household_id — the
other side's data already **is** the shared record, so nothing points back
the other way and there's no cycle to worry about. Unlinking is just
clearing `household_id`; nothing is deleted.

**Heads up:** linking does not merge or migrate any data that already
exists — it only affects what each login reads/writes going forward.
If both spouses already had their own separate pipeline/candidates/PV
history before linking, that old data doesn't get combined automatically.

### Upline account number required at signup

`ProfileGate.tsx` (the one-time "Finish your profile" screen shown after
signup, before the rest of the app unlocks) used to only require first
name, last name, and team — linking to an upline was a separate,
easy-to-skip self-service step on My Profile, so plenty of accounts never
did it. The upline's account number is now a **required** field on this
same gate, right alongside name/team: submitting calls `link_upline()`
same as My Profile always has, and a bad/unknown number blocks
progression with the RPC's own error message ("No account found with
that number") instead of silently letting someone through un-sponsored.
A spouse's email is also collected here now, but stays **optional** —
not everyone has one on the team — calling the existing `link_spouse()`
if filled in, same validation-blocks-progression treatment if it's typed
but wrong. Nothing changed about the RPCs themselves or My Profile's own
link/unlink UI, which still exists for fixing a mistake or changing
either link later.

Admins (`isPrimaryUser`) are the one exception — they aren't sponsored by
anyone on the team, so the upline field drops its `required` attribute
and the field's own helper text changes to say it's optional for them.
An admin can still fill it in and link an upline if they want (e.g. an
admin who's also personally building a downline of their own) — `handleSubmit`
only calls `link_upline()` at all when the field isn't blank, for anyone,
admin or not.

### Upline visibility

Every account gets a 6-digit `account_number` (shown at the top of **My
Profile**, generated automatically on signup by `handle_new_user()`). A
downline enters their upline's number under "My Upline" on their own My
Profile page (self-service, via the `link_upline(account_number)`
function), which sets their own `profiles.upline_id` — read-only visibility
for the upline, not shared data like the spouse linking above.

Once linked, the upline sees that person (and everyone below them,
recursively — an upline's upline sees the whole downline chain) on the
**Team** tab: Pipeline, Candidates, Contacts, Volume, Core Run Streak, and
now their **Assistant conversations** too, the same access primary users
(`adamangle@icloud.com`, `alexangle@me.com`, `laurasangle@gmail.com`) already have to everyone. The
**Team** tab is visible to every signed-in user now, not just primary
users — non-admins just see their own downline (or nobody, until someone
links to them) instead of the whole company, and don't get the
company-wide **Teams** aggregate view, which stays primary-user-only.

The recursion is `is_upline_of(viewer, target)`, a `security definer`
function that walks `upline_id` up to 20 levels looking for `viewer` —
that depth cap is just a safety net against a bad manual edit creating a
cycle; `link_upline()` itself also refuses to link if it would create one.
This is the only case in the app where reading someone's Assistant chat
history is possible by anyone other than that person themselves — worth
knowing if a downline ever asks who can see their role-play conversations.

**Now symmetric: you can also see your own upline, in sponsoring
order — but never sideways.** The `profiles` table's select policy used
to only grant `is_upline_of(auth.uid(), id)` (you can read anyone in your
*downline*). It now also grants `is_upline_of(id, auth.uid())` — anyone in
your *upline* — so a rep can see who sponsored them, and who sponsored
that person, all the way to the top. Someone in neither chain (a
completely different branch, or a sibling under the same sponsor who
isn't literally you) matches neither clause and is still invisible —
"no cross-line visibility" was already true before this change (a
non-admin's `profiles` query was always scoped to self + downline only)
and stays true now; the only thing added is the second, upward direction.
This only affects the `profiles` row itself (name, team, join date,
account number) — it does **not** extend to anyone's business data
(pipeline, candidates, contacts, ratings, goals), which is still governed
entirely by each table's own `is_upline_of(auth.uid(), user_id)`-only
policy, unchanged and still one-directional (you still can't see your
upline's numbers just because you can now see their name).

Three places elsewhere in the app used to discover "does this account
have any downline" via a plain `profiles` query scoped only by RLS
(`.neq("id", user.id)`, relying on RLS to mean "downline") —
`app/streak/page.tsx`'s downline pipeline card and `app/calendar/page.tsx`'s
"do I have anyone to broadcast an event to" check. Both would have started
counting upline members as if they were downline the moment upline
visibility shipped, so both were switched to the same
`get_downline_user_ids()` RPC the Pipeline Tracker's fill-in feature
already used — the authoritative "who's actually below me" source,
unaffected by the `profiles` RLS change either way.

Primary users (`adamangle@icloud.com`, `alexangle@me.com`, `laurasangle@gmail.com`) additionally see
everyone's `account_number` on the **Team** tab — next to each row in the
Members list, and again on a selected member's detail view — since
`profiles` RLS already lets an admin read every row, this is purely a
display addition (`isAdmin &&` guards, no schema change). Useful for
helping someone link up without needing to ask them to read their own
number off My Profile.

### Linked households share downline/upline visibility too

A rep reported seeing no downline at all despite being linked (via
`link_spouse`) to their fiancée — real gap, not a misunderstanding.
Household linking only ever shared *business data* (pipeline, candidates,
contacts); sponsorship visibility (`is_upline_of`, driving the Members
list, the Team tab's per-member detail view, and every business-data RLS
policy) is governed entirely by `upline_id`, a completely separate
mechanism that linking never touched. A couple running one business only
has one real sponsor line, but a recruit may have entered *either*
partner's account number depending on who they actually talked to — so
only whichever partner the recruit picked ever saw them as downline; the
other partner saw nothing, despite genuinely running the same business.

Fixed at the single source of truth: `is_upline_of(p_viewer, p_target)`
now expands **both** arguments to their linked household unit (self, plus
whoever they're linked to in either direction — `household_id` is only
ever stored on the "deferring" side, so both directions have to be
checked) before walking the sponsorship chain. Both arguments needed
expanding, not just one — this function gets called with both argument
orders across the app (the `profiles` select policy alone does
`is_upline_of(auth.uid(), id) or is_upline_of(id, auth.uid())`), so
widening only `p_viewer` would've silently left the reverse direction
broken. Because this one function is what every downline/upline check in
the app already calls through — `profiles` visibility, every
business-data table's RLS, `delete_downline_account`,
`grant_next_onboarding_session`, the Team tab's aggregate RPCs — the
Members list and per-member detail view picked this up automatically,
with no changes needed to any of them individually.

**My Tree**/**My Upline** needed a second, small fix on top: unlike the
Members list (a flat filter over whatever `profiles` RLS already
returns), those two are built by literally walking `upline_id` starting
from one specific account (`buildSponsorshipChildren`), so a recruit
sponsored under a spouse's id would still never appear rooted under "you"
even though the row itself is now fetchable. A new
`get_household_partner_id()` function (security definer, checks both
directions of the `household_id` pointer the same way) lets the Team tab
resolve a linked partner's id once and fold their tree/chain in: **My
Downline** now builds the tree from both roots and merges the top-level
lists (re-sorted, since each root's own list was only alphabetical on its
own); **My Upline** falls back to a linked partner's own chain if this
account's is empty, since typically only one partner in a couple actually
entered a sponsor's account number.

### Sponsorship tree views

The Team tab's toggle row has two more views alongside Members/Teams,
both visualizing the same `upline_id` chain as a nested, collapsible
tree (indented rather than a graphical side-scrolling org chart — a real
box-and-line chart doesn't fit a 448px-wide phone screen without
horizontal scrolling of its own, the exact thing this pass was trying to
get away from):

- **My Upline** (everyone) — the chain going up from your own sponsor to
  the top, **in sponsoring order** (immediate sponsor first, then theirs,
  and so on) — a flat numbered list, not a tree, since there's exactly
  one path upward by definition. Built by walking `upline_id` pointers
  starting from your own profile using whatever's already in the fetched
  `profiles` array — now that the select policy grants upline visibility
  (see above), those rows are simply present once fetched, no extra
  query. Empty for anyone with no upline set yet, with a nudge to add
  one on My Profile.
- **My Tree** (everyone) — your own downline, nested by who sponsored
  whom, with "you" as the root. `buildSponsorshipChildren()` only follows
  the `upline_id`-graph *downward* from your own id, so the upline rows
  now also present in `profiles` are simply never reached by this
  traversal — they don't leak into this tree.
- **Whole Team** (admin only) — literally everyone who's signed up,
  nested the same way, rooted at whoever has no upline at all (the
  founders). Only meaningful for an admin, since `is_app_admin()` already
  grants full visibility independent of upline/downline either way.

The **Members** list (flat list of downline profiles, each with a
Pipeline/Candidates/Contacts/etc. detail view) explicitly excludes the
upline chain now present in `profiles` — a `downlineProfiles` filter
subtracts `myUplineChain`'s ids before rendering, so your own sponsor
doesn't show up mixed into a list of people you supervise (their business
data wouldn't even load correctly there anyway, since every other table's
RLS is still one-directional downline-only). The member count in the
page subtitle uses the same filtered list for a non-admin.

`My Tree`/`Whole Team` are built by `buildSponsorshipChildren()` in
`lib/sponsorship-tree.ts` (groups the flat `profiles` array by
`upline_id`, sorts each level alphabetically, recurses) and rendered by
`components/SponsorshipTree.tsx` — each node is tap-to-collapse (▾/▸) and
links straight to that person's `/profile/[id]`, with their named `team`
shown alongside and a count of direct reports. No new tables or RPCs for
any of this — the upline-chain piece is one RLS policy addition, the rest
is a new way to look at data the app already had.

A linked couple still shows up as **two separate nodes** in the tree —
household linking (`link_spouse`, shares business data) and sponsorship
(`upline_id`, who signed up under whom) are two independent concepts, so
a married couple each having their own account under the same sponsor is
correct, not a bug, the same as it's always been. What *was* missing:
the tree didn't surface the "· shared w/ spouse" tag the Members list
already shows next to a linked account's name — `TreeNode` now checks
`profile.household_id` the same way, so both views agree. Only the
partner who ran `link_spouse` (the one "deferring" to the other) gets the
tag, since `household_id` is only ever set on that one side — seeing it
on just one of the two names in a couple is expected, not a sign the link
half-failed.

### Pipeline Tracker: upline fill-in

Any upline (any level, not just admins) can log a downline member's
Pipeline Tracker numbers on their behalf — in case that person forgets or
just isn't logging it, the upline can still keep the team's numbers
accurate. A **Filling In For** card appears at the top of the Pipeline
Tracker tab (only if you actually have downline — hidden for everyone
else), defaulting to "Me." Pick someone else and the whole page — Daily/
Weekly/Monthly counters, the conversion stat, and the Trend chart — switch
to editing *their* numbers instead of yours, with an amber "You're editing
{name}'s pipeline numbers, not your own" reminder so it's never ambiguous
whose numbers are on screen. The Candidate Roadmap section (individual
candidate names/notes, a more personal record than the funnel counts)
isn't part of this — it's hidden while filling in for someone else, with a
note pointing back to "Me."

`pipeline_periods` got pulled out of the shared household-tables RLS loop
into its own explicit block so its `insert`/`update` policies could allow
`is_upline_of(auth.uid(), user_id)` in addition to the owner/household/
admin checks the other household tables (candidates, contacts, monthly_pv,
customer_sales) still use — those are unchanged, an upline still can't
write to a downline's contacts or candidates, only read them. `delete`
stays owner/household/admin only on `pipeline_periods` too — filling in
isn't deleting.

### Daily Tally auto-rolls into Weekly/Monthly, and syncs with Core Run Streak

Two related double-entry fixes, both new SQL functions:

- **Daily → Weekly → Monthly rollup.** Editing any stage on the **Daily**
  tab (Questions, Yeses, QI1, QI2, IS1, FU1, IS2, FU2, Questionnaire,
  Launches) now also applies the same delta to that day's week and month
  totals — `bump_pipeline_stage(p_owner_id, p_period_start, p_stage,
  p_delta)` upserts all three rows (`daily`/`weekly`/`monthly`) in one
  call, using Postgres's `date_trunc('week', ...)` (Monday-start, same
  convention `lib/dates.ts`'s `getWeekStart()` already uses) and
  `date_trunc('month', ...)` to find the right week/month row for that
  day. `app/pipeline/page.tsx`'s `updateStage()` now calls this instead
  of writing directly to the table whenever `periodType === "daily"` —
  Weekly/Monthly tabs edited directly are unchanged (still a plain
  update, no cascade, since there's no smaller unit to attribute a
  rollup to). This only applies going forward; it doesn't retroactively
  reconcile whatever Weekly/Monthly numbers already exist from manual
  double-entry before this shipped.
- **Questions/Yeses ↔ Core Run Streak sync.** These two stages also exist
  as their own counters on Core Run Streak's "Today's Activity" card —
  previously two entirely separate numbers you had to keep in sync by
  hand. Now editing either updates the other for that same calendar day:
  `mirror_pipeline_stage_to_streak(p_period_start, p_stage, p_delta)`
  (called from Pipeline's `updateStage()`, mirrors the delta into the
  caller's own `streak_days` row) and the equivalent JS-side logic in
  `app/streak/page.tsx`'s new `logActivityCount()` (mirrors the delta
  back into Pipeline via `bump_pipeline_stage`, so a Streak-side edit
  still gets the full Daily/Weekly/Monthly rollup too). Since asking the
  question (or getting a yes) is itself a story-sharing moment, **Story
  Shares goes up by the same delta** in both directions too — not just
  the existing `story_share > 0 or questions > 0` qualifying check, the
  actual displayed count.
  Two deliberate scope limits: this sync only ever targets the account
  actually performing the edit — filling in for a downline's Pipeline
  numbers never touches the filler's own Core Run Streak (that would be
  attributing someone else's activity to the wrong person's streak), and
  it's a live sync going forward only, not a backfill against whatever
  the two counters already showed independently before this shipped.

### Guarding against a bad device clock corrupting Weekly/Monthly

A real incident: a device with a wrong date/timezone computed an invalid
"current week" locally (a Sunday instead of the Monday every week is
supposed to start on) and silently created a second `pipeline_periods`
row under that bad date — every other device (with a correct clock) kept
reading/writing the correctly-dated row and never saw the stray one, so
the person's real numbers looked like they'd vanished even though they
were saved fine, just under an orphaned, effectively invisible row.

Two constraints on `pipeline_periods` now make that specific corruption
impossible to write at all, from any client, regardless of that client's
clock: `pipeline_periods_weekly_monday_check` requires a `weekly` row's
`period_start` to actually be a Monday, and `_monthly_first_check`
requires a `monthly` row's to be the 1st of the month. A one-time repair
(in `schema.sql`, safe to re-run) merges any already-corrupted row's
numbers into the period it should have been before the constraints are
added, rather than losing them. If a client's clock is ever wrong enough
to trip one of these going forward, `friendlyPeriodError()` in
`app/pipeline/page.tsx` turns the resulting database error into "check
your device's date/time settings" instead of a raw, confusing message —
it can't silently corrupt data anymore, but a genuinely wrong device
clock still can't log the *correct* period either, which isn't
fixable from the server side.

### Deleting a downline's account

An admin, or an upline at any level, can permanently delete a downline
member's account from their entry on the **Team** tab — for when someone
quits the business. It's under a "Danger Zone" card and requires typing
the member's exact email to confirm before the delete button enables.

This calls the `delete_downline_account(user_id)` function, which checks
the caller is an admin or upline of that person, then deletes their row
from `auth.users`. Every other table (profiles, pipeline, candidates,
contacts, streak, PV, sales, Assistant history) references `auth.users`
with `on delete cascade`, so everything belonging to that person is wiped
in one shot. **This is irreversible** — there's no undo and no soft
delete. You can't use this on your own account (that still needs to go
through Supabase directly).

### Core Run Streak detail (what/how much)

Beyond the 4 qualifying checks (Read / Listen / Daily Update / Story
Share), each day's Core Run Streak entry now also captures:

- **Read** — add each thing you're reading today one at a time (type a
  title, hit Add or Enter), with a ✕ to remove any of them, same pattern
  as Listen — plus a separate "how much today" free-text field (e.g.
  "20 pages"). `read_what` is still derived from the list (joined
  titles) so nothing downstream (public profile, Daily Update summary)
  needed to change. A numeric Minutes Read counter (`read_minutes` on
  `streak_days`) briefly lived here too but was removed from this card —
  the column and its Goals metric (`READING` in `GOAL_ITEMS_BY_PERIOD`)
  still exist, just with no UI writing to it anymore.
- **Listen** — add each audio you listened to today one at a time (type
  a name, hit Add or Enter), with a ✕ to remove any of them — instead of
  cramming them all into one text field. `listen_what`/`listen_count`
  are still derived from the list (joined text / item count) so nothing
  downstream (public profile, Daily Update summary) needed to change
- **Today's Activity** — counters for Story Shares, Questions, Yeses, and Depth Texts
- **Meetings** — its own add-one-at-a-time list (who/what), same pattern as Listen

The 4 boolean flags that actually determine your streak are unchanged
and still the only thing `qualifies()` looks at — they're just now set
automatically from the detail fields (read counts once you type an
amount, listen/story share count once their counter is above 0) instead
of being separate manual toggles. This was a deliberate choice so adding
these fields couldn't retroactively break anyone's existing streak
history; `daily_update` stays a plain manual toggle either way.

### Editing a previous day (backfilling / filing after midnight)

Every field on the Core Run Streak page — Read, Listen, Daily Update,
Today's Activity, Meetings — edits whichever day is currently
**selected**, not always "today." A card near the top shows the
selected day (defaulting to today) with a date picker and a "Today"
quick-jump button, plus the **Last 30 Days** grid (previously 14 days)
right below it — tap any day to switch to it. Switching days loads that
day's actual saved values into the fields (never blank unless the day
truly has nothing logged), and a "✏️ Editing {date}" banner stays
visible while you're on a day other than today so it's never ambiguous
which day you're filling in. Saving always upserts to the selected
day's row specifically — editing yesterday can't touch today's entry or
vice versa. This is the fix for two related requests: being able to go
back and add something you forgot ("don't want it to go away"), and
being able to file the report for a day *after* midnight without losing
that day's data once the calendar flips.

The "Games Unlocked" alert only ever fires while editing today — going
back and completing a past day's Core Run doesn't re-trigger it.

### Goals ("Your goal today/this week/this month is...")

The **Goals** tab (`app/goals/page.tsx`) is three boxes — "Your goal
today is:", "Your goal this week is:", "Your goal this month is:" —
each an inline number field per line, but **each period has its own
item list** rather than repeating the same one everywhere
(`GOAL_ITEMS_BY_PERIOD` in `lib/constants.ts`):

- **Today**: Reading `[__]` minutes, Listen to `[__]` Audio,
  `[__]` Conversations, `[__]` Story shares, `[__]` Questions, `[__]` Yeses
- **This Week**: `[__]` Questions, `[__]` Yeses, `[__]` QI1s
- **This Month**: `[__]` Yeses, `[__]` QI1s

The idea: daily is granular day-to-day activity, weekly/monthly step up
to the funnel milestones that actually matter at that cadence. Each
period's target is independent (a weekly goal isn't derived from the
daily one, or vice versa) and **stays the same until you manually
change it** — nothing resets automatically. Most metrics still have no
live actual-vs-target display (an earlier version had one for
everything; it caused repeated confusion and was dropped, twice) —
**QI1s is the one exception**: since it already has a real, reliable
per-period number (the exact same `pipeline_periods.qi1` count the
Pipeline Tracker's own QI1 counter writes to), the weekly/monthly QI1s
goal shows "(you've shown N so far)" next to it, safe to show because
it's the same trusted number already visible elsewhere, not a new
computation — logging a QI1 there means it's already happened, not
just scheduled, so "shown" is the accurate word, not "booked". A note
under the daily box reads "📋 Check Upline on what
your daily goal should be." Targets are individual (not shared with a
linked spouse), stored in a `goals` table — one row per metric+period.
"Reading minutes" replaced the earlier "Pages Read" counter
(`read_minutes` on `streak_days`, superseding `read_pages`) to match
how the goal is actually phrased. Depth Texts was dropped from this
list — it's still its own counter on the Core Run Streak page's
Today's Activity card, just not goal-settable here.

### Your Dreams (5 year / 10 year / lifetime)

Above the numeric goal boxes, **Your Dreams** is three plain, unbounded
textareas — 5 Year Dream, 10 Year Dream, Lifetime Dream — deliberately
just blank space to write freely rather than another structured form.
Backed by three new `profiles` columns (`dream_5_year`, `dream_10_year`,
`dream_lifetime`), which piggybacks on that table's existing RLS: same
"own + upline (any level) + admin can read, only the owner can write"
policy every other profile field already uses, so an upline seeing every
level of their downline's dreams needed zero new policy work. Each field
autosaves on blur (same local-buffer-then-commit-on-blur pattern as
candidate notes elsewhere) rather than a separate Save button.

Two places surface it beyond the Goals tab itself:
- **Dashboard** ("Today"): a "🌟 Remember Your Why" card leads the page
  (above even the Core Run Streak card) showing whichever horizon is
  filled in, furthest-out first (lifetime → 10 year → 5 year), truncated
  to two lines (`line-clamp-2`) and linking to `/goals`. Only shows once
  at least one dream is filled in, so a brand-new profile with nothing
  written yet doesn't show empty dead space.
- **Team tab**: a per-member "Goals & Dreams" card (in the same expanded
  member view as Call Ratings, Pipeline, etc.) shows that person's actual
  goal targets by period alongside their three dream fields in full, so
  an upline can see both the numbers and the "why" behind them in one
  place instead of hunting across pages.

There's no way to build a real iOS Home Screen widget without a native
app (WidgetKit requires a Swift app extension, out of reach for a web
app installed via "Add to Home Screen"). Goals (now including Your
Dreams) is the closest substitute: it's the **landing page**
(`app/page.tsx` redirects to `/dashboard`, which itself leads with the
Dreams reminder and Today's Goals), so opening the app puts both the big
picture and today's numbers in front of you immediately, no navigating
required.

### Calendar (meetings, reminders, team events)

A new **Calendar** tab (`app/calendar/page.tsx`) is one system for both
personal reminders and team-wide events, replacing the need for a
separate Google Calendar for team scheduling:

- **Personal use** — add anything with a title, date/time, optional
  notes, and an optional link to a candidate (e.g. "QI1 with Jane" at a
  specific time, or a reminder like "17, graduates this year — follow up
  after"). Shows under Upcoming, sorted soonest-first; recently-passed
  events stay visible below for a bit before you clean them up. **Recently
  Passed** now shows the linked candidate's name too, same as Upcoming
  already did — it used to drop straight to just title + time once an
  event passed, so "who was this meeting even with" wasn't answerable
  without tapping back into the event.
- **Broadcasting to your downline** — if you have anyone below you,
  an "Add to all downline" checkbox appears when adding an event. Check
  it for team meetings, info sessions, master classes, or conferences
  and every downline member (any level) gets their own copy on their
  own calendar, tagged "📢 From {your name}" so it's clear it came from
  upline. This calls a new `broadcast_event_to_downline()` function
  (security definer, same pattern as `delete_downline_account` and
  `grant_next_onboarding_session` elsewhere in this app) since normal
  RLS only allows inserting rows for yourself.
- **Sending to specific downline people instead of everyone** — right
  below the "Add to all downline" checkbox, unchecking it (or never
  checking it) reveals a scrollable checklist of your actual downline
  members by name. Check one or several and only they get a copy —
  useful for a smaller huddle or a candidate-specific meeting that
  doesn't belong on the whole team's calendar. Calls a new
  `send_event_to_recipients()` function, the same shape as
  `broadcast_event_to_downline()` but filtered to the ids you picked —
  and it re-validates that filter server-side against your real downline
  (`get_downline_user_ids`), so a tampered request still can't reach
  outside it.
- **Upline visibility** — same access model as Core Run Streak and
  Assistant conversations: an upline (any level) or admin can read a
  downline's calendar even without a broadcast, so the Team tab's member
  detail view now shows a downline member's **Upcoming Calendar** card —
  this is how "when exactly QI1s are booked, and every other step of the
  process" becomes visible to upline without anyone having to share a
  separate calendar app.

A linked spouse is never treated as "downline" for broadcasting/sending,
even if their account also technically satisfies the upline check (e.g.
they entered your account number as their own upline when they signed
up) — their data resolves to the same shared owner as your own, so
counting them separately would double-count your own numbers under
their name. Both the downline recipient pickers above and the Daily
Update summary's Downline totals (Core Run Streak page) filter this out.

### Shared calendar for linked spouses

Calendar now joins the list of things a linked household shares — a
married couple sees one merged calendar, not two separate ones. This is
a deliberate change from how `calendar_events` started out: unlike Core
Run Streak and Assistant conversations (personal on purpose, even for a
linked spouse), a shared family/business calendar is exactly what a
couple actually wants.

New personal events now insert under the household's canonical
`ownerId` — the same convention `candidates`/`contacts`/`pipeline_periods`
already use — rather than the creator's own raw id, so whichever spouse
adds something, it shows up on both logins automatically. RLS on
`calendar_events` widened to check household membership in both
directions (`household_id` lookup either way), rather than the
one-directional pattern the other household-shareable tables use —
those tables always write through that single canonicalized owner id, so
a row's `user_id` is never the deferring spouse's own raw id, but
`calendar_events` predates the ownerId convention and has existing rows
filed under whichever spouse originally created them. Checking both
directions keeps those older rows visible to both spouses too, not just
new ones going forward.

The Calendar page itself fetches every row belonging to either side of
the household (`ownerId` plus a `get_household_partner_id()` lookup, to
also catch a spouse's pre-existing rows filed under their own raw id)
and merges them into one list. A standing Team Event or downline
broadcast still inserts one copy per profile — including both members of
a household — so once two spouses' calendars are merged, the same
standing event would otherwise show up twice; the merge step dedupes by
matching title + time + notes before rendering.

`user_id` is still whose calendar a row shows on and `creator_id` is
still who actually made it, so a spouse-added or broadcast event still
shows "📢 From {name}" — that pill now doubles as "which of us actually
added this," not just "this came from upline."

### Calendar views: Agenda, Day, and Month

A three-way tab (`Agenda` / `Day` / `Month`) sits at the very top of the
Calendar tab, right under the header — the first thing on screen, not
something you scroll past a form to reach — mirroring the view switcher
in a full calendar app:

- **Agenda** — the original list view: Upcoming, soonest first, then
  Recently Passed. Still the default.
- **Day** — an hourly grid (6 AM–9 PM) for a single day, with each
  event drawn as a colored block positioned at its actual time (an event
  outside that window clamps to the nearest edge rather than
  disappearing). Below the grid, that day's events are listed as normal
  cards — the grid is for a fast visual scan of how the day lays out,
  the list below is where you actually delete something or read its
  notes. ‹ › steps one day at a time, with no limit on how far forward
  or back.
- **Month** — a traditional 7-column grid, Sunday-first, with leading/
  trailing days from adjacent months filling out every row to a full
  week. Each day shows up to 3 small colored dots (one per event type)
  so a glance down the month shows which weeks are busy. Tapping a day
  selects it and shows its events as cards underneath, same list-below-
  the-grid pattern as Day view. ‹ › steps a month at a time; jumping to a
  different month resets the selected day to today (if you're back on
  the current month) or the 1st.

Both grids and the Agenda list read from the same merged, deduped event
list — switching tabs doesn't refetch anything, it's the same data laid
out three different ways.

### Adding an event: a floating "+" button, not an inline form

The Add Event form (and, for admins, Team Events underneath it) used to
be a permanently-open card at the top of the page, pushing the actual
calendar views below the fold. It's now a **floating "+" button**
(bottom-right, above the bottom nav — same spot and same idea as Google
Calendar's own FAB) that opens a bottom sheet with the form. Saving a
personal/downline/specific-people event closes the sheet automatically;
if the event itself saved but the broadcast/send-to-specific-people step
failed, the sheet stays open so that error doesn't disappear along with
it. The sheet close button (✕) and tapping the backdrop both dismiss it
without saving.

**Team Events (recurring)** — an admin-only section inside that same
sheet, below the personal Add Event form, for standing, company-wide
events (Masterclasses, Summit, Major Conferences, etc.) that are meant
for literally everyone, not just an admin's own downline. Unlike the
broadcast checkbox above (a one-time push to whoever is currently
downline), adding a recurring event here:

- Immediately puts a copy on every **current** member's calendar
  (`add_company_event()`, security definer, admin-only).
- Automatically puts a copy on every **future** signup's calendar too,
  for as long as the event hasn't already passed — `handle_new_user()`
  now copies every still-upcoming row from the new `company_events`
  table onto a new profile's calendar the moment they sign up. That's
  the actual "recurring rule": add it once, it keeps applying to new
  people without anyone having to remember to re-broadcast it.
- Removing a recurring event (`remove_company_event()`) only stops it
  from going out to *future* signups — it doesn't retroactively pull it
  off anyone's calendar who already has it (they can remove their own
  copy the normal way).

### Team Events photo/video gallery

A new **Team Events** page (`app/events/page.tsx`, under **More** —
available from signup, not gated behind onboarding) is a photo/video
gallery of past events — deliberately independent of the Calendar tab's
"Team Events (recurring)" section above, which is for *upcoming*
standing events an admin schedules ahead of time. This page is for
*after* an event has happened: an admin gives it its own title + date
(e.g. "SUMMIT Conference 2026") right on this page, then uploads photos
and videos to it. Everyone can browse every event and tap a thumbnail
for a full-screen lightbox (video plays with controls); only an admin
sees the **Add Event** form, the **📷 Add Photos/Videos** upload
control, and the ✕/× delete buttons on media and events.

The lightbox tracks the tapped photo's position within its album, not
just the photo itself, so it can page through the rest of that album:
swipe left/right on the image (a touchstart/touchend delta past 50px
counts as a swipe), or tap the ‹ / › arrows, to move to the next/previous
item — wrapping from the last item back to the first. A "3 / 15" counter
in the top center only shows up when the album has more than one item.

Backed by two new tables: `team_event_albums` (one row per named past
event) and `event_media` (one row per photo or video, tied to an album,
with a `media_type` of `'photo'` or `'video'`), plus a public-read
`event-media` Storage bucket — same public-bucket-with-restricted-writes
pattern as the existing `avatars` bucket. RLS on both tables: select is
open to everyone, insert/update/delete is admin-only. Deleting a photo,
video, or whole event cleans up the actual storage object(s) too, not
just the row(s), so nothing orphaned piles up in the bucket.

### Daily Update summary (copy/paste for LTD)

The bottom of the Core Run Streak page has a **Daily Update Summary**
card: a read-only, pre-formatted block of text built from that day's
Read/Listen/activity detail, meeting details, any new candidates
connected that day, your streak as of that day, that week's and that
month's pipeline numbers, your PV, and a list of everyone currently
active in your Candidate Roadmap — pulled the same way the Pipeline
Tracker defines "active" (not yet launched, not filtered out). Each
active candidate shows their next real process milestone (QI1, QI2,
IS1, FU1, IS2, FU2, or Offer Call) rather than their raw roadmap step,
so the two internal "Audio & Reading" homework steps roll forward to
the info session they're prepping for (`CANDIDATE_STEP_SHORT_LABELS` in
`lib/constants.ts`) instead of showing as "Audio & Reading". **Meetings**
is an add-one-at-a-time list (same pattern as Listen — type who/what,
hit Add, ✕ to remove), stored in `meeting_items text[]`, so the summary
shows what each meeting actually was instead of a bare count. **New
Contacts Today** pulls from the Candidate Roadmap itself — any
`candidates` row whose `connected_date` falls on the summary's day —
with the candidate's notes included verbatim (the same "met at X, works
at Y" detail visible on their roadmap card), not the separate A/B
Contact List. Meant to be copied straight into your nightly LTD update
to your upline. Tap **Copy Daily Update** to copy it, or select the text
manually from the box. It regenerates live as you edit the selected
day's Core Run Streak fields (see above) and always reflects that same
day — there's no separate date picker in this card anymore, it just
follows whichever day is selected up top. Picking a previous day also
re-derives that day's actual week/month boundaries (via
`getWeekStart`/`getMonthStart`) rather than reusing today's, so the
pipeline totals shown are correct even right at a week or month
boundary, and the streak line reports the streak as of that day rather
than today's live streak.

The summary also has a separate **Downline** section, clearly split from
your own numbers above it: combined weekly/monthly pipeline totals
across everyone in your downline, and who's currently active in their
pipelines (candidate name, next process milestone, and which downline
member it belongs to). It relies entirely on RLS already scoping
`profiles`/`pipeline_periods`/`candidates` reads to "yours + your
downline" (`is_upline_of()` in `supabase/schema.sql`) — no new tables or
functions needed. A linked couple's shared data lives under whichever
partner is the household owner (`profiles.household_id`), so downline
members are deduped to that owner before summing, same resolution the
Team tab already uses, to avoid double-counting a linked pair.

### New to the Team spotlight

The Leaderboard's **Daily** tab has a **🎉 New to the Team** card listing
anyone who signed up *today* and completed their profile (name + team),
linking to their profile — visible to everyone, not just admin/upline.
It's backed by `get_new_members()` (was a rolling 14-day window, now just
their signup day, and only shown while on the Daily tab), and just
quietly disappears once nobody's joined today (no "no new members"
clutter) — or the moment you switch off Daily.

### Auto-filled profile: reading, listening, streak, milestones

A public profile (tap anyone's name on the Leaderboard) now automatically
shows, pulled live from their Core Run Streak entries — nothing to fill
in separately:

- **Core Run**: their current streak length, what they're currently
  reading (and how much), and what audio they most recently listened to
  (and how many)
- **Milestones**: badges for 1 Week, 30 Days, 90 Days, 6 Months, and 1
  Year, based on the **longest streak they've ever hit** — once earned, a
  milestone stays on their profile even after a later streak resets

This is powered by two new functions, `get_current_streak(user_id)` and
`get_longest_streak(user_id)`, folded into `get_public_profile()`. Same
privacy model as the rest of the public profile: security definer, so it
can read anyone's Core Run Streak data, but only ever returns the
computed streak numbers and the latest reading/listening entry — never
someone's full day-by-day history.

### Liking a Leaderboard ranking

Every ranking row on the Leaderboard (Team Leaders, Individual Leaders,
QI1 Rhythm, Core Run Streaks, 5+ Active Candidates, Core 300, Day 1
Ditto) has a heart button next to it. Tap it to like that ranking —
everyone on the team can see who's liked it (names show underneath the
heart). It's just a straightforward `leaderboard_likes` table (your own
like to add/remove, readable by anyone) plus `get_likers()` to resolve
names, since leaderboard rows themselves are computed on the fly rather
than stored records.

### Process tab leads Resources, with a real Perfect First Month

The Resources hub (`app/library/page.tsx`) now opens straight to
**Process** by default — it's the first pill in the tab row instead of
the last — so a new person's path lands on Process rather than it being
buried behind Audios/Leaders/Products/Scripts. (Resources itself now
lives under the **More** tab rather than the main bottom nav — see
"Bottom nav cleanup" below.)

**🚀 Perfect First Month** is its own pill, right after Process — not a
card nested inside it. Process stays exactly what it was (the pre-launch
interview stages + the official Pre-Launch Questionnaire); Perfect First
Month is the distinct next step once someone's actually launched, so it
gets its own tab rather than living inside the pre-launch content. It's
an actual numbered step-by-step instead of a loose bag of targets
(`FIRST_MONTH_STEPS` in `lib/process-data.ts`):

1. Budget Session
2. Create your A/B List
3. Create your Customer List
4. Book your first QI1s
5. Create Sample Bags
6. Commit to a 30 Day Core Run — daily communication with your upline,
   reading 20+ minutes, listening to 1+ audio, reaching out to 2 people
   to share your story, building towards 150 PV
7. Attend weekly events

**9 Core Steps** — the official Angle Diamond Team graphic (Grow Your
Income / Self / Team) is a static image (`public/9-core-steps.jpg`,
served via `next/image`) in its own card at the top of the Process tab —
first thing anyone sees, ahead of the pre-launch stages below it.

### Global search

A 🔍 icon in the header on every page (`components/PageHeader.tsx`) opens
**Search** (`app/search/page.tsx`) — a single text box that searches the
whole app at once, not just whatever section you happen to be in.

It matches against a static index (`lib/search-data.ts`) built from every
page's shortcut, every Scripts & FAQ entry, every Product, Leader,
Process stage, Pre-Launch Questionnaire question, Perfect First Month
step, Sample Bag/Survey question, Audio, and Book — a simple
case-insensitive substring match over each item's title/snippet/source,
grouped by section in the results. Tapping a result navigates straight
to the right Resources tab (`/library?tab=scripts`, `?tab=products`,
etc. — the Resources hub now reads a `tab` query param on load) or the
right page (`/goals`, `/calendar`, and so on).

This only searches static reference content and page shortcuts, not your
personal data (candidates, contacts, notes) — each of those already has
its own search box on its own page.

### Onboarding

A new **Onboarding** tab walks new team members through a series of
sessions (Welcome, Building Your List, The Invite, Presenting &
Follow-Up, Launch & Beyond — placeholder titles/resources in
`lib/constants.ts`'s `ONBOARDING_SESSIONS`, swap in your real
videos/reading/checklists there). Session 1 is unlocked for everyone from
signup; unlocking each further session is a manual approval step — an
upline (any level) or admin taps **Unlock Next** on that person's entry
on the **Team** tab, calling `grant_next_onboarding_session()`. Locked
sessions still show their title and description so people know what's
coming, just not the resources inside.

Next to **Unlock Next** is an **Unlock All** button, calling
`grant_all_onboarding_sessions()` — same authorization (upline or
admin), but jumps straight to all 5 sessions unlocked in one tap. Meant
for someone who isn't actually new to the business (already experienced
elsewhere) rather than clicking "Unlock Next" four times in a row.

A third button, **🔒 Lock Previous**, calls `lock_previous_onboarding_session()`
to walk back down a session — for when an upline/admin changes their
mind about an unlock. Floored at 1 (Session 1 is always available from
signup, so it can't be locked).

This is deliberately not automatic (e.g. not tied to completing a
checklist) — it's an explicit "I'm confirming this person is ready for
the next session" action by their upline, backed by
`profiles.onboarding_unlocked_through` (defaults to 1, incremented one at
a time, same authorization check as account deletion: upline-of or
admin).

Primary users (`adamangle@icloud.com`, `alexangle@me.com`, `laurasangle@gmail.com`) see every
session unlocked on their own Onboarding tab, regardless of their own
`onboarding_unlocked_through` value — a client-side display check
(`isPrimaryUser`), not a schema change, so admins can review the full
content without needing anyone to "unlock" it for them.

**Session 2: List Building** has the "why build a list?" intro, a
direct link to the actual LTD "Building Your List" worksheet (Dropbox
JPG) — the real sheet with the Start Here checklist, the "Who do you know
named..." first-name prompts, "Who do you know that is a(n)..."
occupations, "Who is your..." professionals, and "Who do you know
who..." lifestyle prompts, rather than that content retyped into the
app — the **Crush Your List** audio by Jim Mueller and John Resch to
listen to before working through it — and **Normalize the Work** by Kyle
and Austin Brown, and Hunter and Vanessa Lindsay, which has no link since
their coach sends it directly through the LTD media app.

### Progressive feature unlock

A brand-new signup doesn't see the whole app at once — it's a lot to take
in on day one. Instead, tabs unlock in step with Onboarding, driven by the
same `profiles.onboarding_unlocked_through` value used above (no separate
schema — this is purely additive gating on top of it):

| Unlocks at session | Tabs |
| --- | --- |
| 1 (signup) | Today, Calendar, Leaderboard, Onboarding, My Profile, Search, More |
| 2 (List Building done) | + Contacts, Volume |
| 3 (Customers done) | *(nothing new)* |
| 4 (Sharing Your Story done) | + Pipeline, History |
| 5 (30-Day Core Run done) | + Resources, Run Streak, Goals, Team, Games, Assistant |

Resources used to be available from signup, but moved to session 5 once
its Books/Audios tabs started auto-linking to real PDFs/audio files
(see below) — it stopped being a safe "browse everything on day one"
area and became something to earn by actually finishing onboarding
rather than self-serving ahead of it.

The mapping lives in one place, `lib/onboarding-gate.ts`'s
`FEATURE_MIN_SESSION`, and is read by three call sites: `BottomNav` and
`app/more/page.tsx` filter out locked tabs entirely (they don't show up
grayed-out — they just aren't there yet), and each gated page is wrapped
in a `<FeatureGate minSession={N}>` component that bounces a direct visit
(a bookmark, a stale link) back to `/onboarding` if that tier isn't
unlocked yet. The Today dashboard is always reachable, but its Core Run
Streak / Goals / Pipeline cards only render once their destination is
actually unlocked, so it never links somewhere that immediately bounces.

Primary users bypass all of this (`unlockedThrough` reads as unlimited for
them via `AuthGate`'s `useAuth()`), same as the full-Onboarding-content
bypass above.

**Session 4 has an extra requirement:** it shouldn't unlock until someone
has put real work into their A/B list — `SESSION_4_CONTACT_MINIMUM` (50)
in `lib/constants.ts` is the single source of truth, checked against
`category in ('A', 'B')` rows in `contacts` (the Customer list doesn't
count). Two places read it:
- **Team tab** — the upline's "Unlock Next" button is disabled for the
  3→4 transition specifically until the person's count clears 50, with a
  "currently X/50" readout next to it so the upline can see the gap
  without guessing. Every other transition (1→2, 2→3, 4→5) is ungated, and
  "Unlock All" stays ungated everywhere — it's the existing intentional
  override for someone who isn't actually new.
- **Onboarding page** — the mentee sees the same "you have X/50" progress
  line right on their own locked Session 4 card, so they know what's left
  without having to ask.

This is enforcement, not just a suggestion — reaching 50 doesn't
auto-unlock anything (onboarding has always been upline-granted, not
self-serve), it only unblocks the upline's button once they're ready to
grant it.

**Session 4 also requires a reading confirmation** —
`SESSION_4_READING_REQUIREMENT` in `lib/constants.ts` currently reads
"chapters 2, 12, and 13 of The Magic of Thinking Big" (the Session 2
First Year Books pick — see `FIRST_YEAR_BOOKS` in `lib/library-data.ts`).
Unlike the contact count, there's no way to actually verify someone read
specific chapters, so this is self-reported: a checkbox on the mentee's
own locked Session 4 card writes straight to a new
`profiles.thinking_big_chapters_confirmed` boolean (self-service — the
existing `update_own` RLS policy on `profiles` already covers it, no new
policy needed). The Team tab's "Unlock Next" for the 3→4 transition now
requires *both* the contact count **and** this checkbox, each shown as
its own line with a ✓/○ so the upline can see which one is still
outstanding.

The checkbox and contact count only show up while Session 4 is still
locked (that's where the actual gating happens), but both requirements
are also listed as their own separate resource cards right inside
Session 4's own content list — "📖 Reading" and "📋 Homework: Contact
Builder" — alongside the Story Training Video/audios, so they're visible
in context whenever anyone (including an admin, who never sees the locked
state at all) looks at what Session 4 covers, not just during the brief
window before it unlocks.

**Onboarding is the home screen until it's done.** The "resume where you
left off" behavior that sends people to the Today dashboard on app open
now checks completion first: anyone who hasn't unlocked all 5 sessions
gets sent to `/onboarding` instead, every time they open the app, until
they finish — reinforcing that Onboarding is the most important thing for
a new person to work through first. Once all 5 sessions are unlocked, app
open goes back to landing on Today as usual.

### Prospect access (candidate resources by code, no account)

Candidates in the interview process can see a curated set of resources —
without a real account, without email/password, without anything to sign
up for — via a short access code tied to their Candidate Roadmap row. No
separate "candidate app": `/prospect` is a standalone, unauthenticated
route (`AuthGate` skips its whole sign-in wall for that one path) that
never touches `auth.users` or `profiles` at all until they actually join.

**Getting the code:** each card on the **Candidate Roadmap** (Pipeline
Tracker tab) shows a "🔑 Code: XXXXXX" pill — every candidate gets one
automatically the moment they're added (`candidates.access_code`, a
6-character code excluding visually-ambiguous characters like `0`/`O` and
`1`/`I`/`L`, generated by a `before insert` trigger). Tapping the pill
copies a ready-to-send message ("Check out these resources: .../prospect
— your code is XXXXXX") to the clipboard — texting that is the entire
invite flow.

**What the candidate sees:** they open `/prospect`, type in the code, and
`get_candidate_by_access_code()` (callable by the unauthenticated `anon`
role) looks them up by code and returns their name, current roadmap step,
launched status, and the inviter's name — nothing private, no auth
required. The step itself (`current_step`) is only ever used to decide
*which resources* to show — the internal step label/jargon ("IS1", "FU2",
etc.) is never displayed to the candidate, since they have no reason to
know what any of that means. The inviter shown is whoever actually added
the candidate
(`candidates.creator_id`), not necessarily the household owner their
business data is attributed to (`candidates.user_id`) — those differ for
a linked couple, and the greeting should say whichever partner actually
sent the code, not always default to whoever the shared numbers belong
to. The app remembers a validated code in `localStorage` on their
device so they don't have to retype it on repeat visits ("Not you? Enter
a different code" resets it). The code screen and the normal sign-in
screen (`LoginForm`) cross-link to each other — "Already a team member?
Sign in" on `/prospect`, "In the interview process? Enter your prospect
code" on the sign-in screen — so whichever one someone lands on first,
they can get to the right place.

**Scheduled meetings show up in their view too.** The candidate picker
already on the Add Event form (Calendar tab — link an event to a specific
candidate) is the whole mechanism: any upcoming `calendar_events` row
tagged with a candidate now also surfaces in that candidate's `/prospect`
view as an "📅 Upcoming" card (title, date/time, notes), via
`get_candidate_upcoming_events()` — same anon-callable pattern as above.
Scheduling QI1, an Info Session, whatever, the normal way is all it takes.

**Resources unlock automatically as they move through the roadmap.**
`CANDIDATE_STEP_RESOURCES` in `lib/constants.ts` is a parallel array to
`CANDIDATE_STEPS`, one resource list per step — as you advance a
candidate's step on the Roadmap (the same buttons/flow as today), whatever
is assigned to that step *and every step before it* shows up in their
`/prospect` view immediately, cumulatively, with no manual sending
required. The default set right now (team-wide, before any per-IBO
customization below):

| Step | Default resources |
| --- | --- |
| 1. Yes | *(none — no QI1 booked yet)* |
| 2. QI1 | *(none — candidates don't get their code until QI2 is booked)* |
| 3. QI2 | Summary of *Business of the 21st Century* (Robert Kiyosaki) · "What Is Network Marketing?" (Entrepreneur.com) · "Why Gen Z Is Betting on Direct Selling" (Entrepreneur.com) |
| 4. IS1 | *Digital Flea Market of Dreams* podcast (John Resch) · *The Go-Giver* |
| 5. FU1 | "How Do You Want to Live?" (Alex and Laura Angle) · "Financial Stability of the 21st Century" (Greg Duncan) |
| 6. IS2 | *The 25 Laws of Doing the Impossible* (Patrick Bet-David) · "List Ditto Associate" (Dirk and Laura Taylor) |
| 7. FU2 | "Dissatisfied" (Manny Winston) · "At the Highest Level" (Mark Nathan) |
| 8. Questionnaire | *(none yet)* |
| 9. Offer Call | *(none yet)* |

Each default also carries a rough `estimate` (e.g. "~20 min listen",
"~2 hr read") shown next to it in `/prospect` — these are best-guess
approximations, not measured from the actual files (there's no way to
read an external file's real length from here), so treat them as
ballpark and correct any you know the real runtime for.

**Per-IBO customization.** The table above is a team-wide default, but any
IBO can hide a default just for their own candidates or add their own
resource at any step, from the new **Candidate Resources** section of the
Resources tab (right after Process) — without touching anyone else's
candidates. This is backed by `candidate_resource_overrides` (household-
shareable, same RLS pattern as `candidates`/`contacts`): a `remove` row
hides a default for that step (matched by its exact label), an `add` row
is a resource that IBO tacked on beyond the defaults. `/prospect` merges
these in via `get_candidate_resource_overrides()` (anon-callable, looked
up by the candidate's access code) — `effectiveResourcesForStep()` in
`app/prospect/page.tsx` does the actual defaults-minus-removed-plus-added
merge before rendering.

**Sending a one-off resource to a specific candidate.** The team-wide
defaults and per-IBO overrides above are both about *steps* — every
candidate at that step gets that resource. Sometimes you want to send one
particular podcast or book to one particular person without it applying
to anyone else and without moving them through a step. Expanding any
candidate's card on the **Candidate Roadmap** now shows a "Send a
Resource" mini-form (label + detail + optional URL) plus a list of
whatever's already been sent to them, each with its own Remove — backed
by `candidate_specific_resources`, keyed directly to that one
`candidate_id` (no step, no `user_id` scoping). `/prospect` shows these
in an unconditional "🎁 Just For You" card list — via
`get_candidate_specific_resources()` (anon-callable, same access-code
lookup pattern) — regardless of what step the candidate is on.

**Anyone in your upline can send one too — even without being the
inviter.** Whoever actually added the candidate is recorded as
`creator_id`, but a resource send shouldn't be limited to that one
person — any upline at any level should be able to drop a resource on a
downline's candidate without needing to be that candidate's direct
inviter. The **"Filling In For"** picker (also used for entering someone
else's pipeline numbers) now doubles as this: pick a downline, and the
Roadmap tab shows a read-only list of that person's active candidates
(name + current step, no roadmap-editing controls — notes/step/launch
stay off-limits) with the same "Send a Resource" mini-form for each. This
is deliberately narrower than the write access "Filling In For" already
has for pipeline numbers — sending a resource is the only thing an upline
can do here on someone else's candidate. `candidate_specific_resources`'
RLS allows insert/select/delete for the candidate's own household, any
upline of that household (`is_upline_of()`, the same recursive
upline-chain check used everywhere else in the app), or an app admin.

**Getting Launched hands them off to a real signup — no auto-linking.**
Once you mark a candidate Launched, their `/prospect` view swaps to a
"🎉 You're in! Create your account" card linking to the normal `/dashboard`
sign-up screen. That's a completely ordinary new account from there —
they pick their own team and type in your account number themselves, the
same as anyone else joining the team; there's no session/account carried
over from the code-based view, since there was never an account to carry.

**Info Session (IS1/IS2): you pick in person or virtual, not the
candidate.** The candidate doesn't know the jargon and isn't the one who
knows how the conversation actually went, so this isn't a self-service
choice in `/prospect` — expanding a candidate's card on the Candidate
Roadmap, once they've reached IS1 (and again once they've reached IS2),
shows an "IS1/IS2 Info Session" control right there: a plain In
Person/Virtual toggle, same as flipping any other setting on their card.
IS1 and IS2 are two separate real-world sessions a candidate attends at
two different points in the process, so each tracks its own independent
mode/pick/watched state (`is1_*` / `is2_*` columns on `candidates`)
rather than sharing one - picking one doesn't touch the other.

- **In Person** needs nothing else from you - `/prospect` automatically
  shows whichever flyer graphic is currently live. Behind it is a
  permanent, admin-only speaker library ("🎤 Info Session Speaker" card
  at the top of the Resources tab's Candidate Resources section):
  `info_session_speakers` — upload each speaker's flyer graphic *once,
  ever*, and it's saved for good in the `info-session-flyer` storage
  bucket (public-read, admin-only write — same pattern as
  `event-media`). A separate "This week:" dropdown just points at
  whichever saved speaker is presenting (`info_session_flyer.speaker_id`
  — one shared pointer for the whole team, not per-IBO, since it's one
  physical weekly event), so a repeat speaker is picking their name
  again, never re-uploading the same image.
- **Virtual** shows a dropdown of all 12 recurring weekly webinar slots
  (soonest first) across a fixed set of shows (`VIRTUAL_WEBINAR_SLOTS` in
  `lib/constants.ts` — presenter, day/hour in Eastern time, and the
  registration link), computed live via `nextWebinarOccurrence()` in
  `lib/dates.ts` (a small Eastern-time-aware "what's the next occurrence
  of this weekly slot" helper — the slots are fixed Eastern times
  regardless of what timezone the candidate or you happen to be in,
  always labeled "ET" rather than a fixed "EST" so it stays correct
  whichever side of a daylight-saving switch the date falls on). Picking
  one is a normal edit to that candidate's row, same as anything else on
  their card — nothing locks once set, so a wrong pick is just as easy to
  fix as a typo in their notes.
- **The candidate only sees the result, and only marks it watched.**
  `/prospect` shows nothing here at all until you've set a mode - then
  it shows the flyer (in person) or a join link once you've picked a
  specific webinar (virtual), plus an "I've watched it" button that's
  entirely the candidate's own call, since only they know whether they
  actually watched it. Tapping it swaps the whole card for a plain
  "✅ Info Session complete" line, permanently — there's no way to reopen
  or rewatch it from there.

**Candidates check resources off as they finish them.** Every resource
card in `/prospect` — team-wide defaults, per-IBO additions, and one-off
"Just For You" sends alike — has a checkbox the candidate taps once
they've actually gone through it. Unlike Info Session's "watched" flag,
this is a plain toggle (`candidate_resource_completions`, keyed by
candidate + the resource's label): unchecking a mis-tap is just as easy
as checking it. Expanding a candidate's card on the Candidate Roadmap
shows a "📋 Resources: X/Y completed" line that expands into the full
checklist (✅/⬜ per resource) — read-only from the IBO's side, since only
the candidate can honestly report what they've done, but now it's
obvious at a glance who's actually doing the work and what's still
outstanding, instead of having to ask.

**Optional Resources library — a shared catalog to pick from instead of
retyping.** The per-IBO "add" overrides and one-off "Just For You" sends
above both start from a blank form — fine occasionally, tedious if you
want to share the same podcast with several candidates or add it to your
own defaults for good. `optional_resources` is a small, admin-managed,
read-only-to-everyone-else table (label, detail, optional link, optional
estimate) — a permanent library the whole team draws from, exactly like
the Info Session speaker library above. Anywhere you'd normally type a
resource by hand, if the library has anything in it you'll see a "Pick
from library:" dropdown above the freehand fields:

- **Candidate Resources section (Resources tab)** — picking one from the
  library for a given step inserts an `add` row into
  `candidate_resource_overrides` immediately (via `addFromLibrary()`),
  carrying its `estimate` along — same end result as typing it by hand,
  just faster, and it becomes part of your own automatic defaults for
  every candidate at that step going forward.
- **"Send a Resource" (Candidate Roadmap, per candidate)** — picking one
  inserts straight into `candidate_specific_resources` for that one
  candidate only (via `sendFromLibrary()`), same one-off behavior as
  typing it by hand.

Managing what's actually *in* the library is admin-only: a "📚 Optional
Resources Library" card at the top of the Candidate Resources section
(same spot as the speaker library) lets an admin add (label/detail/
link/estimate) or remove entries — every IBO reads the same shared list,
nobody else can edit it. `estimate` was also added to
`candidate_resource_overrides` and `candidate_specific_resources`
themselves (not just the library), so a resource added or sent from the
library shows its time estimate on `/prospect` next to "Just For You" and
per-step resources, same as the team-wide defaults already do.

**Checking for broken links.** With dozens of hand-typed links (many
pointing at random third-party PDF mirrors, not just Dropbox), some are
bound to go stale. A "Check Links" button on the library admin card
POSTs every URL in the library to `/api/check-links`, a server-side
route that fetches each one and reports back which failed — flagging
each with a "⚠️ broken link?" badge right on its row. This has to run
server-side rather than from the browser: a client-side `fetch()` to an
arbitrary third-party host almost always gets blocked by CORS
regardless of whether the link actually still works, so the result
would be meaningless — a Vercel serverless function has no such
restriction.

**Browsing the library: Audio / Reading / Other, plus search.** Every
library entry has a `kind` (`audio`, `reading`, or `other` — for
anything that isn't cleanly one or the other, like a worksheet or a
video), set from a toggle both when an admin adds a new one and via a
per-entry dropdown on any existing one, so a miscategorized entry is a
couple of taps to fix, not a re-add. Everywhere a resource is picked
from the library — Candidate Resources, Onboarding Resources, and both
one-off "Send a Resource" boxes — now shares one `LibraryResourcePicker`
component (`components/LibraryResourcePicker.tsx`) instead of a single
long dropdown: Audio/Reading/Other tabs plus a live search box matching
against either the title or the detail line (where the speaker/author
usually is), so finding one specific resource in a growing library
stays fast.

**Books tab auto-links to a PDF once one's in the library.** The Books
tab's "First Year Reading" and "Advanced Leadership Library" lists
(`FIRST_YEAR_BOOKS`/`ADVANCED_LIBRARY` in `lib/library-data.ts`) are
just titles/authors — most are real published books with no legal free
copy to link to. But whenever a `reading`-kind library entry's title
matches one of these book titles exactly (once you strip its leading
emoji — see `normalizeTitle()` in `app/library/page.tsx`), that
title becomes a clickable link straight to the PDF, no separate lookup
needed. Add a book's PDF to the Optional Resources library with a title
that matches the book's plain name (e.g. "📖 The Go-Giver" for "The
Go-Giver") and the Books tab picks it up automatically. The Audios tab
works the same way against `AUDIOS` in `lib/library-data.ts`, matching
`audio`-kind library entries instead of `reading`-kind ones — add
"🎧 Skydivers" to the library and the fixed Skydivers card on the
Audios tab links straight to it.

**The same library also feeds Onboarding.** Everyone starts from the same
team-wide `ONBOARDING_SESSIONS` defaults (`lib/constants.ts`), but exactly
like Candidate Resources, any IBO can hide a default just for their own
downline's onboarding or add their own — typed by hand or picked from the
same Optional Resources library — from a new **Onboarding Resources**
section of the Resources tab (right after Candidate Resources).
`onboarding_resource_overrides` is the same household-shareable,
remove-hides/add-tacks-on pattern as `candidate_resource_overrides`, just
keyed by onboarding session (1-5) instead of candidate step -
`effectiveResourcesForSession()` in `lib/constants.ts` does the merge, and
the Onboarding page reads it directly (no anon RPC needed here, since
Onboarding — unlike `/prospect` — is already behind auth).

**Sending a resource straight to a team member, any time.** Candidate
Resources and Onboarding Resources above are both about defaults for
everyone at a given step/session. Sometimes you just want to hand one
specific already-onboarded person something — not tied to a session, not
waiting for them to reach some step. On the Pipeline Tracker's Tally tab,
picking someone in the existing **"Filling In For"** dropdown now also
shows a **"Send a Resource to {name} Directly"** box (same freehand-or-
pick-from-library form as everywhere else) right above their prospects
list — backed by a new `member_resources` table, keyed to that person's
own account id (not a household id, since onboarding progress is tracked
per-person even inside a linked household). Only an upline (any level) or
admin can send one; the recipient sees everything ever sent to them in a
**"🎁 Sent To You"** card at the top of their own Onboarding page, with a
✕ to dismiss each one once they've seen it.

### Milestone Alerts

Separate from the milestone badges on a public profile, the Leaderboard
itself has a **🏅 Milestone Alerts** card that spotlights anyone whose
current Core Run Streak just crossed 1 Week, 30/90 Days, 6 Months, or 1
Year — visible to everyone, likeable just like any other ranking row. It's
powered by `get_recent_milestones()`, which matches while a streak is
within 2 days of a threshold; there's no separate "reached on" date
stored anywhere, so the alert just naturally stops appearing a couple of
days after the fact.

The Leaderboard also has a **💎 Diamond Run High Scores** card (same
data as the in-game leaderboard, via `get_game_leaderboard()`) so the
whole team can see who's currently on top — 👑 marks the champion,
likeable like any other ranking row.

### Trend charts

Pipeline Tracker (pick any stage from the dropdown) and Volume both show
a small line chart of your own numbers over the last several
weeks/months/periods, instead of only ever showing the current one — a
lightweight custom SVG chart (`components/TrendChart.tsx`), no charting
library needed.

### Core 300 Meter (Volume tab)

The **Personal Circle PV** card, at the very top of the **Volume** tab
(`app/volume/page.tsx`), fills a progress bar live against the team's
300 PV standard as you type — no separate save step, it just tracks
whatever's in that input. A tick mark at the halfway point is labeled
150 PV, and three milestone badges (🟢 100, 🟢 200, 🏆 300) light up in
color as you cross each threshold and stay grayed out below it.

### Day 1 Ditto Meter (Volume tab)

The **Day 1 Ditto** card has the same kind of progress bar as the PV
meter above, scaled to the 100 PV Ditto standard instead of 300 — it
fills live as you type into the Day 1 Ditto field (which is specifically
for a Ditto order placed on day 1 of the month, not PV in general), hits
🏆 at 100+, and a small trend chart underneath shows Day 1 Ditto by
month so you can compare against past months at a glance.

### Duplication Calculator (Volume tab)

A calculator card on the **Volume** tab (`app/volume/page.tsx`) reads
straight off the Personal Circle PV field above it — no separate entry —
and instantly shows what your group's total volume would look like if
25, 50, or 100 people were each duplicating that same amount (simple
multiplication, client-side only, nothing saved to the database).

### Customer Sales (Volume tab)

Logging a sale is just a couple of taps: one or more quick-pick product
lines — XS, Nutrilite, Artistry, Amway Home, Satinique, G&H, Glister,
iCook, Other, tap to select any number of them — and a PV amount, plus
optional notes. No customer name/description field anymore (dropped in
favor of speed — `description` still exists on `customer_sales` for any
older rows that have one, just not written to or shown for new sales
without one). A single stat tile above the log shows the highest PV sale
logged this month, computed live from that month's `customer_sales`
rows. The `categories` (plural, an array) and `amount` columns are
additive on the existing `customer_sales` table; `categories` replaced
an earlier single-select `category` column (left in place, unused,
rather than dropped) once multi-select was added.

### Today's Sales (Leaderboard)

Any customer sale logged today gets "posted" team-wide on the
**Leaderboard** in a **🛍️ Today's Sales** card — one row per sale
(newest first), each showing who made it, every product line category
picked for that sale, and the PV amount. It's a feed of individual
sales, not an aggregated per-person total, since the categories are only
meaningful sale-by-sale. It's always visible (not gated behind the
daily/weekly/monthly toggle, since
it's a "today" spotlight the same way New to the Team and Milestone
Alerts are) and recomputes fresh on every page load via
`get_daily_sales_feed()`, so there's no separate "reset it" step at
midnight - a new day just naturally starts from zero rows matching
`created_at::date = current_date`.

### Daily period (Pipeline Tracker & Leaderboard)

Both the **Pipeline Tracker** and **Leaderboard** now have a **Daily**
option alongside Weekly and Monthly. On Pipeline Tracker it's just a
third `period_type` bucket (`pipeline_periods.period_type` now allows
`'daily'`, `period_start` is just today's date) — same counters,
same Candidate Roadmap underneath, just scoped to today.

On the Leaderboard, switching to Daily reuses the exact same Team
Leaders / Individual Leaders / QI1 Rhythm sections already built for
weekly and monthly — no new functions needed, since
`get_team_pipeline_totals()` and `get_individual_leaders()` already take
any `period_type`/`period_start`. This is what actually answers "who got
the most yeses / QI1s / QI2s / etc. today" — Individual Leaders already
covers every pipeline stage except Questions, per period. Core 300 and
Day 1 Ditto stay monthly-only (they're inherently monthly concepts, not
daily), and the QI1 Rhythm threshold is 1+ for Daily (vs. 2+/week,
8+/month).

### Daily Reminders (push notifications)

`components/NotificationOptIn.tsx` (surfaced on the Notifications page)
tries to turn on push notifications automatically the moment the page
loads, with no "Enable" button — this works with zero taps on platforms
that allow a background permission request (Android/desktop Chrome and
Firefox). **iOS Safari is a hard exception**: it flatly refuses to show
its native permission dialog unless triggered by a real tap, so the
automatic attempt there reliably fails, and the component falls back to
a single **Turn On** button — that's an Apple platform rule, not a
choice this app makes, and there's no way to get push notifications on
an iPhone with truly zero taps. The automatic attempt is raced against a
4-second timeout specifically so this fallback always kicks in cleanly
instead of leaving the component stuck showing nothing (an earlier
version of this hung with a blank space where the card should be, since
the failed permission request never resolved). A few other things worth
knowing:

- **iPhone requires "Add to Home Screen" first**, on top of the above —
  this is a separate hard Safari rule. If someone opens the app in a
  regular Safari tab, they'll see instructions instead; only once it's
  been added to the Home Screen and reopened from there does the
  Turn On button even become reachable.
- If someone taps **Turn Off**, that choice is remembered (a
  `angle-notifications-opted-out` flag in `localStorage`) so the app
  doesn't silently re-subscribe them next visit — a **Turn On** control
  takes its place. If the browser/OS permission itself is denied, there's
  nothing the app can do about that from inside the page; it shows a
  message pointing to the browser/device settings instead of a dead
  button.
- The reminder fires once daily via a Vercel Cron job hitting
  `/api/push/send-reminders`, currently scheduled for **8:00 PM Eastern**
  (`0 0 * * *` UTC). Because it's a fixed UTC hour, it'll actually land at
  7 or 9 PM Eastern for the ~5 months a year on the other side of Daylight
  Saving Time — nudge the hour in `vercel.json` by ±1 around the March/
  November changeovers if you want it exact year-round.
- The route is protected by a shared secret (`CRON_SECRET`) that Vercel
  automatically sends back as a Bearer token when it fires the cron job —
  anyone hitting that URL without it just gets a 401.
- It only messages people who both (a) have enabled reminders on at least
  one device and (b) haven't completed all 4 of today's Core Run items
  yet — everyone else is silently skipped, no spam.
- **New environment variables required** — see `.env.local.example` for
  the full list (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`). These are
  separate from the Supabase anon key already in use — the service role
  key in particular bypasses Row Level Security entirely and must never
  be exposed to the browser (no `NEXT_PUBLIC_` prefix, server-only).

The opt-in component (`components/NotificationOptIn.tsx`, surfaced on the
Notifications page) is a single subscription that covers both this
reminder and the stat-leader digest below — there's only one
`push_subscriptions` row per device, not one per notification type.

### Calendar event reminders (custom timing) + color-coded event types

Every Calendar event gets a push notification before it starts — title,
event time, and the linked candidate's name if there is one (same info
the Upcoming/Recently Passed cards show). How long before is a per-event
choice now (`CALENDAR_REMINDER_OPTIONS` in `lib/constants.ts`): No
reminder, 10 minutes, 30 minutes (the default for new events), 1 hour, or
1 day — a new `calendar_events.reminder_minutes_before` column (nullable;
`null` means no reminder for that event). Each event also gets a category
(`CALENDAR_EVENT_TYPES`: Candidate Meeting, Team Event, Reminder, Other),
each with its own color dot shown next to the title on every event card
(`EventDot` in `app/calendar/page.tsx`) so a scan down Upcoming tells a
QI1 apart from a team meeting apart from a personal follow-up at a
glance, without reading every line. Both fields are selects right in the
Add Event form; `broadcast_event_to_downline()` carries them through to
every copy it creates too, so a broadcast team meeting shows up
correctly color-coded (and reminder-configured) for everyone it goes to.

Building the reminder itself needed a fundamentally different scheduling
mechanism than the Daily Reminder and Stat Leader crons below, because of
a hard platform limit worth knowing about: **Vercel's Hobby plan caps
cron jobs at once per day, and not even minute-precise within that
hour** — there's no way to get Vercel itself to check "is anything
starting soon" on the kind of 5-minute cadence this needs.

The fix: `/api/push/send-calendar-reminders` isn't wired into
`vercel.json` at all — that limit only applies to Vercel's *own* cron
scheduler, not to how often an ordinary deployed route can be hit by an
external caller. Instead, a **Supabase pg_cron job** (Postgres's own
scheduler, included on every plan including free, with a 1-minute
minimum granularity — no Vercel plan limit anywhere near this path) fires
every 5 minutes and uses the `pg_net` extension to make an HTTP call into
that route, same `CRON_SECRET` bearer-token auth as the existing cron
routes. Run this once (fill in your actual Vercel domain and `CRON_SECRET`
value — Postgres can't read Vercel's environment variables, so this has
to be a literal, hand-filled-in string, not a reference):

```sql
create extension if not exists pg_net;

select cron.schedule(
  'send-calendar-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-VERCEL-DOMAIN/api/push/send-calendar-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR-CRON-SECRET-VALUE'),
    body := '{}'::jsonb
  );
  $$
);
```

The route fetches upcoming events that have a `reminder_minutes_before`
set and haven't had a reminder sent yet (`calendar_events.reminder_sent`),
then filters in JavaScript for whichever ones fall within ±5 minutes of
*their own* configured offset — every event can ask for a different lead
time, so this can't be a single shared date-range query the way the
original fixed-30-minutes version was. A ±5-minute band checked every 5
minutes gives every event at least one poll inside its band, with margin
either side for clock drift or a slightly-late tick; `reminder_sent`, not
the band's precision, is what actually prevents a double-send on the
overlap. It's marked `true` the moment an event is processed, even if the
rep has no push subscription yet or the send fails, so a stale event
can't get retried forever on every single poll. Logged into
`sent_notifications` under a new `calendar_reminder` kind, showing up in
**Notifications** history same as every other push this app sends.

### Event-triggered push notifications

Six more pushes fire the instant something happens, rather than on any
kind of schedule — a different shape of problem than the Daily Reminder,
Stat Leader digest, or Calendar reminder above, all of which are cron-
driven. These are triggered directly by a user action, so they all go
through one shared route, **`/api/notify`**, authenticated the same
way `/api/assistant/rate-call` is (the caller's own Supabase access token
in an `Authorization: Bearer` header, not `CRON_SECRET`) — the route
figures out who else needs to be told and what to say, then hands off to
`notifyUsers()` in `lib/notifyEvent.ts` (the same send-and-log tail used
everywhere else: push to every device on file, drop dead subscriptions on
a 404/410, log one `sent_notifications` row per recipient). Client pages
call it fire-and-forget through `fireNotifyEvent()` in
`lib/notifyClient.ts` — a failed push notification should never surface as
an error on an action that already saved successfully.

The six, and who they notify:

- **Calendar event added by upline/admin** (`calendar_event_added`) —
  fires after `broadcast_event_to_downline()` (a rep sending something to
  their whole downline), `send_event_to_recipients()` (sending to a
  specific few instead of everyone), or `add_company_event()` (an admin's
  recurring team event), notifying everyone the event just landed on. The
  route re-derives the recipient list itself from the caller's real
  downline rather than trusting a client-supplied id list for the
  "specific people" case.
- **Downline call rating submitted** (`call_rating_submitted`) — fires in
  `RatingJobsProvider` right after a finished Rate a Call analysis saves
  successfully, notifying every level of the submitter's upline
  (`get_upline_user_ids()`, the new mirror of `get_downline_user_ids()`
  with the `is_upline_of` argument order swapped).
- **Downline completes today's Core Run** (`core_run_completed`) — fires
  in `app/streak/page.tsx`'s `saveToday()` the moment `qualifies()` flips
  from false to true for *today* specifically (the same transition check
  already used for the Games-unlocked banner), notifying the submitter's
  upline.
- **You complete today's Core Run, unlocking all 3 games**
  (`games_unlocked`) — fires from the exact same transition check as
  `core_run_completed` above, but self-targeted (notifies you, not your
  upline) — replaces what used to be a local-only, un-logged
  `Notification.showNotification()` call scoped to whichever device
  happened to be open at the time.
- **Downline reaches 5+ active pipeline candidates** (`pipeline_5plus`) —
  fires from `updateCandidate()` in the Candidate Roadmap after any step
  move, launch, or filter-out. A brand-new RPC,
  `try_claim_pipeline_threshold_notification()`, atomically flips a
  persisted `profiles.notified_5plus_pipeline` latch and reports back
  whether *this* call is the one that just crossed the threshold — a
  DB-backed flag rather than client-side state, so it survives page
  reloads and isn't fooled by two devices independently recomputing the
  same count. Resets to false if the count later drops back under 5, so
  crossing up again later notifies again.
- **Upline unlocks your next onboarding session** (`onboarding_unlocked`)
  — fires from **Team**'s "Unlock Next Session" / "Unlock All Sessions"
  buttons, notifying just that one downline member. The route
  double-checks authorization server-side too (admin, or
  `is_upline_of(you, them)`) before sending, rather than trusting that the
  grant itself already succeeded.

Run this once against `sent_notifications`'s kind check constraint to
allow the six new values (safe to re-run — same drop/re-add pattern as
every other constraint change in this file):

```sql
alter table sent_notifications drop constraint if exists sent_notifications_kind_check;
alter table sent_notifications add constraint sent_notifications_kind_check check (
  kind in (
    'daily_stat_leaders', 'weekly_stat_leaders', 'monthly_stat_leaders', 'core_run_reminder',
    'calendar_reminder', 'calendar_event_added', 'call_rating_submitted', 'core_run_completed',
    'pipeline_5plus', 'onboarding_unlocked', 'games_unlocked'
  )
);
```

### Stat Leader Notifications

On top of the Core Run reminder, a second cron route
(`/api/push/send-stat-leaders`, one Vercel Cron entry at `0 13 * * *`
UTC) sends **exactly one** consolidated push per period — never one per
stat category:

- **Daily** — every run, recaps yesterday's Individual Leaders
  (`get_individual_leaders('daily', yesterday)`) into a single line per
  category that had a leader, e.g. `Yeses: Jane Doe (5) · QI1: Bob Smith
  (3)`.
- **Weekly** — only fires when the run date is a Monday (the start of a
  new week), recapping the week that just ended
  (`get_individual_leaders('weekly', lastWeekStart)`).
- **Monthly** — only fires on the 1st of the month, recapping the month
  that just ended: Individual Leaders plus the top Core 300 PV
  (`get_core300_leaderboard`) and top Day 1 Ditto (`get_ditto_leaderboard`)
  performers, each appended as its own line.

Ties within a category join with `/` (`Launches: Jane Doe / Bob Smith
(2)`); a household couple's shared stat joins with `&` (`Jane Doe & John
Doe`), matching the Leaderboard's existing convention. If a period has no
qualifying leaders in any category, that period's notification is skipped
entirely rather than sending an empty message — this is also why the
route can safely run every day without ever producing three separate
pings.

### Notifications page

`app/notifications/page.tsx` (linked from **More**) lists every push
notification actually sent, newest first, reading the new
`sent_notifications` table: broadcast rows (the stat-leader digests,
`user_id` null) are visible to everyone, and personal rows (the Core Run
reminder) only to their recipient. Both cron routes insert a row here
right after a successful send — `recipient_count` records how many
devices a broadcast actually reached. There's no insert policy for
regular users; only the service-role cron routes write to it.

### Games

A single **Games** tab holds three mini-games behind a pill-tab
switcher (`app/games/page.tsx`, same pattern as the Resources hub's
section tabs) — each game is its own component under
`components/games/` and only mounts while its tab is active. The
initial tab can be deep-linked via `?tab=diamond-run|diamond-chase|trivia`
(e.g. `/games?tab=trivia`), read with `useSearchParams()` inside a
`<Suspense>` boundary per Next's docs.

Admins don't have to complete that day's Core Run to unlock any of the
three — each game's own `unlocked` check now short-circuits on
`isPrimaryUser(user.email)` before falling back to the real
`coreRunDone` check everyone else needs. Same carve-out pattern used for
Onboarding session gating elsewhere in the app.

- **Diamond Run** — a lightweight Flappy Bird-style game: tap to keep
  your diamond airborne and dodge classic green pipes. Playing is
  gated: it unlocks for the day once you've completed that day's Core
  Run (Read, Listen, Daily Update, Story Share), reading the same
  `streak_days` row that page already writes to. Locked out, it links
  straight to Core Run Streak. High scores: `game_high_scores` +
  `get_game_leaderboard()`.
- **Diamond Chase** — classic Snake, reskinned: a trail of diamonds
  (head outlined in white) chases down a hand-drawn book icon instead
  of apples on a 15x20 grid (drawn with canvas shapes rather than an
  emoji — emoji rendered via canvas `fillText` is unreliable on iOS
  Safari and wasn't showing up there). Controls: arrow keys/WASD,
  swipe, or the on-screen D-pad (large 56px buttons for easier
  tapping). Speed ramps up slightly with every book eaten, starting a
  bit slower than the first version for easier control. Gated the same
  way as Diamond Run — locked until that day's Core Run is complete,
  linking to Core Run Streak while locked out. High scores:
  `snake_high_scores` + `get_snake_leaderboard()`.
- **Trivia** — a daily 5-question challenge, not a survival mode.
  Every user gets the same 5 questions on a given calendar day, picked
  deterministically from `lib/trivia-data.ts`'s `TRIVIA_QUESTIONS` pool
  by a seeded shuffle keyed off the date string (`components/games/
  TriviaGame.tsx`'s `dailyQuestionIndices`) — no server-side "today's
  questions" state needed, it's just computed the same way on every
  device. The start screen frames it as "a fun way to test your LTD
  knowledge" (honor system, no looking up or asking someone for the
  answer) plus a no-pressure nudge if you're struggling to get 5 in a
  row: keep plugging into audios, books, and team events and it'll keep
  getting easier — not a "you're falling behind" message. Playing is
  gated the same way as Diamond Run —
  unlocks once that day's Core Run (Read, Listen, Daily Update, Story
  Share) is complete. One attempt per day: answering a question wrong
  ends the attempt immediately (no retries, no seeing the remaining
  questions), and finishing all 5 also ends it — either way you wait
  until the next calendar day for a new set. Results are stored in
  `trivia_daily_results` with a `(user_id, day)` primary key, which is
  what actually enforces "no do-overs" even if a client tried to bypass
  the UI, not just the app's own logic. A streak (consecutive calendar
  days scoring 5/5) is computed on the fly by `get_trivia_streak()` —
  same recursive-CTE approach as Core Run Streak — and surfaced on a
  `get_trivia_streak_leaderboard()`-powered leaderboard.
  - **"Where to find it" hint on a miss** — every `TriviaQuestion` now
    carries a `source` field (`lib/trivia-data.ts`) pointing at where the
    answer actually lives — mostly `More → Resources → Audios/Books/
    Leaders/Products/Process`, since that's where the underlying facts
    already live in the app (an audio's summary and speaker are shown
    right on its card, the 9 Core Steps graphic leads the Process tab,
    etc.). A few are pure oral team history that was never written down
    anywhere in the app (a specific event name, an old day-job story,
    what someone was afraid of) — those just say so plainly rather than
    pointing at nothing. Since a wrong answer ends the attempt
    immediately (one-strike design, not a "finish all 5 then review"
    quiz), there's only ever one missed question per day — its hint shows
    right on the reveal, then again on the day's result card. This is
    session-only, not persisted: `trivia_daily_results` only stores a
    score, not which question was missed, so reloading the page loses it
    (same as the rest of that table's shape).
  - **Games Unlocked alert** — the moment your Core Run for the day
    flips from incomplete to complete, the Core Run Streak page
    (`app/streak/page.tsx`) shows a dismissible "🎉 Games Unlocked!"
    banner linking to `/games`. This used to say "Trivia Unlocked" and
    link straight to the Trivia tab specifically, back when Trivia was
    the only one of the three games gated behind today's Core Run — but
    Diamond Run and Diamond Chase both gate on the exact same
    `coreRunDone` check (see each game's own `unlockStatus` in
    `components/games/DiamondRunGame.tsx` /
    `DiamondChaseGame.tsx` / `TriviaGame.tsx`), so all three unlock at
    once — the banner was just never updated to say so. It also used to
    fire a local, device-only `ServiceWorkerRegistration.showNotification()`
    call that never went through the server and never showed up on the
    **Notifications** page; it's now a `games_unlocked` kind on the same
    event-triggered `/api/notify` route as the five below (real push to
    every device you've registered, logged into `sent_notifications`
    like everything else), self-targeted since this one's for you, not
    your upline.

All three: plain HTML5 canvas (or plain DOM for Trivia), no game
library, and no anti-cheat on scores — same trust level as any other
self-reported number in this app.

### Badges

A video-game-style achievement layer (`/badges`, its own tab under
More) sitting on top of numbers already tracked everywhere else in the
app — Core Run Streak, Volume (PV, Day 1 Ditto), Pipeline Tracker
(Questions/Yeses/QI1s), Goals — plus one brand-new self-reported
counter (books finished, since unlike audios there was never an
existing way to know someone actually read something).

- **The catalog lives in code, not the database.** `lib/badges.ts`'s
  `BADGE_DEFINITIONS` is a flat list of ~92 badges (key, category,
  label, description, icon, which metric it checks, what threshold) —
  Core Run Streak (10/30/60/90/365 days), Monthly PV (150/300 "Core
  300"/600/1000), Day 1 Ditto (100/150/300 PV), Ditto Streak and Core
  300 Streak (3/6/12 consecutive months each), Audios (5/10 in a day,
  plus 5+/day for 7 days straight), Books (10/20/30/40/50 in a year),
  Questions (5/10/15/20 in a day, 25/30 in a week), Yeses (2/5/10 in a
  day, 10/15/20/25/30 in a week), Goals (filled out at all), QI1s
  weekly (every number 2 through 10) and monthly (8/10/15/20/25/30),
  plus a second batch: Contacts (100 on your A/B list, +25 added in a
  month), Customers (first/10th/25th sale logged, a single 100+ PV
  sale, 300+ PV in a month), Pipeline Beyond QI1 (IS1/IS2 5-in-a-month,
  FU1/FU2 10-in-a-month with a personal and a team-combined-with-
  downline variant of each), Launches (first launch, a 3-month launch
  streak, 5/10/25 total launches combined with your downline), Speed
  (launch within 30 days of a Yes), Consistency (a 7-day Perfect Week,
  a full calendar-month Perfect Month, rebuilding a 10+ day streak after
  breaking one), Calendar & Meetings (10/week, 20/month), Team Culture
  (attend 5 different Team Events), Household (link your spouse),
  Growing Others (finish Onboarding within 60 days), Meta/Combo (Core
  300 + Ditto + a full month of Core Run in the same month, plus
  10/25/50 total badges earned), Longevity (Core 300 in 12 different
  calendar months lifetime), Games (beat your own Diamond Run high
  score 5 times, 7/30-day Trivia streaks), and a Wildcard (meetings
  logged on both Saturday and Sunday of the same weekend). Only
  `user_badges` (which `badge_key` a real person has actually earned,
  `earned_at`) lives in the database.
- **One RPC computes every raw number.** `get_badge_metrics(p_user_id)`
  returns a single row of ~43 metrics — longest Core Run Streak, max
  monthly PV, max Day 1 Ditto PV, longest Core 300/Ditto streaks (same
  gaps-and-islands SQL trick as `get_longest_streak`, just over months
  instead of days), max audios in a day, longest 5+-audio-day streak,
  max Questions/Yeses per day and per week, max QI1s per week and per
  month, whether any goal's ever been saved, the best "books finished"
  count across any single calendar year, plus everything the second
  badge batch needed: A/B contact counts, customer sales counts/PV
  (`customer_sales.amount` is already PV, not dollars, so no new column
  was needed there), IS1/IS2/FU1/FU2 monthly maxes (the FU1/FU2 "team"
  variants sum `pipeline_periods` across `get_downline_user_ids()` too),
  launch counts and streaks (personal and team-combined), a "launched
  within 30 days of connecting" check, a calendar-month Perfect Month
  check, a count of 10+-day Core Run streaks (2+ means a rebuilt
  Comeback Kid), weekly/monthly meeting totals, Team Event attendance
  (see `event_attendances` below), whether a spouse is linked, whether
  Onboarding finished within 60 days of signup, a same-month Triple
  Threat check, a total-badges-earned count (excluding the meta badges
  themselves), distinct Core 300 months, Diamond Run
  `times_improved`, the longest Trivia streak
  (`get_longest_trivia_streak()`, a new gaps-and-islands function
  alongside the existing current-streak-only `get_trivia_streak()`),
  and a same-weekend Saturday+Sunday meetings check. `lib/badges.ts`'s
  thresholds get compared against this one row rather than one query
  per badge. The function is dropped and recreated (not a bare `create
  or replace`) whenever its return-table column list grows, since
  Postgres won't let `CREATE OR REPLACE FUNCTION` change an existing
  return shape.
- **"Longest/max ever," not "current."** Same reasoning as
  `get_longest_streak`: a badge earned once should stay earned even
  after the underlying streak or count later resets — nobody should
  ever lose a badge they already have.
- **Automatic detection + notification, no manual claiming.**
  `lib/badgeEngine.ts`'s `checkAndAwardBadges(ownerId)` fetches the
  metrics row and the already-earned badge keys, inserts any
  newly-qualifying ones, and fires a `badge_earned` push (both to the
  earner — "You just earned X!" — and their upline — "{name} just
  earned X!" — same two-recipient shape as Core Run Completed/5+
  pipeline) for each one. Called opportunistically from the Today
  dashboard and the Badges tab itself on mount, rather than hooked into
  every single save action across Pipeline/Streak/Volume — since
  almost every metric is "best ever" rather than "just now," it doesn't
  need to fire the instant a number changes to still feel prompt, and
  Today is the one screen almost everyone opens regularly anyway.
- **Books: a "+1 Book Finished" button**, since there's no way to
  auto-detect someone actually read something. Each tap inserts a row
  into `book_completions` (household-shareable, no upline fill-in —
  finishing a book isn't something an upline logs for a downline) and
  re-runs the badge check immediately, so a book that pushes you over
  a yearly threshold unlocks right away instead of waiting for the next
  Today dashboard visit.
- **Team Regular needed a new self-report, same reasoning as
  Books.** `event_media` uploads are admin-only, so `uploaded_by` can't
  tell who actually showed up to a Team Event. A new `event_attendances`
  table (household-shareable, no upline fill-in, same shape as
  `book_completions`) backs a "📸 I Was There" button on each album on
  the Team Events page — tap once per album, no re-tapping since the
  table's `unique (user_id, album_id)` plus a live `Set` of already-
  attended album IDs turn the button into a "✅ You were there" pill
  after the first tap.
- **Three new columns feed the rest of the second batch.**
  `candidates.launched_at` (stamped by "Mark Launched" on Pipeline,
  cleared by "Restore") drives Fast Starter's "within 30 days" check.
  `game_high_scores.times_improved` (incremented in
  `DiamondRunGame.tsx`'s `endGame()`, but only when there was a real
  previous best to beat — the very first score set doesn't count as
  "beating" anything) drives High Scorer.
  `profiles.onboarding_completed_at` (stamped by
  `grant_next_onboarding_session`/`grant_all_onboarding_sessions` the
  first time `onboarding_unlocked_through` reaches 5, never overwritten
  after) drives Fast Learner.
- **The Badges tab itself** groups every badge by category, shows
  earned/total per category, and renders each badge with its icon,
  label, description, and either an earned date (✅, tinted card) or a
  progress bar toward its threshold (🔒) — the "23/30" feel of a
  video-game achievement list rather than a flat locked/unlocked
  toggle.
- **user_badges' RLS mirrors `pipeline_periods`' upline-fill-in
  pattern**, not the plain household-only pattern most tables use — an
  upline filling in a downline's pipeline numbers can trigger that
  downline earning a badge, so insert has to allow self, household,
  upline, or admin, the same four clauses as `pipeline_periods`'
  `insert_own_or_upline` policy.
- **A "🏅 My Badges" card on My Profile** links its header to `/badges`,
  showing an earned/total count and every earned badge as a pill chip
  (`components/BadgePillList.tsx`, shared with the public profile card
  below) — 12 shown by default with a "Show all N ▾" toggle to expand
  the rest in place, rather than a dead-end "+N more" label.
- **Badges also show on the public profile** (`/profile/[id]`, what
  opens when you tap a name on the Leaderboard) via a new
  `get_public_badges(p_user_id)` RPC — same reasoning as
  `get_public_profile`: badges are meant to be seen by any teammate as
  bragging rights, not gated by `user_badges`' narrower
  self/household/upline/admin RLS, so this bypasses it the same way
  `get_public_profile` bypasses `profiles`' RLS. No internal
  authorization check, same precedent as `get_public_profile`/
  `get_current_streak`.
- **A third batch adds ~39 more badges (~131 total)**: Business
  Structure (organizational size — "legs" and total people), Legs with
  Volume/on Core Run/Taking Action (organizational health), Training &
  Events, Sample Bags, a Customer Survey badge (folded into the
  existing Customers category), and AI Chat Practice.
  - **"Legs" needed a brand-new recursive function.**
    `get_leg_members(p_user_id)` walks the whole downline tree (any
    depth) and tags every member with which first-level "leg" they
    trace back to — a leg's root is
    `coalesce(household_id, id)` of the direct recruit, so two direct
    recruits who are a linked spouse pair collapse into one leg
    (matching "spouses count as two people but not two legs"), while
    `viewer_unit` mirrors `is_upline_of`'s own household expansion so
    either spouse's direct recruits count as the household's legs.
    `get_badge_metrics` calls it once via a `with legs as (...)` CTE
    and reuses it for every leg-related metric: `leg_count`,
    `total_downline_people`, five "N legs + M people" combo booleans
    (3+10/6+25/6+50/9+75/12+100), and three current-snapshot health
    counts — legs with any monthly PV logged this month, legs with
    someone on an active Core Run Streak right now, and legs with any
    pipeline activity logged this month. These are live snapshots, not
    "longest ever" — but a badge once inserted into `user_badges` is
    never re-checked for removal, so the "never lose a badge" rule
    still holds even if organization size later shrinks.
  - **A generic `activity_logs` table** replaces adding a one-off table
    per action — same self-report reasoning as `book_completions`, just
    `kind`-tagged (`sample_bag_given`, `customer_survey_completed`,
    `weekly_training_attended`, `monthly_masterclass_attended`,
    `quarterly_conference_attended`, `story_practiced`) so one table
    and one RLS policy set covers all six instead of six each. The
    Badges tab's new "📋 Log Activity" card has one row per kind — a
    running count + "+1" for Sample Bags, a "Mark Done"/"✅ Done" toggle
    for the other five.
  - **"Grade a meeting on the AI chat"** reuses the existing `call_ratings`
    table (the Assistant's Rate a Call feature) rather than adding
    anything new — `call_ratings_count` is just `count(*)` for that user.
- **A fourth batch adds ~29 more badges (~160 total)**: App Habits,
  Depth & Duplication (generations *below* your legs, not across them),
  Leadership & Recognition, Data Hygiene, Timing, Referral Chains, three
  more Customers badges (lifetime/yearly sales totals), a Team Culture
  and a Support badge, and four more Meta/Combo badges.
  - **Depth needed a second recursive function.** `get_leg_members`
    (batch 3) tags who belongs to which leg; `get_downline_with_depth`
    tags how many generations below you someone is (1 = a direct
    recruit, 2 = their recruit, etc.) — same `viewer_unit` household
    expansion, different question (depth, not identity). Backs Third/
    Fourth/Fifth Generation (`max_downline_depth` ≥ 3/4/5) and Second
    Generation Growth (`second_gen_or_deeper_count` ≥ 10). Duplication
    Nation reuses `get_leg_members` a second way — for each of your
    legs, it calls `get_leg_members(leg_root)` *again* to check whether
    that leg itself has 3+ legs of its own.
  - **App opens get their own table.** `app_opens` (one row per day,
    logged automatically from `AuthGate` via an `upsert` with
    `ignoreDuplicates` — not self-reported) backs Daily Visitor's
    "30 days in a row," the same gaps-and-islands trick as everything
    else that's ever asked "longest streak."
  - **Leaderboard likes reverse-engineer `entry_key`.** `leaderboard_likes.entry_key`
    is a client-built string with a different shape per leaderboard
    section (`streak:<uuid>`, `core300:<date>:<uuid>`,
    `milestone:<uuid>:<days>`, etc. — see the `*EntryKey` builders in
    `app/leaderboard/page.tsx`). Shoutout/Fan Favorite match
    `entry_key` against every format that embeds a plain user id
    (streak, active-candidates, game, core300, ditto, milestone,
    qi1_rhythm) to count times-liked-received; `team`/`individual`
    entries are skipped since those keys identify a stage/period, not
    one person, and `daily_sale` is skipped since it keys off a sale id
    instead. Cheerleader/Encourager (likes *given*) don't need any of
    that — just `count(*) where liker_id = p_user_id`.
  - **Good Neighbor needed to know who last touched a row.** Nothing on
    `pipeline_periods` recorded whether an edit was the owner's own or
    an upline filling in for them — `last_edited_by` (stamped by
    `bump_pipeline_stage` for the Daily Tally path, and directly by the
    client for the weekly/monthly direct-edit path) fixes that. The
    metric only counts `period_type = 'daily'` rows to avoid
    triple-counting the automatic weekly/monthly rollup as 3 separate
    "times."
  - **Full Spectrum and Perfectionist can't be a raw number** — they're
    a property of the badge catalog itself (category coverage) crossed
    with the earned-badge set, both client-side facts, not something
    `get_badge_metrics()` can compute. `BadgeDefinition` is now a union
    (`MetricBadgeDefinition | MetaBadgeDefinition`); `isBadgeEarned`/
    `badgeProgress` take an optional `earnedKeys` set for the two
    `special` badges, and `checkAndAwardBadges` evaluates them against
    "existing + newly-earned this pass" so earning the last badge a
    meta badge needs triggers it in the same pass, not a pass later.
    Perfectionist excludes itself and Full Spectrum from the "every
    badge in this category" check for Meta/Combo, since otherwise that
    one category could never complete (it would require having already
    earned itself).
- **A fifth batch adds ~36 more badges (~196 total)**: Firsts, Onboarding
  Milestones, more Games (Trivia/Diamond Chase/Diamond Run tiers), more
  Business Structure (Team of 5/10/20/50/100 people, plus a "10 people +
  8 combined QI1s" combo), more Goals/Household/Audios/Books/Consistency
  badges, and one badge each added to Leadership & Recognition and
  Longevity. Six of the picks turned out to already exist under
  different names — Perfect Quarter/Half/Year duplicated the existing
  Core 300 Streak tiers (3/6/12 months), Ditto Devotee/Legend duplicated
  the existing Ditto Streak tiers (6/12 months), and Consistency Is King
  duplicated the existing Perfect Month badge — so those six were left
  alone rather than adding exact duplicates.
  - **Diamond Chase gets its own `times_improved` column** (mirroring
    Diamond Run's from an earlier batch) for Diamond Chase Pro, and a
    trivial `exists` check on `snake_high_scores` for Diamond Chase
    Rookie (played at all).
  - **Caught Up needed a "have you looked" watermark**, since
    `sent_notifications` never tracked per-notification read state — a
    new `profiles.notifications_last_viewed_at`, stamped every time the
    Notifications page loads, compared against your most recent
    notification's timestamp.
  - **Goal Getter only checks 3 of the 7 goal metrics** (`questions`,
    `yeses`, `qi1s`) — those are the ones with a direct 1:1 match in
    `pipeline_periods` for whatever period the goal is set to.
    `read_minutes`/`audios`/`conversations`/`story_shares` live in
    `streak_days` instead, which would need summing across a goal's
    period rather than a straight column match, so they're not covered.
  - **Household Streak and the "Team of 10 + 8 QI1s" combo** both
    reuse patterns already established elsewhere — the former mirrors
    `is_upline_of`'s "find the other half of a household" resolution,
    the latter reuses the `get_downline_user_ids`-based team-combined
    sum pattern from `max_fu1_month_team`/`max_fu2_month_team`.
  - **Well-Rounded is a third `special` meta badge**, and needed more
    than a plain earned-key set — it cares which *week* each badge was
    earned, not just which ones. `isBadgeEarned`/`badgeProgress` now
    take an `EarnedBadgeMap` (`badge_key -> earned_at`) instead of a
    bare `Set<string>`; Full Spectrum/Perfectionist just call `.has()`
    on it like before, Well-Rounded groups by a Monday-anchored week
    bucket and checks whether any single week covers 3+ categories.
- **Alex and Laura's accounts can browse Badges but never earn them**
  (`BADGE_EXCLUDED_EMAILS`/`isBadgeExcluded()` in `lib/constants.ts`) —
  they run the whole team rather than a personal business inside it, so
  earning badges isn't a fit for their accounts specifically (every
  other primary/admin email still earns badges normally). `checkAndAwardBadges`
  is simply never called for them (Today dashboard, Badges tab mount),
  but the Badges tab itself, its nav/search entries, and the "My
  Badges" card on their own profile all render normally so they can
  still see the full catalog their team is working through — plus a
  one-time cleanup `delete` that already cleared any badges their
  accounts had accumulated before this was scoped correctly.
  `get_public_badges()` still suppresses their rows server-side as a
  harmless backstop, even though it'll never have rows to suppress now
  that earning stays blocked.
- **Fixed: the public profile's Badges card only rendered when the
  viewed person had 1+ badge earned**, so anyone with zero badges (most
  people, early on) showed no Badges section at all — looked like the
  feature wasn't there. It now always renders, the same way My
  Profile's own "My Badges" card always has, with a "no badges earned
  yet" empty state instead of disappearing.
- **Team terminology: "layers," not "generations."** The existing 3/4/5
  layers-deep badges and Second Layer Growth (previously "Generation")
  got their labels/descriptions updated — `badge_key`s were left alone
  so anyone who already earned one keeps it (only the display text
  changed, matched by key, not by name).
- **A sixth batch adds ~34 more badges (~230 total)**: more Customers
  (product category variety, repeat customers), Story & Depth, more AI
  Chat Practice (per-call-type specialist badges), Info Sessions,
  Reading, more Growing Others, Household, Calendar & Meetings, Games,
  Speed, Consistency, Leadership & Recognition, App Habits, and one
  more each in Depth & Duplication, Referral Chains, and Meta/Combo.
  - **Patient Teacher needed a new audit table.** Neither
    `grant_next_onboarding_session` nor `grant_all_onboarding_sessions`
    recorded who granted what to whom - just the resulting unlock level
    on `profiles`. A new insert-only `onboarding_grants` table
    (`granter_id`, `target_id`, `granted_at`), written by both grant
    functions, backs "grant an unlock to 5 different downline members."
  - **Fully Resourced is a simplification**, not a literal "every
    resource assigned" check — the real "assigned resources" set is
    computed client-side (`effectiveResourcesForStep`, constants +
    per-candidate overrides + library picks), not a single DB table.
    It checks candidate-specific sends instead: a candidate whose
    `candidate_resource_completions` count matches or exceeds their
    `candidate_specific_resources` count (and has at least one sent).
  - **Comeback Season (0 → 5+ active candidates in a month) was
    skipped** — it needs a historical daily/monthly snapshot of pipeline
    size, which nothing in the schema currently keeps; candidates only
    ever reflect their *current* state, not a timeline of it.
  - **Collector is a fourth `special` meta badge** (earn 1+ badge in 10
    different categories) — same `EarnedBadgeMap` mechanism as Full
    Spectrum, just a lower bar than "every" category.
- **A seventh batch adds 54 more badges (284 total)**, reused mostly-existing
  metrics for higher tiers (Veteran/Pro/Icon/Legend-style badges across AI
  Chat Practice, Calendar & Meetings, Customers, Contacts, Business
  Structure, Consistency, App Habits, Sample Bags, Games) plus new
  categories: Push & Calendar (turning on Daily Reminder push, scheduling a
  downline-visible calendar event), Profile (photo, hometown, favorite
  audios/books all filled in), and Assistant (attaching a screenshot to a
  conversation).
  - **Balanced Portfolio is a fifth `special` meta badge** (5+ badges in 5
    different categories) — a higher per-category bar than Collector/Full
    Spectrum, which only ever need 1 badge in a category to count it.
  - **Marathon Reader Pro was changed from minutes to books** per
    feedback — it's a higher tier on `total_books_lifetime` (50, above
    Bookworm's 20) instead of a new lifetime-minutes column.
  - **A few "current state" simplifications**, same spirit as Fully
    Resourced/Comeback Season above: Roadmap Regular (10 active candidates)
    and All In (active candidate + goal + Core Run Streak) read the
    *current* snapshot rather than "ever hit this at once," since the
    schema doesn't keep historical pipeline-size snapshots. Team Spirit
    (attend a Team Event within 30 days of "your own launch") uses signup
    date (`profiles.created_at`) as a stand-in, since the app only tracks
    launch dates for candidates *you* launch, not your own.
  - **Full Circle (convert a Contact into a Candidate) is name-matched**,
    not a real link between the two tables — there's no explicit
    "convert" action in the app, so it checks for a candidate whose name
    matches an existing contact's, case-insensitively, for the same user.
  - **Steady Growth and Founder's Circle reuse the `legs` CTE** already in
    `get_badge_metrics` (one new leg every quarter for 4 straight quarters,
    by each leg's `profiles.created_at`; 3 direct recruits whose own
    downline via `get_leg_members` each reaches 5+ people).
  - **Streak Gamer needed a "current" Trivia streak.** The existing
    `get_longest_trivia_streak` is lifetime-best, not "still going" — a new
    `get_current_trivia_streak(p_user_id)` mirrors `get_current_streak`'s
    walk-back-from-today shape, applied to `trivia_daily_results` instead
    of `streak_days`.

- **An eighth batch adds 13 more badges (297 total)**: consecutive-month
  QI1 streaks at two different bars (8+/month and 10+/month, each at
  2/3/6/9/12 months running) and three tiers of legs launched within a
  single calendar year (12/15/20) — the latter reuses the same `legs`
  CTE and `profiles.created_at`-as-join-date proxy Steady Growth already
  established.
- **Fixed: a linked spouse's public profile always showed 0 badges.**
  `get_public_badges(p_user_id)` looked up `user_badges` by the *viewed
  person's own id*, but badges are evaluated and stored at the household
  level — `checkAndAwardBadges` always inserts under `ownerId`
  (`household_id ?? id`, see `AuthGate`). For a "deferring" spouse whose
  own id differs from their household owner's, every earned badge lived
  under their partner's id instead, so their own public profile — looked
  up by their individual id — never had anything to find. Now resolves
  to the household owner first, the same `coalesce(household_id, id)`
  pattern the rest of the household-sharing logic already uses, so it
  reads the same badges "My Badges" on their own profile already showed
  them (which reads via `ownerId` and was never affected).

- **Fixed: badges never got evaluated for an account that rarely opens
  Today or Badges itself.** `checkAndAwardBadges` only ever ran with the
  *current logged-in user's own* `ownerId` (Today's mount, Badges tab's
  mount) - nobody viewing someone else's profile triggered evaluation
  for the person being viewed. An account whose numbers are mostly
  filled in by an upline, and who rarely opens those two tabs
  themselves, could sit at zero badges indefinitely even while
  genuinely qualifying for some. A new `get_badge_owner_id(p_user_id)`
  RPC resolves the viewed person's real household owner id (returning
  `null` for Alex/Laura, same exclusion every other call site already
  applies) and the public profile page now calls `checkAndAwardBadges`
  with it opportunistically, then re-fetches badges so a newly-earned
  one shows immediately. Safe for any viewer: `user_badges`' existing
  insert policy (self/household/upline/admin) means `checkAndAwardBadges`
  simply no-ops for a stranger without permission, and it already
  swallows every error internally by design.
- **A final round of three closes it out at exactly 300 badges**: 2
  Years of Core 300 (24-month streak), a 6-Month Launch Streak, and
  Library Legend (75 lifetime books) — all reuse metrics `get_badge_metrics`
  already computed for earlier tiers, so no schema changes were needed
  for this last batch.
- **Fixed: logging enough audios for "5 Audios in a Day" on the Core Run
  Streak page didn't award it right away.** `checkAndAwardBadges` only
  ran on Today's and Badges' own mount — the Core Run Streak page's
  `saveToday` (used by every Read/Listen/Meetings add, and every
  counter change) never called it, so a badge earned there sat
  un-awarded until something else happened to trigger the next Today or
  Badges page load. `saveToday` now fires `checkAndAwardBadges(ownerId)`
  right after every successful save, same as `logBook`/`logActivity` on
  the Badges tab already did for their own actions.

### Tapping a badge shows its description

Badge pills on My Profile and the public profile (`components/BadgePillList.tsx`)
were previously just a static row with a hover `title` tooltip — useless on
mobile, where there's no hover. Each pill is now a button; tapping it opens
the same bottom-sheet modal pattern already used elsewhere (Today dashboard's
active-pipeline modal) showing the badge's icon, label, full description, and
the date it was earned.

- **Fixed: tapping a badge opened the modal but cut off before showing the
  description**, description-and-earned-date content invisible below the
  screen edge, on iOS in standalone (home-screen) mode specifically. Every
  other modal in this app (Today dashboard, Calendar, the success-quote
  overlay) is deliberately rendered as a sibling of `.page-main`, never
  nested inside it — a documented iOS Safari quirk (see the comment on
  `.tab-bar` in `globals.css`) makes a `fixed inset-0` element misbehave,
  rendering relative to a scrolling ancestor's bounds instead of the true
  viewport, when nested inside one. `BadgePillList` is a shared component
  reused inside other pages' `.page-main`-nested cards, so it can't just
  move — its modal is now rendered via `createPortal` into `document.body`
  instead, escaping the scrolling ancestor entirely.

### Avatar & Leveling

A points/level layer on top of the Badges catalog — every earned badge
already contributes toward an overall account level, shown as a colored
ring around the profile photo (bronze/silver/gold/diamond as you level
up) plus a numeric level and progress bar toward the next one.

- **Every badge carries a `points` value** now (`lib/badges.ts`), not
  just `metric`/`threshold`. These aren't uniform — a badge with several
  siblings sharing its metric (e.g. the 5 Core Run Streak milestones)
  scales by position from easiest to hardest; a standalone badge with no
  siblings is a flat mid-value (bumped up if it already carries a crown
  icon); the 5 `special` meta badges are the flat max. Categories that
  are core business-building (QIs, Launches, Business Structure, the
  three Legs-with-X categories, Depth & Duplication, Referral Chains,
  Leadership & Recognition, Pipeline Beyond QI1, Firsts, Contacts,
  Growing Others) carry a 3x multiplier per the team's explicit call that
  growing your network and team structure matters far more than anything
  else; Games carries 0.3x. These numbers were tuned by hand against a
  generated draft (grouped by category, sent back and forth for
  correction) rather than computed at runtime — there's no live scoring
  formula, just the values that came out of that review pass.
- **`lib/levels.ts` turns a set of earned badge keys into a level.**
  `pointsForBadgeKeys()` sums them; `levelForPoints()`/`levelProgress()`
  walk a precomputed threshold table (`100 * level^1.6`, levels 1-40) —
  the exponent means each level takes progressively more than the last,
  so even a fully-maxed account (every one of the 300 badges) tops out
  a little past level 30 rather than blowing past a linear curve. It's
  deliberately aspirational, not something normal activity reaches
  quickly. `frameTierForLevel()` maps level ranges to bronze (5+),
  silver (10+), gold (20+), diamond (30+) — the 5 tiers that show as a
  ring color, via `FRAME_TIER_CLASSES`.
- **`components/LevelAvatar.tsx`** is the shared avatar-with-ring — the
  profile photo (or a fallback emoji circle when there isn't one)
  wrapped in a tier-colored Tailwind ring, with an optional small level
  number chip. One component, three size variants, reused everywhere
  below.
- **My Profile gets a new Level card** above "My Badges" — avatar, tier
  label, progress bar, and points-to-next-level, computed from the
  badges already fetched for that page (no new query).
- **The Badges tab itself gets the same Level card** at the top, for
  the same reason it's on My Profile — it was the one place showing
  someone's badge progress that didn't also show their level. Fetches
  `profiles.photo_url` alongside its existing metrics/badges queries;
  hidden for Alex/Laura (`isBadgeExcluded`) since they can browse the
  tab but never earn, so a level that can never move isn't useful to
  show them.
- **The public profile's header card** swaps its plain photo circle for
  `LevelAvatar`, plus a level pill and progress bar under the name —
  same `badges` array `get_public_badges` already returns (already
  household-resolved after the earlier bug fix), so again no new query.
- **Leaderboard rows get a small avatar next to every name.** Unlike
  the two profile pages, the Leaderboard renders a couple dozen
  different entry types (individual leaders, streak, Core 300, active
  candidates, QI1 rhythm, Ditto, daily sales, milestones, games) all
  through two small shared components, `PersonLink`/`CoupleLink` — so
  rather than threading avatar/level data through every call site, two
  new bulk RPCs are fetched once per page load and provided via a
  `LevelDataContext` that `PersonLink` reads directly:
  - `get_all_public_photos()` — one row per account with a photo set,
    individual (not household-merged), since a photo is personal the
    same way the rest of a profile is.
  - `get_all_earned_badge_keys()` — joins `user_badges` to every profile
    whose own id *or* household_id matches the row's owner, so a linked
    spouse's own individual id gets the same badge list (and therefore
    the same level) their household actually earned, without the client
    needing to do any household resolution itself.
  Both are "seen by any teammate" the same way `get_public_profile`/
  `get_public_badges` already are — no new privacy surface, just a
  bulk-friendly shape for a list view instead of one RPC call per row.
  - **Fixed: the Individual Leaders section looked broken when several
    people tied for the same category** (e.g. two couples both leading
    FU1) — every tied name rendered its own inline avatar in one wrapping
    comma-separated paragraph, and a photo doesn't reflow with the text
    the way a word does, so it landed mid-sentence wherever the line
    happened to break. First pass turned the avatar off whenever a
    category had more than one winner, which fixed the wrapping glitch
    but then hid tied winners' photos entirely (e.g. two people tied on
    FU1 lost their avatars while every solo-winner category kept
    theirs) — a real regression, not the intended fix. Rebuilt properly
    instead: a tie now gets its own stacked row per winner underneath
    the category label (avatar, name(s), team, each on its own line)
    rather than one shared wrapping paragraph, so every winner keeps
    their avatar regardless of how many people tied. `PersonLink`/
    `CoupleLink` still take a `showAvatar` prop for the couple of
    contexts where a name appears inline mid-sentence with no room for
    a photo. The avatar size for these inline rows also dropped from
    40px to a new 24px `"xs"` size, and every list row switched from
    `items-center` to `items-start` so a wrapped name doesn't center the
    count/like button oddly across multiple lines.
  - **Fixed: `CoupleLink` only showed one spouse's avatar**, which read
    as "one of them has a badge account and one doesn't" - not the
    case, since badges (and therefore level) are household-merged and
    always identical for both. Both halves of a couple now get their
    own avatar (same level ring, their own individual photo) whenever
    `showAvatar` is on for that row.
- **Badges now sort by point value, highest first**, everywhere a
  badge list is shown. `BadgePillList` (My Profile's "My Badges" card
  and the public profile's "Badges" card) sorts by `points` descending
  instead of the caller's `earned_at desc` order - a badge's point
  value is a better "how impressive is this" signal than when it
  happened to be earned. The main Badges tab does the same within each
  category card, so the hardest badge in a category leads instead of
  whatever order it happens to sit in `BADGE_DEFINITIONS`.

### Success quote on open

Every time the app is opened fresh, a dismissible overlay shows a
success/mindset quote pulled from books on the team's reading list
(`lib/quotes.ts`'s `BOOK_QUOTES`, sourced from the book list in
`lib/library-data.ts`). This is a deliberately curated, non-exhaustive
set — only quotes we could confirm are accurately attributed are
included, rather than guessing at exact wording for every book on the
list. Add more over time as you confirm exact quotes you want in
rotation. It shows once per app open (tied to `AuthGate` mounting, not
per internal tab navigation) and dismisses with a tap.

Quotes cycle through the whole list in a shuffled order (stored in
this device's `localStorage`) before any repeat, rather than picking
independently at random each time — with a pool this size, pure random
picks repeated constantly. Once you've seen every quote once, it
reshuffles and starts a new cycle.

## Notes on the Role-Play Coach

The **Role-Play Coach** tab is strictly a practice simulator for A-list,
B-list, and C-list/marketplace conversations — it is not a general Q&A
assistant. It's backed by a system prompt
(`lib/angle-team-system-prompt.txt`, ~8k tokens, down from ~45k tokens
before this was narrowed to roleplay-only) that plays the prospect one
message at a time and then gives scored feedback when the user ends the
scenario. Everything else the old prompt covered — compensation plan,
products, scripts, process steps, sample bags, the customer survey — lives
as static reference content in the **Resources** tab instead; if a user asks
the coach a general question, it's instructed to redirect them there rather
than answer. The same redirect now applies if someone pastes a full call
transcript into this tab by mistake instead of using **Rate a Call** — the
prompt has an explicit "HANDLING PASTED CALL/MEETING TRANSCRIPTS" section
telling it not to try to invent the prospect's "next line" for a call that
already ended (that was producing a blank reply bubble before this was
added — a transcript ending in a natural goodbye gives the model nothing to
continue, and the strict "output exactly one dialogue turn" rule left it
with nothing to say). As a second layer of defense, `app/api/assistant/route.ts`
now falls back to a plain "Didn't catch a clear reply there" message
instead of ever returning an empty string, so a blank chat bubble shouldn't
be possible even if a future edge case produces empty model output again.
Every message calls Anthropic's Claude API (model set in
`app/api/assistant/route.ts`, currently `claude-sonnet-5`) from a
server-only API route — the API key never reaches the browser, and the
route checks that the caller has a valid Supabase session before it will
respond.

Because the system prompt now fits in a fraction of what it used to, cost
per message is much lower than the original design. The route still uses
Anthropic's prompt caching (`cache_control: ephemeral`) so repeated messages
within the same short window are cheaper than the first one, but this is
still a real, metered cost per message — keep an eye on usage at
[console.anthropic.com](https://console.anthropic.com). To use a cheaper or
more capable model, change the `model` value in
`app/api/assistant/route.ts`. Chat history is stored per-user in the
`assistant_messages` table with the same private-by-default RLS as
everything else.

Users can also paste or attach a screenshot of a real text/DM thread
(📎 button or paste directly into the message box) instead of typing —
Claude reads the image directly and either critiques the finished
conversation or continues the role-play in character from the last message
shown. Images add a small amount of per-message cost (roughly a cent or two
per screenshot at typical phone-screenshot resolution, no caching discount
since each one is unique) and are stored as base64 in the `image_data`
column on `assistant_messages`. If you already ran `supabase/schema.sql`
before this was added, just run the `alter table assistant_messages add
column if not exists image_data text;` line again — it's additive and won't
touch existing data.

## Notes on Rate a Call

The "Rate This Call" button could get permanently stuck on "Rating..."
with no error ever shown. Two contributing gaps, both fixed:
- `app/api/assistant/rate-call/route.ts` had no `maxDuration` set, so a
  detailed 9-section analysis (up to 3000 output tokens, not streamed) on
  a long transcript could take longer than Vercel's default function
  timeout and get killed mid-generation. It now sets `export const
  maxDuration = 60;`.
- In `CallRatingPanel.tsx`, the session refresh and the prior-ratings
  lookup ran *before* the `try`/`finally` that resets the `rating` state -
  if either of those hung (e.g. a flaky connection stalling the Supabase
  auth token refresh), `setRating(false)` never ran and the button stayed
  stuck forever with no feedback. The whole operation now runs inside one
  `run()` closure raced against a 90-second timeout
  (`Promise.race([run(), timeoutRejection(RATE_TIMEOUT_MS)])`), so no
  matter which step actually stalls, the button always recovers within 90
  seconds with a clear "check your connection and try again" message
  instead of hanging indefinitely.

A rating could also come back with a blank result — a real Claude API
response, but with empty text — and `route.ts` returned it as if it had
succeeded, so it got saved as a real `call_ratings` row with nothing in
it and no score, showing up in **Your Ratings** as an entry that expanded
to nothing when tapped. A blank analysis is now treated as a failure the
same as any other error instead of being saved. Separately, the
`overall_score` parser only matched the exact literal `OVERALL_SCORE:
X/10` line — it now also falls back to the first `X/10` near the start of
the response, since every rubric states the score there in section 1
regardless of whether the model reproduces the exact requested line
format. And since a handful of bad rows had already been saved before this
was fixed, each entry in **Your Ratings** now has a small "✕" delete
button (`handleDeleteRating` in `CallRatingPanel.tsx`) so a rep can clean
one up without needing database access — a row with no analysis text is
also flagged inline ("no result — try re-rating") so a stray one is easy
to spot.

A blank result turned out to keep recurring for the same short transcript
(the tail end of a call — a couple of closing lines, not real diagnostic
content) even after the fix above stopped it from being silently saved —
the same input succeeded on some attempts and came back empty on others.
Asking the model for a detailed, evidence-specific 9-section analysis
from a transcript that's mostly just "thanks, talk soon, bye" is a real
edge case for a degenerate completion. `route.ts` now retries the
Anthropic call once automatically before giving up if the first attempt
comes back blank, and the eventual error message (if both attempts are
empty) suggests pasting the complete transcript rather than an excerpt.

That blank-result retry turned out to have created a second, subtler
failure mode: two full non-streamed 9-section generations back to back
(the original attempt plus the retry) can add up to longer than the
route's `maxDuration = 60`, and a function killed mid-generation gives
the browser no HTTP response at all — from the client that's not a clean
error, it's a raw dropped connection (`TypeError: Load failed` on
Safari/iOS, `Failed to fetch` on Chromium), surfacing as an opaque "Load
failed" message with no indication anything was even attempted.
`route.ts` now tracks elapsed time and skips the retry attempt entirely
if the first one already used more than 40 of the 60 seconds, failing
fast with a real error message instead of risking the function getting
killed mid-retry. `CallRatingPanel.tsx` also now recognizes this specific
network-level failure (`isNetworkFailure()`) and retries the whole
operation once automatically after a 1.5s pause before giving up — this
class of failure is usually transient on mobile (a signal dip, or iOS
suspending the in-flight request if the screen locks or the tab gets
backgrounded during the multi-second wait) and often clears up on its
own. If it still fails after that, the message is now "Lost connection
while rating this call. Your transcript is still here — check your
signal and tap Rate This Call again" instead of the browser's raw,
unhelpful wording.

Since a legitimate rating can still take up to a minute even when
nothing's wrong, "Rate This Call" turning into "Rating…" with no other
feedback for that long reads as frozen. It now shows an indeterminate
sliding progress bar (`.progress-track`/`.progress-fill` in
`app/globals.css`, a `translateX` loop — there's no real percentage to
report for a single non-streamed API call, so this is deliberately just
"something is actively happening" rather than a fake completion
estimate) plus a line naming which rubric it's checking against and that
a detailed call can take up to a minute, so the wait reads as expected
rather than broken.

**The actual root cause of "Load failed" happening on every single
attempt** (not a flaky-connection retry case at all) turned out to be a
missing deploy config, not the network or timeout theories above.
`route.ts` reads five rubric files (`lib/qi1-call-rating-prompt.txt`
through `lib/questionnaire-call-rating-prompt.txt`) with `readFileSync`
at module load — the code comment even predicted the risk ("so Next's
file tracer can see each one individually"), but `next.config.ts`'s
`outputFileTracingIncludes` only ever declared the unrelated
`/api/assistant` role-play route's system prompt file, never this
route's five rubric files. Next's automatic tracer doesn't reliably
follow a computed `path.join(process.cwd(), ...)` call, so in the actual
deployed Vercel bundle these files were very likely missing entirely -
confirmed by inspecting the build's own `route.js.nft.json` file-trace
manifest before and after this fix. A missing file used to throw at
module load, before the request handler's own `try`/`catch` could ever
run, crashing the function before it could respond at all - which a
client can only ever see as a dropped connection, not a clean error, and
does so on every single request rather than intermittently, since it's
a deployment bug, not a runtime fluke.

Two fixes: `next.config.ts` now declares all five rubric files under
`outputFileTracingIncludes["/api/assistant/rate-call"]`, matching the
existing pattern already used for the role-play route. Separately,
`route.ts` no longer reads these files at module scope at all -
`loadRatingPrompts()` reads them lazily on first request (then caches
the result) inside the request handler's own `try`/`catch`, so even if a
tracing config slips again in the future, the failure mode is a clean
JSON 500 ("The rating rubrics aren't available on the server right
now.") instead of silently taking the whole function down before it can
respond.

With the deployment bug fixed, the blank-result failure (see above)
turned out to still recur even on a genuine, complete, full-length
(~30 minute) transcript — ruling out the "short excerpt" theory entirely,
since that's a substantial, content-rich call, not a thin one. First pass
at a fix added a "Never Return A Blank Response" instruction to all five
rubric prompts (`lib/*-call-rating-prompt.txt`) telling the model to
write up whatever's actually there rather than withhold output on a thin
call — worth keeping, but it doesn't explain a blank result on a rich
30-minute call, so it's very unlikely to be the actual fix here.

**The actual root cause, found after adding logging and watching it
recur live:** a full, non-streamed, blocking call to Anthropic for a
detailed 9-section write-up plus 10-dimension scorecard on a genuinely
long transcript can take longer than this route's `maxDuration` (60s) to
generate — and when Vercel kills a function mid-generation, the client
gets no HTTP response at all, just a dropped connection. Different
browsers report that dropped connection in confusingly different-looking
ways depending on *where* the client-side code was when it got cut off:
sometimes the familiar "Load failed"/"Failed to fetch", but if the
platform's own non-JSON timeout page reaches the client instead and
`res.json()` tries to parse it, Safari specifically throws a raw
`SyntaxError: The string did not match the expected pattern.` — a
generic WebKit message shared by several unrelated failed-string-parsing
APIs, so it reads like nonsense with zero context, but it's the same
underlying cause: the function got killed and the client is looking at
garbage instead of JSON. Raising `max_tokens` from 3000 to 8000 (to fix
the earlier blank-result theory) made this *more* likely, not less — a
detailed write-up that actually uses close to 8000 tokens takes
meaningfully longer to generate than one capped at 3000, pushing more
requests past the 60s ceiling instead of fewer.

The real fix is streaming. `route.ts` now uses
`anthropic.messages.stream()` instead of a single blocking
`messages.create()` call, accumulating text as it arrives, racing it
against a 48-second soft deadline (well under the 60s hard ceiling, with
buffer left for the Supabase save and response serialization). If the
soft deadline hits, the stream is aborted and whatever text has already
streamed in is used as the result — real, substantive content, just
possibly missing the last section — with a plain note appended
explaining it may be cut short and suggesting a re-rate. This guarantees
the function always returns a valid JSON response before Vercel's hard
kill, which is the thing that actually eliminates both the "Load failed"
and the cryptic Safari `SyntaxError` failure modes: there's no longer a
code path where the platform kills the function with nothing sent back
at all. The old attempt-loop retry (re-sending identical input and
hoping for a different, non-blank result) is gone along with it — it
never addressed a *slow* generation, only a spuriously blank one, and
added its own risk of compounding two long requests back to back.

**That streaming rewrite shipped with its own bug, and it reproduced the
identical failure** — worth recording since it's a genuinely easy trap.
`stream.done()` rejects if the stream errors or gets aborted, and the
deadline branch calls `stream.abort()` on whichever side of
`Promise.race()` *didn't* win. `Promise.race` doesn't attach a rejection
handler to the side it discards — so once that abandoned `stream.done()`
promise later rejected (as a direct result of the `abort()` call one line
below it), it became a genuinely unhandled promise rejection in the
middle of an in-flight request. An unhandled rejection can tear down a
serverless function before its response is sent, which is exactly the
same "killed mid-request, client gets garbage instead of JSON" failure
the whole rewrite was meant to fix — so the fix looked like it did
nothing. The actual fix: attach `.then(() => false, () => false)` to
`stream.done()` immediately at creation, before racing it against
anything, so both outcomes (finishes normally, or rejects because of the
abort this same code path triggers) are handled at the source regardless
of which side of the race is the one that mattered.

**With that fixed, a new but different failure showed up**: a clean,
real error response instead of a dropped connection — genuine progress —
but reading `The assistant couldn't produce a rating for this transcript
(reason: deadline)`. That means zero characters streamed back in the
entire deadline window, which is a distinct case from "ran out of time
partway through a real write-up" (that path already has usable partial
content and doesn't need a retry). Getting literally nothing back reads
more like a transient hiccup (a momentary connection blip, brief model
overload) than "this call is genuinely too long," so it's worth exactly
one automatic retry rather than failing outright. `route.ts`'s `attempt()`
now takes an explicit deadline and reports whether the stream ever fired
its `connect` event; the route tracks total elapsed time against a 54s
hard budget (leaving 6s for the Supabase save and response
serialization), and if the first attempt comes back with zero characters
*and* more than 15 seconds of budget remain, it retries once with
whatever's left. If it's still empty after that, the error message now
also says whether the stream ever connected at all, which narrows down
"never reached Anthropic" vs. "connected but produced nothing" for next
time. Every attempt (and the retry, if one happens) logs to Vercel's
function logs regardless of outcome, so a recurrence is diagnosable from
there instead of another round of guessing from a client-side screenshot.

As defense in depth on the client side, `RatingJobsProvider.tsx` also no
longer calls `res.json()` directly — it reads the response as text first
and parses it explicitly, so *any* non-JSON response (this cause or a
genuinely new one down the line) surfaces a clear, readable error message
instead of whatever native exception happens to bubble up from a failed
parse.

**Even with all of the above fixed, a genuinely rich, long call (deep
into a 30+ minute transcript) could still legitimately need more
generation time than fits — confirmed this is a Hobby-tier Vercel
project, which hard-caps every function at 60 seconds with no override,
so raising `maxDuration` past that isn't an option here.** The only real
lever left is making the model say the same substantive thing in fewer
tokens, since fewer output tokens directly means less generation
wall-clock time. Each rubric (`lib/*-call-rating-prompt.txt`) now has a
"Keep It Concise" instruction targeting roughly 700-900 words total
across all 9 sections plus the scorecard — 2-3 sentences per bullet, no
restating the transcript, no repeating the same point differently.
Concise is meant as "economical with words," not "shallower judgment" —
every section still has to carry real, evidence-based content. `max_tokens`
in `route.ts` also came down from 8000 to 4000 (generous headroom above
the ~900-word target, not the thing actually doing the work of keeping
this fast). The streaming + soft-deadline + zero-byte-retry machinery
from the fixes above all stay as the safety net for whatever residual
tail case still runs long, but the goal is for that path to stop being
the common case.

### Score calibration: anchoring the number, not just the write-up

A side-by-side comparison against ChatGPT rating the identical
transcript surfaced a real gap: ChatGPT scored it an 8, this rated it a
6, and the rep's own read of the call (they were on it) was that it was
genuinely good. The rubrics never gave the model an actual anchor for
what a given number means — "score the call out of 10" with no scale —
so a rigorous, honesty-focused rubric (explicitly told to hunt for real
weaknesses and not overrate pleasant-but-unproven candidates) had every
incentive to dock points for legitimate, specific critiques without
anything stopping those from dragging an otherwise strong call down into
"average" territory. Each rubric now has a **Score Calibration** block
right under the score request, with explicit 9-10 / 7-8 / 5-6 / 3-4 / 1-2
bands and a direct instruction: a call with genuine rapport, real
candidate openness, and natural forward momentum belongs in the 7-8
range even with a few specific things to sharpen next time — 5-6 and
below is reserved for calls with actual structural gaps (multiple
diagnostic goals untouched, weak connection, no real pressure-testing at
all), not just normal room for polish. The goal is a score that still
tells the truth about weaknesses in the write-up, without an unanchored
number quietly punishing a good call for not being flawless.

The Role-Play / Rate a Call toggle-pill row on the Assistant page used to
scroll away with the rest of the chat — once a Role-Play conversation got
long, switching to Rate a Call meant scrolling all the way back to the top
first. The tab bar (`.tab-bar` in `app/globals.css`) is now a plain,
non-scrolling sibling of `<main className="page-main">`, rendered between
`PageHeader` and `<main>` — the same layout position the header itself
already occupies. `page-main` gets `!pt-0` on this page since the tab bar
now supplies its own top padding.

**The actual root cause of "can't scroll" (app-wide, not just this page):**
`.app-shell` used `min-h-dvh` (a *minimum* height) instead of a fixed
`h-dvh`. `page-main` below it is `flex-1 overflow-y-auto`, which only
becomes a genuinely scrollable region if its flex parent is height-bounded
— with only a minimum height, `app-shell` just grows to fit however tall
its content gets, so `page-main` never actually clips its content and
`overflow-y-auto` never engages. Confirmed by rendering the exact layout
in a headless browser and comparing `scrollHeight` vs `clientHeight`:
under `min-h-dvh`, `page-main`'s `clientHeight` always equals its
`scrollHeight` (nothing to scroll internally) and the whole *document*
scrolls instead. That fallback happens to work in an ordinary browser tab,
but not reliably in iOS's standalone/"Add to Home Screen" display mode
(`display: "standalone"` in `app/manifest.ts`), which is how this app is
normally used — standalone mode doesn't give the same free rubber-band
document scroll a Safari tab does, so anything relying on it can appear
to not scroll at all, or only sometimes. Changing `.app-shell` to `h-dvh`
(a fixed height) makes flexbox actually bound `page-main`, so its own
`overflow-y-auto` becomes the real, working scroll container on every
page — re-running the same headless comparison after the fix shows
`page-main`'s `scrollHeight` exceeding its `clientHeight` and wheel/touch
scrolling correctly moving its `scrollTop`.

Two more scroll hardening passes on top of that fix, since it wasn't
enough on its own for content that appears *after* the initial page load
(tapping a rating open):
- `page-main` now also sets `-webkit-overflow-scrolling: touch`, the
  standard hint for momentum/inertial touch scrolling to actually engage
  on a nested `overflow-y: auto` element in iOS WebKit.
- A rating's expanded write-up (in both `CallRatingPanel.tsx`'s "Your
  Ratings" and the Team page's "Call Ratings" folder) was given its own
  bounded, independently-scrollable box (`.expand-scroll`: `max-h-80
  overflow-y-auto` plus the same touch-scrolling hint) instead of being a
  plain `<p>` that grows `page-main`'s total height - the idea being that
  some mobile browsers don't reliably notice a scroll container's content
  grew after a React state update until something else forces a reflow.

  **This turned out to be wrong, and to be the exact same bug all over
  again at a smaller scale.** A rep reported a long rating's write-up
  visibly "cutting off" with no way to read the rest - `.expand-scroll`'s
  own nested `overflow-y-auto`, sitting *inside* `page-main`'s
  `overflow-y-auto`, hit precisely the nested-scroll-region hazard
  described above: iOS doesn't reliably recognize the inner region as its
  own independently-scrollable target, especially when it's short enough
  that a scroll gesture reads as ambiguous between "scroll me" and "scroll
  my parent." The fix is to remove the nested scroll box entirely -
  `.expand-scroll` is gone, and the expanded analysis is now a plain `<p>`
  that just grows `page-main`'s height, the same container already proven
  to scroll reliably by the `h-dvh` fix above. One scroll region for the
  whole page, not two independent ones fighting over the same touch
  gesture.

`CallRatingPanel.tsx`'s save step used to silently swallow a failed
`call_ratings` insert — if that table (or a column/constraint on it)
didn't exist yet in a given Supabase project, the rating would still
"work" from the user's point of view (Claude scored it, the form cleared),
but nothing was actually saved, and no error appeared anywhere. Now the
insert's `error` is checked and thrown, which surfaces as "Rated it, but
couldn't save it: ..." with the real Postgres error, and the form no
longer clears on that path so the transcript isn't lost. If you ever see
that message, it means `supabase/schema.sql`'s `call_ratings` section
(table + `candidate_id` column + widened `call_type` check + RLS) hasn't
fully been run against that database yet.

The **Assistant** tab now has a second panel, **Rate a Call**, alongside
the Role-Play Coach. A rep pastes the text transcript of a recorded
meeting and gets it scored against that stage's vetting rubric — overall
score, what the call did well/weakened, a candidate scorecard, yellow
flags, sharper follow-up questions, and a blunt verdict. This is a single
one-shot API call, not a multi-turn conversation — it's a separate route
(`app/api/assistant/rate-call/route.ts`) from the Role-Play Coach.

**Five meeting types are supported: QI1, QI2, FU1, FU2, and
Questionnaire** — each with its own system prompt
(`lib/qi1-call-rating-prompt.txt`, `qi2-...`, `fu1-...`, `fu2-...`,
`questionnaire-...`), loaded with prompt caching (`cache_control:
ephemeral`) since each one's rubric text is fixed and identical across
every request for that type. The **Meeting Type** dropdown on the form has
no default — the rep must pick one before the "Rate This Call" button
enables, since each stage covers different ground and grading a QI2 call
against QI1 criteria (or vice versa) would be wrong. `CALL_RATING_TYPES` in
`lib/constants.ts` is the single source of truth for the five valid types,
shared by the UI dropdown, the API route's validation, and the
`call_ratings.call_type` check constraint in `supabase/schema.sql`.

Each rubric reflects what that call is actually supposed to cover in this
process (see the "Process Context" section repeated near the top of every
rubric file):
- **QI1** — diagnostic/trust-building only; not meant to explain the
  business or go deep on compensation.
- **QI2** — book review + macro business run-through, building the context
  needed before the Webinar.
- **FU1** — confirming what landed from the Webinar/audios and locking in
  specific commitments (PV, habits, expectations).
- **FU2** — the full compensation-plan walkthrough, tied back to the
  candidate's own financial goals.
- **Questionnaire** — the 18-part questionnaire review right before the
  Final call; mostly listening/extracting rather than teaching, since the
  candidate should already understand the business by this point.

**Calibration:** none of the rubrics treat talk time or explaining as an
automatic weakness — a prospect usually doesn't know what's going on yet,
and QI2/FU2 in particular are supposed to be explanation-heavy. Each
rubric's "3. What weakened the call" section only flags teaching/talking
when it comes at the expense of connection or a missed diagnostic
question — except the Questionnaire rubric, which calibrates the other
way: by that stage the candidate should already understand the business,
so heavy re-teaching there is treated as a bigger red flag than earlier in
the process, since it suggests something didn't land before.

Recorded meetings themselves aren't accepted — only pasted/typed
transcripts. Claude can't process raw audio/video, so audio input would
require adding a separate transcription service (e.g. Whisper), a new API
key, and per-minute transcription cost/storage — out of scope for now.
Transcripts are capped at 60,000 characters (roughly a 45+ minute call with
headroom) to keep any single request bounded. Cost is dominated by the
transcript's length rather than the (cached) rubric — a typical 15–45
minute call transcript runs roughly 1–3 cents per rating at current Claude
Sonnet 5 pricing, versus a fraction of a cent for a normal Role-Play Coach
message.

Ratings are stored per-rep in the `call_ratings` table (transcript,
full write-up, and a parsed `overall_score`) with the same RLS as
`assistant_messages` — a rep sees their own ratings under **Your Ratings**
on the Rate a Call tab, and their upline (any level) or an admin sees the
same list as a **Call Ratings** folder on that rep's page under the
**Team** tab, so an upline can see how their downline's calls (across every
stage) are trending without asking for a screen-share.

Both of those lists are grouped into a heading per meeting type (QI1, QI2,
FU1, FU2, Questionnaire — in that process order, not alphabetical or
by-recency) via `groupCallRatingsByType()` in `lib/call-ratings.ts`, with
an "avg X.X/10" pill next to any type that has more than one scored
rating. The point is spotting a stage-specific pattern (e.g. this rep's
FU2 calls are consistently weak) at a glance instead of it getting lost in
one mixed, chronological feed. A type with zero ratings yet is omitted
rather than shown as an empty section.

**Cross-meeting memory:** the "Candidate name" field is a dropdown of the
rep's own `candidates` (Candidate Roadmap) rows, with a fallback text
input for someone not added there yet. Picking a candidate links the
rating via `call_ratings.candidate_id`. When rating a call for a linked
candidate, the app pulls that candidate's rep notes plus their last 3
prior ratings (any call type) and passes them to Claude as context ahead
of the new transcript — so a QI2 or FU1 rating for a candidate who already
has a QI1 on file is judged with the model already "remembering" what came
up before, not from a blank slate every time. This context is built
client-side from the rep's own rows (respecting the same RLS as
everything else) and sent to the API route per-request; it isn't stored
separately, since it's cheap to regenerate from `call_ratings` and
`candidates` each time. Prior analyses are capped at 3,000 characters each
in this context to keep cost bounded for a candidate who's been rated many
times.

### Rating a call now runs in the background, independent of the page

Rate a Call used to run entirely inside `CallRatingPanel`'s own local
state — tapping "Rate This Call" kicked off an async flow (session
refresh, the Anthropic call, the Supabase save) that lived and died with
that component. Since Next.js unmounts a page's components on client-side
navigation, switching to any other tab while a rating was in flight threw
the whole thing away mid-request — a detailed call can legitimately take
up to a minute, and leaving the Assistant page during that minute (to
check Pipeline, answer a text, anything) silently killed a rating that
otherwise would have completed successfully.

The fix: `components/RatingJobsProvider.tsx` is a new context provider
mounted once in `AuthGate.tsx`, inside the authenticated tree but wrapping
`{children}` and `BottomNav` together — so unlike a page's own components,
it never unmounts on navigation, only on sign-out or closing the tab.
`submitRating()` hands the whole rating flow (the fetch to
`/api/assistant/rate-call`, then the `call_ratings` insert, plus the same
network-failure retry and a 90s timeout the old code had) off to this
provider and returns immediately — the rep can leave the page right away
and the job keeps running regardless of what's on screen.

Two pieces of feedback come out of this: a small global banner
(`RatingJobsBanner`, fixed just above the bottom nav on every page) shows
"Rating X's call in the background…" while it runs and a brief "✅ Rated…"
or "⚠️ Couldn't rate…" for a few seconds once it lands, dismissible early
with a tap; and if the rep is still on the Assistant page when it
finishes, `CallRatingPanel` picks up the same job (tracked by id in
`myJobIds`) and updates **Your Ratings** in place, same as before. If
they've navigated away by the time it completes, the result is already
saved to `call_ratings` by the time they come back, so History just shows
it fresh on next load — no separate relay needed for that case. The old
per-page progress bar (`.progress-track`/`.progress-fill` in
`app/globals.css`) is gone along with the local `rating` boolean it was
tied to, replaced by the global banner plus a small inline "still
analyzing" line scoped to jobs this panel itself submitted.

### App-wide audit: silent write failures

A full pass looked for the same bug class already found and fixed in Rate
a Call, Add Contact, and the Team Events album/photo uploads earlier:
code that fires off a Supabase insert/update/upsert, destructures only
`{ data }` (or nothing at all) without checking `error`, and then
unconditionally clears the input / keeps an optimistic local update as if
it had succeeded — so a failed save looks identical to a successful one,
with no error shown and (for optimistic updates) the UI now silently
disagreeing with the database. This turned out to be a pattern used
throughout the app rather than a one-off, and it was fixed the same way
everywhere it was found:

- **Pipeline Tracker** — `addCandidate`, the +/- stage counters
  (`updateStage`), and candidate step/status changes (`updateCandidate`)
  now check `error`, surface it, and revert the optimistic value (the
  counters and step changes) rather than leaving a count or step that was
  never actually saved.
- **Volume** — Personal Circle PV (`savePv`), Day 1 Ditto (`saveDitto`),
  and Customer Sales (`addSale`) all now surface a save error instead of
  showing "Saved." (or clearing the sale form) regardless of outcome.
- **Team Events** — creating an album (`createAlbum`) no longer clears the
  title field on a failed insert.
- **Assistant** — if saving the user's own message fails, the input text
  is restored and the assistant API is never called with stale/incomplete
  context (previously it would silently proceed using only the prior
  messages, so the reply wouldn't reflect what was just typed). If saving
  the assistant's reply fails after a successful API call, the reply is
  still shown in the conversation (the API call already happened and cost
  something) with a note that it couldn't be saved to history.
- **Calendar** — adding a personal event or a recurring team event
  (`addEvent`, `addCompanyEvent`) now surfaces insert/RPC errors instead
  of clearing the form regardless.
- **Goals** — saving a target on blur (`setTarget`) now surfaces an error
  instead of silently not persisting a typed number.
- **Core Run Streak** — `saveToday` (every checkbox, counter, and text
  field on the page funnels through this) now surfaces a save error
  instead of leaving an optimistic checkmark that was never actually
  written — this is the single highest-traffic write in the app, so this
  was the most consequential instance of the bug.
- **Onboarding** — the Session 4 "I've read the chapters" checkbox now
  reverts and shows an error on a failed save, instead of showing
  "confirmed" for a requirement that never actually saved.
- **Contact Builder / Candidate History** — `updateContact` and the
  History page's `updateCandidate` now revert their optimistic update and
  surface an error on failure.

Left alone deliberately: the Leaderboard's like button and the mini-games'
high-score/trivia-result saves. Both are optimistic, low-stakes,
easily-retried actions with no real consequence if a save is silently
missed, unlike the business data above.

The Notifications page's **Turn On** button had the exact same bug: its
`turnOn()` handler wrapped the subscribe attempt in `try { ... } finally`
with no `catch`, so a thrown error (or a missing `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
config, which used to just return `false` indistinguishably from "permission
not granted") reset the button back to normal with zero indication
anything failed - tapping it looked like it did nothing. `subscribe()` now
throws a descriptive error for a real config problem instead of silently
returning `false`, and `turnOn()` catches and surfaces it under the button.

That fix immediately surfaced a real, previously-invisible config bug:
`The string contains invalid characters` — the raw browser error `atob()`
throws for a `NEXT_PUBLIC_VAPID_PUBLIC_KEY` that isn't valid base64.
The near-certain cause is a stray trailing space/newline or wrapping
quotes left over from pasting the key into Vercel's environment variable
UI — both `components/NotificationOptIn.tsx` (client-side subscribe) and
`lib/webpush.ts` (server-side send, same risk for `VAPID_PRIVATE_KEY`)
now trim whitespace and strip a matching pair of wrapping quotes off
these three env vars before using them, instead of failing on either. If
the error still appears after this deploys, the key's actual *value* in
Vercel is wrong (not just whitespace) and needs re-pasting in full.

### LTD Messaging link on Core Run Streak

Right under **Copy Daily Update**, once the summary's been copied, a
second button appears: **Open LTD Messaging to paste it**, linking to
`https://apps.apple.com/app/id1633405330` (`LTD_MESSAGING_APP_URL` in
`app/streak/page.tsx`). LTD Messaging is a private team app with no
public custom URL scheme or universal link documented anywhere, so this
intentionally does **not** attempt to guess one and silently fail the
same way the Turn On button above used to - it opens the app's real App
Store listing instead, which shows an **Open** button there (one extra
tap) if it's already installed, or **Get** if it isn't. If LTD ever
publishes a real deep-link scheme, swapping this for a true one-tap
handoff is a one-line change.

### UX friction audit

A pass looking for concrete tedium — redundant taps, buried actions,
dead-end flows — rather than bugs, aimed squarely at making this feel
less like a chore and more like something reps actually want to open:

- **Tap-to-edit on every stage/streak counter.** The Pipeline Tracker's
  per-stage counts and the Core Run Streak's Questions/Yeses/Story Shares
  counters were `+`/`−` only — catching up on 15 Yeses from a live event
  meant 15 separate taps. The number itself is now tappable and opens a
  plain numeric entry (`StageCount` in `app/pipeline/page.tsx`, the
  existing shared `Counter` in `app/streak/page.tsx`), while the +/−
  buttons stay for quick single adjustments.
- **Pipeline Tracker split into Tally / Candidate Roadmap tabs.** These
  used to be one long page — the per-stage tally (what most people check
  many times a day) and the heavier candidate-management UI (notes,
  connected dates, launch/filter buttons) stacked on top of each other in
  a single scroll, competing for the same space. An earlier pass tried
  moving Candidate Roadmap above the tally since Add Candidate is likely
  the single most common action on the page, but that just flipped which
  one was buried — the actual fix was giving them separate tabs, the same
  pill-tab pattern already used on Assistant (Role-Play/Rate a Call) and
  Games. **Tally** (period toggle, Filling In For, conversion %, the
  per-stage counters, Trend chart) is the default tab, so the numbers you
  check constantly are visible with zero scrolling and no longer share
  space with the roadmap at all; **Candidate Roadmap** (active-pipeline
  summary, Add Candidate, candidate list) is one tap away.
- **Search now finds your actual people, not just app content.**
  `app/search/page.tsx` used to only search static content — page names,
  Scripts & FAQ, Products, Leaders. Typing a name now also runs a
  debounced (250ms) `ilike` query against your own `candidates` and
  `contacts` tables and surfaces real matches (with their current step
  or list/status as the snippet) alongside the static results, so
  "where's Chris" actually finds Chris instead of nothing.

One deliberate non-fix: **Read/Listen/Story Share on the Core Run Streak
dashboard card look like they could be quick-toggled directly from
Today**, but they're not raw booleans — `read` is genuinely derived from
whether `read_amount` is filled in, `listen` from `listen_count > 0`,
`story_share` from `story_shares > 0 || questions > 0` (some people log a
conversation under Questions instead of Story Shares even though it was
really the same "shared your story" moment — either one satisfies it,
not Story Shares specifically). Adding a bare toggle for any of
these on the dashboard would create a real inconsistency (a checked box
with no actual reading/listening/sharing behind it, silently reverted the
next time `/streak` recomputes it from the underlying fields) — so this
stays a "go fill in the details" link rather than a shortcut. Only
`daily_update` is a plain boolean, and wasn't worth a special case on its
own.

### More tab merges: Candidate History into Pipeline Tracker

Liked the Assistant/Games pill-tab pattern enough to look for more places
it fit. **Candidate History** was the clearest case — it's the exact same
`candidates` table the Pipeline Tracker's Candidate Roadmap tab already
shows, just a month-by-month historical lens instead of an active/launched
one. It's now a third tab on Pipeline Tracker (**Tally / Candidate
Roadmap / History**) instead of a separate destination behind More, and
reuses the same `candidates` state already loaded for Roadmap (no
duplicate query) and the same `updateCandidate` (Restore button included).
`app/history/page.tsx` is gone; the "Filling In For" guard message
(History is your own candidates, not the downline member's whose numbers
you're filling in) got the same treatment the Roadmap tab already had.
Removed from `app/more/page.tsx`, `components/BottomNav.tsx`'s
`MORE_ROUTES`, and `lib/onboarding-gate.ts`; `lib/search-data.ts`'s
"Candidate History" shortcut now points at `/pipeline`.

### Leaderboard: tab split tried and reverted, collapsible sections instead

First attempt split the page into Pipeline/Recognition tabs along a real
data fault line (only Team Leaders, Individual Leaders, QI1 Rhythm, Core
300, and Day 1 Ditto actually depend on the Daily/Weekly/Monthly toggle;
Milestone Alerts, Today's Sales, Core Run Streaks, Active Candidates, and
Diamond Run High Scores are all period-independent RPCs that used to sit
under a toggle that did nothing to them) — but the tab split itself
didn't land well in practice, so that got reverted.

The actual fix: every section (`Section` in `app/leaderboard/page.tsx`)
is now collapsible — a tap on the title toggles it open/closed, with a
`▸`/`▾` chevron showing which way it'll go. **Team Leaders** and
**Individual Leaders** default open (the two sections the page's whole
purpose is built around); the other eight — New to the Team, Milestone
Alerts, Today's Sales, QI1 Rhythm, Core Run Streaks, 5+ Active
Candidates, Diamond Run High Scores, Core 300, and Day 1 Ditto — default
closed, collapsing down to just a title bar until tapped open. This
shortens the default scroll to roughly a fifth of its previous length
without asking anyone to learn a new tab-based mental model, and every
section is still there, one tap away, exactly where it always was.

### Leaderboard: grouped section headings, lighter defaults

Grew to eleven sections over time with no structure beyond "one long
stack, in whatever order they were added" — easy to lose track of
what's where. Added five plain-text group headings (`GroupHeading` in
`app/leaderboard/page.tsx`, not collapsible, not a card - just a
scan-friendly divider) so the page now reads as labeled clusters
instead of one undifferentiated scroll:

- **Team Activity** — New to the Team, Milestone Alerts, Today's
  Sales (only shown if at least one of the three has anything to show)
- **Leaders** — Team Leaders, Individual Leaders, QI1 Rhythm
- **Consistency & Pipeline** — Core Run Streaks, 5+ Active Candidates
- **Volume** (monthly only) — Core 300, Day 1 Ditto 100+

A Games group (Diamond Run High Scores) briefly existed at the very
end here too, matching the same "games count for less than real
business activity" ordering established for badge points — removed
again right after, per direct feedback that this page specifically
should stay about business activity. `get_game_leaderboard` and the
Games tab itself are untouched; only this one Leaderboard section is
gone (along with its now-dead `gameLeaders` state, fetch effect, and
`gameEntryKey` helper).

**Individual Leaders no longer defaults open** — it's the single
densest section on the page (per-category ties each get their own
stacked avatar row now), so between it and Team Leaders both being
open by default, that pairing alone was most of what made the page
feel cluttered on first load. Team Leaders (compact, one line per
category) still defaults open.

Deliberately left alone per explicit direction: the repeated
`(TEAM NAME)` tag on nearly every row looks redundant right now only
because the whole team is still testing the app pre-launch under a
single team - once other teams are on it, that repetition is exactly
the information that tells rows apart, so it wasn't touched.

### Pipeline Tracker Tally: browsing past days/weeks/months

The Tally tab used to only ever show the current day/week/month — no way
to check "how many Yeses did I get last week" without it already having
scrolled off. It now has the same `‹`/`›` offset-based navigator already
used on the Team tab's Teams view and Leaderboard's monthly nav
(`periodOffset` in `app/pipeline/page.tsx`, 0 = current, disabled going
into the future, resets to 0 whenever Daily/Weekly/Monthly is switched
since the three offsets aren't comparable to each other).

One deliberate behavior difference from just adding an offset to the
existing load: browsing back to a period that was never logged does
**not** silently insert an empty row into `pipeline_periods` just from
viewing it — only the *current* period still auto-creates on load (the
original "just start tallying today" convenience). A past period with
nothing logged renders as a client-only zeroed "draft" (`id: ""`); editing
one of its counters for the first time inserts the real row at that point
(`updateStage` in `app/pipeline/page.tsx` branches on `period.id` being
empty), so scrolling back through history to look at old numbers can't
leave a trail of empty rows behind it.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com) v4 (navy `#0f172a` / amber `#f59e0b` theme)
- [Supabase](https://supabase.com) (Postgres + Auth + client SDK, no server API layer needed)
