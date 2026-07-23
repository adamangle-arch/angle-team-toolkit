"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import { RECOGNITION_TYPES } from "@/lib/constants";
import { formatDateLabel, getToday } from "@/lib/dates";
import type { RecognitionEntry } from "@/lib/types";

export default function RecognitionPage() {
  const [entries, setEntries] = useState<RecognitionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<string>(RECOGNITION_TYPES[0]);
  const [eventDate, setEventDate] = useState(getToday());
  const [note, setNote] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("recognition_log")
        .select("*")
        .order("event_date", { ascending: false });
      setEntries((data as RecognitionEntry[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function addEntry() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSaving(true);
    const { data } = await supabase
      .from("recognition_log")
      .insert({ name: trimmedName, type, event_date: eventDate, note })
      .select("*")
      .single();
    if (data) {
      setEntries((prev) =>
        [data as RecognitionEntry, ...prev].sort((a, b) =>
          b.event_date.localeCompare(a.event_date)
        )
      );
    }
    setName("");
    setNote("");
    setEventDate(getToday());
    setSaving(false);
  }

  async function deleteEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await supabase.from("recognition_log").delete().eq("id", id);
  }

  return (
    <>
      <PageHeader title="Recognition Log" subtitle="Celebrate every win" />
      <main className="page-main">
        <div className="card space-y-2">
          <p className="section-title">Log a Win</p>
          <input
            className="input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {RECOGNITION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          <textarea
            className="textarea"
            placeholder="Note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="btn-primary w-full"
            onClick={addEntry}
            disabled={saving || !name.trim()}
          >
            Save Win
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading recognition log…</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">No wins logged yet — go make one!</div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="card space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{entry.name}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateLabel(entry.event_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="pill-amber">{entry.type}</span>
                    <button
                      className="btn-icon !h-7 !w-7 text-sm"
                      onClick={() => deleteEntry(entry.id)}
                      aria-label="Delete entry"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {entry.note && <p className="text-sm text-slate-300">{entry.note}</p>}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
