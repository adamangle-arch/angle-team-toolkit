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

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **Authentication > Sign In / Providers > Email** and turn **off**
   "Confirm email" (unless you want teammates to click an email link before
   their first login — off is simpler for a small internal team).
3. In the Supabase dashboard, open **SQL Editor > New query**, paste the
   contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it.
   This creates every table the app needs with per-user Row Level Security.
   **Re-running this file drops and recreates every app table**, so only run
   it again later if you're OK losing existing data.
4. Near the top of `supabase/schema.sql`, the `is_app_admin()` function is
   hardcoded to a list of email addresses — change it to whichever accounts
   should be able to see/manage everyone's data, then re-run the file.
5. Go to **Project Settings > API** and copy:
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
the top of the Candidate Roadmap section, and the same threshold
(`ACTIVE_PIPELINE_MIN_STEP` in `lib/constants.ts`) is what the Leaderboard's
5+ Active Candidates section uses. Tap the count itself to expand a quick
name + step summary of everyone it includes, without having to scroll
through the full editable candidate cards below to see who's where.

Each candidate also has a **Connected** date (defaults to today when
added, editable anytime). Marking a candidate "Filtered Out" removes them
from the active roadmap board immediately — they're not deleted from the
database, just hidden from the working list. Every candidate you've ever
added (active, launched, or filtered out, and exactly which step they
filtered out at) lives on its own **Candidate History** tab, with a
Restore option for anything settled by mistake.

Candidate History is divided by month (by `connected_date`), one month at
a time, with ← → arrows to page back up to 12 months — same bounded
pattern as the Leaderboard's monthly view (`getMonthStartOffset`), so
older history doesn't turn into one endless scrolling table.

**Upgrading an existing project:** the roadmap steps shifted by one
position to make room for the new "Yes" step at index 0 — run this once
(not part of the reusable schema.sql patches) so existing candidates keep
pointing at the same step they were actually on:
```sql
update candidates set current_step = current_step + 1;
```

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
(`adamangle@icloud.com`, `alexangle@me.com`) already have to everyone. The
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

Primary users (`adamangle@icloud.com`, `alexangle@me.com`) additionally see
everyone's `account_number` on the **Team** tab — next to each row in the
Members list, and again on a selected member's detail view — since
`profiles` RLS already lets an admin read every row, this is purely a
display addition (`isAdmin &&` guards, no schema change). Useful for
helping someone link up without needing to ask them to read their own
number off My Profile.

### Sponsorship tree views

The Team tab's toggle row has two more views alongside Members/Teams,
both visualizing the same `upline_id` chain as a nested, collapsible
tree (indented rather than a graphical side-scrolling org chart — a real
box-and-line chart doesn't fit a 448px-wide phone screen without
horizontal scrolling of its own, the exact thing this pass was trying to
get away from):

- **My Tree** (everyone) — your own downline, nested by who sponsored
  whom, with "you" as the root. For a non-admin this is a client-side
  reshape of the same `profiles` rows already fetched for the Members
  view (RLS already limits that query to self + downline), so no new
  query or SQL was needed. Empty for anyone who hasn't sponsored anyone
  yet.
- **Whole Team** (admin only) — literally everyone who's signed up,
  nested the same way, rooted at whoever has no upline at all (the
  founders). Only meaningful for an admin, since a non-admin's `profiles`
  rows never include anyone outside their own downline in the first
  place.

Both are built by `buildSponsorshipChildren()` in
`lib/sponsorship-tree.ts` (groups the flat `profiles` array by
`upline_id`, sorts each level alphabetically, recurses) and rendered by
`components/SponsorshipTree.tsx` — each node is tap-to-collapse (▾/▸) and
links straight to that person's `/profile/[id]`, with their named `team`
shown alongside and a count of direct reports. No new tables, columns, or
RPCs — this is purely a new way to look at data the app already had.

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

- **Read** — what you're reading (free text) plus a numeric Minutes
  Read counter (`read_minutes`) so a reading goal is a real trackable
  number, not just free text like "20 pages"
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

The "Trivia Unlocked" alert only ever fires while editing today — going
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

There's no way to build a real iOS Home Screen widget without a native
app (WidgetKit requires a Swift app extension, out of reach for a web
app installed via "Add to Home Screen"). Goals is the closest
substitute: it's the **landing page** (`app/page.tsx` redirects to
`/goals` instead of `/pipeline`), so opening the app puts today's goals
in front of you immediately, no navigating required.

### Calendar (meetings, reminders, team events)

