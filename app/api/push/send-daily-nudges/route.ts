import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured, webpush, describePushError, isPermanentPushFailure } from "@/lib/webpush";
import { getToday, getMonthStart, formatMonthLabel } from "@/lib/dates";

export const dynamic = "force-dynamic";

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// Once-a-day sweep for the three "you haven't filled this out" nudges -
// grouped into one route (and one pg_cron entry, same reasoning as
// send-calendar-reminders: Vercel Hobby's cron slots are already spent on
// the Core Run reminder and stat leaders digest) rather than three. All
// three now run every day (volume_reminder and goals_reminder used to be
// gated to a few dates/Mondays only - widened to daily on request):
//   - mission_reminder: to anyone who hasn't opened the app yet today
//     (app_opens) - points at Today's Mission on the dashboard.
//   - volume_reminder: to anyone with no PV logged yet for the current
//     month.
//   - goals_reminder: to anyone who has never set a single goal (any
//     period, ever) - once they set one this stops forever for them,
//     this isn't a recurring "update your goals" nag.
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
  const today = getToday();
  const monthStart = getMonthStart();

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth");
  const subscriptions = (subs as Subscription[]) ?? [];
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, note: "no subscribed devices" });
  }
  const userIds = Array.from(new Set(subscriptions.map((s) => s.user_id)));

  const [{ data: muteRows }, { data: openedTodayRows }, { data: pvRows }, { data: goalRows }] =
    await Promise.all([
      supabase.from("profiles").select("id,muted_notification_kinds,first_name,last_name,email").in("id", userIds),
      supabase.from("app_opens").select("user_id").eq("day", today).in("user_id", userIds),
      supabase.from("monthly_pv").select("user_id,pv").eq("period_start", monthStart).in("user_id", userIds),
      supabase.from("goals").select("user_id").in("user_id", userIds),
    ]);

  const profileRows =
    (muteRows as { id: string; muted_notification_kinds: string[] | null; first_name: string | null; last_name: string | null; email: string }[]) ?? [];
  const mutedKindsByUser = new Map(
    profileRows.map((p) => [p.id, new Set(p.muted_notification_kinds ?? [])])
  );
  // See send-reminders/route.ts's comment - names the recipient in a
  // failed send's error line instead of leaving it an anonymous count.
  const labelByUserId = new Map(
    profileRows.map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email])
  );
  const openedTodaySet = new Set(((openedTodayRows as { user_id: string }[]) ?? []).map((r) => r.user_id));
  const pvByUser = new Map(((pvRows as { user_id: string; pv: number }[]) ?? []).map((r) => [r.user_id, r.pv]));
  const hasAnyGoalSet = new Set(((goalRows as { user_id: string }[]) ?? []).map((r) => r.user_id));

  type PendingMessage = { kind: string; title: string; body: string; url: string };
  const messagesByUser = new Map<string, PendingMessage[]>();

  function queue(userId: string, message: PendingMessage) {
    if (mutedKindsByUser.get(userId)?.has(message.kind)) return;
    const list = messagesByUser.get(userId) ?? [];
    list.push(message);
    messagesByUser.set(userId, list);
  }

  for (const userId of userIds) {
    if (!openedTodaySet.has(userId)) {
      queue(userId, {
        kind: "mission_reminder",
        title: "🎯 Today's Mission is waiting",
        body: "You haven't opened the app yet today — check what's on your plate.",
        url: "/dashboard",
      });
    }
    if ((pvByUser.get(userId) ?? 0) === 0) {
      queue(userId, {
        kind: "volume_reminder",
        title: "💰 Log this month's volume",
        body: `No PV logged yet for ${formatMonthLabel(monthStart)} — keep your Core 300 status on track.`,
        url: "/volume",
      });
    }
    if (!hasAnyGoalSet.has(userId)) {
      queue(userId, {
        kind: "goals_reminder",
        title: "🎯 Set your goals",
        body: "You haven't set any goals yet — a few minutes now keeps you focused all week.",
        url: "/goals",
      });
    }
  }

  const subsByUser = new Map<string, Subscription[]>();
  for (const sub of subscriptions) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  }

  let sent = 0;
  let skipped = 0;
  let removed = 0;
  const errors: string[] = [];

  for (const [userId, messages] of messagesByUser) {
    const userSubs = subsByUser.get(userId) ?? [];
    for (const message of messages) {
      let deliveredToAny = false;
      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: message.title, body: message.body, url: message.url })
          );
          deliveredToAny = true;
        } catch (error: unknown) {
          if (isPermanentPushFailure(error)) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
            removed++;
          } else {
            errors.push(`${labelByUserId.get(userId) ?? userId}: ${describePushError(error)}`);
          }
        }
      }
      if (deliveredToAny) {
        sent++;
        await supabase.from("sent_notifications").insert({
          kind: message.kind,
          title: message.title,
          body: message.body,
          user_id: userId,
          recipient_count: userSubs.length,
        });
      } else {
        skipped++;
      }
    }
  }

  return NextResponse.json({ sent, skipped, removed, errors });
}
