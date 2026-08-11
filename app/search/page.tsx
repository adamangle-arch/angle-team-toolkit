"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { CANDIDATE_STEPS } from "@/lib/constants";
import { searchStatic, type SearchResult } from "@/lib/search-data";
import type { Candidate, Contact } from "@/lib/types";

// One-tap shortcuts under the search bar, Google-app AI Mode/Talk/Create
// row style - Search was otherwise type-to-find only, with no jumping-off
// point for the handful of actions people actually open the app to do.
// Pipeline already reads ?tab= to land straight on the Add Candidate
// form; Calendar already has its own "+" FAB that opens the moment the
// page mounts, so a plain link there is enough.
const QUICK_ACTIONS = [
  { label: "➕ Add Candidate", href: "/pipeline?tab=roadmap" },
  { label: "💰 Log Today's PV", href: "/volume" },
  { label: "📅 Log a Meeting", href: "/calendar" },
] as const;

function candidateSnippet(c: Candidate, query: string): string {
  // A note match ("works at Amazon") is the whole reason this candidate
  // surfaced, so show the note itself rather than the usual step status -
  // otherwise there's no visible link between the search term and why
  // this result showed up at all.
  if (c.notes && c.notes.toLowerCase().includes(query.toLowerCase())) {
    return `📝 ${c.notes}`;
  }
  if (c.launched) return "Launched";
  if (c.filtered_out) return "Filtered out";
  return `Step ${c.current_step + 1}/${CANDIDATE_STEPS.length}: ${CANDIDATE_STEPS[c.current_step]?.label ?? ""}`;
}

function contactSnippet(c: Contact): string {
  const list = c.category === "Customer" ? "Customer List" : `${c.category}-List`;
  return `${list} — ${c.status}`;
}

export default function SearchPage() {
  const router = useRouter();
  const { ownerId } = useAuth();
  const [query, setQuery] = useState("");
  const [liveResults, setLiveResults] = useState<SearchResult[]>([]);

  // Debounced so a quick typo mid-word doesn't fire a query per
  // keystroke - this is the only network-backed part of an otherwise
  // instant, purely client-side search.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [{ data: candidatesByName }, { data: candidatesByNotes }, { data: contacts }, { data: people }] =
        await Promise.all([
        supabase
          .from("candidates")
          .select("id,name,current_step,launched,filtered_out,notes")
          .eq("user_id", ownerId)
          .ilike("name", `%${trimmed}%`)
          .limit(8),
        // Separate query rather than a single .or() filter - a search term
        // containing a comma or parenthesis would otherwise collide with
        // PostgREST's own filter-syntax delimiters.
        supabase
          .from("candidates")
          .select("id,name,current_step,launched,filtered_out,notes")
          .eq("user_id", ownerId)
          .ilike("notes", `%${trimmed}%`)
          .limit(8),
        supabase
          .from("contacts")
          .select("id,name,category,status")
          .eq("user_id", ownerId)
          .ilike("name", `%${trimmed}%`)
          .limit(8),
        // Company-wide, not scoped to ownerId - anyone on the team should
        // be findable here even if they're not in your own up/downline,
        // same as they already are on the Leaderboard.
        supabase.rpc("search_profiles_by_name", { p_query: trimmed }),
      ]);
      if (cancelled) return;
      const candidatesById = new Map<string, Candidate>();
      for (const c of (candidatesByName as Candidate[]) ?? []) candidatesById.set(c.id, c);
      for (const c of (candidatesByNotes as Candidate[]) ?? []) candidatesById.set(c.id, c);
      const candidateResults: SearchResult[] = Array.from(candidatesById.values()).map((c) => ({
        title: c.name,
        snippet: candidateSnippet(c, trimmed),
        href: "/pipeline",
        source: "Candidates",
      }));
      const contactResults: SearchResult[] = ((contacts as Contact[]) ?? []).map((c) => ({
        title: c.name,
        snippet: contactSnippet(c),
        href: "/contacts",
        source: "Contacts",
      }));
      const peopleResults: SearchResult[] = (
        (people as { user_id: string; first_name: string | null; last_name: string | null; team: string | null }[]) ??
        []
      ).map((p) => ({
        title: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed",
        snippet: p.team ? `View profile — ${p.team}` : "View profile",
        href: `/profile/${p.user_id}`,
        source: "People",
      }));
      setLiveResults([...peopleResults, ...candidateResults, ...contactResults]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, ownerId]);

  // liveResults only ever gets set while a fetch for a >=2-char query is
  // in flight/complete - gating on length here too means it's never
  // shown stale under a since-cleared/shortened query.
  const results = useMemo(
    () => [...(query.trim().length >= 2 ? liveResults : []), ...searchStatic(query)],
    [liveResults, query]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      const list = map.get(r.source) ?? [];
      list.push(r);
      map.set(r.source, list);
    }
    return Array.from(map.entries());
  }, [results]);

  return (
    <>
      <PageHeader title="Search" subtitle="Find anything, anywhere in the app" />
      <main className="page-main">
        <input
          autoFocus
          className="input"
          placeholder="Search a keyword, candidate, or contact…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {!query.trim() && (
          <>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.href}
                  onClick={() => router.push(action.href)}
                  className="toggle-pill-inactive flex-none bg-white/5"
                >
                  {action.label}
                </button>
              ))}
            </div>
            <div className="empty-state">
              Start typing to search your candidates, contacts, pages, scripts, products, leaders,
              and more.
            </div>
          </>
        )}

        {query.trim() && results.length === 0 && (
          <div className="empty-state">Nothing matches that search.</div>
        )}

        {grouped.map(([source, items]) => (
          <div key={source} className="card space-y-2">
            <p className="section-title">{source}</p>
            <div className="space-y-1">
              {items.map((r, i) => (
                <button
                  key={`${r.href}-${r.title}-${i}`}
                  onClick={() => router.push(r.href)}
                  className="block w-full rounded-lg p-2 text-left transition hover:bg-white/5"
                >
                  <p className="text-sm font-medium text-white">{r.title}</p>
                  {r.snippet && (
                    <p className="line-clamp-2 text-xs text-slate-400">{r.snippet}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
