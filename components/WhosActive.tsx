"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import AvatarWithStory from "@/components/AvatarWithStory";
import { SkeletonList } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import { useActiveStories } from "@/lib/useActiveStories";
import type { TeamMemberBasic } from "@/lib/types";

// A day's worth of staleness - long enough to still be useful ("seen this
// morning") without listing someone who hasn't opened the app in a week.
const RECENTLY_ACTIVE_HOURS = 24;

function personName(entry: { first_name: string | null; last_name: string | null }): string {
  return [entry.first_name, entry.last_name].filter(Boolean).join(" ") || "Unnamed";
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

// The first thing anyone sees on Home - who's on the app right now, at a
// glance, by face and first name only (no full-name roll call; that used
// to be a whole sentence naming everyone, which got unreadable past a
// handful of people). Reuses the same team-wide roster RPC Leaderboard's
// Spotlight tab already added (get_all_team_members) - which of them are
// actually online comes from AuthGate's Realtime Presence channel
// (activeUserIds), not from this; last_active_at (also on this same row)
// backs the "recently active but not online right now" half of the row.
// Previously lived on the Stories page as "Who's Around" - moved here
// since it's a team-pulse check, not something specific to Stories, and
// belongs where everyone actually looks first.
export default function WhosActive() {
  const { user, activeUserIds } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMemberBasic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { storiesByUser } = useActiveStories();

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_all_team_members").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setTeamMembers((data as TeamMemberBasic[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeMembers = (teamMembers ?? []).filter((m) => activeUserIds.includes(m.user_id));
  // Excludes anyone already counted live in activeMembers - being both
  // currently online and "recently" active is redundant to show twice.
  const recentlyActiveMembers = (teamMembers ?? [])
    .filter((m) => !activeUserIds.includes(m.user_id) && m.last_active_at)
    .filter((m) => hoursSince(m.last_active_at as string) <= RECENTLY_ACTIVE_HOURS)
    .sort((a, b) => (b.last_active_at as string).localeCompare(a.last_active_at as string));
  // One combined row - active-now people first (green dot), then anyone
  // else active in the last 24h, faces only, tap through to their profile.
  const members = [
    ...activeMembers.map((m) => ({ ...m, isActiveNow: true })),
    ...recentlyActiveMembers.map((m) => ({ ...m, isActiveNow: false })),
  ];

  return (
    <div className="card space-y-2">
      <p className="section-title flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
        Who&apos;s Active
      </p>
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : teamMembers === null ? (
        <SkeletonList cards={1} lines={2} />
      ) : members.length === 0 ? (
        <p className="empty-state">No one else has been active in the last 24 hours.</p>
      ) : (
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-0.5">
          {members.map((m) => (
            <AvatarWithStory
              key={m.user_id}
              userId={m.user_id}
              photoUrl={m.photo_url}
              level={1}
              showLevelChip={false}
              size="sm"
              name={personName(m)}
              stories={storiesByUser.get(m.user_id)}
              className="flex w-14 shrink-0 flex-col items-center gap-1 text-center"
              overlay={
                m.isActiveNow && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-navy"
                    aria-hidden="true"
                  />
                )
              }
            >
              <span className="w-full truncate text-[10px] text-slate-300">
                {m.user_id === user.id ? "You" : m.first_name || "Unnamed"}
              </span>
            </AvatarWithStory>
          ))}
        </div>
      )}
    </div>
  );
}
