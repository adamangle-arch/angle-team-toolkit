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
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

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
  }

  useEffect(() => {
    const uid = user.id;
    async function load() {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
      setProfile((data as Profile) ?? null);
      if (data?.household_id) {
        const { data: partnerData } = await supabase.rpc("get_public_profile", {
          p_user_id: data.household_id,
        });
        setPartner(((partnerData as PublicProfile[]) ?? [])[0] ?? null);
      }
      setLoading(false);
    }
    load();
  }, [user.id]);

  async function handleLink() {
    const email = partnerEmail.trim();
    if (!email) return;
    setLinking(true);
    setLinkError(null);
    const { error } = await supabase.rpc("link_spouse", { p_partner_email: email });
    setLinking(false);
    if (error) {
      setLinkError(error.message);
      return;
    }
    setPartnerEmail("");
    await reload();
    refreshProfile();
  }

  async function handleUnlink() {
    setLinking(true);
    await supabase.from("profiles").update({ household_id: null }).eq("id", user.id);
    setLinking(false);
    await reload();
    refreshProfile();
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
                  <button className="btn-secondary w-full" onClick={handleUnlink} disabled={linking}>
                    {linking ? "Unlinking…" : "Unlink"}
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
                    onClick={handleLink}
                    disabled={linking || !partnerEmail.trim()}
                  >
                    {linking ? "Linking…" : "Link"}
                  </button>
                </div>
              )}
              {linkError && <p className="text-xs text-red-400">{linkError}</p>}
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
