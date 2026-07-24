import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured, webpush } from "@/lib/webpush";
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
  return Boolean(day && day.read && day.listen && day.daily_update && day.story_share);
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

  const [{ data: subs }, { data: todayRows }] = await Promise.all([
    supabase.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth"),
    supabase.from("streak_days").select("*").eq("day", day),
  ]);

  const subscriptions = (subs as Subscription[]) ?? [];
  const todayByUser = new Map<string, StreakDay>();
  for (const row of (todayRows as StreakDay[]) ?? []) {
    todayByUser.set(row.user_id, row);
  }

  let sent = 0;
  let skipped = 0;
  let removed = 0;
  const errors: string[] = [];

  for (const sub of subscriptions) {
    if (qualifies(todayByUser.get(sub.user_id))) {
      skipped++;
      continue;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: "🔥 Core Run reminder",
          body: "You haven't logged today's Core Run yet — Read, Listen, Daily Update, Story Share.",
          url: "/streak",
        })
      );
      sent++;
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

  return NextResponse.json({ sent, skipped, removed, errors });
}
