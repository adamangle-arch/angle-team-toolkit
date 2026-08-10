"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getToday } from "@/lib/dates";
import { isPrimaryUser } from "@/lib/constants";

// Shared by all three games (Diamond Run, Diamond Chase, Trivia) - unlocks
// on EITHER finishing today's Core Run OR simply having an active streak
// already. get_current_streak walks back to yesterday when today isn't
// logged yet, so someone who reliably logs their Core Run late at night
// isn't locked out of games all day despite an unbroken streak - only
// someone who's actually let the streak lapse stays locked until they log
// today's. Admins bypass entirely, same carve-out used for Onboarding
// session gating.
export function useCoreRunUnlock(userId: string, userEmail: string | null | undefined) {
  const [coreRunDoneToday, setCoreRunDoneToday] = useState(false);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [{ data: dayRow }, { data: streakValue }] = await Promise.all([
        supabase
          .from("streak_days")
          .select("read,listen,daily_update,story_share")
          .eq("user_id", userId)
          .eq("day", getToday())
          .maybeSingle(),
        supabase.rpc("get_current_streak", { p_user_id: userId }),
      ]);
      if (cancelled) return;
      setCoreRunDoneToday(
        Boolean(dayRow?.read && dayRow?.listen && dayRow?.daily_update && dayRow?.story_share)
      );
      setStreak((streakValue as number) ?? 0);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const unlocked = isPrimaryUser(userEmail) || coreRunDoneToday || streak > 0;

  return { unlocked, loading, coreRunDoneToday, streak };
}
