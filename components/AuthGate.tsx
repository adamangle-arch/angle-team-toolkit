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
import RatingJobsProvider from "./RatingJobsProvider";
import { ONBOARDING_SESSIONS, isPrimaryUser } from "@/lib/constants";
import type { Profile } from "@/lib/types";

type AuthContextValue = {
  user: User;
  // Resolved household owner for the shared business tables (pipeline,
  // candidates, contacts, PV, customer sales) — equals user.id unless
  // this account has linked to a spouse via My Profile, in which case
  // it's the spouse's id. Core Run Streak and the profile itself always
  // use user.id directly, never ownerId.
  ownerId: string;
  // How many Onboarding sessions are unlocked (Infinity for admins) -
  // drives the progressive feature-unlock gating in lib/onboarding-gate.ts
  // (BottomNav, the More tab, and each gated page all read this).
  unlockedThrough: number;
  onboardingComplete: boolean;
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

  // Admins always see the whole app - onboarding gating is for brand-new
  // signups, not for the people running the team.
  const isAdmin = Boolean(user && isPrimaryUser(user.email));

  // TEMPORARY: lets an admin preview a locked-down tier without touching
  // their real onboarding_unlocked_through row. From the browser console:
  //   sessionStorage.setItem("atk_debug_unlock", "2"); location.reload();
  // and to go back to normal:
  //   sessionStorage.removeItem("atk_debug_unlock"); location.reload();
  // Session-only (clears on tab close) and admin-only - remove this block
  // once testing is done.
  const debugUnlock =
    typeof window !== "undefined" && isAdmin
      ? Number(sessionStorage.getItem("atk_debug_unlock") ?? "") || null
      : null;

  const unlockedThrough = debugUnlock ?? (isAdmin ? Infinity : (profile?.onboarding_unlocked_through ?? 1));
  const onboardingComplete = unlockedThrough >= ONBOARDING_SESSIONS.length;

  // Whatever URL the browser/PWA happens to resume at (a bookmark, an
  // iOS home-screen launch resuming its last page, a stale tab), the
  // first time the fully-authenticated app shell mounts in a given tab
  // session, send them to their home screen instead of wherever that URL
  // points - the Today dashboard once Onboarding is complete, but
  // Onboarding itself is the "home screen" until then, since it's the
  // most important thing for a brand-new person to finish first.
  // sessionStorage (not localStorage) is what makes this "once per app
  // open" rather than "once ever" or "on every reload."
  useEffect(() => {
    if (!fullyAuthed) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("atk_app_opened")) return;
    sessionStorage.setItem("atk_app_opened", "1");
    const homePath = onboardingComplete ? "/dashboard" : "/onboarding";
    if (pathname !== homePath) {
      router.replace(homePath);
    }
  }, [fullyAuthed, onboardingComplete, pathname, router]);

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
        unlockedThrough,
        onboardingComplete,
        refreshProfile: () => loadProfile(user.id),
        signOut: () => supabase.auth.signOut(),
      }}
    >
      <ConfigWarning />
      <QuoteOverlay />
      <RatingJobsProvider>
        {children}
        <BottomNav />
      </RatingJobsProvider>
    </AuthContext.Provider>
  );
}
