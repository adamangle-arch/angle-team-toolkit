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
import FestiveBackdrop from "./FestiveBackdrop";
import WelcomeVideoOverlay from "./WelcomeVideoOverlay";
import RatingJobsProvider from "./RatingJobsProvider";
import PullToRefresh from "./PullToRefresh";
import { ONBOARDING_SESSIONS, isPrimaryUser, type ThemeColor } from "@/lib/constants";
import { applyTheme, applyColorMode } from "@/lib/applyTheme";
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
  // Badge shown on the More tab (where Notifications lives) - count of
  // sent_notifications newer than profiles.notifications_last_viewed_at,
  // the same watermark the "Caught Up" badge already tracks. Fetched
  // once per app open; the Notifications page calls refreshUnreadCount
  // after marking the watermark current so the badge clears immediately
  // instead of waiting for the next app open.
  unreadNotificationCount: number;
  refreshUnreadCount: () => void;
  // Small status dot on the Home tab (BottomNav) so it's visible from
  // every page, not just the Streak page itself - see get_core_run_status
  // in supabase/schema.sql for what each value means. null until the
  // first fetch resolves (renders no dot in the meantime).
  coreRunStatus: "done" | "off_day" | "at_risk" | "pending" | null;
  refreshCoreRunStatus: () => void;
  // Same value that drives the data-theme attribute below, exposed so
  // components that need to vary more than CSS custom properties can
  // give them (e.g. Home's grid tiles picking a themed palette/icon for
  // USA/Christmas/Easter) don't have to read document.documentElement
  // themselves. Same "amber" fallback as the attribute effect.
  themeColor: ThemeColor;
  // Lets Home show its own top-of-page WelcomeVideoLockCard without a
  // separate fetch (AuthGate already has the whole profile loaded) - see
  // needsWelcomeVideo just below for the auto-play overlay this is
  // otherwise unrelated to.
  welcomeVideoWatchedAt: string | null;
  refreshProfile: () => void;
  signOut: () => void;
  // Who else has the app open right now, team-wide - Stories' Pulse tab's
  // "who's active now" indicator. Pure Realtime Presence (ephemeral,
  // resets on disconnect, no table/publication involved), tracked here
  // rather than on the Stories page itself so it reflects real app usage
  // everywhere, not just whoever happens to also be on Stories at the
  // same moment.
  activeUserIds: string[];
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthGate");
  return ctx;
}

const AUTH_TIMEOUT_MS = 15000;

// Neither supabase-js call below has a built-in timeout, so a stalled
// request (a dead connection, a weak signal) previously left the app
// stuck on "Loading…" forever with no way out. Racing against a timeout
// turns that into a recoverable error instead.
function withTimeout<T>(promise: PromiseLike<T>, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS)),
  ]);
}

