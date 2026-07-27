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

// Turns on push notifications automatically - there's deliberately no
// "Enable" button to tap first. The one prompt that's unavoidable is the
// browser/OS's own native permission dialog (that's how push works
// everywhere; no app can skip it), but this component never adds an
// extra in-app tap in front of it.
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
  const [busy, setBusy] = useState(false);

  async function subscribe() {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return false;
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
      if (Notification.permission === "denied") {
        setBlocked(true);
        setChecked(true);
        return;
      }
      const ok = await subscribe();
      if (ok) setSubscribed(true);
      else setBlocked(true);
      setChecked(true);
    }
    ensureSubscribed();
    // Only needs to run once per mount - re-checking on every user.id
    // change isn't meaningful here (it's the same device/subscription).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

  async function turnOn() {
    setBusy(true);
    try {
      const ok = await subscribe();
      if (ok) {
        window.localStorage.removeItem(OPTED_OUT_KEY);
        setOptedOut(false);
        setBlocked(false);
        setSubscribed(true);
      } else {
        setBlocked(true);
      }
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

  if (optedOut && !subscribed) {
    return (
      <div className="card flex items-center justify-between gap-2">
        <div>
          <p className="section-title">🔕 Notifications are off</p>
          <p className="text-xs text-slate-400">You turned these off.</p>
        </div>
        <button className="btn-primary shrink-0" onClick={turnOn} disabled={busy}>
          Turn On
        </button>
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
