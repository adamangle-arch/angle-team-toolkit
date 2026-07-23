# Angle Team Toolkit

A mobile-friendly activity tracker for a network marketing team, built with
Next.js (App Router) and Supabase. Eight tabs, one for each part of the
day-to-day workflow: Pipeline Tracker, Candidate Roadmap, First 30 Days
Checklist, A/B Contact List, Call Log, Self-Education Streak, Recognition Log,
and Goals. All data is stored in Supabase (Postgres), so it persists across
sessions and devices.

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open **SQL Editor > New query**, paste the
   contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it.
   This creates every table the app needs and seeds the First 30 Days
   checklist tasks.
3. Go to **Project Settings > API** and copy:
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

Open [http://localhost:3000](http://localhost:3000). It redirects to the
Pipeline Tracker tab.

## Deploying to Vercel

See the deployment steps the assistant gave you in chat, or in short:

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Add the two env vars above (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the Vercel project's
   **Settings > Environment Variables**.
4. Deploy.

## Notes on security

This app has no login screen — every visitor with the deployed URL can read
and write data using the Supabase `anon` key, which is intentionally public
(it's shipped to the browser). `supabase/schema.sql` enables Row Level
Security with a permissive "allow all" policy so the app works out of the
box. That's fine for a private team tool, but don't share the live URL
publicly. If you need real access control later, add
[Supabase Auth](https://supabase.com/docs/guides/auth) and tighten the RLS
policies in `supabase/schema.sql`.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com) v4 (navy `#0f172a` / amber `#f59e0b` theme)
- [Supabase](https://supabase.com) (Postgres + client SDK, no server API layer needed)
