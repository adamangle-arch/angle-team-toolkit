"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import WayHeader from "@/components/way/WayHeader";
import { WaySkeletonList } from "@/components/way/WaySkeleton";
import { useWayAuth } from "@/components/way/WayAuthGate";
import { waySupabase } from "@/lib/way/supabaseClient";
import type { JournalEntry, JournalEntryType } from "@/lib/way/types";

const TYPE_LABELS: Record<JournalEntryType, string> = {
  prayer: "Prayer",
  gratitude: "Gratitude",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function JournalPage() {
  const { profile } = useWayAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<JournalEntryType>("prayer");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error } = await waySupabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setEntries((data as JournalEntry[]) ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);

    const { data, error } = await waySupabase
      .from("journal_entries")
      .insert({ user_id: profile.id, entry_type: entryType, content: trimmed })
      .select()
      .single();

    setSaving(false);
    if (error) {
      setError(`Couldn't save that: ${error.message}`);
      return;
    }
    setEntries((prev) => [data as JournalEntry, ...prev]);
    setContent("");
  }

  async function remove(id: string) {
    const prev = entries;
    setEntries((cur) => cur.filter((e) => e.id !== id));
    const { error } = await waySupabase.from("journal_entries").delete().eq("id", id);
    if (error) {
      setEntries(prev);
      setError(`Couldn't delete that: ${error.message}`);
    }
  }

  return (
    <>
      <WayHeader title="Journal" subtitle="Private — just between you and God" backHref="/the-way/courses" />
      <main className="way-page-main">
        <div className="way-card space-y-3">
          <div className="flex gap-2">
            {(["prayer", "gratitude"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setEntryType(t)}
                className="way-btn flex-1"
                style={
                  entryType === t
                    ? { background: "var(--way-accent)", color: "var(--way-accent-ink)" }
                    : { background: "var(--way-surface-2)", color: "var(--way-text-dim)" }
                }
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <textarea
            className="way-input min-h-24"
            placeholder={entryType === "prayer" ? "What's on your heart to pray about?" : "What are you thankful for today?"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          {error && (
            <p className="text-xs" style={{ color: "var(--way-danger)" }}>
              {error}
            </p>
          )}
          <button className="way-btn way-btn-primary w-full" onClick={submit} disabled={saving || !content.trim()}>
            {saving ? "Saving…" : "Save Entry"}
          </button>
        </div>

        {loading ? (
          <WaySkeletonList cards={2} />
        ) : entries.length === 0 ? (
          <p className="way-empty-state">Nothing here yet — your first entry will show up below.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="way-card flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-xs" style={{ color: "var(--way-text-dim)" }}>
                    <span className="way-pill">{TYPE_LABELS[entry.entry_type]}</span>
                    <span>{formatDate(entry.created_at)}</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--way-text)" }}>
                    {entry.content}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete entry"
                  className="shrink-0"
                  style={{ color: "var(--way-text-dim)" }}
                  onClick={() => remove(entry.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
