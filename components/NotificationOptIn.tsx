"use client";

import { useEffect, useState } from "react";
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
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

  async function subscribe(): Promise<boolean> {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
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
    const json = sub.toJSON();
    await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
      },
      { onConflict: "endpoint" }
    );
    return true;
  }

  useEffect(() => {
    if (!isSupported) return;

    async function ensureSubscribed() {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        setSubscribed(true);
        setChecked(true);
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

  if (isIOS && !isStandalone) {
    return (
      <div className="card space-y-1.5">
        <p className="section-title">🔔 Notifications</p>
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
        <p className="section-title">🔕 Notifications are off</p>
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
            <p className="section-title">🔔 Notifications</p>
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
            <p className="section-title">🔕 Notifications are off</p>
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
    <div className="card flex items-center justify-between gap-2">
      <div>
        <p className="section-title">🔔 Notifications are on</p>
        <p className="text-xs text-slate-400">
          You&apos;ll get a Core Run reminder plus daily, weekly, and monthly stat-leader updates.
        </p>
      </div>
      <button className="btn-secondary shrink-0" onClick={turnOff} disabled={busy}>
        Turn Off
      </button>
    </div>
  );
}
