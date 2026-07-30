"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ProfileForm from "@/components/ProfileForm";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { TEAMS, isBadgeExcluded } from "@/lib/constants";
import { BADGE_DEFINITIONS } from "@/lib/badges";
import BadgePillList from "@/components/BadgePillList";
import type { Profile, PublicProfile, UserBadge } from "@/lib/types";

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

  return (
    <>
      <PageHeader title="My Profile" subtitle="Shown when teammates tap your name on the Leaderboard" />
      <main className="page-main">
        {loading || !profile ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <>
            {!isBadgeExcluded(user.email) && (
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
            )}

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
