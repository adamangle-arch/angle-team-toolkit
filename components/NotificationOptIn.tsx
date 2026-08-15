"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";

const OPTED_OUT_KEY = "angle-notifications-opted-out";

function supportsPush(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window
  );
}

// Strips a matching pair of wrapping quotes - pasting straight from a
// .env.local.example line (`KEY="value"`) into Vercel's raw value field,
// quotes included, is another common way this ends up not being valid
// base64, same as a stray trailing space/newline.
function stripWrappingQuotes(value: string): string {
  const first = value[0];
  const last = value[value.length - 1];
  if (value.length >= 2 && first === last && (first === '"' || first === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function urlBase64ToUint8Array(base64String: string) {
  // A stray trailing space/newline is an extremely common copy-paste
  // artifact when setting this as a Vercel environment variable, and
  // atob() rejects it outright with an opaque "invalid characters"
  // error - trimming here fixes that silently instead of requiring a
  // pixel-perfect paste.
  const trimmed = stripWrappingQuotes(base64String.trim()).trim();
  const padding = "=".repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, "+").replace(/_/g, "/");
  let rawData: string;
  try {
    rawData = window.atob(base64);
  } catch {
    throw new Error(
      "The push notification key (NEXT_PUBLIC_VAPID_PUBLIC_KEY) is misconfigured on the server - it isn't valid base64. Double-check it was pasted in full with no extra characters."
    );
  }
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Safari on iOS silently refuses (or just never resolves) a
// Notification.requestPermission() call that isn't triggered by a real
// tap - it won't show its native permission dialog otherwise. Racing
// against a timeout means an attempt made without a tap (the automatic
// one below) always eventually gives up and falls back to a one-tap
// button instead of leaving the whole component hanging forever.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// Tries to turn on push notifications automatically first, so platforms
// that allow it (Android/desktop Chrome and Firefox) never need a tap at
// all. iOS Safari requires a real user gesture before it'll show its own
// native permission dialog, so on iPhone the automatic attempt below
// reliably fails/times out and this falls back to a single "Turn On" tap
// - that's a hard platform rule, not something this app can bypass, but
// it's still just the one unavoidable tap, never an extra one on top of it.
export default function NotificationOptIn() {
  const { user } = useAuth();
  const [isIOS] = useState(() => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [isStandalone] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true)
  );
  const [isSupported] = useState(supportsPush);
  const [checked, setChecked] = useState(() => !supportsPush());
  const [subscribed, setSubscribed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turnOnError, setTurnOnError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function subscribe(): Promise<boolean> {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()) {
      // A real config problem, not "permission not granted" - throwing
      // (instead of quietly returning false like the rest of this
      // function) means a tap on Turn On actually shows an error instead
      // of silently doing nothing.
      throw new Error("Push notifications aren't set up on the server yet.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    });
    await upsertSubscriptionRow(sub);
    return true;
  }

  // Shared by subscribe() (brand-new browser permission grant) and the
  // mount-time self-heal below (permission already granted, re-syncing the
  // row in case it was deleted server-side - see ensureSubscribed). Throws
  // on failure in both cases rather than swallowing it: a silent failure
  // here is exactly how "device says on, server has nothing to send to"
  // happens, since the client never had another way to notice.
  async function upsertSubscriptionRow(sub: PushSubscription) {
    const json = sub.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
      },
      { onConflict: "endpoint" }
    );
    if (error) throw new Error(error.message);
  }

  useEffect(() => {
    if (!isSupported) return;

    async function ensureSubscribed() {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        setSubscribed(true);
        setChecked(true);
        // The client-side subscription surviving doesn't mean the server
        // still has a matching row - a prior send can 404/410 and delete
        // it (see notifyUsers()), and there's no client-side signal for
        // that. Re-upserting here on every app open heals that drift
        // silently in the common case; if it keeps failing, surface it
        // rather than let "Notifications are on" keep lying indefinitely.
        upsertSubscriptionRow(existing).catch((error) => {
          setSyncError(error instanceof Error ? error.message : "Couldn't verify your subscription with the server.");
        });
        return;
      }
      if (window.localStorage.getItem(OPTED_OUT_KEY) === "true") {
        setOptedOut(true);
        setChecked(true);
        return;
      }
      const permissionBefore: NotificationPermission = Notification.permission;
      if (permissionBefore === "denied") {
        setBlocked(true);
        setChecked(true);
        return;
      }
      try {
        const ok = await withTimeout(subscribe(), 4000);
        const permissionAfter: NotificationPermission = Notification.permission;
        if (ok) setSubscribed(true);
        else if (permissionAfter === "denied") setBlocked(true);
        else setNeedsTap(true);
      } catch {
        // Threw or timed out - almost always Safari declining to prompt
        // without a tap. Fall back to a one-tap button rather than
        // leaving the component stuck with nothing rendered.
        setNeedsTap(true);
      }
      setChecked(true);
    }
    ensureSubscribed();
    // Only needs to run once per mount - re-checking on every user.id
    // change isn't meaningful here (it's the same device/subscription).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

  async function turnOn() {
    setBusy(true);
    setTurnOnError(null);
    try {
      const ok = await subscribe();
      if (ok) {
        window.localStorage.removeItem(OPTED_OUT_KEY);
        setOptedOut(false);
        setBlocked(false);
        setNeedsTap(false);
        setSubscribed(true);
      } else if (Notification.permission === "denied") {
        setNeedsTap(false);
        setBlocked(true);
      }
      // else: permission still isn't "granted" after a real tap - the OS
      // dialog itself is the source of truth here (e.g. dismissed
      // without choosing), nothing more this component can add.
    } catch (err) {
      // Without this, a thrown error (missing VAPID config, a rejected
      // pushManager.subscribe() call, etc.) left the button looking like
      // it did nothing when tapped, with no indication anything failed.
      setTurnOnError(err instanceof Error ? err.message : "Couldn't turn on notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      window.localStorage.setItem(OPTED_OUT_KEY, "true");
      setOptedOut(true);
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  // Self-service answer to "I turned this on but never get anything" -
  // sends a real push right now and reports back exactly which stage
  // failed (no server subscription row, no VAPID keys configured, or a
  // genuine delivery error), instead of leaving someone to guess.
  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setTestResult({ ok: false, message: "You need to be signed in to send a test." });
        return;
      }
      const res = await fetch("/api/notify/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      setTestResult({ ok: Boolean(json.ok), message: json.message ?? "Something went wrong." });
    } catch {
      setTestResult({ ok: false, message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setTesting(false);
    }
  }

  if (isIOS && !isStandalone) {
    return (
      <div className="card space-y-1.5">
        <p className="section-title flex items-center gap-1.5">
          <Bell className="h-4 w-4" aria-hidden />
          Notifications
        </p>
        <p className="text-sm text-slate-300">
          Add this app to your Home Screen to get notifications: tap the Share button, then
          &quot;Add to Home Screen&quot;. They only work once it&apos;s opened from there.
        </p>
      </div>
    );
  }

  if (!isSupported || !checked) return null;

  if (blocked) {
    return (
      <div className="card space-y-1">
        <p className="section-title flex items-center gap-1.5">
          <BellOff className="h-4 w-4" aria-hidden />
          Notifications are off
        </p>
        <p className="text-xs text-slate-400">
          You&apos;ve blocked notifications for this app in your browser or device settings. Turn
          them back on there to get your Core Run reminder and stat-leader updates.
        </p>
      </div>
    );
  }

  if (needsTap && !subscribed) {
    return (
      <div className="card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="section-title flex items-center gap-1.5">
              <Bell className="h-4 w-4" aria-hidden />
              Notifications
            </p>
            <p className="text-xs text-slate-400">
              Get a Core Run reminder and daily/weekly/monthly stat-leader updates.
            </p>
          </div>
          <button className="btn-primary shrink-0" onClick={turnOn} disabled={busy}>
            Turn On
          </button>
        </div>
        {turnOnError && <p className="text-xs text-red-400">{turnOnError}</p>}
      </div>
    );
  }

  if (optedOut && !subscribed) {
    return (
      <div className="card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="section-title flex items-center gap-1.5">
              <BellOff className="h-4 w-4" aria-hidden />
              Notifications are off
            </p>
            <p className="text-xs text-slate-400">You turned these off.</p>
          </div>
          <button className="btn-primary shrink-0" onClick={turnOn} disabled={busy}>
            Turn On
          </button>
        </div>
        {turnOnError && <p className="text-xs text-red-400">{turnOnError}</p>}
      </div>
    );
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="section-title flex items-center gap-1.5">
            <Bell className="h-4 w-4" aria-hidden />
            Notifications are on
          </p>
          <p className="text-xs text-slate-400">
            You&apos;ll get a Core Run reminder plus daily, weekly, and monthly stat-leader updates.
          </p>
        </div>
        <button className="btn-secondary shrink-0" onClick={turnOff} disabled={busy}>
          Turn Off
        </button>
      </div>
      {syncError && (
        <p className="text-xs text-red-400">
          Couldn&apos;t confirm your subscription with the server ({syncError}). Try Turn Off, then
          Turn On again.
        </p>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
        <p className="text-xs text-slate-500">Not sure it&apos;s working?</p>
        <button className="chip-btn shrink-0" onClick={sendTest} disabled={testing}>
          {testing ? "Sending…" : "Send Test Notification"}
        </button>
      </div>
      {testResult && (
        <p className={`text-xs ${testResult.ok ? "text-amber-light" : "text-red-400"}`}>{testResult.message}</p>
      )}
    </div>
  );
}
