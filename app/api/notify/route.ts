import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUsers } from "@/lib/notifyEvent";
import { isPrimaryUser } from "@/lib/constants";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

type Body =
  | {
      kind: "calendar_event_added";
      title: string;
      eventAt: string;
      scope: "downline" | "all" | "specific";
      recipientIds?: string[];
    }
  | { kind: "call_rating_submitted"; candidateName: string; callType: string; overallScore: number | null }
  | { kind: "core_run_completed" }
  | { kind: "pipeline_5plus" }
  | { kind: "onboarding_unlocked"; targetUserId: string; sessionNumber: number };

function fullName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "Someone";
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Someone";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Single endpoint for every event-triggered (as opposed to cron-scheduled)
// push notification - calendar events added by upline/admin, a downline's
// call rating submission, Core Run completion, hitting 5+ active pipeline
// candidates, and an onboarding session unlock. One file rather than five
// near-identical ones since they all share the same auth step and the
// same notifyUsers() tail; the per-kind switch below is where they
// actually differ (who the recipients are and what the copy says).
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
  const userEmail = userData.user.email;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    switch (body.kind) {
      case "calendar_event_added": {
        let recipients: string[];
        if (body.scope === "all") {
          const { data: recipientRows } = await admin.from("profiles").select("id").neq("id", userId);
          recipients = ((recipientRows as { id: string }[]) ?? []).map((r) => r.id);
        } else {
          // "downline" and "specific" both start from the caller's real
          // downline - for "specific" this also doubles as validation,
          // narrowing whatever ids the client sent down to only the ones
          // that are actually this caller's downline (never trust a
          // client-supplied id list outright).
          const { data: recipientRows } = await admin.rpc("get_downline_user_ids", {
            p_user_id: userId,
          });
          const downlineIds = ((recipientRows as { user_id: string }[]) ?? []).map((r) => r.user_id);
          recipients =
            body.scope === "specific"
              ? downlineIds.filter((id) => (body.recipientIds ?? []).includes(id))
              : downlineIds;
        }

        const { data: creator } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const result = await notifyUsers({
          userIds: recipients,
          kind: "calendar_event_added",
          title: `📅 New event: ${body.title}`,
          body: `${fullName(creator)} added it — ${formatTime(body.eventAt)}`,
          url: "/calendar",
        });
        return NextResponse.json(result);
      }

      case "call_rating_submitted": {
        const { data: recipientRows } = await admin.rpc("get_upline_user_ids", {
          p_user_id: userId,
        });
        const recipients = ((recipientRows as { user_id?: string }[]) ?? [])
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id));

        const { data: submitter } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const scoreLabel = body.overallScore != null ? ` — scored ${body.overallScore}/10` : "";
        const result = await notifyUsers({
          userIds: recipients,
          kind: "call_rating_submitted",
          title: `📞 New ${body.callType} rating submitted`,
          body: `${fullName(submitter)} rated a call with ${body.candidateName}${scoreLabel}`,
          url: "/assistant",
        });
        return NextResponse.json(result);
      }

      case "core_run_completed": {
        const { data: recipientRows } = await admin.rpc("get_upline_user_ids", {
          p_user_id: userId,
        });
        const recipients = ((recipientRows as { user_id?: string }[]) ?? [])
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id));

        const { data: submitter } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const result = await notifyUsers({
          userIds: recipients,
          kind: "core_run_completed",
          title: "✅ Core Run complete",
          body: `${fullName(submitter)} completed today's Core Run`,
          url: "/streak",
        });
        return NextResponse.json(result);
      }

      case "pipeline_5plus": {
        const { data: recipientRows } = await admin.rpc("get_upline_user_ids", {
          p_user_id: userId,
        });
        const recipients = ((recipientRows as { user_id?: string }[]) ?? [])
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id));

        const { data: submitter } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const result = await notifyUsers({
          userIds: recipients,
          kind: "pipeline_5plus",
          title: "🚀 5+ active candidates",
          body: `${fullName(submitter)} now has 5 or more active candidates in their pipeline`,
          url: "/pipeline",
        });
        return NextResponse.json(result);
      }

      case "onboarding_unlocked": {
        const isAdmin = isPrimaryUser(userEmail);
        if (!isAdmin) {
          const { data: isUpline } = await admin.rpc("is_upline_of", {
            p_viewer: userId,
            p_target: body.targetUserId,
          });
          if (!isUpline) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
        }

        const { data: grantor } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const result = await notifyUsers({
          userIds: [body.targetUserId],
          kind: "onboarding_unlocked",
          title: "🔓 Onboarding unlocked",
          body: `${fullName(grantor)} unlocked Session ${body.sessionNumber} for you`,
          url: "/onboarding",
        });
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: "Unknown notification kind" }, { status: 400 });
    }
  } catch (error: unknown) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
