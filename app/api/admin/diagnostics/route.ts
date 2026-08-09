import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured } from "@/lib/webpush";
import { isPrimaryUser } from "@/lib/constants";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

// Self-serve answer to "why aren't notifications sending" - every piece
// that can silently break delivery (env vars only set in .env.local and
// never copied into the actual Vercel deployment, the calendar-reminder
// pg_cron job never having been run, or genuinely nothing having gone out
// in a while) previously required dashboard access this app doesn't have.
// Admin-only, gated the same way /api/notify's onboarding_unlocked case is.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser(token);
  if (userError || !userData.user || !isPrimaryUser(userData.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let vapidConfigured = true;
  try {
    ensureWebPushConfigured();
  } catch {
    vapidConfigured = false;
  }
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET);

  const admin = getSupabaseAdmin();
  const [{ count: subscriptionCount }, { data: recentNotifications }, { data: pgCronJobs }] =
    await Promise.all([
      admin.from("push_subscriptions").select("id", { count: "exact", head: true }),
      admin.rpc("get_recent_sent_notifications_admin", { p_limit: 25 }),
      admin.rpc("get_pg_cron_jobs"),
    ]);

  return NextResponse.json({
    vapidConfigured,
    cronSecretConfigured,
    subscriptionCount: subscriptionCount ?? 0,
    recentNotifications: recentNotifications ?? [],
    pgCronJobs: pgCronJobs ?? [],
  });
}
