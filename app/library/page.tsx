"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X, Mic, Headphones, BookOpen, ClipboardList, Library, Rocket, CheckCircle2, AlertTriangle, Wallet, ChevronRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import LibraryResourcePicker from "@/components/LibraryResourcePicker";
import { SkeletonList } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import { fireNotifyEvent } from "@/lib/notifyClient";
import { AUDIOS, FIRST_YEAR_BOOKS, ADVANCED_LIBRARY } from "@/lib/library-data";
import { LEADERS } from "@/lib/leaders-data";
import { PRODUCTS, PV_REFERENCE, STARTER_STACKS } from "@/lib/product-data";
import { SCRIPTS } from "@/lib/scripts-data";
import { PROCESS_STAGES, QUESTIONNAIRE_QUESTIONS, FIRST_MONTH_STEPS } from "@/lib/process-data";
import { SAMPLE_BAG_GUIDE, SURVEY_QUESTIONS, SURVEY_APPOINTMENT_FLOW } from "@/lib/acquisition-data";
import {
  CANDIDATE_STEPS,
  CANDIDATE_STEP_RESOURCES,
  ONBOARDING_SESSIONS,
  isPrimaryUser,
} from "@/lib/constants";
import type {
  CandidateResourceOverride,
  InfoSessionSpeaker,
  OnboardingResourceOverride,
  OptionalResource,
  OptionalResourceKind,
} from "@/lib/types";

type Section =
  | "audios"
  | "books"
  | "leaders"
  | "products"
  | "scripts"
  | "process"
  | "candidate_resources"
  | "onboarding_resources"
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
  { key: "onboarding_resources", label: "Classroom Resources" },
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
      {/* Wraps onto multiple lines instead of scrolling sideways - ten
          categories in one horizontally-scrolling row meant several were
          always off-screen with no obvious way to reach them (same fix
          as the Leaderboard's category tabs). Every tab is visible at
          once here; there's just no need to size columns evenly since
          label lengths vary a lot more than the Leaderboard's four. */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              setSection(s.key);
              setQuery("");
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              section === s.key ? "bg-amber text-ink" : "bg-white/10 text-slate-300"
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
      {section === "onboarding_resources" && <OnboardingResourcesSection />}
      {section === "first_month" && <FirstMonthSection />}
      {section === "acquisition" && <AcquisitionSection />}
    </>
  );
}

