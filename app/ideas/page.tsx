"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Hammer, CheckCircle2, type LucideIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryUser } from "@/lib/constants";
import { formatDateLabel } from "@/lib/dates";
import type { InnovationIdea } from "@/lib/types";

const STATUS_LABEL: Record<InnovationIdea["status"], string> = {
  open: "Open",
  planned: "Planned",
  shipped: "Shipped",
  closed: "Closed",
};

// Only the two "in progress"/"done" states get a leading icon - Open and
// Closed read fine as plain text and don't need one.
const STATUS_ICON: Partial<Record<InnovationIdea["status"], LucideIcon>> = {
  planned: Hammer,
  shipped: CheckCircle2,
};

function StatusLabel({ status }: { status: InnovationIdea["status"] }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="inline-flex items-center gap-1">
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {STATUS_LABEL[status]}
    </span>
  );
}

// Cycle order for the admin's one-tap status button - open is the start,
// closed is a dead end you'd only reach deliberately (not part of the
// cycle), same "not every state loops" idea as Candidate Roadmap's
// Filtered Out.
const STATUS_CYCLE: Record<InnovationIdea["status"], InnovationIdea["status"]> = {
  open: "planned",
  planned: "shipped",
  shipped: "open",
  closed: "open",
};

const FILTERS = ["all", "open", "planned", "shipped"] as const;
type Filter = (typeof FILTERS)[number];

function personName(entry: { first_name: string | null; last_name: string | null }): string {
  return [entry.first_name, entry.last_name].filter(Boolean).join(" ") || "Unnamed";
}

export default function IdeasPage() {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);
  const [ideas, setIdeas] = useState<InnovationIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  function load() {
    supabase.rpc("get_innovation_ideas").then(({ data, error }) => {
      if (error) {
        setError(error.message);
      } else {
        setError(null);
        setIdeas((data as InnovationIdea[]) ?? []);
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function submitIdea() {
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.from("innovation_ideas").insert({ body: trimmed });
    setSubmitting(false);
    if (error) {
      setError(`Couldn't post that: ${error.message}`);
      return;
    }
    setDraft("");
    load();
  }

  async function vote(idea: InnovationIdea) {
    // Optimistic - a vote is low-stakes enough not to wait on the round
    // trip before the count/highlight updates.
    setIdeas((prev) =>
      prev.map((i) =>
        i.id === idea.id
          ? { ...i, voted_by_me: !i.voted_by_me, vote_count: i.vote_count + (i.voted_by_me ? -1 : 1) }
          : i
      )
    );
    const { error } = await supabase.rpc("toggle_innovation_vote", { p_idea_id: idea.id });
    if (error) {
      setError(`Couldn't save that vote: ${error.message}`);
      load();
    } else {
      load();
    }
  }

  async function cycleStatus(idea: InnovationIdea) {
    const next = STATUS_CYCLE[idea.status];
    const { error } = await supabase.from("innovation_ideas").update({ status: next }).eq("id", idea.id);
    if (error) {
      setError(`Couldn't update status: ${error.message}`);
      return;
    }
    load();
  }

  async function removeIdea(idea: InnovationIdea) {
    const { error } = await supabase.from("innovation_ideas").delete().eq("id", idea.id);
    if (error) {
      setError(`Couldn't remove that: ${error.message}`);
      return;
    }
    load();
  }

  const visibleIdeas = ideas.filter((i) => filter === "all" || i.status === filter);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1.5">
            <Lightbulb className="h-5 w-5" aria-hidden />
            Innovation Box
          </span>
        }
        subtitle="Submit and vote on what to build next"
      />
      <main className="page-main">
        <div className="card space-y-2">
          <textarea
            className="input min-h-[70px]"
            placeholder="What should we add or change?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
          />
          <button className="btn-primary w-full" onClick={submitIdea} disabled={!draft.trim() || submitting}>
            {submitting ? "Posting…" : "Post Idea"}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? "toggle-pill-active" : "toggle-pill-inactive"}
            >
              {f === "all" ? "All" : <StatusLabel status={f} />}
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonList cards={4} />
        ) : visibleIdeas.length === 0 ? (
          <div className="empty-state">Nothing here yet — be the first to post an idea.</div>
        ) : (
          <div className="space-y-2">
            {visibleIdeas.map((idea) => (
              <div key={idea.id} className="card space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 text-sm text-slate-200">{idea.body}</p>
                  <button
                    onClick={() => vote(idea)}
                    className={`flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                      idea.voted_by_me ? "bg-amber text-navy" : "bg-white/5 text-slate-300"
                    }`}
                  >
                    <span>▲</span>
                    <span>{idea.vote_count}</span>
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {personName(idea)}
                    {idea.team ? ` (${idea.team})` : ""} — {formatDateLabel(idea.created_at.slice(0, 10))}
                  </span>
                  <span className={idea.status === "shipped" ? "pill-amber" : "pill"}>
                    <StatusLabel status={idea.status} />
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 pt-1">
                    <button
                      className="chip-btn flex items-center gap-1 text-xs"
                      onClick={() => cycleStatus(idea)}
                    >
                      Mark <StatusLabel status={STATUS_CYCLE[idea.status]} />
                    </button>
                    <button className="chip-btn text-xs text-red-400" onClick={() => removeIdea(idea)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
