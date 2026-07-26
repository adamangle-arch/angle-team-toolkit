# Angle Team Toolkit

A mobile-friendly activity tracker for a network marketing team, built with
Next.js (App Router) and Supabase. Tabs for each part of the day-to-day
workflow: Pipeline Tracker (which also holds the active Candidate Roadmap),
a separate Candidate History tab, Contacts, Core Run Streak, Volume, a
Leaderboard, a Role-Play Coach for practicing A-list/B-list/C-list
conversations, and a Resources hub (Products, Scripts & FAQ, Process Guide,
Leaders, Acquisition, Audio & Book Library). Everyone signs in with their own
email/password account, picks their team on first login, and each person's
individual data is private to them. Tapping a name anywhere on the
Leaderboard opens that person's public profile (photo, hometown,
background, favorite audios/books, and how the team has impacted them) —
see "Public profiles" below. All data is stored in Supabase (Postgres), so
it persists across sessions and devices.

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
5+ Active Candidates section uses.

Each candidate also has a **Connected** date (defaults to today when
added, editable anytime). Marking a candidate "Filtered Out" removes them
from the active roadmap board immediately — they're not deleted from the
database, just hidden from the working list. Every candidate you've ever
added (active, launched, or filtered out, and exactly which step they
filtered out at) lives on its own **Candidate History** tab, ordered by
connected date, with a Restore option for anything settled by mistake.

**Upgrading an existing project:** the roadmap steps shifted by one
position to make room for the new "Yes" step at index 0 — run this once
(not part of the reusable schema.sql patches) so existing candidates keep
pointing at the same step they were actually on:
```sql
update candidates set current_step = current_step + 1;
```

Personal Circle PV lives on its own **Volume** tab: each person self-reports
their own current-month PV there (stored in the additive `monthly_pv`
table, same owner-or-primary-user RLS pattern as everything else), with
their last 6 months shown underneath for reference. Anyone at 300+ PV for
the month shows up in the Leaderboard's **Core 300** ranking, visible to
everyone and sorted by PV.

The Volume tab also has a **Day 1 Ditto** field (`day1_ditto_pv` on the same
`monthly_pv` row) — anyone over 100 PV there shows up in the Leaderboard's
**Day 1 Ditto 100+** ranking — and a **Customer Sales** log (`customer_sales`
table) where people can jot down customer sales and notes for the month.
The sales log isn't scored or shown anywhere else; it's just a personal
running record.

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

- **Read** — what you're reading, and how much today (free text, e.g. "20 pages")
- **Listen** — add each audio you listened to today one at a time (type
  a name, hit Add or Enter), with a ✕ to remove any of them — instead of
  cramming them all into one text field. `listen_what`/`listen_count`
  are still derived from the list (joined text / item count) so nothing
  downstream (public profile, Daily Update summary) needed to change
- **Today's Activity** — counters for Story Shares, Questions, Yeses, and Meetings

The 4 boolean flags that actually determine your streak are unchanged
and still the only thing `qualifies()` looks at — they're just now set
automatically from the detail fields (read counts once you type an
amount, listen/story share count once their counter is above 0) instead
of being separate manual toggles. This was a deliberate choice so adding
these fields couldn't retroactively break anyone's existing streak
history; `daily_update` stays a plain manual toggle either way.

### Daily Update summary (copy/paste for LTD)

The bottom of the Core Run Streak page has a **Daily Update Summary**
card: a read-only, pre-formatted block of text built from today's Read/
Listen/activity detail, meeting details, any new contacts added to your
A/B list today (name + category, pulled from `contacts.created_at`
falling on today), your current streak, this week's and this month's
pipeline numbers, your current PV, and a list of everyone currently
active in your Candidate Roadmap — pulled the same way the Pipeline
Tracker defines "active" (not yet launched, not filtered out). Each
active candidate shows their next real process milestone (QI1, QI2,
IS1, FU1, IS2, FU2, or Offer Call) rather than their raw roadmap step,
so the two internal "Audio & Reading" homework steps roll forward to
the info session they're prepping for (`CANDIDATE_STEP_SHORT_LABELS` in
`lib/constants.ts`) instead of showing as "Audio & Reading". Meetings and
new contacts show real detail rather than a bare count: **Meetings** is
now an add-one-at-a-time list (same pattern as Listen — type who/what,
hit Add, ✕ to remove), stored in `meeting_items text[]`, and each new
contact's line includes their status (and notes, if any), not just
name/category. Meant to be copied straight into your nightly LTD update
to your upline. Tap **Copy Daily Update** to copy it, or select the text
manually from the box. It regenerates live as you fill in today's Core
Run Streak fields, so fill those in first.

### New to the Team spotlight

The Leaderboard now has a **🎉 New to the Team** card listing anyone who
completed their profile (name + team) in the last 14 days, newest first,
linking to their profile — visible to everyone, not just admin/upline.
It's backed by `get_new_members(days)`, and just quietly disappears once
nobody's joined recently (no "no new members" clutter).

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

This is deliberately not automatic (e.g. not tied to completing a
checklist) — it's an explicit "I'm confirming this person is ready for
the next session" action by their upline, backed by
`profiles.onboarding_unlocked_through` (defaults to 1, incremented one at
a time, same authorization check as account deletion: upline-of or
admin).

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

### Daily Reminders (push notifications)

Anyone can turn on a push notification (from the Core Run Streak page)
that fires once in the evening if they haven't logged that day's Core Run
yet. A few things worth knowing:

- **iPhone requires "Add to Home Screen" first** — this is a hard Safari
  rule, not something the app can work around. If someone opens the app
  in a regular Safari tab, they'll see instructions instead of an Enable
  button; once they've added it to their Home Screen and reopened it from
  there, the Enable button appears.
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
than answer. Every message calls Anthropic's Claude API (model set in
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

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com) v4 (navy `#0f172a` / amber `#f59e0b` theme)
- [Supabase](https://supabase.com) (Postgres + Auth + client SDK, no server API layer needed)
