"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ProfileForm from "@/components/ProfileForm";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { TEAMS, US_TIMEZONES, THEME_COLORS, type ThemeColor } from "@/lib/constants";
import { guessTimeZone } from "@/lib/timezones";
import { BADGE_DEFINITIONS } from "@/lib/badges";
import { pointsForBadgeKeys, levelProgress, frameTierForLevel, FRAME_TIER_LABELS } from "@/lib/levels";
import BadgePillList from "@/components/BadgePillList";
import LevelAvatar from "@/components/LevelAvatar";
import type { Profile, PublicProfile, UserBadge } from "@/lib/types";

// Kept as a standalone module-scope function (not inlined in the click
// handler below) so it's the same "mutate document from a plain
// function, not a hook" shape AuthGate's own theme-applying effect uses -
// the two together are the entire client-side apply step for a colorway
// change, no other component needs to know about data-theme at all.
function applyThemeColor(key: string) {
  document.documentElement.dataset.theme = key;
}

export default function MyProfilePage() {
  const { user, ownerId, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [earnedBadges, setEarnedBadges] = useState<UserBadge[]>([]);

  const [partner, setPartner] = useState<PublicProfile | null>(null);
  const [partnerEmail, setPartnerEmail] = useState("");
  const [linkingSpouse, setLinkingSpouse] = useState(false);
  const [spouseError, setSpouseError] = useState<string | null>(null);

  const [upline, setUpline] = useState<PublicProfile | null>(null);
  const [uplineNumber, setUplineNumber] = useState("");
  const [linkingUpline, setLinkingUpline] = useState(false);
  const [uplineError, setUplineError] = useState<string | null>(null);

  // "Picked the wrong team at signup" fix - team lives only on the
  // profile row itself, and every leaderboard/stat function (individual
  // leaders, team totals, Core 300, Ditto, etc.) joins against it live
  // rather than storing a copy anywhere else, so changing it here is the
  // entire fix - nothing else needs to move or be re-entered. Own local
  // state (rather than binding straight to profile.team) so picking a
  // different team in the dropdown doesn't apply until Save, same
  // pattern as the Upline/Spouse cards below.
  const [teamChoice, setTeamChoice] = useState<string>("");
  const [syncedTeam, setSyncedTeam] = useState<string | null>(null);
  if (profile && profile.team !== syncedTeam) {
    setSyncedTeam(profile.team);
    setTeamChoice(profile.team ?? "");
  }
  const [savingTeam, setSavingTeam] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSaved, setTeamSaved] = useState(false);

  // Which US time zone this person is in - used as the default zone on
  // the Calendar's Add Event form (and to auto-fill for a linked
  // candidate when theirs isn't set). Same own-local-state-until-Save
  // pattern as My Team above. Defaults to a best guess from the device's
  // own zone rather than an arbitrary one, for whoever hasn't set this
  // explicitly yet.
  const [timezoneChoice, setTimezoneChoice] = useState<string>(() => guessTimeZone());
  const [syncedTimezone, setSyncedTimezone] = useState<string | null>(null);
  if (profile && profile.timezone !== syncedTimezone) {
    setSyncedTimezone(profile.timezone);
    setTimezoneChoice(profile.timezone ?? guessTimeZone());
  }
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [timezoneSaved, setTimezoneSaved] = useState(false);

  // Applies immediately on tap (no separate Save step, unlike Team/Time
  // Zone above) - a colorway is instant visual feedback, not something
  // that benefits from a confirm-before-apply step. document.documentElement's
  // data-theme is what actually repaints the app (every text-amber/
  // bg-amber/border-amber usage reads the CSS custom properties app/
  // globals.css overrides per data-theme value) - set optimistically here
  // and rolled back if the save fails, same pattern as everywhere else in
  // this file.
  const [savingThemeColor, setSavingThemeColor] = useState<ThemeColor | null>(null);
  const [themeColorError, setThemeColorError] = useState<string | null>(null);

  async function reload() {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile((data as Profile) ?? null);

    if (data?.household_id) {
      const { data: partnerData } = await supabase.rpc("get_public_profile", {
        p_user_id: data.household_id,
      });
      setPartner(((partnerData as PublicProfile[]) ?? [])[0] ?? null);
    } else {
      setPartner(null);
    }

    if (data?.upline_id) {
      const { data: uplineData } = await supabase.rpc("get_public_profile", {
        p_user_id: data.upline_id,
      });
      setUpline(((uplineData as PublicProfile[]) ?? [])[0] ?? null);
    } else {
      setUpline(null);
    }
  }

  useEffect(() => {
    async function load() {
      await reload();
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadBadges() {
      const { data } = await supabase
        .from("user_badges")
        .select("*")
        .eq("user_id", ownerId)
        .order("earned_at", { ascending: false });
      if (!cancelled) setEarnedBadges((data as UserBadge[]) ?? []);
    }
    loadBadges();
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  async function handleLinkSpouse() {
    const email = partnerEmail.trim();
    if (!email) return;
    setLinkingSpouse(true);
    setSpouseError(null);
    const { error } = await supabase.rpc("link_spouse", { p_partner_email: email });
    setLinkingSpouse(false);
    if (error) {
      setSpouseError(error.message);
      return;
    }
    setPartnerEmail("");
    await reload();
    refreshProfile();
  }

  async function handleUnlinkSpouse() {
    setLinkingSpouse(true);
    await supabase.from("profiles").update({ household_id: null }).eq("id", user.id);
    setLinkingSpouse(false);
    await reload();
    refreshProfile();
  }

  async function handleSaveTeam() {
    if (!teamChoice || teamChoice === profile?.team) return;
    setSavingTeam(true);
    setTeamError(null);
    setTeamSaved(false);
    const { error } = await supabase.from("profiles").update({ team: teamChoice }).eq("id", user.id);
    setSavingTeam(false);
    if (error) {
      setTeamError(error.message);
      return;
    }
    setTeamSaved(true);
    await reload();
    refreshProfile();
  }

  async function handleSaveTimezone() {
    if (!timezoneChoice || timezoneChoice === profile?.timezone) return;
    setSavingTimezone(true);
    setTimezoneError(null);
    setTimezoneSaved(false);
    const { error } = await supabase
      .from("profiles")
      .update({ timezone: timezoneChoice })
      .eq("id", user.id);
    setSavingTimezone(false);
    if (error) {
      setTimezoneError(error.message);
      return;
    }
    setTimezoneSaved(true);
    await reload();
    refreshProfile();
  }

  async function handleSetThemeColor(key: ThemeColor) {
    if (!profile || profile.theme_color === key || savingThemeColor) return;
    const previous = profile.theme_color;
    setThemeColorError(null);
    setSavingThemeColor(key);
    setProfile({ ...profile, theme_color: key });
    applyThemeColor(key);
    const { error } = await supabase.from("profiles").update({ theme_color: key }).eq("id", user.id);
    setSavingThemeColor(null);
    if (error) {
      setProfile((prev) => (prev ? { ...prev, theme_color: previous } : prev));
      applyThemeColor(previous);
      setThemeColorError(error.message);
      return;
    }
    refreshProfile();
  }

  async function handleLinkUpline() {
    const number = uplineNumber.trim();
    if (!number) return;
    setLinkingUpline(true);
    setUplineError(null);
    const { error } = await supabase.rpc("link_upline", { p_account_number: number });
    setLinkingUpline(false);
    if (error) {
      setUplineError(error.message);
      return;
    }
    setUplineNumber("");
    await reload();
  }

  async function handleUnlinkUpline() {
    setLinkingUpline(true);
    await supabase.from("profiles").update({ upline_id: null }).eq("id", user.id);
    setLinkingUpline(false);
    await reload();
  }

  const totalPoints = pointsForBadgeKeys(earnedBadges.map((ub) => ub.badge_key));
  const myLevel = levelProgress(totalPoints);
  const myTier = frameTierForLevel(myLevel.level);

  return (
    <>
      <PageHeader title="My Profile" subtitle="Shown when teammates tap your name on the Leaderboard" />
      <main className="page-main">
        {loading || !profile ? (
          <SkeletonList cards={2} />
        ) : (
          <>
            <div className="card flex items-center gap-3">
              <LevelAvatar
                photoUrl={profile.photo_url}
                level={myLevel.level}
                name={[profile.first_name, profile.last_name].filter(Boolean).join(" ")}
                size="lg"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="section-title">Level {myLevel.level}</p>
                  <span className="pill-amber shrink-0">{FRAME_TIER_LABELS[myTier]}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-navy">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-light to-amber"
                    style={{ width: `${Math.round(myLevel.progress * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  {totalPoints} pts
                  {myLevel.nextLevelPoints
                    ? ` — ${myLevel.nextLevelPoints - totalPoints} to Level ${myLevel.level + 1}`
                    : " — max level"}
                </p>
              </div>
            </div>

            <div className="card space-y-2">
              <p className="section-title">🎨 App Color</p>
              <p className="text-xs text-slate-400">
                Pick an accent color for the whole app — it&apos;s just yours, everyone else keeps
                whatever they&apos;ve chosen.
              </p>
              <div className="flex flex-wrap gap-3">
                {THEME_COLORS.map((theme) => {
                  const isActive = profile.theme_color === theme.key;
                  return (
                    <button
                      key={theme.key}
                      type="button"
                      className="flex flex-col items-center gap-1"
                      onClick={() => handleSetThemeColor(theme.key)}
                      disabled={savingThemeColor !== null}
                      aria-label={theme.label}
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full text-sm"
                        style={{
                          backgroundColor: theme.swatch,
                          boxShadow: isActive
                            ? `0 0 0 2px var(--color-navy-lighter), 0 0 0 4px ${theme.swatch}`
                            : "none",
                        }}
                      >
                        {isActive && <span className="text-navy">✓</span>}
                      </span>
                      <span className="text-[11px] text-slate-400">{theme.label}</span>
                    </button>
                  );
                })}
              </div>
              {themeColorError && <p className="text-xs text-red-400">{themeColorError}</p>}
            </div>

            <div className="card space-y-2">
              <Link href="/badges" className="flex items-center justify-between gap-2">
                <p className="section-title">🏅 My Badges</p>
                <span className="pill-amber">
                  {earnedBadges.length}/{BADGE_DEFINITIONS.length}
                </span>
              </Link>
              {earnedBadges.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No badges earned yet —{" "}
                  <Link href="/badges" className="underline">
                    tap in to see what&apos;s available
                  </Link>
                  .
                </p>
              ) : (
                <BadgePillList
                  badges={earnedBadges.map((ub) => ({ badge_key: ub.badge_key, earned_at: ub.earned_at }))}
                />
              )}
            </div>

            <div className="card space-y-2">
              <p className="section-title">My Team</p>
              <p className="text-xs text-slate-400">
                Picked the wrong team at signup? Change it here — every leaderboard entry and
                team total reads your team live off this field, so switching it moves your
                Pipeline, Volume, Core Run Streak, and Leaderboard stats over to the new team
                right away. Nothing needs to be re-entered.
              </p>
              <div className="flex items-center gap-2">
                <select
                  className="select flex-1"
                  value={teamChoice}
                  onChange={(e) => {
                    setTeamChoice(e.target.value);
                    setTeamSaved(false);
                  }}
                >
                  {TEAMS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary shrink-0"
                  onClick={handleSaveTeam}
                  disabled={savingTeam || !teamChoice || teamChoice === profile.team}
                >
                  {savingTeam ? "Saving…" : "Save"}
                </button>
              </div>
              {teamError && <p className="text-xs text-red-400">{teamError}</p>}
              {teamSaved && <p className="text-xs text-amber-light">Team updated.</p>}
            </div>

            <div className="card space-y-2">
              <p className="section-title">🌐 My Time Zone</p>
              <p className="text-xs text-slate-400">
                Used as the default zone when you add a Calendar event, and to auto-fill a
                candidate&apos;s time when scheduling for them if their own zone hasn&apos;t been
                set on their Candidate Roadmap card.
              </p>
              <div className="flex items-center gap-2">
                <select
                  className="select flex-1"
                  value={timezoneChoice}
                  onChange={(e) => {
                    setTimezoneChoice(e.target.value);
                    setTimezoneSaved(false);
                  }}
                >
                  {US_TIMEZONES.map((tz) => (
                    <option key={tz.key} value={tz.key}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary shrink-0"
                  onClick={handleSaveTimezone}
                  disabled={savingTimezone || !timezoneChoice || timezoneChoice === profile.timezone}
                >
                  {savingTimezone ? "Saving…" : "Save"}
                </button>
              </div>
              {timezoneError && <p className="text-xs text-red-400">{timezoneError}</p>}
              {timezoneSaved && <p className="text-xs text-amber-light">Time zone updated.</p>}
            </div>

            <div className="card space-y-2">
              <p className="section-title">My Account Number</p>
              <p className="text-xs text-slate-400">
                Give this to anyone you want to be the upline for — once they enter it below,
                you&apos;ll see their numbers (and Assistant conversations) on the Team tab.
              </p>
              <p className="text-2xl font-bold tracking-wide text-amber">
                {profile.account_number}
              </p>
            </div>

            <div className="card space-y-2">
              <p className="section-title">My Upline</p>
              <p className="text-xs text-slate-400">
                Enter your upline&apos;s account number to give them read-only visibility into your
                Pipeline, Candidates, Contacts, Volume, Core Run Streak, and Assistant
                conversations — same as an admin sees. This doesn&apos;t change or share your data,
                it only grants them a view.
              </p>
              {profile.upline_id ? (
                <>
                  <p className="text-sm text-slate-200">
                    Reporting to{" "}
                    <span className="font-medium text-white">
                      {upline
                        ? [upline.first_name, upline.last_name].filter(Boolean).join(" ")
                        : "…"}
                    </span>
                  </p>
                  <button
                    className="btn-secondary w-full"
                    onClick={handleUnlinkUpline}
                    disabled={linkingUpline}
                  >
                    {linkingUpline ? "Removing…" : "Remove Upline"}
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    placeholder="Upline's account number"
                    value={uplineNumber}
                    onChange={(e) => setUplineNumber(e.target.value)}
                  />
                  <button
                    className="btn-primary shrink-0"
                    onClick={handleLinkUpline}
                    disabled={linkingUpline || !uplineNumber.trim()}
                  >
                    {linkingUpline ? "Linking…" : "Link"}
                  </button>
                </div>
              )}
              {uplineError && <p className="text-xs text-red-400">{uplineError}</p>}
            </div>

            <div className="card space-y-2">
              <p className="section-title">Linked Spouse</p>
              <p className="text-xs text-slate-400">
                Everything except Core Run Streak and this profile — Pipeline, Candidates,
                Contacts, Volume — becomes one shared record between you and your spouse&apos;s
                login. Core Run Streak and profiles stay individual, so a couple shows up as two
                people to tap through on the Leaderboard.
              </p>
              {profile.household_id ? (
                <>
                  <p className="text-sm text-slate-200">
                    Linked to{" "}
                    <span className="font-medium text-white">
                      {partner
                        ? [partner.first_name, partner.last_name].filter(Boolean).join(" ")
                        : "…"}
                    </span>
                  </p>
                  <button
                    className="btn-secondary w-full"
                    onClick={handleUnlinkSpouse}
                    disabled={linkingSpouse}
                  >
                    {linkingSpouse ? "Unlinking…" : "Unlink"}
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    className="input"
                    placeholder="Spouse's email"
                    value={partnerEmail}
                    onChange={(e) => setPartnerEmail(e.target.value)}
                  />
                  <button
                    className="btn-primary shrink-0"
                    onClick={handleLinkSpouse}
                    disabled={linkingSpouse || !partnerEmail.trim()}
                  >
                    {linkingSpouse ? "Linking…" : "Link"}
                  </button>
                </div>
              )}
              {spouseError && <p className="text-xs text-red-400">{spouseError}</p>}
            </div>

            {saved && <p className="px-1 text-xs text-amber-light">Saved.</p>}
            <ProfileForm
              userId={user.id}
              profile={profile}
              onDone={() => {
                setSaved(true);
                reload();
              }}
            />
          </>
        )}
      </main>
    </>
  );
}
