"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import NotificationOptIn from "@/components/NotificationOptIn";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { NOTIFICATION_KINDS, NOTIFICATION_KIND_LABELS as KIND_LABELS } from "@/lib/constants";
import { SkeletonList } from "@/components/Skeleton";
import type { SentNotification } from "@/lib/types";

function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const { user, refreshUnreadCount } = useAuth();
  const [notifications, setNotifications] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutedKinds, setMutedKinds] = useState<string[]>([]);
  const [muteError, setMuteError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data }, { data: profileRow }] = await Promise.all([
        supabase
          .from("sent_notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("profiles").select("muted_notification_kinds").eq("id", user.id).single(),
      ]);
      setNotifications((data as SentNotification[]) ?? []);
      setMutedKinds(
        (profileRow as { muted_notification_kinds: string[] | null } | null)?.muted_notification_kinds ?? []
      );
      setLoading(false);
      // For the Caught Up badge - a "you've viewed the list since X"
      // watermark, since there's no per-notification read state. Also
      // what the bottom nav's unread badge counts against - refreshing
      // it here clears the badge immediately instead of waiting for the
      // next app open to notice.
      await supabase
        .from("profiles")
        .update({ notifications_last_viewed_at: new Date().toISOString() })
        .eq("id", user.id);
      refreshUnreadCount();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function toggleKind(kind: string) {
    const previous = mutedKinds;
    const next = mutedKinds.includes(kind)
      ? mutedKinds.filter((k) => k !== kind)
      : [...mutedKinds, kind];
    setMutedKinds(next);
    const { error } = await supabase
      .from("profiles")
      .update({ muted_notification_kinds: next })
      .eq("id", user.id);
    if (error) {
      // Revert - otherwise a failed save still shows as toggled.
      setMutedKinds(previous);
      setMuteError(error.message);
    } else {
      setMuteError(null);
    }
  }

  return (
    <>
      <PageHeader title="Notifications" subtitle="Every push notification we've sent you" />
      <main className="page-main">
        <NotificationOptIn />

        {!loading && (
          <div className="card space-y-2">
            <p className="section-title">🔔 Notification Preferences</p>
            <p className="text-xs text-slate-400">
              Turn off anything you don&apos;t want pushed to your device — muted ones also won&apos;t
              show up in the history below.
            </p>
            <div className="space-y-1.5">
              {NOTIFICATION_KINDS.map(({ kind, label }) => {
                const muted = mutedKinds.includes(kind);
                return (
                  <div
                    key={kind}
                    className="flex items-center justify-between rounded-lg bg-navy px-3 py-2"
                  >
                    <span className="text-sm text-slate-200">{label}</span>
                    <button
                      className={muted ? "toggle-pill-inactive" : "toggle-pill-active"}
                      onClick={() => toggleKind(kind)}
                    >
                      {muted ? "Off" : "On"}
                    </button>
                  </div>
                );
              })}
            </div>
            {muteError && <p className="text-xs text-red-400">{muteError}</p>}
          </div>
        )}

        {loading ? (
          <SkeletonList cards={3} />
        ) : notifications.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-400">
              No notifications yet — you&apos;ll see updates here when a candidate moves forward,
              your team hits a milestone, or your upline sends you something.
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className="card space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-white">{n.title}</p>
                <span className="shrink-0 text-xs text-slate-500">{formatSentAt(n.created_at)}</span>
              </div>
              <p className="text-sm text-slate-300">{n.body}</p>
              <p className="text-xs text-slate-500">{KIND_LABELS[n.kind]}</p>
            </div>
          ))
        )}
      </main>
    </>
  );
}
