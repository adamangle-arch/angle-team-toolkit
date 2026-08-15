"use client";

import { use, useEffect, useState } from "react";
import { Flame, BookOpen, Headphones, Medal } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import BadgePillList from "@/components/BadgePillList";
import { SkeletonList } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import { STREAK_MILESTONES } from "@/lib/constants";
import { BADGE_DEFINITIONS } from "@/lib/badges";
import { checkAndAwardBadges } from "@/lib/badgeEngine";
import { pointsForBadgeKeys, levelProgress, frameTierForLevel, FRAME_TIER_LABELS } from "@/lib/levels";
import LevelAvatar from "@/components/LevelAvatar";
import type { PublicProfile } from "@/lib/types";

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [badges, setBadges] = useState<{ badge_key: string; earned_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: profileData }, { data: badgeData }] = await Promise.all([
        supabase.rpc("get_public_profile", { p_user_id: id }),
        supabase.rpc("get_public_badges", { p_user_id: id }),
      ]);
      if (cancelled) return;
      setProfile(((profileData as PublicProfile[]) ?? [])[0] ?? null);
      setBadges((badgeData as { badge_key: string; earned_at: string }[]) ?? []);
      setLoading(false);

      // Best-effort catch-up: this may be the only place badge
      // evaluation ever runs for an account that rarely opens Today or
      // Badges itself - checkAndAwardBadges no-ops safely (RLS blocks
      // the insert) if the viewer isn't allowed to award on this
      // person's behalf.
      const { data: badgeOwnerId } = await supabase.rpc("get_badge_owner_id", { p_user_id: id });
      if (cancelled || !badgeOwnerId) return;
      await checkAndAwardBadges(badgeOwnerId as string);
      const { data: refreshedBadges } = await supabase.rpc("get_public_badges", { p_user_id: id });
      if (!cancelled) setBadges((refreshedBadges as { badge_key: string; earned_at: string }[]) ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const name = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unnamed"
    : "";

  const audios = profile
    ? [profile.favorite_audio_1, profile.favorite_audio_2, profile.favorite_audio_3].filter(
        Boolean
      )
    : [];
  const books = profile
    ? [profile.favorite_book_1, profile.favorite_book_2, profile.favorite_book_3].filter(Boolean)
    : [];

  const totalPoints = pointsForBadgeKeys(badges.map((b) => b.badge_key));
  const theirLevel = levelProgress(totalPoints);
  const theirTier = frameTierForLevel(theirLevel.level);

  return (
    <>
      <PageHeader title="Profile" />
      <main className="page-main">
        {loading ? (
          <SkeletonList cards={2} />
        ) : !profile ? (
          <div className="empty-state">Profile not found.</div>
        ) : (
          <>
            <div className="card flex items-center gap-3">
              <LevelAvatar photoUrl={profile.photo_url} level={theirLevel.level} name={name} size="lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-semibold text-white">{name}</p>
                  {profile.team && <p className="pill-amber shrink-0">{profile.team}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="pill shrink-0">Level {theirLevel.level}</span>
                  <span className="text-xs text-slate-400">{FRAME_TIER_LABELS[theirTier]}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-light to-amber"
                    style={{ width: `${Math.round(theirLevel.progress * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {(profile.current_streak > 0 ||
              profile.last_read_what ||
              profile.last_listen_what) && (
              <div className="card space-y-2">
                <div className="flex items-center justify-between">
                  <p className="section-title flex items-center gap-1.5">
                    <Flame className="h-4 w-4" aria-hidden />
                    Core Run
                  </p>
                  <span className={profile.current_streak > 0 ? "pill-amber" : "pill"}>
                    {profile.current_streak} day{profile.current_streak === 1 ? "" : "s"} streak
                  </span>
                </div>
                {profile.last_read_what && (
                  <p className="text-sm text-slate-200">
                    <BookOpen className="inline h-3.5 w-3.5" aria-hidden /> Currently reading{" "}
                    <span className="font-medium">{profile.last_read_what}</span>
                    {profile.last_read_amount ? ` — ${profile.last_read_amount}` : ""}
                  </p>
                )}
                {profile.last_listen_what && (
                  <p className="text-sm text-slate-200">
                    <Headphones className="inline h-3.5 w-3.5" aria-hidden /> Recently listened to{" "}
                    <span className="font-medium">{profile.last_listen_what}</span>
                    {profile.last_listen_count
                      ? ` — ${profile.last_listen_count} audio(s)`
                      : ""}
                  </p>
                )}
              </div>
            )}

            {STREAK_MILESTONES.some((m) => profile.longest_streak >= m.days) && (
              <div className="card space-y-2">
                <p className="section-title flex items-center gap-1.5">
                  <Medal className="h-4 w-4" aria-hidden />
                  Milestones
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STREAK_MILESTONES.filter((m) => profile.longest_streak >= m.days).map((m) => (
                    <span key={m.days} className="pill-amber flex items-center gap-1">
                      <Medal className="h-3 w-3" aria-hidden />
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title flex items-center gap-1.5">
                  <Medal className="h-4 w-4" aria-hidden />
                  Badges
                </p>
                <span className="pill-amber">
                  {badges.length}/{BADGE_DEFINITIONS.length}
                </span>
              </div>
              {badges.length === 0 ? (
                <p className="text-xs text-slate-400">No badges earned yet.</p>
              ) : (
                <BadgePillList badges={badges} />
              )}
            </div>

            {profile.hometown && (
              <div className="card space-y-1">
                <p className="section-title">Hometown</p>
                <p className="text-sm text-slate-200">{profile.hometown}</p>
              </div>
            )}

            {profile.background && (
              <div className="card space-y-1">
                <p className="section-title">Background</p>
                <p className="text-sm text-slate-200">{profile.background}</p>
              </div>
            )}

            {audios.length > 0 && (
              <div className="card space-y-1">
                <p className="section-title">Top Favorite Audios</p>
                {audios.map((a, i) => (
                  <p key={i} className="text-sm text-slate-200">
                    {i + 1}. {a}
                  </p>
                ))}
              </div>
            )}

            {books.length > 0 && (
              <div className="card space-y-1">
                <p className="section-title">Top Favorite Books</p>
                {books.map((b, i) => (
                  <p key={i} className="text-sm text-slate-200">
                    {i + 1}. {b}
                  </p>
                ))}
              </div>
            )}

            {profile.team_impact && (
              <div className="card space-y-1">
                <p className="section-title">How This Team Has Helped</p>
                <p className="text-sm text-slate-200">{profile.team_impact}</p>
              </div>
            )}

            {!profile.hometown &&
              !profile.background &&
              audios.length === 0 &&
              books.length === 0 &&
              !profile.team_impact && (
                <div className="empty-state">
                  {name} hasn&apos;t filled in their profile yet.
                </div>
              )}
          </>
        )}
      </main>
    </>
  );
}
