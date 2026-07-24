"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { AUDIOS, FIRST_YEAR_BOOKS, ADVANCED_LIBRARY } from "@/lib/library-data";

type Tab = "audios" | "books";

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>("audios");
  const [query, setQuery] = useState("");

  const filteredAudios = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return AUDIOS;
    return AUDIOS.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.speaker.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [query]);

  return (
    <>
      <PageHeader title="Audio & Book Library" subtitle="Search by title, speaker, or topic" />
      <main className="page-main">
        <div className="card flex p-1">
          <button
            className={tab === "audios" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setTab("audios")}
          >
            Audios
          </button>
          <button
            className={tab === "books" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setTab("books")}
          >
            Books
          </button>
        </div>

        {tab === "audios" ? (
          <>
            <input
              className="input"
              placeholder="Search audios (e.g. 'discouraged', 'posture', 'Winston')…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="px-1 text-xs text-slate-500">
              {filteredAudios.length} audio{filteredAudios.length === 1 ? "" : "s"}
            </p>
            <div className="space-y-2">
              {filteredAudios.map((audio) => (
                <div key={audio.title} className="card space-y-1.5">
                  <div>
                    <p className="font-semibold text-white">{audio.title}</p>
                    <p className="text-xs text-slate-400">{audio.speaker}</p>
                  </div>
                  <p className="text-sm text-slate-300">{audio.summary}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {audio.tags.map((t) => (
                      <span key={t} className="pill">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {filteredAudios.length === 0 && (
                <div className="empty-state">No audios match that search.</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="card space-y-2">
              <p className="section-title">First Year Reading</p>
              <p className="text-xs text-slate-400">
                Complete these before offering a new person a partnership.
              </p>
              <div className="space-y-1">
                {FIRST_YEAR_BOOKS.map((b) => (
                  <div key={b.title} className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">{b.title}</span>
                    <span className="text-xs text-slate-500">{b.author}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="px-1 text-xs text-slate-500">
              Advanced Leadership Library — for after the first-year list, matched to what
              someone needs right now rather than in a fixed order.
            </p>

            {ADVANCED_LIBRARY.map((group) => (
              <div key={group.category} className="card space-y-2">
                <div>
                  <p className="section-title">{group.category}</p>
                  <p className="text-xs text-slate-400">{group.whenToRecommend}</p>
                </div>
                <div className="space-y-1">
                  {group.books.map((b) => (
                    <div key={b.title} className="flex items-center justify-between text-sm">
                      <span className="text-slate-200">{b.title}</span>
                      {b.author && <span className="text-xs text-slate-500">{b.author}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </main>
    </>
  );
}