export default function LibraryPage() {
  return (
    <FeatureGate minSession={5}>
      <PageHeader title="Resources" subtitle="Everything the team needs to reference" />
      <main className="page-main">
        <Suspense fallback={<SkeletonList cards={4} />}>
          <LibraryTabs />
        </Suspense>
      </main>
    </FeatureGate>
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

type DisplayAudio = {
  title: string;
  speaker: string;
  summary: string;
  tags: string[];
  url?: string;
  estimate?: string | null;
};

function AudiosSection({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (v: string) => void;
}) {
  const [audioResources, setAudioResources] = useState<
    { label: string; detail: string; url: string | null; estimate: string | null }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("optional_resources")
        .select("label,detail,url,estimate")
        .eq("kind", "audio");
      if (!cancelled) {
        setAudioResources(
          (data as { label: string; detail: string; url: string | null; estimate: string | null }[]) ?? []
        );
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Every optional_resources row with kind="audio" either overlays a link
  // (+ estimate) onto a curated AUDIOS entry it title-matches, or - if it
  // doesn't match any curated title - shows up as its own card. This is
  // what makes "Add to Library" (Resources hub, kind Audio) automatically
  // appear here with a working link, with no code change needed for each
  // new one added.
  const allAudios = useMemo<DisplayAudio[]>(() => {
    const curatedKeys = new Set(AUDIOS.map((a) => normalizeTitle(a.title)));
    const byKey = new Map<string, { label: string; detail: string; url: string | null; estimate: string | null }>();
    for (const row of audioResources) {
      byKey.set(normalizeTitle(row.label), row);
    }

    const curated: DisplayAudio[] = AUDIOS.map((a) => {
      const match = byKey.get(normalizeTitle(a.title));
      return {
        title: a.title,
        speaker: a.speaker,
        summary: a.summary,
        tags: a.tags,
        url: match?.url ?? undefined,
        estimate: match?.estimate ?? null,
      };
    });

    const extra: DisplayAudio[] = audioResources
      .filter((row) => !curatedKeys.has(normalizeTitle(row.label)))
      .map((row) => ({
        title: row.label,
        speaker: row.detail,
        summary: "",
        tags: [],
        url: row.url ?? undefined,
        estimate: row.estimate,
      }));

    return [...curated, ...extra];
  }, [audioResources]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allAudios;
    return allAudios.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.speaker.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [allAudios, query]);

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
              {audio.url ? (
                <a
                  href={audio.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-amber-light underline decoration-dotted underline-offset-2"
                >
                  {audio.title}
                </a>
              ) : (
                <p className="font-semibold text-white">{audio.title}</p>
              )}
              {audio.speaker && <p className="text-xs text-slate-400">{audio.speaker}</p>}
            </div>
            {audio.summary && <p className="text-sm text-slate-300">{audio.summary}</p>}
            {(audio.tags.length > 0 || audio.estimate) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {audio.estimate && <span className="pill">{audio.estimate}</span>}
                {audio.tags.map((t) => (
                  <span key={t} className="pill">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="empty-state">No audios match that search.</div>}
      </div>
    </>
  );
}

// Strips a leading emoji (or any other non-letter/non-number clutter)
// so a library label like "📖 The Go-Giver" or "🎧 Skydivers" normalizes
// down to the same key as the plain title ("The Go-Giver", "Skydivers")
// it's meant to match, whether that's a book or a fixed AUDIOS entry.
function normalizeTitle(s: string): string {
  return s
    .replace(/^[^\p{L}\p{N}]+/gu, "")
    .replace(/[‐‑‒–—―]/g, "-") // en/em dash
    // etc. -> plain hyphen, so a typographic dash in one source
    // (lib/library-data.ts) still matches a plain hyphen typed into the
    // other (optional_resources.label) - e.g. "Emerald Success Story –
    // Angle" vs "🎧 Emerald Success Story - Angle"
    .trim()
    .toLowerCase();
}

function BookRow({ title, author, url }: { title: string; author: string; url?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-light underline decoration-dotted underline-offset-2"
        >
          {title}
        </a>
      ) : (
        <span className="text-slate-200">{title}</span>
      )}
      {author && <span className="shrink-0 text-xs text-slate-500">{author}</span>}
    </div>
  );
}

function BooksSection() {
  const [pdfLinks, setPdfLinks] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("optional_resources")
        .select("label,url")
        .eq("kind", "reading")
        .not("url", "is", null);
      if (!cancelled) {
        const map = new Map<string, string>();
        for (const row of (data as { label: string; url: string | null }[]) ?? []) {
          if (row.url) map.set(normalizeTitle(row.label), row.url);
        }
        setPdfLinks(map);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="card space-y-2">
        <p className="section-title">First Year Reading</p>
        <p className="text-xs text-slate-400">
          Complete these before offering a new person a partnership. Titles link to a PDF where
          one&apos;s been added to the Optional Resources library.
        </p>
        <div className="space-y-1">
          {FIRST_YEAR_BOOKS.map((b) => (
            <BookRow key={b.title} title={b.title} author={b.author} url={pdfLinks.get(normalizeTitle(b.title))} />
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
              <BookRow
                key={b.title}
                title={b.title}
                author={b.author}
                url={pdfLinks.get(normalizeTitle(b.title))}
              />
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
      <Link
        href="/budget"
        className="card flex items-center justify-between gap-2 transition hover:bg-white/5"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/15">
            <Wallet className="h-4.5 w-4.5 text-amber-light" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-white">My Budget</span>
            <span className="block text-xs text-slate-400">
              Fill out (or revisit) your Session 1 budget worksheet anytime.
            </span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      </Link>

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
  const [libraryResources, setLibraryResources] = useState<OptionalResource[]>([]);
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
      const [{ data }, { data: libraryRows }] = await Promise.all([
        supabase
          .from("candidate_resource_overrides")
          .select("*")
          .eq("user_id", ownerId)
          .order("created_at", { ascending: true }),
        supabase.from("optional_resources").select("*").order("label", { ascending: true }),
      ]);
      if (!cancelled) {
        setOverrides((data as CandidateResourceOverride[]) ?? []);
        setLibraryResources((libraryRows as OptionalResource[]) ?? []);
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

  async function addFromLibrary(step: number, resource: OptionalResource) {
    setError(null);
    const { data, error } = await supabase
      .from("candidate_resource_overrides")
      .insert({
        user_id: ownerId,
        step,
        action: "add",
        label: resource.label,
        detail: resource.detail,
        url: resource.url,
        estimate: resource.estimate,
      })
      .select("*")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setOverrides((prev) => [...prev, data as CandidateResourceOverride]);
    setAddingStep(null);
  }

  if (loading) {
    return <SkeletonList cards={4} />;
  }

  return (
    <>
      {isPrimaryUser(user.email) && <InfoSessionSpeakerAdmin />}
      {isPrimaryUser(user.email) && <FU1VideoAdminToggle />}
      {isPrimaryUser(user.email) && <OptionalResourcesAdmin onChange={setLibraryResources} />}

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
                      <X className="h-5 w-5" aria-hidden />
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
                  {(o.detail || o.estimate) && (
                    <p className="truncate text-xs text-slate-500">
                      {o.detail}
                      {o.estimate && <span> · {o.estimate}</span>}
                    </p>
                  )}
                </div>
                <button
                  className="btn-icon shrink-0"
                  onClick={() => deleteOverride(o.id)}
                  aria-label={`Remove ${o.label}`}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ))}

            {addingStep === step ? (
              <div className="space-y-2 rounded-lg bg-navy px-3 py-2">
                {libraryResources.length > 0 && (
                  <LibraryResourcePicker
                    resources={libraryResources}
                    onPick={(resource) => addFromLibrary(step, resource)}
                  />
                )}
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

// Same "team-wide default, freely edited per-IBO, optionally picked from
// a shared library" pattern as CandidateResourcesSection above, but for
// onboarding sessions instead of candidate steps - see
// onboarding_resource_overrides in supabase/schema.sql. The library
// management widget itself (OptionalResourcesAdmin) lives on the
// Candidate Resources tab, not duplicated here - this section just reads
// the same shared optional_resources table for its own "pick from
// library" pickers.
function OnboardingResourcesSection() {
  const { ownerId } = useAuth();
  const [overrides, setOverrides] = useState<OnboardingResourceOverride[]>([]);
  const [libraryResources, setLibraryResources] = useState<OptionalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingSession, setAddingSession] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data }, { data: libraryRows }] = await Promise.all([
        supabase
          .from("onboarding_resource_overrides")
          .select("*")
          .eq("user_id", ownerId)
          .order("created_at", { ascending: true }),
        supabase.from("optional_resources").select("*").order("label", { ascending: true }),
      ]);
      if (!cancelled) {
        setOverrides((data as OnboardingResourceOverride[]) ?? []);
        setLibraryResources((libraryRows as OptionalResource[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  function openAddForm(session: number) {
    setAddingSession(session);
    setNewLabel("");
    setNewDetail("");
    setNewUrl("");
    setError(null);
  }

  async function hideDefault(session: number, label: string) {
    setError(null);
    const { data, error } = await supabase
      .from("onboarding_resource_overrides")
      .insert({ user_id: ownerId, session, action: "remove", label })
      .select("*")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setOverrides((prev) => [...prev, data as OnboardingResourceOverride]);
  }

  async function deleteOverride(id: string) {
    const previous = overrides;
    setOverrides((prev) => prev.filter((o) => o.id !== id));
    const { error } = await supabase.from("onboarding_resource_overrides").delete().eq("id", id);
    if (error) {
      setOverrides(previous);
      setError(error.message);
    }
  }

  async function addResource(session: number) {
    const label = newLabel.trim();
    if (!label) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("onboarding_resource_overrides")
      .insert({
        user_id: ownerId,
        session,
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
    setOverrides((prev) => [...prev, data as OnboardingResourceOverride]);
    setAddingSession(null);
  }

  async function addFromLibrary(session: number, resource: OptionalResource) {
    setError(null);
    const { data, error } = await supabase
      .from("onboarding_resource_overrides")
      .insert({
        user_id: ownerId,
        session,
        action: "add",
        label: resource.label,
        detail: resource.detail,
        url: resource.url,
        estimate: resource.estimate,
      })
      .select("*")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setOverrides((prev) => [...prev, data as OnboardingResourceOverride]);
    setAddingSession(null);
  }

  if (loading) {
    return <SkeletonList cards={4} />;
  }

  return (
    <>
      <div className="card space-y-1">
        <p className="section-title">Classroom Resources</p>
        <p className="text-xs text-slate-400">
          What every new team member sees on their Classroom page, at each of the 5 sessions.
          These are the team-wide defaults — hide any you don&apos;t want new people to see, or add
          your own; either way it only affects your own downline&apos;s onboarding, not anyone
          else&apos;s.
        </p>
      </div>

      {error && (
        <div className="card">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {ONBOARDING_SESSIONS.map((sessionInfo, i) => {
        const sessionNumber = i + 1;
        const removedLabels = new Set(
          overrides
            .filter((o) => o.session === sessionNumber && o.action === "remove")
            .map((o) => o.label)
        );
        const added = overrides.filter((o) => o.session === sessionNumber && o.action === "add");
        const defaults = sessionInfo.resources;

        return (
          <div key={sessionInfo.title} className="card space-y-2">
            <p className="section-title">{sessionInfo.title}</p>

            {defaults.length === 0 && added.length === 0 && (
              <p className="text-sm text-slate-400">Nothing at this session.</p>
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
                          (o) =>
                            o.session === sessionNumber && o.action === "remove" && o.label === r.label
                        );
                        if (row) deleteOverride(row.id);
                      }}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      className="btn-icon shrink-0"
                      onClick={() => hideDefault(sessionNumber, r.label)}
                      aria-label={`Hide ${r.label}`}
                    >
                      <X className="h-5 w-5" aria-hidden />
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
                  {(o.detail || o.estimate) && (
                    <p className="truncate text-xs text-slate-500">
                      {o.detail}
                      {o.estimate && <span> · {o.estimate}</span>}
                    </p>
                  )}
                </div>
                <button
                  className="btn-icon shrink-0"
                  onClick={() => deleteOverride(o.id)}
                  aria-label={`Remove ${o.label}`}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ))}

            {addingSession === sessionNumber ? (
              <div className="space-y-2 rounded-lg bg-navy px-3 py-2">
                {libraryResources.length > 0 && (
                  <LibraryResourcePicker
                    resources={libraryResources}
                    onPick={(resource) => addFromLibrary(sessionNumber, resource)}
                  />
                )}
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
                  <button className="btn-secondary flex-1" onClick={() => setAddingSession(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn-primary flex-1"
                    onClick={() => addResource(sessionNumber)}
                    disabled={saving || !newLabel.trim()}
                  >
                    {saving ? "Adding…" : "Add"}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-secondary w-full" onClick={() => openAddForm(sessionNumber)}>
                + Add Resource
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

// Team-wide kill switch for the FU1 video, backed by the app_settings
// singleton row (same id-boolean-primary-key-default-true pattern as
// info_session_flyer) - overrides every individual candidate's own
// fu1_video_enabled the moment it's turned off, since an admin deciding
// the whole team shouldn't use this outranks any one IBO's per-candidate
// setting.
function FU1VideoAdminToggle() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("app_settings")
        .select("fu1_video_enabled")
        .eq("id", true)
        .maybeSingle();
      setEnabled((data as { fu1_video_enabled: boolean } | null)?.fu1_video_enabled ?? true);
      setLoading(false);
    }
    load();
  }, []);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    setError(null);
    setEnabled(next);
    const { error } = await supabase.from("app_settings").update({ fu1_video_enabled: next }).eq("id", true);
    setSaving(false);
    if (error) {
      setEnabled(!next);
      setError(error.message);
    }
  }

  if (loading) return null;

  return (
    <div className="card space-y-2">
      <p className="section-title">FU1 Video</p>
      <p className="text-xs text-slate-400">
        Team-wide switch for the video shown to candidates at FU1. Turning this off hides it for
        every candidate, everywhere, regardless of what any individual IBO has set below on their
        own candidates.
      </p>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          className="h-4 w-4 accent-amber"
          checked={enabled}
          onChange={toggle}
          disabled={saving}
        />
        <span className="font-medium">Show the FU1 video to candidates</span>
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// A permanent library of speaker flyers (see info_session_speakers in
// supabase/schema.sql) - each one is uploaded once, ever, and stays
// saved, so a repeat speaker is just picked from the list again instead
// of re-uploading the same graphic every week. "This week" is a
// separate pointer (info_session_flyer.speaker_id) into that library -
// one shared row/library for the whole team (not per-IBO), since it's
// one physical weekly event.
function InfoSessionSpeakerAdmin() {
  const [speakers, setSpeakers] = useState<InfoSessionSpeaker[]>([]);
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: speakerRows }, { data: flyerRow }] = await Promise.all([
        supabase.from("info_session_speakers").select("*").order("name", { ascending: true }),
        supabase.from("info_session_flyer").select("speaker_id").eq("id", true).maybeSingle(),
      ]);
      setSpeakers((speakerRows as InfoSessionSpeaker[]) ?? []);
      setCurrentSpeakerId((flyerRow as { speaker_id: string | null } | null)?.speaker_id ?? null);
      setLoading(false);
    }
    load();
  }, []);

  async function handleAddFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = newName.trim();
    if (!name) {
      setError("Enter the speaker's name first.");
      e.target.value = "";
      return;
    }
    setError(null);
    setUploading(true);
    const id = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `speakers/${id}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("info-session-flyer").upload(path, file);
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      e.target.value = "";
      return;
    }
    const { data: pub } = supabase.storage.from("info-session-flyer").getPublicUrl(path);
    const { data, error: insertError } = await supabase
      .from("info_session_speakers")
      .insert({ id, name, image_url: pub.publicUrl })
      .select("*")
      .single();
    setUploading(false);
    e.target.value = "";
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSpeakers((prev) => [...prev, data as InfoSessionSpeaker].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
  }

  async function deleteSpeaker(id: string) {
    const previous = speakers;
    setSpeakers((prev) => prev.filter((s) => s.id !== id));
    const { error: deleteError } = await supabase.from("info_session_speakers").delete().eq("id", id);
    if (deleteError) {
      setSpeakers(previous);
      setError(deleteError.message);
      return;
    }
    if (currentSpeakerId === id) setCurrentSpeakerId(null);
  }

  async function selectCurrentSpeaker(id: string) {
    setSavingCurrent(true);
    setError(null);
    setCurrentSpeakerId(id || null);
    const { error: updateError } = await supabase
      .from("info_session_flyer")
      .update({ speaker_id: id || null })
      .eq("id", true);
    setSavingCurrent(false);
    if (updateError) setError(updateError.message);
  }

  if (loading) return null;

  return (
    <div className="card space-y-3">
      <div>
        <p className="section-title flex items-center gap-1.5">
          <Mic className="h-4 w-4" aria-hidden /> Info Session Speaker
        </p>
        <p className="text-xs text-slate-400">
          Shown to every IS1/IS2 candidate attending in person. Upload each speaker&apos;s flyer
          once — it&apos;s saved here for good, so picking who&apos;s speaking each week is all
          that&apos;s left to do.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-400">
        <span className="shrink-0 font-medium text-slate-300">This week:</span>
        <select
          className="select"
          value={currentSpeakerId ?? ""}
          onChange={(e) => selectCurrentSpeaker(e.target.value)}
          disabled={savingCurrent || speakers.length === 0}
        >
          <option value="">— none selected —</option>
          {speakers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {speakers.length > 0 && (
        <div className="space-y-1.5">
          {speakers.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg bg-navy px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image_url} alt={s.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{s.name}</p>
              <button
                className="btn-icon shrink-0"
                onClick={() => deleteSpeaker(s.id)}
                aria-label={`Remove ${s.name}`}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5 rounded-lg bg-navy px-3 py-2">
        <p className="text-xs font-medium text-slate-300">Add a new speaker</p>
        <input
          className="input"
          placeholder="Speaker name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <label className="btn-secondary block w-full cursor-pointer text-center">
          {uploading ? "Uploading…" : "Upload Flyer"}
          <input type="file" accept="image/*" className="hidden" onChange={handleAddFile} disabled={uploading} />
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

const KIND_GROUPS: { key: OptionalResourceKind; label: string }[] = [
  { key: "audio", label: "Audio" },
  { key: "reading", label: "Reading" },
  { key: "other", label: "Other" },
];

// <option> elements can only render plain text, so the icon lives here
// instead of baked into KIND_GROUPS.label - the label string is shared
// with the native <select> below, which has no way to show a lucide icon.
const KIND_ICONS: Record<OptionalResourceKind, typeof Headphones> = {
  audio: Headphones,
  reading: BookOpen,
  other: ClipboardList,
};

// A shared, admin-managed library of podcasts/articles/etc. any IBO can pick
// from (see optional_resources in supabase/schema.sql) instead of retyping
// the title/detail/link from scratch every time they want to send one -
// either as a one-off to a candidate or added to their own auto-send defaults.
function OptionalResourcesAdmin({
  onChange,
}: {
  onChange: (resources: OptionalResource[]) => void;
}) {
  const [resources, setResources] = useState<OptionalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEstimate, setNewEstimate] = useState("");
  const [newKind, setNewKind] = useState<OptionalResourceKind>("audio");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [brokenUrls, setBrokenUrls] = useState<Set<string> | null>(null);

  async function checkLinks() {
    const urls = Array.from(new Set(resources.map((r) => r.url).filter((u): u is string => !!u)));
    if (urls.length === 0) return;
    setCheckingLinks(true);
    setError(null);
    setBrokenUrls(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const res = await fetch("/api/check-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) throw new Error(`Check failed (${res.status})`);
      const { results } = (await res.json()) as { results: { url: string; ok: boolean }[] };
      setBrokenUrls(new Set(results.filter((r) => !r.ok).map((r) => r.url)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check links.");
    }
    setCheckingLinks(false);
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("optional_resources").select("*").order("label", { ascending: true });
      setResources((data as OptionalResource[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function addToLibrary() {
    const label = newLabel.trim();
    if (!label) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("optional_resources")
      .insert({
        label,
        detail: newDetail.trim(),
        url: newUrl.trim() || null,
        estimate: newEstimate.trim() || null,
        kind: newKind,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    const updated = [...resources, data as OptionalResource].sort((a, b) => a.label.localeCompare(b.label));
    setResources(updated);
    onChange(updated);
    setNewLabel("");
    setNewDetail("");
    setNewUrl("");
    setNewEstimate("");
    fireNotifyEvent({ kind: "library_resource_added", resourceLabel: label });
  }

  async function deleteResource(id: string) {
    const previous = resources;
    const updated = resources.filter((r) => r.id !== id);
    setResources(updated);
    onChange(updated);
    const { error } = await supabase.from("optional_resources").delete().eq("id", id);
    if (error) {
      setResources(previous);
      onChange(previous);
      setError(error.message);
    }
  }

  async function setResourceKind(id: string, kind: OptionalResourceKind) {
    const previous = resources;
    const updated = resources.map((r) => (r.id === id ? { ...r, kind } : r));
    setResources(updated);
    onChange(updated);
    const { error } = await supabase.from("optional_resources").update({ kind }).eq("id", id);
    if (error) {
      setResources(previous);
      onChange(previous);
      setError(error.message);
    }
  }

  if (loading) return null;

  return (
    <div className="card space-y-3">
      <div className="space-y-2">
        <div>
          <p className="section-title flex items-center gap-1.5">
            <Library className="h-4 w-4" aria-hidden /> Optional Resources Library
          </p>
          <p className="text-xs text-slate-400">
            Podcasts, articles, and other resources any IBO can pick from — as a one-off send to a
            candidate, or added to their own automatic defaults — instead of typing the details from
            scratch each time.
          </p>
        </div>
        <button className="btn-secondary w-full" onClick={checkLinks} disabled={checkingLinks}>
          {checkingLinks ? "Checking links…" : "Check Links"}
        </button>
        {brokenUrls && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            {brokenUrls.size === 0 ? (
              <>
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden />
                All links look good.
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" aria-hidden />
                {brokenUrls.size} link{brokenUrls.size === 1 ? "" : "s"} may be broken — flagged below.
              </>
            )}
          </p>
        )}
      </div>

      {KIND_GROUPS.map(({ key, label }) => {
        const group = resources.filter((r) => r.kind === key);
        if (group.length === 0) return null;
        const KindIcon = KIND_ICONS[key];
        return (
          <div key={key} className="space-y-1.5">
            <p className="flex items-center gap-1 text-xs font-semibold text-slate-400">
              <KindIcon className="h-3 w-3" aria-hidden />
              {label} ({group.length})
            </p>
            {group.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {r.label}
                    {r.url && brokenUrls?.has(r.url) && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-semibold text-red-400">
                        <AlertTriangle className="h-3 w-3" aria-hidden /> broken link?
                      </span>
                    )}
                  </p>
                  {(r.detail || r.estimate) && (
                    <p className="truncate text-xs text-slate-500">
                      {r.detail}
                      {r.estimate && <span> · {r.estimate}</span>}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    className="select w-auto pr-6 text-xs"
                    value={r.kind}
                    onChange={(e) => setResourceKind(r.id, e.target.value as OptionalResourceKind)}
                  >
                    {KIND_GROUPS.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                  <button className="btn-icon" onClick={() => deleteResource(r.id)} aria-label={`Remove ${r.label}`}>
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div className="space-y-1.5 rounded-lg bg-navy px-3 py-2">
        <p className="text-xs font-medium text-slate-300">Add to library</p>
        <div className="flex flex-wrap gap-2">
          {KIND_GROUPS.map((g) => {
            const KindIcon = KIND_ICONS[g.key];
            return (
              <button
                key={g.key}
                type="button"
                className={`${newKind === g.key ? "toggle-pill-active" : "toggle-pill-inactive"} gap-1`}
                onClick={() => setNewKind(g.key)}
              >
                <KindIcon className="h-3.5 w-3.5" aria-hidden />
                {g.label}
              </button>
            );
          })}
        </div>
        <input
          className="input"
          placeholder="Label (e.g. 🎧 Emerald Success Story - McGrath)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <input
          className="input"
          placeholder="Detail (optional)"
          value={newDetail}
          onChange={(e) => setNewDetail(e.target.value)}
        />
        <input
          className="input"
          placeholder="Link (optional)"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
        />
        <input
          className="input"
          placeholder="Estimate (e.g. 34 min listen)"
          value={newEstimate}
          onChange={(e) => setNewEstimate(e.target.value)}
        />
        <button className="btn-primary w-full" onClick={addToLibrary} disabled={saving || !newLabel.trim()}>
          {saving ? "Adding…" : "+ Add to Library"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function FirstMonthSection() {
  return (
    <div className="card space-y-2">
      <p className="section-title flex items-center gap-1.5">
        <Rocket className="h-4 w-4" aria-hidden /> Perfect First Month (New Launch)
      </p>
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
