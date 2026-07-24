"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ProfileForm from "@/components/ProfileForm";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/lib/types";

export default function MyProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  async function reload() {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    const uid = user.id;
    async function load() {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
      setProfile((data as Profile) ?? null);
      setLoading(false);
    }
    load();
  }, [user.id]);

  return (
    <>
      <PageHeader title="My Profile" subtitle="Shown when teammates tap your name on the Leaderboard" />
      <main className="page-main">
        {loading || !profile ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <>
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
