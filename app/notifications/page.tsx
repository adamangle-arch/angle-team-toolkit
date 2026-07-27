"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import type { SentNotification } from "@/lib/types";

const KIND_LABELS: Record<SentNotification["kind"], string> = {
  daily_stat_leaders: "Daily leaders",
  weekly_stat_leaders: "Weekly leaders",
  monthly_stat_leaders: "Monthly leaders",
  core_run_reminder: "Core Run reminder",
};

function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("sent_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifications((data as SentNotification[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <>
      <PageHeader title="Notifications" subtitle="Every push notification we've sent you" />
      <main className="page-main">
        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : notifications.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-400">
              No notifications yet. Enable push notifications on Core Run Streak to start getting them.
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
