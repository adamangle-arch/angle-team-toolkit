import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured, webpush } from "@/lib/webpush";
import { getDateOffset, getMonthStart, getMonthStartOffset, getToday, getWeekStart, getWeekStartOffset } from "@/lib/dates";
import { PIPELINE_STAGES } from "@/lib/constants";
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

const CATEGORY_ORDER = PIPELINE_STAGES.filter((s) => s.key !== "questions").map((s) => s.key);
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

function buildLeaderLines(rows: IndividualLeaderEntry[]): string[] {
  const byCategory = new Map<string, IndividualLeaderEntry[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }
  const lines: string[] = [];
  for (const key of CATEGORY_ORDER) {
    const group = byCategory.get(key);
    if (!group || group.length === 0) continue;
    lines.push(`${CATEGORY_LABELS[key]}: ${group.map(personLabel).join(" / ")} (${group[0].value})`);
  }
  return lines;
}

function composeMessage(periodLabel: string, lines: string[]): { title: string; body: string } | null {
  if (lines.length === 0) return null;
  return { title: `🏆 ${periodLabel} Leaders`, body: lines.join(" · ") };
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
  const dailyMsg = composeMessage("Yesterday's", buildLeaderLines((dailyRows as IndividualLeaderEntry[]) ?? []));
  if (dailyMsg) {
    messages.push({ kind: "daily_stat_leaders", periodType: "daily", periodStart: yesterday, ...dailyMsg });
  }

  if (getWeekStart() === today) {
    const lastWeekStart = getWeekStartOffset(1);
    const { data: weeklyRows } = await supabase.rpc("get_individual_leaders", {
      p_period_type: "weekly",
      p_period_start: lastWeekStart,
    });
    const weeklyMsg = composeMessage("Last Week's", buildLeaderLines((weeklyRows as IndividualLeaderEntry[]) ?? []));
    if (weeklyMsg) {
      messages.push({ kind: "weekly_stat_leaders", periodType: "weekly", periodStart: lastWeekStart, ...weeklyMsg });
    }
  }

  if (getMonthStart() === today) {
    const lastMonthStart = getMonthStartOffset(1);
    const [{ data: monthlyRows }, { data: core300Rows }, { data: dittoRows }] = await Promise.all([
      supabase.rpc("get_individual_leaders", { p_period_type: "monthly", p_period_start: lastMonthStart }),
      supabase.rpc("get_core300_leaderboard", { p_period_start: lastMonthStart }),
      supabase.rpc("get_ditto_leaderboard", { p_period_start: lastMonthStart }),
    ]);

    const lines = buildLeaderLines((monthlyRows as IndividualLeaderEntry[]) ?? []);

    const core300Top = topByValue((core300Rows as Core300Entry[]) ?? [], (row) => row.pv);
    if (core300Top.length > 0) {
      lines.push(`Core 300: ${core300Top.map(personLabel).join(" / ")} (${core300Top[0].pv} PV)`);
    }

    const dittoTop = topByValue((dittoRows as DittoEntry[]) ?? [], (row) => row.day1_ditto_pv);
    if (dittoTop.length > 0) {
      lines.push(`Ditto Bonus: ${dittoTop.map(personLabel).join(" / ")} (${dittoTop[0].day1_ditto_pv} PV)`);
    }

    const monthlyMsg = composeMessage("Last Month's", lines);
    if (monthlyMsg) {
      messages.push({
        kind: "monthly_stat_leaders",
        periodType: "monthly",
        periodStart: lastMonthStart,
        ...monthlyMsg,
      });
    }
  }

  if (messages.length === 0) {
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
    .select("id,muted_notification_kinds")
    .in(
      "id",
      Array.from(new Set(subscriptions.map((s) => s.user_id)))
    );
  const mutedKindsByUser = new Map(
    ((muteRows as { id: string; muted_notification_kinds: string[] | null }[]) ?? []).map((p) => [
      p.id,
      new Set(p.muted_notification_kinds ?? []),
    ])
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
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          errors.push(String(error));
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

  return NextResponse.json({ sent: results, errors });
}
