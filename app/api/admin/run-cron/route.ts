import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPrimaryUser } from "@/lib/constants";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

// Every one of these normally only ever runs when Vercel's own cron
// scheduler (or, for calendar reminders, the external Supabase pg_cron
// job) hits it with the real CRON_SECRET header - there was previously no
// way to fire one on demand short of curl and a copy-pasted secret. This
// route does exactly that server-side (it already has CRON_SECRET in its
// own environment) so an admin can isolate "does the route's own logic
// work" from "is the thing that's supposed to trigger it actually wired
// up" - the second half is invisible from inside this app either way and
// has to be checked in the Vercel/Supabase dashboards directly.
const ALLOWED_PATHS = [
  "/api/push/send-reminders",
  "/api/push/send-stat-leaders",
  "/api/push/send-calendar-reminders",
  "/api/push/send-daily-nudges",
  "/api/push/send-engagement-filler",
] as const;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser(token);
  if (userError || !userData.user || !isPrimaryUser(userData.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const path = body.path;
  if (!path || !ALLOWED_PATHS.includes(path as (typeof ALLOWED_PATHS)[number])) {
    return NextResponse.json({ error: "Unknown cron path" }, { status: 400 });
  }
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set on this deployment - that alone would explain every scheduled push failing." },
      { status: 500 }
    );
  }

  const target = new URL(path, request.url);
  const response = await fetch(target, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({ error: "Non-JSON response" }));
  return NextResponse.json({ status: response.status, result });
}