// A thrown Supabase/PostgREST error is a plain {message, code, details}
// object, not an Error instance - `err instanceof Error` misses it and
// falls back to a useless generic string right when the real message
// (an RLS denial, a broken trigger) is what's actually needed to debug it.
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return fallback;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [activeUserIds, setActiveUserIds] = useState<string[]>([]);
  const [coreRunStatus, setCoreRunStatus] = useState<AuthContextValue["coreRunStatus"]>(null);
  // Tapping "Skip for now" on the welcome video doesn't change anything
  // on the profile (welcome_video_watched_at stays null, on purpose, so
  // it auto-plays again next app open) - without this, needsWelcomeVideo
  // below would still be true right after skipping, and the overlay
  // would just sit there looking like the button did nothing. This is
  // the "for now" part: dismissed for this one open only, reset (like
  // atk_app_opened elsewhere in this file) the next time the tab/app
  // actually restarts, not on every navigation within it.
  const [skippedVideoThisOpen, setSkippedVideoThisOpen] = useState(false);

  useEffect(() => {
    withTimeout(supabase.auth.getSession(), "Timed out checking your session — check your connection.")
      .then(({ data }) => {
        setUser(data.session?.user ?? null);
        setLoading(false);
      })
      .catch((err) => {
        setAuthError(errorMessage(err, "Could not check your session."));
        setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(uid: string) {
    try {
      const { data, error } = await withTimeout(
        supabase.from("profiles").select("*").eq("id", uid).single(),
        "Timed out loading your profile — check your connection."
      );
      // PGRST116 = "no rows returned" - an auth account with no matching
      // profiles row (a signup trigger that failed partway, or any other
      // edge case that skipped the insert) used to be a permanent dead
      // end here, since retrying the same select just fails the same
      // way forever. ensure_profile() creates the missing row exactly
      // the way the signup trigger would have, then this re-selects
      // once - a no-op for every normal account that already has one.
      if (error?.code === "PGRST116") {
        const { error: ensureError } = await withTimeout(
          supabase.rpc("ensure_profile"),
          "Timed out setting up your profile — check your connection."
        );
        if (ensureError) throw ensureError;
        const retry = await withTimeout(
          supabase.from("profiles").select("*").eq("id", uid).single(),
          "Timed out loading your profile — check your connection."
        );
        if (retry.error) throw retry.error;
        setAuthError(null);
        setProfile((retry.data as Profile) ?? null);
        return;
      }
      if (error) throw error;
      setAuthError(null);
      setProfile((data as Profile) ?? null);
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

  // Repaints the whole app in the picked accent colorway (My Profile's
  // "App Color" card writes profiles.theme_color, and for the "custom"
  // colorway, profiles.custom_theme_hex too) - see lib/applyTheme.ts for
  // what this actually does (a data-theme attribute for a preset, or
  // derived inline custom properties for a custom hex). Falls back to
  // "amber" (the default) before the profile loads and for signed-out/
  // no-profile states, which already matches the base @theme values with
  // no attribute set at all.
  useEffect(() => {
    applyTheme(profile?.theme_color || "amber", profile?.custom_theme_hex ?? null);
  }, [profile?.theme_color, profile?.custom_theme_hex]);

  // Independent of the accent colorway above - My Profile's "App Mode"
  // card (profiles.color_mode). See applyColorMode in lib/applyTheme.ts.
  useEffect(() => {
    applyColorMode(profile?.color_mode || "dark");
  }, [profile?.color_mode]);

  const nameTeamComplete = Boolean(
    profile?.first_name && profile?.last_name && profile?.team && profile?.team_confirmed_at
  );
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
  // points - the Leaderboard once Onboarding is complete, but Onboarding
  // itself is the "home screen" until then, since it's the most
  // important thing for a brand-new person to finish first.
  // sessionStorage (not localStorage) is what makes this "once per app
  // open" rather than "once ever" or "on every reload."
  useEffect(() => {
    if (!fullyAuthed) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("atk_app_opened")) return;
    sessionStorage.setItem("atk_app_opened", "1");
    const homePath = onboardingComplete ? "/home" : "/onboarding";
    if (pathname !== homePath) {
      router.replace(homePath);
    }
  }, [fullyAuthed, onboardingComplete, pathname, router]);

  // Logs today as an "app opened" day for the Daily Visitor badge - once
  // per day is all that matters, so onConflict + ignoreDuplicates makes
  // every mount after the first today a cheap no-op rather than an error.
  useEffect(() => {
    if (!fullyAuthed || !user) return;
    supabase
      .from("app_opens")
      .upsert(
        { user_id: user.id, day: new Date().toISOString().slice(0, 10) },
        { onConflict: "user_id,day", ignoreDuplicates: true }
      )
      .then(() => {});
  }, [fullyAuthed, user]);

  function refreshUnreadCount() {
    supabase.rpc("get_unread_notification_count").then(({ data, error }) => {
      if (!error) setUnreadNotificationCount((data as number) ?? 0);
    });
  }

  // Refetched once per app open (not on every render/navigation) - the
  // Notifications page calls refreshUnreadCount directly after marking
  // things viewed, so the badge clears right away without waiting for
  // this to run again.
  useEffect(() => {
    if (!fullyAuthed) return;
    refreshUnreadCount();
  }, [fullyAuthed]);

  function refreshCoreRunStatus() {
    supabase.rpc("get_core_run_status").then(({ data, error }) => {
      if (!error) setCoreRunStatus((data as AuthContextValue["coreRunStatus"]) ?? null);
    });
  }

  // Same "once per app open" cadence as the notifications badge above -
  // the Streak page calls refreshCoreRunStatus directly after a save so
  // the dot updates immediately instead of waiting for the next app open.
  useEffect(() => {
    if (!fullyAuthed) return;
    refreshCoreRunStatus();
  }, [fullyAuthed]);

  // Live badge updates via Supabase Realtime - without this, a push
  // notification that arrives while the app is already open doesn't
  // touch the nav badge until the next full app open (the effect above
  // only runs once per mount). RLS on sent_notifications already
  // restricts what a given client's session receives here to rows
  // addressed to them or broadcasts, same as the table's normal select
  // policy - no extra filter needed.
  useEffect(() => {
    if (!fullyAuthed) return;
    const channel = supabase
      .channel("sent_notifications_unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sent_notifications" },
        () => refreshUnreadCount()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fullyAuthed]);

  // Presence, not Postgres Changes - an ephemeral "who's connected to this
  // channel right now" roster the Realtime server tracks in memory, gone
  // the instant a tab closes/loses connection. No table or publication
  // involved, unlike the two channels above. config.presence.key = the
  // user's own id, so presenceState()'s keys directly are the list of
  // currently-active user ids - one entry per person, not per tab (a
  // second tab from the same person just adds another presence under the
  // same key).
  useEffect(() => {
    if (!fullyAuthed || !user) return;
    const channel = supabase.channel("app_presence", { config: { presence: { key: user.id } } });
    channel
      .on("presence", { event: "sync" }, () => {
        setActiveUserIds(Object.keys(channel.presenceState()));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fullyAuthed, user]);

  // last_active_at - deliberately a plain REST write, not nested inside
  // the presence channel's SUBSCRIBED callback above. It used to be: that
  // meant Pulse's "recently active in the last 24h" fallback only ever
  // got data for someone whose realtime websocket happened to connect
  // successfully - exactly the case it's supposed to be a fallback FOR,
  // since a network that blocks/drops websockets (some corporate wifi,
  // some mobile carriers, some browser extensions) would silently leave
  // that person with no live presence AND no last_active_at, so they'd
  // never show up as "around" at all despite actively using the rest of
  // the app. This fires independently, once per app session, the same
  // "just a REST call" way the app_opens upsert above does.
  useEffect(() => {
    if (!fullyAuthed || !user) return;
    supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) console.error("Couldn't update last_active_at:", error.message);
      });
  }, [fullyAuthed, user]);

  // /prospect is a public, unauthenticated view (a candidate enters their
  // access code, no account involved) - it renders standalone rather than
  // behind the normal sign-in wall. /reset-password is similar: arriving
  // there means following an emailed reset link (a short-lived recovery
  // session, not a normal signed-in one), so it has to render before the
  // profile-completeness checks below ever run - an already-onboarded
  // account clicking a reset link would otherwise just get dropped
  // straight into the app instead of the password form.
  if (pathname === "/prospect" || pathname === "/reset-password") {
    return <>{children}</>;
  }

  if (authError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-slate-400">{authError}</p>
        <button
          className="btn-secondary"
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
        <ProfileGate user={user} profile={profile} onComplete={() => loadProfile(user.id)} />
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
  // QuoteOverlay would otherwise stack on top of the welcome video on
  // someone's very first app open (both are unconditional full-screen
  // overlays) - the welcome video takes priority until it's been shown.
  // Deliberately ignores welcome_video_skipped_at (the profile column) -
  // skipping is meant to keep coming back on every app open until
  // someone actually finishes it, same as Onboarding Session 1 staying
  // locked the whole time (see the unlock check in
  // app/onboarding/page.tsx and app/onboarding/[session]/page.tsx).
  // skippedVideoThisOpen (the local state above) is what actually
  // dismisses it for the current open - see the comment there.
  const needsWelcomeVideo = !profile.welcome_video_watched_at && !skippedVideoThisOpen;

  return (
    <AuthContext.Provider
      value={{
        user,
        ownerId,
        unlockedThrough,
        onboardingComplete,
        unreadNotificationCount,
        refreshUnreadCount,
        coreRunStatus,
        refreshCoreRunStatus,
        themeColor: profile.theme_color || "amber",
        welcomeVideoWatchedAt: profile.welcome_video_watched_at,
        refreshProfile: () => loadProfile(user.id),
        signOut: () => supabase.auth.signOut(),
        activeUserIds,
      }}
    >
      <ConfigWarning />
      <FestiveBackdrop themeColor={profile.theme_color || "amber"} />
      {needsWelcomeVideo ? (
        <WelcomeVideoOverlay
          userId={user.id}
          onWatched={() => loadProfile(user.id)}
          onSkip={() => setSkippedVideoThisOpen(true)}
        />
      ) : (
        <QuoteOverlay />
      )}
      <RatingJobsProvider>
        <PullToRefresh>{children}</PullToRefresh>
        <BottomNav />
      </RatingJobsProvider>
    </AuthContext.Provider>
  );
}
