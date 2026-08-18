import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { StoryPost } from "@/lib/types";

// Every currently-active (last 24h) story, grouped by poster and sorted
// oldest-first within each person's set (chronological, matching how
// Instagram/Snapchat play a story back from the start) - shared by every
// place an avatar can open someone's story (Stories page's own tray,
// Who's Active, Leaderboard rows, Profile pages) so each of those
// doesn't need to re-fetch+re-group get_active_stories() on its own.
export function useActiveStories(): { storiesByUser: Map<string, StoryPost[]>; loading: boolean } {
  const [storiesByUser, setStoriesByUser] = useState<Map<string, StoryPost[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_active_stories").then(({ data }) => {
      if (cancelled) return;
      const rows = ((data as StoryPost[]) ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
      const map = new Map<string, StoryPost[]>();
      for (const row of rows) {
        const list = map.get(row.user_id) ?? [];
        list.push(row);
        map.set(row.user_id, list);
      }
      setStoriesByUser(map);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { storiesByUser, loading };
}
