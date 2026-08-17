"use client";

import { useEffect, useState } from "react";
import { Lightbulb, HelpCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryUser } from "@/lib/constants";
import { formatDateLabel } from "@/lib/dates";
import type { InnovationIdea } from "@/lib/types";

const KINDS = ["question", "idea"] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABEL: Record<Kind, string> = { question: "Questions", idea: "Ideas" };
const KIND_PLACEHOLDER: Record<Kind, string> = {
  question: "What are you wondering about the app?",
  idea: "What should we add or change?",
};
const KIND_EMPTY: Record<Kind, string> = {
  question: "No questions yet — ask away.",
  idea: "No ideas yet — be the first to post one.",
};

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
  const [kind, setKind] = useState<Kind>("idea");

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
    const { error } = await supabase.from("innovation_ideas").insert({ body: trimmed, kind });
    setSubmitting(false);
    if (error) {
      setError(`Couldn't post that: ${error.message}`);
      return;
    }
    setDraft("");
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

  const visibleIdeas = ideas.filter((i) => i.kind === kind);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1.5">
            <Lightbulb className="h-5 w-5" aria-hidden />
            Innovation Box
          </span>
        }
        subtitle="Everyone here is an entrepreneur - ask a question or drop an idea. Only admins see it."
      />
      <main className="page-main">
        <div className="flex gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={kind === k ? "toggle-pill-active flex-1" : "toggle-pill-inactive flex-1"}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="card space-y-2">
          <textarea
            className="input min-h-[70px]"
            placeholder={KIND_PLACEHOLDER[kind]}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
          />
          <button className="btn-primary w-full" onClick={submitIdea} disabled={!draft.trim() || submitting}>
            {submitting ? "Posting…" : kind === "question" ? "Post Question" : "Post Idea"}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading ? (
          <SkeletonList cards={4} />
        ) : visibleIdeas.length === 0 ? (
          <div className="empty-state">{KIND_EMPTY[kind]}</div>
        ) : (
          <div className="space-y-2">
            {visibleIdeas.map((idea) => (
              <div key={idea.id} className="card space-y-1.5">
                <div className="flex items-start gap-2">
                  {idea.kind === "question" && (
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  )}
                  <p className="flex-1 text-sm text-slate-200">{idea.body}</p>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {isAdmin ? personName(idea) : "You"}
                    {isAdmin && idea.team ? ` (${idea.team})` : ""} — {formatDateLabel(idea.created_at.slice(0, 10))}
                  </span>
                  {(isAdmin || idea.user_id === user.id) && (
                    <button className="chip-btn text-xs text-red-400" onClick={() => removeIdea(idea)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
