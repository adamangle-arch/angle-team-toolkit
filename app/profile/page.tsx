"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ProfileForm from "@/components/ProfileForm";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import type { Profile, PublicProfile } from "@/lib/types";

export default function MyProfilePage() {
  const { user, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const [partner, setPartner] = useState<PublicProfile | null>(null);
  const [partnerEmail, setPartnerEmail] = useState("");
  const [linkingSpouse, setLinkingSpouse] = useState(false);
  const [spouseError, setSpouseError] = useState<string | null>(null);

  const [upline, setUpline] = useState<PublicProfile | null>(null);
  const [uplineNumber, setUplineNumber] = useState("");
  const [linkingUpline, setLinkingUpline] = useState(false);
  const [uplineError, setUplineError] = useState<string | null>(null);

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
