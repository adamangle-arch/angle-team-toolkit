"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { AUDIOS, FIRST_YEAR_BOOKS, ADVANCED_LIBRARY } from "@/lib/library-data";
import { LEADERS } from "@/lib/leaders-data";
import { PRODUCTS, PV_REFERENCE, STARTER_STACKS } from "@/lib/product-data";
import { SCRIPTS } from "@/lib/scripts-data";
import { PROCESS_STAGES, QUESTIONNAIRE_QUESTIONS, FIRST_MONTH_STEPS } from "@/lib/process-data";
import { SAMPLE_BAG_GUIDE, SURVEY_QUESTIONS, SURVEY_APPOINTMENT_FLOW } from "@/lib/acquisition-data";
import { CANDIDATE_STEPS, CANDIDATE_STEP_RESOURCES, isPrimaryUser } from "@/lib/constants";
import type { CandidateResourceOverride, InfoSessionFlyer } from "@/lib/types";

type Section =
  | "audios"
  | "books"
  | "leaders"
  | "products"
  | "scripts"
  | "process"
  | "candidate_resources"
  | "first_month"
  | "acquisition";

// "Process" leads the list (and is the default tab) so it's the first
// thing a new person sees on Resources - what to actually do, not
// buried behind Audios/Leaders/Products. "Candidate Resources" sits
// right after it since it's the other half of running that same
// interview process - what a candidate actually receives at each step.
// "Perfect First Month" is its own pill right after those (not a card
// inside Process), since it's a distinct next step once someone's
// launched, not part of the pre-launch interview process.
const SECTIONS: { key: Section; label: string }[] = [
  { key: "process", label: "Process" },
  { key: "candidate_resources", label: "Candidate Resources" },
  { key: "first_month", label: "Perfect First Month" },
  { key: "audios", label: "Audios" },
  { key: "books", label: "Books" },
  { key: "leaders", label: "Leaders" },
  { key: "products", label: "Products" },
  { key: "scripts", label: "Scripts & FAQ" },
  { key: "acquisition", label: "Customers" },
];

function isSection(value: string | null): value is Section {
  return SECTIONS.some((s) => s.key === value);
}

function LibraryTabs() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [section, setSection] = useState<Section>(isSection(initialTab) ? initialTab : "process");
  const [query, setQuery] = useState("");

  return (
    <>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              setSection(s.key);
              setQuery("");
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              section === s.key ? "bg-amber text-navy" : "bg-white/10 text-slate-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "audios" && <AudiosSection query={query} setQuery={setQuery} />}
      {section === "books" && <BooksSection />}
      {section === "leaders" && <LeadersSection query={query} setQuery={setQuery} />}
      {section === "products" && <ProductsSection query={query} setQuery={setQuery} />}
      {section === "scripts" && <ScriptsSection query={query} setQuery={setQuery} />}
      {section === "process" && <ProcessSection />}
      {section === "candidate_resources" && <CandidateResourcesSection />}
      {section === "first_month" && <FirstMonthSection />}
      {section === "acquisition" && <AcquisitionSection />}
    </>
  );
}

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Resources" subtitle="Everything the team needs to reference" />
      <main className="page-main">
        <Suspense fallback={<div className="empty-state">Loading…</div>}>
          <LibraryTabs />
        </Suspense>
      </main>
    </>
  );
}

