import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured, webpush } from "@/lib/webpush";
import type { SentNotification } from "@/lib/types";

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// Shared "push to a set of recipients + log it" tail end for every
// event-triggered notification (calendar event added, call rating
// submitted, Core Run completed, 5+ pipeline, onboarding unlocked) -
// mirrors the send loop in send-calendar-reminders/route.ts, but fires
// once per app event instead of once per cron sweep, and logs one
// sent_notifications row per recipient (not per event) since each
// recipient's push either lands or doesn't independently.
export async function notifyUsers(params: {
  userIds: string[];
  kind: SentNotification["kind"];
  title: string;
  body: string;
  url: string;
}): Promise<{ sent: number; skipped: number; removed: number; errors: string[] }> {
  const { userIds, kind, title, body, url } = params;
  const recipients = Array.from(new Set(userIds));
  if (recipients.length === 0) {
    return { sent: 0, skipped: 0, removed: 0, errors: [] };
  }

  ensureWebPushConfigured();
  const supabase = getSupabaseAdmin();

  const { data: subRows } = await supabase
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", recipients);

  const subsByUser = new Map<string, Subscription[]>();
  for (const sub of (subRows as Subscription[]) ?? []) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  }

  let sent = 0;
  let skipped = 0;
  let removed = 0;
  const errors: string[] = [];

  for (const userId of recipients) {
    const subs = subsByUser.get(userId) ?? [];
    if (subs.length === 0) {
      skipped++;
      continue;
    }

    let deliveredToAny = false;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url })
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
        kind,
        title,
        body,
        user_id: userId,
        recipient_count: subs.length,
      });
    } else {
      skipped++;
    }
  }

  return { sent, skipped, removed, errors };
}
