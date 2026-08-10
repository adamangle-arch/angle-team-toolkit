import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured, webpush, describePushError, isPermanentPushFailure } from "@/lib/webpush";
import { AUDIOS, FIRST_YEAR_BOOKS, ADVANCED_LIBRARY } from "@/lib/library-data";

export const dynamic = "force-dynamic";

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const GAP_MINUTES = 20;
const WINDOW_START_HOUR = 8;
const WINDOW_END_HOUR = 21; // exclusive - last eligible hour is 20:xx
const DEFAULT_TIMEZONE = "America/New_York"; // same fallback guessTimeZone() uses

type FillerItem = { title: string; body: string };

const BOOK_ITEMS: FillerItem[] = [
  ...FIRST_YEAR_BOOKS.map((b) => ({
    title: "📖 Book recommendation",
    body: `"${b.title}" by ${b.author} — worth picking up next.`,
  })),
  ...ADVANCED_LIBRARY.flatMap((category) =>
    category.books.map((b) => ({
      title: "📖 Book recommendation",
      body: `"${b.title}" by ${b.author} — worth picking up next.`,
    }))
  ),
];

const AUDIO_ITEMS: FillerItem[] = AUDIOS.map((a) => ({
  title: "🎧 Audio recommendation",
  body: `"${a.title}" by ${a.speaker} — ${a.summary}`,
}));

const FILLER_POOL: FillerItem[] = [...BOOK_ITEMS, ...AUDIO_ITEMS];

// Current local hour-of-day (0-23) in `timeZone`, for the daytime-window
// check below - deliberately just the hour, not a full offset conversion
// like lib/timezones.ts's helpers do for scheduling exact instants.
function localHour(timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit" }).formatToParts(
    new Date()
  );
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

// Fills the gap when nothing else has notified someone in a while, so the
// app stays present in someone's day even between real events - draws from
// the same book/audio library content already in the Resources tab rather
// than inventing new copy, and deliberately recommends books rather than
// quoting them verbatim (no actual quote text exists anywhere in the app,
// and fabricating quotes attributed to real authors isn't something to
// guess at). Runs every 10 minutes via pg_cron (see README) and fires for
// anyone who hasn't received ANY notification - this kind or any other -
// in the last 20 minutes, so it naturally backs off automatically whenever
// a real notification (a reminder, a leaderboard like, anything) already
// covered that gap. Only within each person's own local daytime window
// (8am-9pm, falling back to Eastern for anyone without a timezone set) -
// nobody should get a book recommendation at 3am.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (FILLER_POOL.length === 0) {
    return NextResponse.json({ sent: 0, note: "no filler content available" });
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

  const { data: subs } = await supabase.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth");
  const subscriptions = (subs as Subscription[]) ?? [];
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, note: "no subscribed devices" });
  }
  const userIds = Array.from(new Set(subscriptions.map((s) => s.user_id)));

  const [{ data: profileRows }, { data: recentRows }] = await Promise.all([
    supabase.from("profiles").select("id,muted_notification_kinds,timezone,first_name,last_name,email").in("id", userIds),
    supabase
      .from("sent_notifications")
      .select("kind,user_id")
      .gte("created_at", new Date(Date.now() - GAP_MINUTES * 60 * 1000).toISOString()),
  ]);

  const profiles =
    (profileRows as {
      id: string;
      muted_notification_kinds: string[] | null;
      timezone: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string;
    }[]) ?? [];
  const mutedKindsByUser = new Map(profiles.map((p) => [p.id, new Set(p.muted_notification_kinds ?? [])]));
  const timezoneByUser = new Map(profiles.map((p) => [p.id, p.timezone ?? DEFAULT_TIMEZONE]));
  const labelByUserId = new Map(
    profiles.map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email])
  );

  const recent = (recentRows as { kind: string; user_id: string | null }[]) ?? [];
  const directlyServed = new Set(recent.filter((r) => r.user_id).map((r) => r.user_id as string));
  const recentBroadcastKinds = recent.filter((r) => !r.user_id).map((r) => r.kind);

  function wasServed(userId: string): boolean {
    if (directlyServed.has(userId)) return true;
    const muted = mutedKindsByUser.get(userId) ?? new Set();
    return recentBroadcastKinds.some((kind) => !muted.has(kind));
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

  for (const userId of userIds) {
    if (mutedKindsByUser.get(userId)?.has("engagement_filler") || wasServed(userId)) {
      skipped++;
      continue;
    }
    const hour = localHour(timezoneByUser.get(userId) ?? DEFAULT_TIMEZONE);
    if (hour < WINDOW_START_HOUR || hour >= WINDOW_END_HOUR) {
      skipped++;
      continue;
    }

    const item = FILLER_POOL[Math.floor(Math.random() * FILLER_POOL.length)];
    const userSubs = subsByUser.get(userId) ?? [];
    let deliveredToAny = false;
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: item.title, body: item.body, url: "/library" })
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
        kind: "engagement_filler",
        title: item.title,
        body: item.body,
        user_id: userId,
        recipient_count: userSubs.length,
      });
    } else {
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, removed, errors });
}
