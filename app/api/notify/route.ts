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
  | { kind: "onboarding_unlocked"; targetUserId: string; sessionNumber: number }
  | { kind: "games_unlocked" }
  | { kind: "badge_earned"; targetUserId: string; badgeLabel: string }
  | { kind: "leaderboard_liked"; targetUserId: string }
  | { kind: "story_posted" }
  | { kind: "candidate_launched"; candidateName: string }
  | { kind: "candidate_filtered_out"; candidateName: string }
  | { kind: "member_resource_sent"; targetUserId: string; resourceLabel: string }
  | { kind: "library_resource_added"; resourceLabel: string }
  | { kind: "streak_milestone_reached"; days: number; label: string }
  | { kind: "downline_signup_linked"; firstName: string; lastName: string }
  | { kind: "customer_sale_logged" }
  | { kind: "onboarding_completed"; targetUserId: string }
  | { kind: "story_liked"; targetUserId: string }
  | { kind: "story_commented"; targetUserId: string; commentPreview: string }
  | { kind: "budget_worksheet_completed" };

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

      case "leaderboard_liked": {
        const { data: liker } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const result = await notifyUsers({
          userIds: [body.targetUserId],
          kind: "leaderboard_liked",
          title: "❤️ Someone liked your ranking",
          body: `${fullName(liker)} liked one of your Leaderboard rankings!`,
          url: "/leaderboard",
        });
        return NextResponse.json(result);
      }

      case "story_liked": {
        const { data: liker } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const result = await notifyUsers({
          userIds: [body.targetUserId],
          kind: "story_liked",
          title: "❤️ Someone liked your story",
          body: `${fullName(liker)} liked your story!`,
          url: "/stories",
        });
        return NextResponse.json(result);
      }

      case "story_commented": {
        const { data: commenter } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const result = await notifyUsers({
          userIds: [body.targetUserId],
          kind: "story_commented",
          title: "💬 New comment on your story",
          body: `${fullName(commenter)}: "${body.commentPreview}"`,
          url: "/stories",
        });
        return NextResponse.json(result);
      }

      // Kind name is a holdover from before My Budget autosaved - fired
      // once now, on someone's first-ever autosave (app/budget/page.tsx's
      // isFirstSave), not on a "mark complete" button tap (there isn't
      // one anymore). Renaming the kind string would mean a schema.sql
      // check-constraint change for no real benefit, so only the title/
      // body text below were updated to match.
      case "budget_worksheet_completed": {
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
          kind: "budget_worksheet_completed",
          title: "💰 Budget worksheet started",
          body: `${fullName(submitter)} started filling out their budget worksheet`,
          url: "/team",
        });
        return NextResponse.json(result);
      }

      case "story_posted": {
        // Whole team, not just upline - unlike every other event here,
        // get_active_stories() has no upline/downline restriction at all
        // (every story is visible company-wide), so the notification
        // follows the same reach as the content itself.
        const { data: teamRows } = await admin.from("profiles").select("id").not("team", "is", null);
        const recipients = ((teamRows as { id: string }[]) ?? [])
          .map((r) => r.id)
          .filter((id) => id !== userId);

        const { data: poster } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const result = await notifyUsers({
          userIds: recipients,
          kind: "story_posted",
          title: "📸 New story posted",
          body: `${fullName(poster)} just posted today's story`,
          url: "/stories",
        });
        return NextResponse.json(result);
      }

      case "candidate_launched": {
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
          kind: "candidate_launched",
          title: "🚀 New launch!",
          body: `${fullName(submitter)} just launched ${body.candidateName}`,
          url: "/pipeline",
        });
        return NextResponse.json(result);
      }

      case "candidate_filtered_out": {
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
          kind: "candidate_filtered_out",
          title: "📋 Candidate filtered out",
          body: `${fullName(submitter)} filtered out ${body.candidateName}`,
          url: "/pipeline",
        });
        return NextResponse.json(result);
      }

      case "customer_sale_logged": {
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
          kind: "customer_sale_logged",
          title: "💰 New customer sale",
          body: `${fullName(submitter)} logged a new customer sale`,
          url: "/volume",
        });
        return NextResponse.json(result);
      }

      case "onboarding_completed": {
        // Same guard as onboarding_unlocked - only the target's real
        // upline (or an admin) can trigger this, since it's fired from
        // Team's grant flow where the caller could be an admin acting on
        // someone else's behalf, not just the target's direct upline.
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

        const { data: graduate } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", body.targetUserId)
          .maybeSingle();

        const { data: uplineRows } = await admin.rpc("get_upline_user_ids", {
          p_user_id: body.targetUserId,
        });
        const recipients = ((uplineRows as { user_id?: string }[]) ?? [])
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id));

        const result = await notifyUsers({
          userIds: recipients,
          kind: "onboarding_completed",
          title: "🎓 Onboarding completed",
          body: `${fullName(graduate)} just finished onboarding!`,
          url: "/onboarding",
        });
        return NextResponse.json(result);
      }

      case "downline_signup_linked": {
        // Recipient is the caller's own upline_id, not something the client
        // sends - by the time this fires, ProfileGate's link_upline() RPC
        // has already set it server-side, so re-reading it here is both
        // simpler and safer than trusting a client-supplied target id.
        const { data: caller } = await admin
          .from("profiles")
          .select("upline_id")
          .eq("id", userId)
          .maybeSingle();
        const uplineId = caller?.upline_id;
        if (!uplineId) {
          return NextResponse.json({ sent: 0, skipped: 0, removed: 0, errors: [] });
        }

        const name = [body.firstName, body.lastName].filter(Boolean).join(" ") || "Someone";
        const result = await notifyUsers({
          userIds: [uplineId],
          kind: "downline_signup_linked",
          title: "🎉 New team member",
          body: `${name} just joined your team and linked you as their upline`,
          url: "/pipeline",
        });
        return NextResponse.json(result);
      }

      case "member_resource_sent": {
        const { data: sender } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", userId)
          .maybeSingle();

        const result = await notifyUsers({
          userIds: [body.targetUserId],
          kind: "member_resource_sent",
          title: "🎁 New resource sent to you",
          body: `${fullName(sender)} sent you "${body.resourceLabel}"`,
          url: "/onboarding",
        });
        return NextResponse.json(result);
      }

      case "library_resource_added": {
        const { data: recipientRows } = await admin.from("profiles").select("id").neq("id", userId);
        const recipients = ((recipientRows as { id: string }[]) ?? []).map((r) => r.id);

        const result = await notifyUsers({
          userIds: recipients,
          kind: "library_resource_added",
          title: "📚 New resource in the library",
          body: `"${body.resourceLabel}" was just added to the resource library`,
          url: "/library",
        });
        return NextResponse.json(result);
      }

      case "streak_milestone_reached": {
        // Self-targeted, same as games_unlocked - a personal celebration,
        // not something the rest of the team needs to hear about.
        const result = await notifyUsers({
          userIds: [userId],
          kind: "streak_milestone_reached",
          title: `🔥 ${body.label} streak!`,
          body: `You've hit a ${body.label} Core Run streak. Keep it going!`,
          url: "/streak",
        });
        return NextResponse.json(result);
      }

      case "games_unlocked": {
        // Self-targeted, unlike every other kind here - this is "you just
        // unlocked today's games," not something to tell anyone else.
        // Goes through the same notifyUsers() tail as the rest (real push
        // to every device on file, logged into sent_notifications) rather
        // than the old client-only Notification.showNotification() call
        // this replaced, which fired locally on just the one open device
        // and never showed up in Notifications history.
        const result = await notifyUsers({
          userIds: [userId],
          kind: "games_unlocked",
          title: "🎮 Games Unlocked!",
          body: "You completed today's Core Run — Diamond Run, Diamond Chase, and Trivia are all unlocked for today.",
          url: "/games",
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

      case "badge_earned": {
        // Unlike every other kind here, the target isn't necessarily the
        // caller - checkAndAwardBadges() runs against whatever ownerId
        // the page it's called from is already scoped to, which can be
        // the caller's own id or their linked household partner's id.
        // Guard the same way onboarding_unlocked does (upline/admin),
        // plus allow the caller acting on their own or their household's
        // behalf, which onboarding_unlocked never needs to since nobody
        // unlocks their own session.
        const isAdmin = isPrimaryUser(userEmail);
        if (userId !== body.targetUserId && !isAdmin) {
          const { data: isUpline } = await admin.rpc("is_upline_of", {
            p_viewer: userId,
            p_target: body.targetUserId,
          });
          let allowed = Boolean(isUpline);
          if (!allowed) {
            const { data: callerProfile } = await admin
              .from("profiles")
              .select("household_id")
              .eq("id", userId)
              .maybeSingle();
            allowed = callerProfile?.household_id === body.targetUserId;
          }
          if (!allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
        }

        const { data: earner } = await admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", body.targetUserId)
          .maybeSingle();

        const selfResult = await notifyUsers({
          userIds: [body.targetUserId],
          kind: "badge_earned",
          title: `🏅 Badge earned: ${body.badgeLabel}`,
          body: `You just earned "${body.badgeLabel}"!`,
          url: "/badges",
        });

        const { data: uplineRows } = await admin.rpc("get_upline_user_ids", {
          p_user_id: body.targetUserId,
        });
        const uplineIds = ((uplineRows as { user_id?: string }[]) ?? [])
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id));

        const uplineResult = await notifyUsers({
          userIds: uplineIds,
          kind: "badge_earned",
          title: `🏅 ${fullName(earner)} earned a badge`,
          body: `${fullName(earner)} just earned "${body.badgeLabel}"!`,
          url: "/badges",
        });

        return NextResponse.json({
          sent: selfResult.sent + uplineResult.sent,
          skipped: selfResult.skipped + uplineResult.skipped,
          removed: selfResult.removed + uplineResult.removed,
          errors: [...selfResult.errors, ...uplineResult.errors],
        });
      }

      default:
        return NextResponse.json({ error: "Unknown notification kind" }, { status: 400 });
    }
  } catch (error: unknown) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
