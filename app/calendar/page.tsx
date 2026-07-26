"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryUser } from "@/lib/constants";
import type { CalendarEvent, CompanyEvent, Candidate, Profile } from "@/lib/types";

function formatEventLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in local time, with no
// timezone suffix - toISOString gives UTC, so build it from local parts.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarPage() {
  const { user, ownerId } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [hasDownline, setHasDownline] = useState(false);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [eventAt, setEventAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [candidateId, setCandidateId] = useState("");
  const [broadcast, setBroadcast] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = isPrimaryUser(user.email);
  const [companyEvents, setCompanyEvents] = useState<CompanyEvent[]>([]);
  const [ceTitle, setCeTitle] = useState("");
  const [ceNotes, setCeNotes] = useState("");
  const [ceEventAt, setCeEventAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [ceSaving, setCeSaving] = useState(false);

  async function loadCompanyEvents() {
    const { data } = await supabase
      .from("company_events")
      .select("*")
      .order("event_at", { ascending: true });
    setCompanyEvents((data as CompanyEvent[]) ?? []);
  }

  async function loadEvents() {
    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .order("event_at", { ascending: true });
    const rows = (data as CalendarEvent[]) ?? [];
    setEvents(rows);

    const creatorIds = Array.from(
      new Set(rows.filter((e) => e.creator_id !== user.id).map((e) => e.creator_id))
    );
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .in("id", creatorIds);
      const map: Record<string, string> = {};
      for (const p of (profiles as Pick<Profile, "id" | "first_name" | "last_name">[]) ?? []) {
        map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed";
      }
      setCreatorNames(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    async function load() {
      await loadEvents();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", ownerId)
        .order("name", { ascending: true });
      setCandidates((data as Candidate[]) ?? []);
    }
    load();
  }, [ownerId]);

  // A linked spouse can also technically satisfy is_upline_of (e.g. they
  // entered this account's number as their own upline when they signed
  // up), but they're not real downline - their data resolves to this
  // same account's ownerId, so they're excluded here the same way the
  // Daily Update summary's downline totals are.
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id,household_id")
        .neq("id", user.id);
      const real = ((data as { id: string; household_id: string | null }[]) ?? []).filter(
        (p) => (p.household_id ?? p.id) !== ownerId
      );
      setHasDownline(real.length > 0);
    }
    load();
  }, [user.id, ownerId]);

  useEffect(() => {
    if (!isAdmin) return;
    async function load() {
      await loadCompanyEvents();
    }
    load();
  }, [isAdmin]);

  async function addCompanyEvent() {
    const trimmedTitle = ceTitle.trim();
    if (!trimmedTitle || !ceEventAt) return;
    setCeSaving(true);
    await supabase.rpc("add_company_event", {
      p_title: trimmedTitle,
      p_notes: ceNotes,
      p_event_at: new Date(ceEventAt).toISOString(),
    });
    setCeTitle("");
    setCeNotes("");
    setCeSaving(false);
    await loadCompanyEvents();
    await loadEvents();
  }

  async function removeCompanyEvent(id: string) {
    setCompanyEvents((prev) => prev.filter((e) => e.id !== id));
    await supabase.rpc("remove_company_event", { p_id: id });
  }

  async function addEvent() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !eventAt) return;
    setSaving(true);
    const isoEventAt = new Date(eventAt).toISOString();
    const linkedCandidate = candidateId || null;

    await supabase.from("calendar_events").insert({
      user_id: user.id,
      creator_id: user.id,
      title: trimmedTitle,
      notes,
      event_at: isoEventAt,
      candidate_id: linkedCandidate,
      scope: "private",
    });

    if (broadcast) {
      await supabase.rpc("broadcast_event_to_downline", {
        p_title: trimmedTitle,
        p_notes: notes,
        p_event_at: isoEventAt,
        p_candidate_id: linkedCandidate,
      });
    }

    setTitle("");
    setNotes("");
    setCandidateId("");
    setBroadcast(false);
    setSaving(false);
    loadEvents();
  }

  async function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await supabase.from("calendar_events").delete().eq("id", id);
  }

  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.event_at >= now);
  const past = events.filter((e) => e.event_at < now).slice(-10).reverse();

  function candidateName(id: string | null): string | null {
    if (!id) return null;
    return candidates.find((c) => c.id === id)?.name ?? null;
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Meetings, sessions, and reminders — yours and your downline's"
      />
      <main className="page-main">
        <div className="card space-y-2">
          <p className="section-title">Add Event</p>
          <input
            className="input"
            placeholder="Title (e.g. QI1 with Jane)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="datetime-local"
            className="input"
            value={eventAt}
            onChange={(e) => setEventAt(e.target.value)}
          />
          <select
            className="select"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
          >
            <option value="">No linked candidate</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <textarea
            className="textarea"
            placeholder="Notes (e.g. 17, graduates this year — follow up after)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {hasDownline && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={broadcast}
                onChange={(e) => setBroadcast(e.target.checked)}
              />
              Add to all downline (team meeting, info session, master class, conference…)
            </label>
          )}
          <button
            className="btn-primary w-full"
            onClick={addEvent}
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving…" : "Add Event"}
          </button>
        </div>

        {isAdmin && (
          <div className="card space-y-2">
            <p className="section-title">Team Events (recurring)</p>
            <p className="text-xs text-slate-400">
              Goes out to every current member right away, and automatically to anyone who
              signs up later too — a standing rule, not a one-time send.
            </p>
            <input
              className="input"
              placeholder="Title (e.g. Masterclass)"
              value={ceTitle}
              onChange={(e) => setCeTitle(e.target.value)}
            />
            <input
              type="datetime-local"
              className="input"
              value={ceEventAt}
              onChange={(e) => setCeEventAt(e.target.value)}
            />
            <textarea
              className="textarea"
              placeholder="Notes (e.g. 4 PM – 7 PM)"
              value={ceNotes}
              onChange={(e) => setCeNotes(e.target.value)}
            />
            <button
              className="btn-primary w-full"
              onClick={addCompanyEvent}
              disabled={ceSaving || !ceTitle.trim()}
            >
              {ceSaving ? "Saving…" : "Add Recurring Event"}
            </button>

            {companyEvents.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {companyEvents.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy p-2">
                    <div>
                      <p className="text-sm text-slate-200">{e.title}</p>
                      <p className="text-xs text-slate-500">{formatEventLabel(e.event_at)}</p>
                    </div>
                    <button
                      className="btn-icon !h-6 !w-6 text-xs shrink-0"
                      onClick={() => removeCompanyEvent(e.id)}
                      aria-label={`Remove recurring event ${e.title}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <>
            <div className="card space-y-2">
              <p className="section-title">Upcoming ({upcoming.length})</p>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-400">No upcoming events.</p>
              ) : (
                upcoming.map((e) => (
                  <div key={e.id} className="rounded-lg bg-navy p-2 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-white">{e.title}</p>
                        <p className="text-xs text-amber-light">{formatEventLabel(e.event_at)}</p>
                      </div>
                      <button
                        className="btn-icon !h-6 !w-6 text-xs shrink-0"
                        onClick={() => deleteEvent(e.id)}
                        aria-label={`Remove ${e.title}`}
                      >
                        ✕
                      </button>
                    </div>
                    {candidateName(e.candidate_id) && (
                      <p className="text-xs text-slate-400">
                        Candidate: {candidateName(e.candidate_id)}
                      </p>
                    )}
                    {e.notes && <p className="text-xs text-slate-400">{e.notes}</p>}
                    {e.creator_id !== user.id && (
                      <span className="pill pill-amber">
                        📢 From {creatorNames[e.creator_id] ?? "your upline"}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {past.length > 0 && (
              <div className="card space-y-2">
                <p className="section-title">Recently Passed</p>
                {past.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-navy p-2"
                  >
                    <div>
                      <p className="text-sm text-slate-300">{e.title}</p>
                      <p className="text-xs text-slate-500">{formatEventLabel(e.event_at)}</p>
                    </div>
                    <button
                      className="btn-icon !h-6 !w-6 text-xs shrink-0"
                      onClick={() => deleteEvent(e.id)}
                      aria-label={`Remove ${e.title}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
