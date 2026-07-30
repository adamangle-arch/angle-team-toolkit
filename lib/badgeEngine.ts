import { supabase } from "@/lib/supabaseClient";
import { BADGE_DEFINITIONS, isBadgeEarned } from "@/lib/badges";
import type { BadgeMetrics, UserBadge } from "@/lib/types";

// Called opportunistically (Today dashboard load, Badges tab load) -
// not from every single save action across the app, since almost
// every metric a badge checks is "longest/max ever" rather than
// "just now," so it doesn't need to fire the instant a number changes
// to still feel prompt. ownerId is the same household-owner id used
// everywhere else (Pipeline Tracker, Volume, Core Run Streak) - an
// upline filling in a downline's numbers still awards the badge (and
// notification) to that downline's own ownerId, never the upline.
export async function checkAndAwardBadges(ownerId: string): Promise<void> {
  try {
    const [{ data: metricsRows }, { data: existingRows }] = await Promise.all([
      supabase.rpc("get_badge_metrics", { p_user_id: ownerId }),
      supabase.from("user_badges").select("badge_key").eq("user_id", ownerId),
    ]);
    const metrics = (metricsRows as BadgeMetrics[] | null)?.[0];
    if (!metrics) return;

    const existingKeys = new Set(
      ((existingRows as Pick<UserBadge, "badge_key">[]) ?? []).map((r) => r.badge_key)
    );

    const regularDefs = BADGE_DEFINITIONS.filter((def) => !("special" in def));
    const metaDefs = BADGE_DEFINITIONS.filter((def) => "special" in def);

    const newlyEarnedRegular = regularDefs.filter(
      (def) => !existingKeys.has(def.key) && isBadgeEarned(def, metrics)
    );

    // Meta badges (Full Spectrum, Perfectionist) depend on the earned-key
    // set itself, so they're checked against "existing + newly-earned
    // this pass" rather than metrics - that way earning the last badge a
    // meta badge needs triggers it in the same pass, not a pass later.
    const projectedKeys = new Set([...existingKeys, ...newlyEarnedRegular.map((def) => def.key)]);
    const newlyEarnedMeta = metaDefs.filter(
      (def) => !existingKeys.has(def.key) && isBadgeEarned(def, metrics, projectedKeys)
    );

    const newlyEarned = [...newlyEarnedRegular, ...newlyEarnedMeta];
    if (newlyEarned.length === 0) return;

    for (const def of newlyEarned) {
      const { error } = await supabase
        .from("user_badges")
        .insert({ user_id: ownerId, badge_key: def.key })
        .select("id")
        .single();
      // Race with another tab/session already awarding the same badge -
      // the unique(user_id, badge_key) constraint rejects the duplicate,
      // which is exactly the outcome wanted (skip re-notifying).
      if (error) continue;
      await fireBadgeNotification(ownerId, def.label);
    }
  } catch {
    // Best-effort only - badge detection is a side effect tacked onto
    // whatever page triggered it and should never surface an error or
    // block that page's own work.
  }
}

async function fireBadgeNotification(targetUserId: string, badgeLabel: string): Promise<void> {
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
      body: JSON.stringify({ kind: "badge_earned", targetUserId, badgeLabel }),
    });
  } catch {
    // Best-effort only, same reasoning as above.
  }
}
