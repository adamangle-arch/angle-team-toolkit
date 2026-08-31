import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured, webpush, describePushError, isPermanentPushFailure } from "@/lib/webpush";
import { getDateOffset, getMonthStart, getMonthStartOffset, getToday, getWeekStart, getWeekStartOffset } from "@/lib/dates";
import { PIPELINE_STAGES, PRIMARY_EMAILS } from "@/lib/constants";
import type { Core300Entry, DittoEntry, IndividualLeaderEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type WithPartnerName = {
  first_name: string | null;
  last_name: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
};

// Conversations/Story Shares aren't tracked by everyone - excluded from
// this digest the same way "questions" already is (see CATEGORIES in
// app/leaderboard/page.tsx for the matching client-side exclusion).
const CATEGORY_ORDER = PIPELINE_STAGES.filter(
  (s) => s.key !== "questions" && s.key !== "conversations" && s.key !== "story_shares"
).map((s) => s.key);
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.key, s.label])
);

function personLabel(entry: WithPartnerName): string {
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ") || "Unnamed";
  const partnerName = [entry.partner_first_name, entry.partner_last_name].filter(Boolean).join(" ");
  return partnerName ? `${name} & ${partnerName}` : name;
}

function topByValue<T extends WithPartnerName>(rows: T[], valueOf: (row: T) => number): T[] {
  if (rows.length === 0) return [];
  const max = Math.max(...rows.map(valueOf));
  return rows.filter((row) => valueOf(row) === max);
}

type CategoryMessage = { title: string; body: string };

// One push per category instead of one combined "here's everyone" digest
// - a rep who only cares about, say, Yeses shouldn't have to read past
// four other categories to find their own name (or miss it entirely in a
// notification preview that only shows the first line).
function buildCategoryMessages(periodLabel: string, rows: IndividualLeaderEntry[]): CategoryMessage[] {
  const byCategory = new Map<string, IndividualLeaderEntry[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }
  const messages: CategoryMessage[] = [];
  for (const key of CATEGORY_ORDER) {
    const group = byCategory.get(key);
    if (!group || group.length === 0) continue;
    messages.push({
      title: `🏆 ${periodLabel} ${CATEGORY_LABELS[key]} Leader${group.length > 1 ? "s" : ""}`,
      body: `${group.map(personLabel).join(" / ")} (${group[0].value})`,
    });
  }
  return messages;
}

