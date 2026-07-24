"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";

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

export default function NotificationOptIn() {
  const { user } = useAuth();
  const [isIOS] = useState(() => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [isStandalone] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true)
  );
  const [isSupported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      typeof window !== "undefined" &&
      "PushManager" in window
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupported) return;

    async function check() {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const sub = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    }
    check();
  }, [isSupported]);

  async function enable() {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setBusy(false);
        return;
      }
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
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  if (isIOS && !isStandalone) {
    return (
      <div className="card space-y-1.5">
        <p className="section-title">🔔 Daily Reminders</p>
        <p className="text-sm text-slate-300">
          Add this app to your Home Screen to enable reminders: tap the Share button, then
          &quot;Add to Home Screen&quot;. Reminders only work once it&apos;s opened from there.
        </p>
      </div>
    );
  }

  if (!isSupported) return null;

  return (
    <div className="card flex items-center justify-between gap-2">
      <div>
        <p className="section-title">🔔 Daily Reminders</p>
        <p className="text-xs text-slate-400">
          {subscribed
            ? "You'll get a nudge if today's Core Run isn't logged by evening."
            : "Get a reminder if you haven't logged today's Core Run yet."}
        </p>
      </div>
      {subscribed ? (
        <button className="btn-secondary shrink-0" onClick={disable} disabled={busy}>
          Turn Off
        </button>
      ) : (
        <button className="btn-primary shrink-0" onClick={enable} disabled={busy}>
          Enable
        </button>
      )}
    </div>
  );
}