A new **Calendar** tab (`app/calendar/page.tsx`) is one system for both
personal reminders and team-wide events, replacing the need for a
separate Google Calendar for team scheduling:

- **Personal use** — add anything with a title, date/time, optional
  notes, and an optional link to a candidate (e.g. "QI1 with Jane" at a
  specific time, or a reminder like "17, graduates this year — follow up
  after"). Shows under Upcoming, sorted soonest-first; recently-passed
  events stay visible below for a bit before you clean them up.
- **Broadcasting to your downline** — if you have anyone below you,
  an "Add to all downline" checkbox appears when adding an event. Check
  it for team meetings, info sessions, master classes, or conferences
  and every downline member (any level) gets their own copy on their
  own calendar, tagged "📢 From {your name}" so it's clear it came from
  upline. This calls a new `broadcast_event_to_downline()` function
  (security definer, same pattern as `delete_downline_account` and
  `grant_next_onboarding_session` elsewhere in this app) since normal
  RLS only allows inserting rows for yourself.
- **Upline visibility** — same access model as Core Run Streak and
  Assistant conversations: an upline (any level) or admin can read a
  downline's calendar even without a broadcast, so the Team tab's member
  detail view now shows a downline member's **Upcoming Calendar** card —
  this is how "when exactly QI1s are booked, and every other step of the
  process" becomes visible to upline without anyone having to share a
  separate calendar app.

A linked spouse is never treated as "downline" for this, even if their
account also technically satisfies the upline check (e.g. they entered
your account number as their own upline when they signed up) — their
data resolves to the same shared owner as your own, so counting them
separately would double-count your own numbers under their name. Both
the "Add to all downline" broadcast and the Daily Update summary's
Downline totals (Core Run Streak page) filter this out.

Data lives in a new `calendar_events` table, individual per person (not
shared with a linked spouse, same as Core Run Streak) — `user_id` is
whose calendar a row shows on, `creator_id` is who actually made it, so
a broadcast row can show who sent it even though it's now "owned" by
the recipient (they can delete their own copy without affecting anyone
else's).

**Team Events (recurring)** — an admin-only card at the top of the
Calendar tab for standing, company-wide events (Masterclasses, Summit,
Major Conferences, etc.) that are meant for literally everyone, not just
an admin's own downline. Unlike the broadcast checkbox above (a one-time
push to whoever is currently downline), adding a recurring event here:

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

Primary users (`adamangle@icloud.com`, `alexangle@me.com`) see every
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
| 1 (signup) | Today, Calendar, Leaderboard, Onboarding, Resources, My Profile, Search, More |
| 2 (List Building done) | + Contacts, Volume |
| 3 (Customers done) | *(nothing new)* |
| 4 (Sharing Your Story done) | + Pipeline, History |
| 5 (30-Day Core Run done) | + Run Streak, Goals, Team, Games, Assistant |

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
  device. Honor system: books, audios, and Amway/LTD materials only, no
  internet lookups. Playing is gated the same way as Diamond Run —
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
  - **Trivia Unlocked alert** — the moment your Core Run for the day
    flips from incomplete to complete, the Core Run Streak page
    (`app/streak/page.tsx`) shows a dismissible "🎉 Trivia Unlocked!"
    banner linking straight to `/games?tab=trivia`, and — if you've
    already granted notification permission via the Daily Reminders
    opt-in — fires a local `ServiceWorkerRegistration.showNotification()`
    call too (no server round-trip, reuses the same service worker
    registered for the existing push-reminder feature).

All three: plain HTML5 canvas (or plain DOM for Trivia), no game
library, and no anti-cheat on scores — same trust level as any other
self-reported number in this app.

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
  Ratings" and the Team page's "Call Ratings" folder) is now wrapped in a
  new `.expand-scroll` class (`max-h-80 overflow-y-auto` plus the same
  touch-scrolling hint) instead of just being a plain `<p>` that grows
  `page-main`'s total height. Some mobile browsers don't reliably notice
  that a scroll container's content grew after a React state update
  (tapping to expand) until some other interaction forces a reflow -
  giving the expanded text its own bounded, independently-scrollable box
  from the start sidesteps that entirely, since only its own internal
  scroll position needs to change, not the outer page's scroll range.

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
`story_share` from `story_shares > 0`. Adding a bare toggle for any of
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

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com) v4 (navy `#0f172a` / amber `#f59e0b` theme)
- [Supabase](https://supabase.com) (Postgres + Auth + client SDK, no server API layer needed)
