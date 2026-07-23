# Angle Team Toolkit

A mobile-friendly activity tracker for a network marketing team, built with
Next.js (App Router) and Supabase. Six tabs, one for each part of the
day-to-day workflow: Pipeline Tracker, Candidate Roadmap, A/B Contact List,
Core Run Streak, Recognition Log, and Goals. Everyone signs in with their own
email/password account, and each person's data is private to them. All data
is stored in Supabase (Postgres), so it persists across sessions and devices.

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
   hardcoded to one email address — change it to whichever account should be
   able to see/manage everyone's data, then re-run the file.
5. Go to **Project Settings > API** and copy:
   - **Project URL**
   - **anon / public** key

## 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the two values from
Supabase:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

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
3. Add the two env vars above (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the Vercel project's
   **Settings > Environment Variables**.
4. Deploy.

## Notes on privacy & security

Every table has Row Level Security scoped to `user_id = auth.uid()`, so
signed-in users only ever see their own rows through the app — Pipeline,
Candidates, Contacts, Streak, Recognition, and Goals are all private per
person. The one exception is the admin email hardcoded in
`is_app_admin()` (see `supabase/schema.sql`): that account can additionally
read, update, or delete any row via direct Supabase access (e.g. the
dashboard's **Table Editor**, which always has full access regardless of
RLS since it runs as the project owner). New rows are always attributed to
whoever is actually logged in, admin included — there's no "post as someone
else."

By default Supabase requires email confirmation on signup; see step 2 above
if you want teammates to be able to log in immediately after creating an
account.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com) v4 (navy `#0f172a` / amber `#f59e0b` theme)
- [Supabase](https://supabase.com) (Postgres + Auth + client SDK, no server API layer needed)
