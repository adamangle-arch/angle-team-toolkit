"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { CANDIDATE_STEPS, isBadgeExcluded } from "@/lib/constants";
import { searchStatic, type SearchResult } from "@/lib/search-data";
import type { Candidate, Contact } from "@/lib/types";

function candidateSnippet(c: Candidate): string {
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
  const { ownerId, user } = useAuth();
  const badgesExcluded = isBadgeExcluded(user.email);
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
      const [{ data: candidates }, { data: contacts }] = await Promise.all([
        supabase
          .from("candidates")
          .select("id,name,current_step,launched,filtered_out")
          .eq("user_id", ownerId)
          .ilike("name", `%${trimmed}%`)
          .limit(8),
        supabase
          .from("contacts")
          .select("id,name,category,status")
          .eq("user_id", ownerId)
          .ilike("name", `%${trimmed}%`)
          .limit(8),
      ]);
      if (cancelled) return;
      const candidateResults: SearchResult[] = ((candidates as Candidate[]) ?? []).map((c) => ({
        title: c.name,
        snippet: candidateSnippet(c),
        href: "/pipeline",
        source: "Candidates",
      }));
      const contactResults: SearchResult[] = ((contacts as Contact[]) ?? []).map((c) => ({
        title: c.name,
        snippet: contactSnippet(c),
        href: "/contacts",
        source: "Contacts",
      }));
      setLiveResults([...candidateResults, ...contactResults]);
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
    () =>
      [...(query.trim().length >= 2 ? liveResults : []), ...searchStatic(query)].filter(
        (r) => !badgesExcluded || r.href !== "/badges"
      ),
    [liveResults, query, badgesExcluded]
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
          <div className="empty-state">
            Start typing to search your candidates, contacts, pages, scripts, products, leaders,
            and more.
          </div>
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
