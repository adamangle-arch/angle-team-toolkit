import { supabase } from "@/lib/supabaseClient";

type NotifyBody =
  | { kind: "calendar_event_added"; title: string; eventAt: string; scope: "downline" | "all" }
  | { kind: "call_rating_submitted"; candidateName: string; callType: string; overallScore: number | null }
  | { kind: "core_run_completed" }
  | { kind: "pipeline_5plus" }
  | { kind: "onboarding_unlocked"; targetUserId: string; sessionNumber: number };

// Fire-and-forget: every call site here is a side effect tacked onto an
// action that already succeeded (a broadcast event sent, a rating saved,
// a session granted), so a push notification failing to send should never
// surface an error to the user or block their flow — swallow it, same
// spirit as notifyTriviaUnlocked in app/streak/page.tsx.
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
