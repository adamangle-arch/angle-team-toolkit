import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured, webpush } from "@/lib/webpush";
import type { CalendarEvent, Candidate } from "@/lib/types";

export const dynamic = "force-dynamic";

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// Vercel Hobby caps cron jobs at once per day (and not even minute-precise
// within that), so this route is never invoked by vercel.json - it's hit
// externally every few minutes by a Supabase pg_cron job (via pg_net),
// which has its own independent 1-minute-minimum scheduler unaffected by
// Vercel's plan. Same CRON_SECRET auth pattern as the other push routes
// either way, so this only actually does anything for whoever's holding
// that secret.
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
  const now = new Date();
  // Widest configurable reminder is 1 day (CALENDAR_REMINDER_OPTIONS in
  // lib/constants.ts) - bounding the fetch to "now" through a bit past
  // that keeps this from pulling in every future event ever scheduled;
  // the actual per-event timing match happens in JS below since each
  // event has its own target offset, not one shared for every row.
  const fetchCutoff = new Date(now.getTime() + (1440 + 10) * 60 * 1000).toISOString();

  const { data: upcoming } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("reminder_sent", false)
    .not("reminder_minutes_before", "is", null)
    .gt("event_at", now.toISOString())
    .lte("event_at", fetchCutoff);

  // A ±5-minute band around each event's own configured offset, checked
  // every ~5 minutes (see the pg_cron schedule in schema.sql's notes),
  // gives every event at least one poll that lands inside its band, with
  // margin either side for clock drift or a slightly-late cron tick -
  // reminder_sent is what actually prevents a double-send on the
  // overlap, not this band's precision.
  const events = ((upcoming as CalendarEvent[]) ?? []).filter((e) => {
    const minutesUntil = (new Date(e.event_at).getTime() - now.getTime()) / 60_000;
    const target = e.reminder_minutes_before as number;
    return minutesUntil <= target + 5 && minutesUntil > target - 5;
  });
  if (events.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, removed: 0, errors: [] });
  }

  const candidateIds = Array.from(
    new Set(events.map((e) => e.candidate_id).filter((id): id is string => Boolean(id)))
  );
  const userIds = Array.from(new Set(events.map((e) => e.user_id)));

  const [{ data: candidateRows }, { data: subRows }, { data: muteRows }] = await Promise.all([
    candidateIds.length > 0
      ? supabase.from("candidates").select("id,name").in("id", candidateIds)
      : Promise.resolve({ data: [] as Pick<Candidate, "id" | "name">[] }),
    supabase.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").in("user_id", userIds),
    supabase.from("profiles").select("id,muted_notification_kinds").in("id", userIds),
  ]);

  const candidateNameById = new Map(
    ((candidateRows as Pick<Candidate, "id" | "name">[]) ?? []).map((c) => [c.id, c.name])
  );
  const subsByUser = new Map<string, Subscription[]>();
  for (const sub of (subRows as Subscription[]) ?? []) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  }
  // Same mute check notifyUsers() does for event-triggered notifications -
  // this cron route has its own separate send loop, so it needs its own copy.
  const mutedIds = new Set(
    ((muteRows as { id: string; muted_notification_kinds: string[] | null }[]) ?? [])
      .filter((p) => (p.muted_notification_kinds ?? []).includes("calendar_reminder"))
      .map((p) => p.id)
  );

  let sent = 0;
  let skipped = 0;
  let removed = 0;
  const errors: string[] = [];

  for (const event of events) {
    // Mark it handled up front, not after - a rep with no subscriptions
    // yet (or a send failure) shouldn't leave this event matching the
    // window query forever and getting retried every single poll.
    await supabase.from("calendar_events").update({ reminder_sent: true }).eq("id", event.id);

    const subs = subsByUser.get(event.user_id) ?? [];
    if (subs.length === 0 || mutedIds.has(event.user_id)) {
      skipped++;
      continue;
    }

    const candidateName = event.candidate_id ? candidateNameById.get(event.candidate_id) : null;
    const time = new Date(event.event_at).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const minutesBefore = event.reminder_minutes_before as number;
    const timeUntilLabel =
      minutesBefore >= 1440
        ? `${Math.round(minutesBefore / 1440)} day${minutesBefore >= 2880 ? "s" : ""}`
        : minutesBefore >= 60
          ? `${Math.round(minutesBefore / 60)} hour${minutesBefore >= 120 ? "s" : ""}`
          : `${minutesBefore} minutes`;
    const title = `📅 Starting in ${timeUntilLabel}: ${event.title}`;
    const body = candidateName
      ? `${time} — Candidate: ${candidateName}`
      : `${time}`;

    let deliveredToAny = false;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url: "/calendar" })
        );
        deliveredToAny = true;
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          removed++;
        } else {
          errors.push(String(error));
        }
      }
    }

    if (deliveredToAny) {
      sent++;
      await supabase.from("sent_notifications").insert({
        kind: "calendar_reminder",
        title,
        body,
        user_id: event.user_id,
        recipient_count: subs.length,
      });
    } else {
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, removed, errors });
}