type PendingMessage = {
  kind: "daily_stat_leaders" | "weekly_stat_leaders" | "monthly_stat_leaders";
  periodType: "daily" | "weekly" | "monthly";
  periodStart: string;
  title: string;
  body: string;
};

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
  const messages: PendingMessage[] = [];

  const yesterday = getDateOffset(1);
  const { data: dailyRows } = await supabase.rpc("get_individual_leaders", {
    p_period_type: "daily",
    p_period_start: yesterday,
  });
  for (const msg of buildCategoryMessages("Yesterday's", (dailyRows as IndividualLeaderEntry[]) ?? [])) {
    messages.push({ kind: "daily_stat_leaders", periodType: "daily", periodStart: yesterday, ...msg });
  }

  let adminReport: { title: string; body: string } | null = null;

  if (getWeekStart() === today) {
    const lastWeekStart = getWeekStartOffset(1);
    const { data: weeklyRows } = await supabase.rpc("get_individual_leaders", {
      p_period_type: "weekly",
      p_period_start: lastWeekStart,
    });
    for (const msg of buildCategoryMessages("Last Week's", (weeklyRows as IndividualLeaderEntry[]) ?? [])) {
      messages.push({ kind: "weekly_stat_leaders", periodType: "weekly", periodStart: lastWeekStart, ...msg });
    }

    // Admin-only recap, separate from the per-category leader pushes above -
    // whole-team totals an admin cares about (growth, launches, current
    // pipeline size) rather than any one category's top performer. Sent to
    // PRIMARY_EMAILS only, via its own block after the main send loop below,
    // since it needs a different (much smaller) recipient list than the
    // broadcast-to-everyone messages array uses.
    const weekEnd = new Date(`${lastWeekStart}T00:00:00Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekEndIso = weekEnd.toISOString();

    const [{ data: weeklyPeriodRows }, { count: newCandidatesCount }, { count: activePipelineCount }] =
      await Promise.all([
        supabase.from("pipeline_periods").select("launches").eq("period_type", "weekly").eq("period_start", lastWeekStart),
        supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .gte("created_at", `${lastWeekStart}T00:00:00Z`)
          .lt("created_at", weekEndIso),
        supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .eq("launched", false)
          .eq("filtered_out", false)
          .gte("current_step", 1),
      ]);

    const totalLaunches = ((weeklyPeriodRows as { launches: number }[]) ?? []).reduce(
      (sum, row) => sum + (row.launches ?? 0),
      0
    );

    adminReport = {
      title: "📊 Weekly team recap",
      body: `Last week: ${totalLaunches} launch${totalLaunches === 1 ? "" : "es"}, ${newCandidatesCount ?? 0} new candidate${(newCandidatesCount ?? 0) === 1 ? "" : "s"} added. ${activePipelineCount ?? 0} active in the pipeline right now.`,
    };
  }

  if (getMonthStart() === today) {
    const lastMonthStart = getMonthStartOffset(1);
    const [{ data: monthlyRows }, { data: core300Rows }, { data: dittoRows }] = await Promise.all([
      supabase.rpc("get_individual_leaders", { p_period_type: "monthly", p_period_start: lastMonthStart }),
      supabase.rpc("get_core300_leaderboard", { p_period_start: lastMonthStart }),
      supabase.rpc("get_ditto_leaderboard", { p_period_start: lastMonthStart }),
    ]);

    const monthlyMsgs = buildCategoryMessages("Last Month's", (monthlyRows as IndividualLeaderEntry[]) ?? []);

    const core300Top = topByValue((core300Rows as Core300Entry[]) ?? [], (row) => row.pv);
    if (core300Top.length > 0) {
      monthlyMsgs.push({
        title: "🏆 Last Month's Core 300 Leader" + (core300Top.length > 1 ? "s" : ""),
        body: `${core300Top.map(personLabel).join(" / ")} (${core300Top[0].pv} PV)`,
      });
    }

    const dittoTop = topByValue((dittoRows as DittoEntry[]) ?? [], (row) => row.day1_ditto_pv);
    if (dittoTop.length > 0) {
      monthlyMsgs.push({
        title: "🏆 Last Month's Ditto Bonus Leader" + (dittoTop.length > 1 ? "s" : ""),
        body: `${dittoTop.map(personLabel).join(" / ")} (${dittoTop[0].day1_ditto_pv} PV)`,
      });
    }

    for (const msg of monthlyMsgs) {
      messages.push({ kind: "monthly_stat_leaders", periodType: "monthly", periodStart: lastMonthStart, ...msg });
    }
  }

  if (messages.length === 0 && !adminReport) {
    return NextResponse.json({ sent: 0, note: "nothing to report for this run" });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth");
  const subscriptions = (subs as Subscription[]) ?? [];

  // Same mute check notifyUsers() does for event-triggered notifications -
  // this cron route has its own separate send loop, so it needs its own
  // copy. Fetched once per-user (not per-kind), then checked per message
  // below since daily/weekly/monthly leaders can each be muted separately.
  const { data: muteRows } = await supabase
    .from("profiles")
    .select("id,muted_notification_kinds,first_name,last_name,email")
    .in(
      "id",
      Array.from(new Set(subscriptions.map((s) => s.user_id)))
    );
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

  const errors: string[] = [];
  const results: { kind: string; recipientCount: number }[] = [];

  for (const message of messages) {
    let recipientCount = 0;
    for (const sub of subscriptions) {
      if (mutedKindsByUser.get(sub.user_id)?.has(message.kind)) continue;
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({ title: message.title, body: message.body, url: "/notifications" })
        );
        recipientCount++;
      } catch (error: unknown) {
        if (isPermanentPushFailure(error)) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          errors.push(`${labelByUserId.get(sub.user_id) ?? sub.user_id}: ${describePushError(error)}`);
        }
      }
    }

    await supabase.from("sent_notifications").insert({
      kind: message.kind,
      title: message.title,
      body: message.body,
      period_type: message.periodType,
      period_start: message.periodStart,
      user_id: null,
      recipient_count: recipientCount,
    });

    results.push({ kind: message.kind, recipientCount });
  }

  if (adminReport) {
    const adminEmails = new Set(PRIMARY_EMAILS.map((e) => e.toLowerCase()));
    let recipientCount = 0;
    for (const sub of subscriptions) {
      const profile = profileRows.find((p) => p.id === sub.user_id);
      if (!profile || !adminEmails.has(profile.email.toLowerCase())) continue;
      if (mutedKindsByUser.get(sub.user_id)?.has("admin_weekly_report")) continue;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: adminReport.title, body: adminReport.body, url: "/team" })
        );
        recipientCount++;
      } catch (error: unknown) {
        if (isPermanentPushFailure(error)) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          errors.push(`${labelByUserId.get(sub.user_id) ?? sub.user_id}: ${describePushError(error)}`);
        }
      }
    }

    await supabase.from("sent_notifications").insert({
      kind: "admin_weekly_report",
      title: adminReport.title,
      body: adminReport.body,
      period_type: "weekly",
      period_start: getWeekStartOffset(1),
      user_id: null,
      recipient_count: recipientCount,
    });

    results.push({ kind: "admin_weekly_report", recipientCount });
  }

  return NextResponse.json({ sent: results, errors });
}
