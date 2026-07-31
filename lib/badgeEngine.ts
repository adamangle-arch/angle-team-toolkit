import { supabase } from "@/lib/supabaseClient";
import { BADGE_DEFINITIONS, isBadgeEarned } from "@/lib/badges";
import type { BadgeMetrics, UserBadge } from "@/lib/types";

// Called opportunistically (Today dashboard load, Badges tab load, the
// Badges tab's own log actions, and every Core Run Streak save) rather
// than gated behind some central scheduler - it's cheap and fully
// idempotent (existing badges are always excluded before inserting), so
// calling it "too often" just means a newly-crossed threshold shows up
// sooner. ownerId is the same household-owner id used
// everywhere else (Pipeline Tracker, Volume, Core Run Streak) - an
// upline filling in a downline's numbers still awards the badge (and
// notification) to that downline's own ownerId, never the upline.
export async function checkAndAwardBadges(ownerId: string): Promise<void> {
  try {
    const [{ data: metricsRows, error: metricsError }, { data: existingRows, error: existingError }] =
      await Promise.all([
        supabase.rpc("get_badge_metrics", { p_user_id: ownerId }),
        supabase.from("user_badges").select("badge_key, earned_at").eq("user_id", ownerId),
      ]);
    // Previously silent: a Postgres error from this RPC (e.g. a runtime
    // exception in one of its many correlated subqueries) resolves as
    // { data: null, error }, not a thrown exception - the metrics === null
    // early return below still fires either way, but without this log
    // there was no trace anywhere that badge evaluation had ever failed
    // for a given account rather than genuinely not qualifying yet.
    if (metricsError) console.error("checkAndAwardBadges: get_badge_metrics failed", metricsError);
    if (existingError) console.error("checkAndAwardBadges: user_badges select failed", existingError);
    const metrics = (metricsRows as BadgeMetrics[] | null)?.[0];
    if (!metrics) return;

    const existingMap = new Map(
      ((existingRows as Pick<UserBadge, "badge_key" | "earned_at">[]) ?? []).map((r) => [
        r.badge_key,
        r.earned_at,
      ])
    );
    const existingKeys = new Set(existingMap.keys());

    const regularDefs = BADGE_DEFINITIONS.filter((def) => !("special" in def));
    const metaDefs = BADGE_DEFINITIONS.filter((def) => "special" in def);

    const newlyEarnedRegular = regularDefs.filter(
      (def) => !existingKeys.has(def.key) && isBadgeEarned(def, metrics)
    );

    // Meta badges (Full Spectrum, Perfectionist, Well-Rounded) depend on
    // the earned-badge set itself (Well-Rounded needs earned_at too), so
    // they're checked against "existing + newly-earned this pass" rather
    // than metrics - that way earning the last badge a meta badge needs
    // triggers it in the same pass, not a pass later. Newly-earned
    // regular badges get "now" as their earned_at since that's the
    // instant they'll actually be inserted.
    const nowIso = new Date().toISOString();
    const projectedKeys = new Map(existingMap);
    for (const def of newlyEarnedRegular) projectedKeys.set(def.key, nowIso);
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
      // which is exactly the outcome wanted (skip re-notifying). Anything
      // else (e.g. RLS blocking the insert because the viewer isn't
      // self/household/upline/admin for this ownerId) is worth logging -
      // otherwise a badge that should have been earned silently never is.
      if (error) {
        if (error.code !== "23505") {
          console.error("checkAndAwardBadges: insert failed for", def.key, error);
        }
        continue;
      }
      await fireBadgeNotification(ownerId, def.label);
    }
  } catch (err) {
    // Best-effort only - badge detection is a side effect tacked onto
    // whatever page triggered it and should never surface an error or
    // block that page's own work. Still logged (not swallowed silently)
    // so a real bug doesn't just look like "never qualified."
    console.error("checkAndAwardBadges failed", err);
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
