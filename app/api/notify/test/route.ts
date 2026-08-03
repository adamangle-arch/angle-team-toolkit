import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWebPushConfigured, webpush } from "@/lib/webpush";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

// Self-service diagnostic for "I turned notifications on but never get
// any" - sends a real push straight to the caller's own device(s) right
// now, bypassing muted_notification_kinds (this isn't a real notification
// kind, it's a mechanics check) and skipping the sent_notifications log
// (it's not something worth showing up in that history). Reports back
// exactly which stage failed instead of a generic success/failure, since
// "nothing arrives" has several unrelated causes (no VAPID keys
// configured on the server, no subscription row for this browser, or a
// dead subscription that a real send would have quietly dropped).
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  try {
    ensureWebPushConfigured();
  } catch {
    return NextResponse.json({
      ok: false,
      message:
        "The server isn't set up to send push notifications yet (VAPID keys missing). This needs to be fixed in the app's hosting configuration, not on your device.",
    });
  }

  const admin = getSupabaseAdmin();
  const { data: subRows } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);
  const subs = (subRows as Subscription[]) ?? [];

  if (subs.length === 0) {
    return NextResponse.json({
      ok: false,
      message:
        "No push subscription found on the server for your account, even though your device thinks it's on. Try Turn Off, then Turn On again below.",
    });
  }

  let delivered = 0;
  let removed = 0;
  const errors: string[] = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: "🔔 Test notification",
          body: "If you can see this, push notifications are working on this device.",
          url: "/notifications",
        })
      );
      delivered++;
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      } else {
        errors.push(String(error));
      }
    }
  }

  if (delivered > 0) {
    return NextResponse.json({
      ok: true,
      message: `Sent to ${delivered} device${delivered === 1 ? "" : "s"} — check your notification shade now.`,
    });
  }
  if (removed > 0) {
    return NextResponse.json({
      ok: false,
      message:
        "Your subscription had gone stale on the server (removed now) — tap Turn Off, then Turn On again to re-subscribe.",
    });
  }
  return NextResponse.json({
    ok: false,
    message: `Send failed: ${errors[0] ?? "unknown error"}`,
  });
}
