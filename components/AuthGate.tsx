"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import LoginForm from "./LoginForm";
import BottomNav from "./BottomNav";
import ConfigWarning from "./ConfigWarning";
import ProfileGate from "./ProfileGate";
import ProfileDetailsGate from "./ProfileDetailsGate";
import QuoteOverlay from "./QuoteOverlay";
import type { Profile } from "@/lib/types";

type AuthContextValue = {
  user: User;
  // Resolved household owner for the shared business tables (pipeline,
  // candidates, contacts, PV, customer sales) — equals user.id unless
  // this account has linked to a spouse via My Profile, in which case
  // it's the spouse's id. Core Run Streak and the profile itself always
  // use user.id directly, never ownerId.
  ownerId: string;
  refreshProfile: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthGate");
  return ctx;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(uid: string) {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    setProfile((data as Profile) ?? null);
    setProfileLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    async function load() {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
      setProfile((data as Profile) ?? null);
      setProfileLoading(false);
    }
    load();
  }, [user]);

  const nameTeamComplete = Boolean(profile?.first_name && profile?.last_name && profile?.team);
  const fullyAuthed = Boolean(user && !profileLoading && profile && nameTeamComplete && profile.profile_prompted);

  // Whatever URL the browser/PWA happens to resume at (a bookmark, an
  // iOS home-screen launch resuming its last page, a stale tab), the
  // first time the fully-authenticated app shell mounts in a given tab
  // session, send them to the Today dashboard instead of wherever that
  // URL points. sessionStorage (not localStorage) is what makes this
  // "once per app open" rather than "once ever" or "on every reload."
  useEffect(() => {
    if (!fullyAuthed) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("atk_app_opened")) return;
    sessionStorage.setItem("atk_app_opened", "1");
    if (pathname !== "/dashboard") {
      router.replace("/dashboard");
    }
  }, [fullyAuthed, pathname, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ConfigWarning />
        <LoginForm />
      </>
    );
  }

  if (profileLoading || !profile) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!nameTeamComplete) {
    return (
      <>
        <ConfigWarning />
        <ProfileGate user={user} onComplete={() => loadProfile(user.id)} />
      </>
    );
  }

  if (!profile.profile_prompted) {
    return (
      <>
        <ConfigWarning />
        <ProfileDetailsGate user={user} profile={profile} onDone={() => loadProfile(user.id)} />
      </>
    );
  }

  const ownerId = profile.household_id ?? user.id;

  return (
    <AuthContext.Provider
      value={{
        user,
        ownerId,
        refreshProfile: () => loadProfile(user.id),
        signOut: () => supabase.auth.signOut(),
      }}
    >
      <ConfigWarning />
      <QuoteOverlay />
      {children}
      <BottomNav />
    </AuthContext.Provider>
  );
}
