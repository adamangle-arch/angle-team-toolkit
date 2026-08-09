"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthGate";
import { supabase } from "@/lib/supabaseClient";

type Connection = { google_email: string | null; last_synced_at: string | null };

const STATUS_MESSAGES: Record<string, string> = {
  connected: "✅ Google Calendar connected.",
  denied: "Google sign-in was cancelled.",
  expired: "That connection attempt expired — try again.",
  error: "Something went wrong connecting Google Calendar.",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Two-way sync between your own Calendar events here and your Google
// Calendar - see the README for exactly what does and doesn't sync
// (recurring Google events and local deletes propagating out are the two
// known v1 gaps). The actual back-and-forth happens server-side on a
// ~5-minute pg_cron sweep; this is just connect/disconnect/status plus a
// "do it now" button for the impatient.
export default function GoogleCalendarConnect() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<Connection | null | undefined>(undefined);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The callback route redirects back here with ?google=connected|... -
  // read once via a lazy initializer (a plain, synchronous read of an
  // external value at mount, not a state update to synchronize a
  // rerender off of) rather than an effect, so there's nothing to
  // clean up here beyond the URL stripping below.
  const [statusMessage, setStatusMessage] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const status = new URLSearchParams(window.location.search).get("google");
    return status ? (STATUS_MESSAGES[status] ?? null) : null;
  });

  async function fetchConnection() {
    const { data } = await supabase
      .from("google_calendar_connections")
      .select("google_email,last_synced_at")
      .eq("user_id", user.id)
      .maybeSingle();
    return (data as Connection) ?? null;
  }

  // syncNow/disconnect below re-fetch status after their own action
  // completes - this wraps that same query for a plain setConnection call.
  async function loadConnection() {
    setConnection(await fetchConnection());
  }

  useEffect(() => {
    async function load() {
      setConnection(await fetchConnection());
    }
    load();
    // Strip ?google= so a refresh doesn't re-show the same message -
    // mutating history isn't a state update, so this is a legitimate
    // effect (synchronizing the URL, an external system, on mount).
    const params = new URLSearchParams(window.location.search);
    if (params.has("google")) {
      params.delete("google");
      const cleanUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function authedFetch(input: string, init?: RequestInit) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Not signed in");
    return fetch(input, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
    });
  }

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const res = await authedFetch("/api/google-calendar/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start connecting.");
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start connecting.");
      setConnecting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      const res = await authedFetch("/api/google-calendar/disconnect", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to disconnect.");
      setConnection(null);
      setStatusMessage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await authedFetch("/api/google-calendar/sync-now", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      await loadConnection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  if (connection === undefined) return null;

  return (
    <div className="card space-y-2">
      <p className="section-title">📆 Google Calendar</p>
      {statusMessage && <p className="text-xs text-slate-300">{statusMessage}</p>}
      {connection ? (
        <>
          <p className="text-xs text-slate-400">
            Connected{connection.google_email ? ` as ${connection.google_email}` : ""} · Last
            synced {timeAgo(connection.last_synced_at)}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={syncNow} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <button className="btn-secondary flex-1" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            Two-way sync — events you add here show up in Google Calendar, and events you add
            in Google Calendar show up here (recurring events aren&apos;t synced).
          </p>
          <button className="btn-primary w-full" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect Google Calendar"}
          </button>
        </>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
