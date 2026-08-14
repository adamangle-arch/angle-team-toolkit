import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured, webpush, describePushError, isPermanentPushFailure } from "@/lib/webpush";
import { getDateOffset } from "@/lib/dates";
import type { StreakDay } from "@/lib/types";

export const dynamic = "force-dynamic";

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function qualifies(day: StreakDay | undefined): boolean {
  return Boolean(day && ((day.read && day.listen && day.daily_update && day.story_share) || day.off_day));
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    ensureWebPushConfigured();
  } catch {
    return NextResponse.json(
      { error: "Push notifications are not configured on the server." },
      { status: 500 }
    );
  }

  const supabase = getSupabaseAdmin();
  const day = today();
  const yesterday = getDateOffset(1);
  const twoDaysAgo = getDateOffset(2);
  const threeDaysAgo = getDateOffset(3);

  const [{ data: subs }, { data: todayRows }, { data: yesterdayRows }, { data: twoDaysAgoRows }] =
    await Promise.all([
      supabase.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth"),
      supabase.from("streak_days").select("*").eq("day", day),
      supabase.from("streak_days").select("*").eq("day", yesterday),
      supabase.from("streak_days").select("*").eq("day", twoDaysAgo),
    ]);

  const subscriptions = (subs as Subscription[]) ?? [];
  const todayByUser = new Map<string, StreakDay>();
  for (const row of (todayRows as StreakDay[]) ?? []) {
    todayByUser.set(row.user_id, row);
  }
  const yesterdayByUser = new Map<string, StreakDay>();
  for (const row of (yesterdayRows as StreakDay[]) ?? []) {
    yesterdayByUser.set(row.user_id, row);
  }
  const twoDaysAgoByUser = new Map<string, StreakDay>();
  for (const row of (twoDaysAgoRows as StreakDay[]) ?? []) {
    twoDaysAgoByUser.set(row.user_id, row);
  }

  // Anyone whose streak_days qualified two days ago (streak was alive)
  // but not yesterday (they missed a day) just had their streak break -
  // this window (exactly two days back vs one day back) fires the check
  // exactly once per break, the morning after it happens, rather than
  // every day the streak stays broken. Not scoped to push-subscription
  // holders - the person whose streak broke doesn't need one, only their
  // upline (the actual recipient) does.
  const brokenStreakUserIds = Array.from(twoDaysAgoByUser.keys()).filter(
    (userId) => qualifies(twoDaysAgoByUser.get(userId)) && !qualifies(yesterdayByUser.get(userId))
  );

  const [{ data: triviaYesterdayRows }, { data: triviaTodayRows }, { data: appOpenRows }] = await Promise.all([
    supabase
      .from("trivia_daily_results")
      .select("user_id,correct_count,total_count")
      .eq("day", yesterday)
      .in(
        "user_id",
        subscriptions.map((s) => s.user_id)
      ),
    supabase
      .from("trivia_daily_results")
      .select("user_id")
      .eq("day", day)
      .in(
        "user_id",
        subscriptions.map((s) => s.user_id)
      ),
    supabase
      .from("app_opens")
      .select("user_id,day")
      .in(
        "user_id",
        subscriptions.map((s) => s.user_id)
      ),
  ]);

  const perfectTriviaYesterday = new Set(
    ((triviaYesterdayRows as { user_id: string; correct_count: number; total_count: number }[]) ?? [])
      .filter((r) => r.total_count > 0 && r.correct_count === r.total_count)
      .map((r) => r.user_id)
  );
  const playedTriviaToday = new Set(
    ((triviaTodayRows as { user_id: string }[]) ?? []).map((r) => r.user_id)
  );
  const lastAppOpenByUser = new Map<string, string>();
  for (const row of (appOpenRows as { user_id: string; day: string }[]) ?? []) {
    const current = lastAppOpenByUser.get(row.user_id);
    if (!current || row.day > current) lastAppOpenByUser.set(row.user_id, row.day);
  }

  // Anyone who's muted a given reminder kind (Notification Preferences on
  // My Profile) is dropped before sending, same as notifyUsers() does for
  // event-triggered notifications - this cron route has its own separate
  // send loop rather than sharing that helper, so the same check needs to
  // be repeated here. Also pulls name/email so a failed send's error line
  // can say who it belongs to instead of just a count - "3 errors" told
  // nobody which 3 people to have re-enable notifications.
  const { data: muteRows } = await supabase
    .from("profiles")
    .select("id,muted_notification_kinds,first_name,last_name,email")
    .in(
      "id",
      subscriptions.map((s) => s.user_id)
    );
  const profileRows =
    (muteRows as { id: string; muted_notification_kinds: string[] | null; first_name: string | null; last_name: string | null; email: string }[]) ?? [];
  const mutedKindsByUser = new Map(
    profileRows.map((p) => [p.id, new Set(p.muted_notification_kinds ?? [])])
  );
  const labelByUserId = new Map(
    profileRows.map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email])
  );

  let sent = 0;
  let skipped = 0;
  let removed = 0;
  const errors: string[] = [];

  async function send(sub: Subscription, kind: string, title: string, body: string, url: string) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url })
      );
      sent++;
      await supabase.from("sent_notifications").insert({
        kind,
        title,
        body,
        user_id: sub.user_id,
        recipient_count: 1,
      });
    } catch (error: unknown) {
      if (isPermanentPushFailure(error)) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      } else {
        errors.push(`${labelByUserId.get(sub.user_id) ?? sub.user_id}: ${describePushError(error)}`);
      }
    }
  }

  for (const sub of subscriptions) {
    if (mutedKindsByUser.get(sub.user_id)?.has("core_run_reminder") || qualifies(todayByUser.get(sub.user_id))) {
      skipped++;
      continue;
    }
    await send(
      sub,
      "core_run_reminder",
      "🔥 Core Run reminder",
      "You haven't logged today's Core Run yet — Read, Listen, Daily Update, Story Share.",
      "/streak"
    );
  }

  // Trivia streak about to reset - only for someone whose streak is still
  // alive as of yesterday (a perfect day) and hasn't played today's 5
  // questions yet. Someone who already played today (win or lose) is
  // skipped either way - if they won the streak doesn't need saving, and
  // if they lost it's already gone, so a reminder wouldn't help.
  for (const sub of subscriptions) {
    if (
      mutedKindsByUser.get(sub.user_id)?.has("trivia_streak_reminder") ||
      !perfectTriviaYesterday.has(sub.user_id) ||
      playedTriviaToday.has(sub.user_id)
    ) {
      skipped++;
      continue;
    }
    await send(
      sub,
      "trivia_streak_reminder",
      "🧠 Your Trivia streak is on the line",
      "Play today's 5 questions before the day ends to keep your streak alive.",
      "/games"
    );
  }

  // Haven't opened the app in a few days - fires exactly once, the day
  // someone crosses 3 days idle, rather than every day after (which would
  // just be spam for anyone who's genuinely stepped away). Only applies to
  // someone with at least one app_opens row - a brand new account with no
  // history yet isn't "inactive."
  for (const sub of subscriptions) {
    const lastOpen = lastAppOpenByUser.get(sub.user_id);
    if (mutedKindsByUser.get(sub.user_id)?.has("app_inactive_reminder") || !lastOpen || lastOpen !== threeDaysAgo) {
      skipped++;
      continue;
    }
    await send(
      sub,
      "app_inactive_reminder",
      "👋 We miss you",
      "It's been a few days since you opened the app - your team's still moving.",
      "/dashboard"
    );
  }

  // Downline streak breaks - the recipient is the broken streak's upline,
  // not the person themselves (they already know), so this loops over the
  // break events rather than over subscriptions like the three kinds
  // above. A user_id can have multiple upline recipients if their upline
  // chain resolves to more than one push-subscribed account.
  if (brokenStreakUserIds.length > 0) {
    const { data: brokenProfiles } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,email")
      .in("id", brokenStreakUserIds);
    const brokenNameById = new Map(
      ((brokenProfiles as { id: string; first_name: string | null; last_name: string | null; email: string }[]) ?? []).map(
        (p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email]
      )
    );

    for (const brokenUserId of brokenStreakUserIds) {
      const { data: uplineRows } = await supabase.rpc("get_upline_user_ids", { p_user_id: brokenUserId });
      const uplineIds = new Set(
        ((uplineRows as { user_id?: string }[]) ?? []).map((r) => r.user_id).filter((id): id is string => Boolean(id))
      );
      if (uplineIds.size === 0) continue;

      const name = brokenNameById.get(brokenUserId) ?? "A team member";
      for (const sub of subscriptions) {
        if (!uplineIds.has(sub.user_id) || mutedKindsByUser.get(sub.user_id)?.has("streak_break_downline")) {
          continue;
        }
        await send(
          sub,
          "streak_break_downline",
          "📉 Streak ended",
          `${name}'s Core Run streak ended after a missed day.`,
          "/leaderboard"
        );
      }
    }
  }

  return NextResponse.json({ sent, skipped, removed, errors });
}
