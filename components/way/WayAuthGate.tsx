"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { waySupabase } from "@/lib/way/supabaseClient";
import WayLoginForm from "./WayLoginForm";
import type { WayProfile } from "@/lib/way/types";

type WayAuthContextValue = {
  user: User;
  profile: WayProfile;
  refreshProfile: () => void;
  signOut: () => void;
};

const WayAuthContext = createContext<WayAuthContextValue | null>(null);

export function useWayAuth(): WayAuthContextValue {
  const ctx = useContext(WayAuthContext);
  if (!ctx) throw new Error("useWayAuth must be used within WayAuthGate");
  return ctx;
}

const AUTH_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: PromiseLike<T>, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS)),
  ]);
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return fallback;
}

export default function WayAuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<WayProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    withTimeout(waySupabase.auth.getSession(), "Timed out checking your session — check your connection.")
      .then(({ data }) => {
        setUser(data.session?.user ?? null);
        setLoading(false);
      })
      .catch((err) => {
        setAuthError(errorMessage(err, "Could not check your session."));
        setLoading(false);
      });
    const { data: listener } = waySupabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(uid: string) {
    try {
      const { data, error } = await withTimeout(
        waySupabase.from("profiles").select("*").eq("id", uid).single(),
        "Timed out loading your profile — check your connection."
      );
      // No profile row yet (a brand-new signup) — ensure_profile() creates
      // it, then this re-selects once.
      if (error?.code === "PGRST116") {
        const { error: ensureError } = await withTimeout(
          waySupabase.rpc("ensure_profile"),
          "Timed out setting up your profile — check your connection."
        );
        if (ensureError) throw ensureError;
        const retry = await withTimeout(
          waySupabase.from("profiles").select("*").eq("id", uid).single(),
          "Timed out loading your profile — check your connection."
        );
        if (retry.error) throw retry.error;
        setAuthError(null);
        setProfile((retry.data as WayProfile) ?? null);
        return;
      }
      if (error) throw error;
      setAuthError(null);
      setProfile((data as WayProfile) ?? null);
    } catch (err) {
      setAuthError(errorMessage(err, "Could not load your profile."));
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    async function load() {
      await loadProfile(uid);
    }
    load();
  }, [user]);

  if (authError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm" style={{ color: "var(--way-text-dim)" }}>
          {authError}
        </p>
        <button
          className="way-btn way-btn-secondary"
          onClick={() => {
            setAuthError(null);
            setLoading(true);
            setProfileLoading(true);
            if (user) {
              loadProfile(user.id);
            } else {
              window.location.reload();
            }
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--way-text-dim)" }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return <WayLoginForm />;
  }

  if (profileLoading || !profile) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--way-text-dim)" }}>
        Loading…
      </div>
    );
  }

  return (
    <WayAuthContext.Provider
      value={{
        user,
        profile,
        refreshProfile: () => loadProfile(user.id),
        signOut: () => waySupabase.auth.signOut(),
      }}
    >
      {children}
    </WayAuthContext.Provider>
  );
}
