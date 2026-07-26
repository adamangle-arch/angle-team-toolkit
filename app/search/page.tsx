"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { searchStatic, type SearchResult } from "@/lib/search-data";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchStatic(query), [query]);

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
          placeholder="Search a keyword or phrase…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {!query.trim() && (
          <div className="empty-state">Start typing to search pages, scripts, products, leaders, and more.</div>
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
