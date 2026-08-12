import { supabase } from "@/lib/supabaseClient";

type NotifyBody =
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
  | { kind: "leaderboard_liked"; targetUserId: string }
  | { kind: "story_posted" }
  | { kind: "candidate_launched"; candidateName: string }
  | { kind: "candidate_filtered_out"; candidateName: string }
  | { kind: "member_resource_sent"; targetUserId: string; resourceLabel: string }
  | { kind: "library_resource_added"; resourceLabel: string }
  | { kind: "streak_milestone_reached"; days: number; label: string }
  | { kind: "downline_signup_linked"; firstName: string; lastName: string }
  | { kind: "customer_sale_logged" }
  | { kind: "onboarding_completed"; targetUserId: string };

// Fire-and-forget: every call site here is a side effect tacked onto an
// action that already succeeded (a broadcast event sent, a rating saved,
// a session granted), so a push notification failing to send should never
// surface an error to the user or block their flow — swallow it.
export async function fireNotifyEvent(body: NotifyBody): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return;
    await fetch("/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort only — see comment above.
  }
}