function SearchBox({
  query,
  setQuery,
  placeholder,
}: {
  query: string;
  setQuery: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      className="input"
      placeholder={placeholder}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
}

function AudiosSection({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (v: string) => void;
}) {
  const filtered = useMemo(() => {
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
      <SearchBox query={query} setQuery={setQuery} placeholder="Search audios (title, speaker, topic)…" />
      <p className="px-1 text-xs text-slate-500">
        {filtered.length} audio{filtered.length === 1 ? "" : "s"}
      </p>
      <div className="space-y-2">
        {filtered.map((audio) => (
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
        {filtered.length === 0 && <div className="empty-state">No audios match that search.</div>}
      </div>
    </>
  );
}

function BooksSection() {
  return (
    <>
      <div className="card space-y-2">
        <p className="section-title">First Year Reading</p>
        <p className="text-xs text-slate-400">Complete these before offering a new person a partnership.</p>
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
        Advanced Leadership Library — matched to what someone needs right now rather than a fixed order.
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
  );
}

function LeadersSection({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LEADERS;
    return LEADERS.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q) ||
        l.occupations.toLowerCase().includes(q) ||
        l.themes.some((t) => t.toLowerCase().includes(q))
    );
  }, [query]);

  return (
    <>
      <SearchBox query={query} setQuery={setQuery} placeholder="Search by name, location, or occupation…" />
      <p className="px-1 text-xs text-slate-500">
        Use naturally and sparingly — relatability, not hero worship.
      </p>
      <div className="space-y-2">
        {filtered.map((l) => (
          <div key={l.name} className="card space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-white">{l.name}</p>
              <span className="pill shrink-0">{l.group}</span>
            </div>
            <p className="text-xs text-slate-400">
              {l.location} · {l.occupations}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {l.themes.map((t) => (
                <span key={t} className="pill">
                  {t}
                </span>
              ))}
            </div>
            {l.note && <p className="text-xs text-slate-500">{l.note}</p>}
          </div>
        ))}
        {filtered.length === 0 && <div className="empty-state">No leaders match that search.</div>}
      </div>
    </>
  );
}

function ProductsSection({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PRODUCTS;
    return PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.bestFor.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <>
      <SearchBox query={query} setQuery={setQuery} placeholder="Search products (name, brand, concern)…" />
      <div className="space-y-2">
        {filtered.map((p) => (
          <div key={p.name} className="card space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-white">{p.name}</p>
              <span className="pill-amber shrink-0">{p.brand}</span>
            </div>
            <p className="text-sm text-slate-300">{p.summary}</p>
            <p className="text-xs text-slate-400">
              <span className="font-medium text-slate-300">Best for: </span>
              {p.bestFor}
            </p>
            {p.pv && <p className="text-xs text-amber-light">{p.pv}</p>}
          </div>
        ))}
        {filtered.length === 0 && <div className="empty-state">No products match that search.</div>}
      </div>

      {!query && (
        <>
          <div className="card space-y-1.5">
            <p className="section-title">PV Quick Reference</p>
            {PV_REFERENCE.map((r) => (
              <div key={r.item} className="flex items-center justify-between text-sm">
                <span className="text-slate-200">{r.item}</span>
                <span className="text-xs text-amber-light">{r.pv}</span>
              </div>
            ))}
          </div>

          <div className="card space-y-1.5">
            <p className="section-title">Starter Stacks</p>
            {STARTER_STACKS.map((s) => (
              <div key={s.name} className="space-y-0.5 border-b border-white/5 pb-1.5 last:border-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{s.name}</span>
                  <span className="text-xs text-slate-500">{s.detail}</span>
                </div>
                <p className="text-xs text-slate-400">{s.bestFor}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ScriptsSection({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SCRIPTS;
    return SCRIPTS.filter(
      (s) =>
        s.question.toLowerCase().includes(q) ||
        s.answer.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const s of filtered) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <>
      <SearchBox query={query} setQuery={setQuery} placeholder="Search scripts, objections, comp plan…" />
      {grouped.map(([category, items]) => (
        <div key={category} className="card space-y-2">
          <p className="section-title">{category}</p>
          <div className="space-y-3">
            {items.map((s) => (
              <div key={s.question} className="space-y-1">
                <p className="text-sm font-medium text-white">{s.question}</p>
                <p className="text-sm text-slate-300">{s.answer}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {grouped.length === 0 && <div className="empty-state">Nothing matches that search.</div>}
    </>
  );
}

function ProcessSection() {
  return (
    <>
      <div className="card space-y-2">
        <p className="section-title">Angle Diamond Team — 9 Core Steps</p>
        <Image
          src="/9-core-steps.jpg"
          alt="Angle Diamond Team 9 Core Steps: Grow Your Income (3-5 QI's/Week, 300 PV Personal Circle, 60% VCS), Grow Your Self (Read 20 Minutes/Day, Listen to 1 Audio/Day, Attend all Meetings), Grow Your Team (Be Accountable, Be Coachable, Communicate Daily using the Message App)"
          width={1170}
          height={733}
          className="h-auto w-full rounded-xl"
        />
      </div>

      {PROCESS_STAGES.map((s) => (
        <div key={s.stage} className="card space-y-2">
          <p className="section-title">{s.stage}</p>
          <p className="text-sm text-slate-300">{s.philosophy}</p>
          {s.exampleQuestions && (
            <div className="space-y-1 border-t border-white/10 pt-2">
              <p className="text-xs font-medium text-slate-400">Example questions</p>
              {s.exampleQuestions.map((q) => (
                <p key={q} className="text-xs text-slate-400">
                  &ldquo;{q}&rdquo;
                </p>
              ))}
            </div>
          )}
          {s.homework && (
            <p className="text-xs text-amber-light">
              <span className="font-medium">Homework: </span>
              {s.homework}
            </p>
          )}
        </div>
      ))}

      <div className="card space-y-1.5">
        <p className="section-title">Pre-Launch Questionnaire (official — don&apos;t alter)</p>
        {QUESTIONNAIRE_QUESTIONS.map((q, i) => (
          <p key={q} className="text-sm text-slate-300">
            {i + 1}. {q}
          </p>
        ))}
      </div>
    </>
  );
}

// What a candidate automatically receives at each roadmap step (see
// /prospect) - CANDIDATE_STEP_RESOURCES in lib/constants.ts is the
// team-wide default, but any IBO can hide a default just for their own
// candidates or add their own on top, without touching anyone else's.
// Each row here is a candidate_resource_overrides insert/delete scoped to
// ownerId - "remove" hides a default (matched by its exact label),
// "add" is a resource this IBO tacked on beyond the defaults.
function CandidateResourcesSection() {
  const { ownerId, user } = useAuth();
  const [overrides, setOverrides] = useState<CandidateResourceOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingStep, setAddingStep] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("candidate_resource_overrides")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setOverrides((data as CandidateResourceOverride[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  function openAddForm(step: number) {
    setAddingStep(step);
    setNewLabel("");
    setNewDetail("");
    setNewUrl("");
    setError(null);
  }

  async function hideDefault(step: number, label: string) {
    setError(null);
    const { data, error } = await supabase
      .from("candidate_resource_overrides")
      .insert({ user_id: ownerId, step, action: "remove", label })
      .select("*")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setOverrides((prev) => [...prev, data as CandidateResourceOverride]);
  }

  async function deleteOverride(id: string) {
    const previous = overrides;
    setOverrides((prev) => prev.filter((o) => o.id !== id));
    const { error } = await supabase.from("candidate_resource_overrides").delete().eq("id", id);
    if (error) {
      setOverrides(previous);
      setError(error.message);
    }
  }

  async function addResource(step: number) {
    const label = newLabel.trim();
    if (!label) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("candidate_resource_overrides")
      .insert({
        user_id: ownerId,
        step,
        action: "add",
        label,
        detail: newDetail.trim(),
        url: newUrl.trim() || null,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOverrides((prev) => [...prev, data as CandidateResourceOverride]);
    setAddingStep(null);
  }

  if (loading) {
    return <div className="empty-state">Loading…</div>;
  }

  return (
    <>
      {isPrimaryUser(user.email) && <InfoSessionFlyerAdmin />}

      <div className="card space-y-1">
        <p className="section-title">Candidate Resources</p>
        <p className="text-xs text-slate-400">
          What a candidate automatically receives at each step of the interview process, once
          you&apos;ve shared their access code (Candidate Roadmap → 🔑 Code). These are the
          team-wide defaults — hide any you don&apos;t want to send, or add your own; either way it
          only affects your own candidates.
        </p>
      </div>

      {error && (
        <div className="card">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {CANDIDATE_STEPS.map((stepInfo, step) => {
        const removedLabels = new Set(
          overrides.filter((o) => o.step === step && o.action === "remove").map((o) => o.label)
        );
        const added = overrides.filter((o) => o.step === step && o.action === "add");
        const defaults = CANDIDATE_STEP_RESOURCES[step];

        return (
          <div key={step} className="card space-y-2">
            <p className="section-title">
              {step + 1}. {stepInfo.label}
            </p>

            {defaults.length === 0 && added.length === 0 && (
              <p className="text-sm text-slate-400">Nothing at this step.</p>
            )}

            {defaults.map((r) => {
              const hidden = removedLabels.has(r.label);
              return (
                <div
                  key={r.label}
                  className={`flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2 ${
                    hidden ? "opacity-50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p
                      className={`truncate text-sm font-medium ${
                        hidden ? "text-slate-500 line-through" : "text-white"
                      }`}
                    >
                      {r.label}
                    </p>
                    <p className="truncate text-xs text-slate-500">{r.detail}</p>
                  </div>
                  {hidden ? (
                    <button
                      className="pill shrink-0"
                      onClick={() => {
                        const row = overrides.find(
                          (o) => o.step === step && o.action === "remove" && o.label === r.label
                        );
                        if (row) deleteOverride(row.id);
                      }}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      className="btn-icon shrink-0"
                      onClick={() => hideDefault(step, r.label)}
                      aria-label={`Hide ${r.label}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}

            {added.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{o.label}</p>
                  {o.detail && <p className="truncate text-xs text-slate-500">{o.detail}</p>}
                </div>
                <button
                  className="btn-icon shrink-0"
                  onClick={() => deleteOverride(o.id)}
                  aria-label={`Remove ${o.label}`}
                >
                  ✕
                </button>
              </div>
            ))}

            {addingStep === step ? (
              <div className="space-y-1.5 rounded-lg bg-navy px-3 py-2">
                <input
                  className="input"
                  placeholder="Label (e.g. 🎧 Audio Name)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Detail (e.g. By So-and-so)"
                  value={newDetail}
                  onChange={(e) => setNewDetail(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Link (optional)"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1" onClick={() => setAddingStep(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn-primary flex-1"
                    onClick={() => addResource(step)}
                    disabled={saving || !newLabel.trim()}
                  >
                    {saving ? "Adding…" : "Add"}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-secondary w-full" onClick={() => openAddForm(step)}>
                + Add Resource
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

// One shared row for the whole team (see info_session_flyer in
// supabase/schema.sql), not per-IBO - there's one physical weekly Info
// Session with a rotating speaker, so whoever updates it here updates it
// for every IBO's IS1/IS2 candidates attending in person. Uploading a new
// image just overwrites the same storage path (upsert), same as an
// avatar photo re-upload.
function InfoSessionFlyerAdmin() {
  const [flyer, setFlyer] = useState<InfoSessionFlyer | null>(null);
  const [speakerName, setSpeakerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("info_session_flyer").select("*").eq("id", true).maybeSingle();
      const row = (data as InfoSessionFlyer) ?? null;
      setFlyer(row);
      setSpeakerName(row?.speaker_name ?? "");
      setLoading(false);
    }
    load();
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `current.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("info-session-flyer")
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }
    const { data: pub } = supabase.storage.from("info-session-flyer").getPublicUrl(path);
    const imageUrl = `${pub.publicUrl}?t=${Date.now()}`;
    const { error: updateError } = await supabase
      .from("info_session_flyer")
      .update({ image_url: imageUrl })
      .eq("id", true);
    setUploading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setFlyer((prev) => ({ image_url: imageUrl, speaker_name: prev?.speaker_name ?? null }));
  }

  async function saveSpeakerName() {
    setSaving(true);
    setError(null);
    const trimmed = speakerName.trim() || null;
    const { error: updateError } = await supabase
      .from("info_session_flyer")
      .update({ speaker_name: trimmed })
      .eq("id", true);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setFlyer((prev) => (prev ? { ...prev, speaker_name: trimmed } : prev));
  }

  if (loading) return null;

  return (
    <div className="card space-y-2">
      <p className="section-title">🎤 This Week&apos;s Info Session Flyer</p>
      <p className="text-xs text-slate-400">
        Shown to every IS1/IS2 candidate who&apos;s attending in person — upload the same graphic
        you already design each week, whoever&apos;s speaking.
      </p>
      {flyer?.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={flyer.image_url} alt="Current Info Session flyer" className="w-full rounded-xl" />
      )}
      <label className="btn-secondary block w-full cursor-pointer text-center">
        {uploading ? "Uploading…" : flyer?.image_url ? "Replace Flyer" : "Upload Flyer"}
        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Speaker name (optional label)"
          value={speakerName}
          onChange={(e) => setSpeakerName(e.target.value)}
        />
        <button className="btn-secondary shrink-0" onClick={saveSpeakerName} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function FirstMonthSection() {
  return (
    <div className="card space-y-2">
      <p className="section-title">🚀 Perfect First Month (New Launch)</p>
      <p className="text-xs text-slate-400">
        Step by step, in order, for someone who just launched.
      </p>
      {FIRST_MONTH_STEPS.map((s, i) => (
        <div key={s.step} className="space-y-1">
          <p className="text-sm font-medium text-white">
            {i + 1}. {s.step}
          </p>
          {s.substeps && (
            <div className="space-y-0.5 pl-4">
              {s.substeps.map((sub) => (
                <p key={sub} className="text-xs text-slate-400">
                  • {sub}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AcquisitionSection() {
  const [answers, setAnswers] = useState<Record<number, "yes" | "no" | null>>({});

  return (
    <>
      <div className="card space-y-2">
        <p className="section-title">Sample Bags</p>
        <div className="space-y-3">
          {SAMPLE_BAG_GUIDE.map((g) => (
            <div key={g.title} className="space-y-1">
              <p className="text-sm font-medium text-white">{g.title}</p>
              <p className="text-sm text-slate-300">{g.content}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card space-y-2">
        <p className="section-title">Customer Survey — tap to check off</p>
        <p className="text-xs text-slate-400">
          Use only these 9 official questions, in order — don&apos;t add or improvise others.
        </p>
        <div className="space-y-3">
          {SURVEY_QUESTIONS.map((sq, i) => {
            const answer = answers[i] ?? null;
            return (
              <div key={sq.question} className="space-y-1.5 border-t border-white/10 pt-3 first:border-0 first:pt-0">
                <p className="text-sm font-medium text-white">
                  {i + 1}. {sq.question}
                </p>
                {sq.followUp && <p className="text-xs text-slate-500">{sq.followUp}</p>}
                <div className="flex gap-2">
                  <button
                    className={answer === "yes" ? "toggle-pill-active flex-none px-4" : "toggle-pill-inactive flex-none bg-white/5 px-4"}
                    onClick={() => setAnswers((prev) => ({ ...prev, [i]: answer === "yes" ? null : "yes" }))}
                  >
                    Yes
                  </button>
                  <button
                    className={answer === "no" ? "toggle-pill-active flex-none px-4" : "toggle-pill-inactive flex-none bg-white/5 px-4"}
                    onClick={() => setAnswers((prev) => ({ ...prev, [i]: answer === "no" ? null : "no" }))}
                  >
                    No
                  </button>
                </div>
                {answer === "yes" && (
                  <p className="rounded-lg bg-amber/10 p-2 text-xs text-amber-light">{sq.recommendations}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card space-y-1.5">
        <p className="section-title">Appointment Flow</p>
        {SURVEY_APPOINTMENT_FLOW.map((step, i) => (
          <p key={step} className="text-sm text-slate-300">
            {i + 1}. {step}
          </p>
        ))}
      </div>
    </>
  );
}
