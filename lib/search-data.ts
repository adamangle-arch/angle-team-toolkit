import { AUDIOS, FIRST_YEAR_BOOKS, ADVANCED_LIBRARY } from "./library-data";
import { LEADERS } from "./leaders-data";
import { PRODUCTS } from "./product-data";
import { SCRIPTS } from "./scripts-data";
import { PROCESS_STAGES, QUESTIONNAIRE_QUESTIONS, FIRST_MONTH_STEPS } from "./process-data";
import { SAMPLE_BAG_GUIDE, SURVEY_QUESTIONS } from "./acquisition-data";

export type SearchResult = {
  title: string;
  snippet: string;
  href: string;
  source: string;
};

// Every page in the app, so typing a feature name (not just its
// content) finds a way there too.
const PAGE_SHORTCUTS: SearchResult[] = [
  { title: "Pipeline Tracker", snippet: "Weekly/monthly funnel counters and the Candidate Roadmap.", href: "/pipeline", source: "Pages" },
  { title: "Candidate History", snippet: "Every candidate you've ever added, active or not.", href: "/history", source: "Pages" },
  { title: "Contacts", snippet: "Your A/B list.", href: "/contacts", source: "Pages" },
  { title: "Core Run Streak", snippet: "Read, Listen, Daily Update, Story Share, and your streak.", href: "/streak", source: "Pages" },
  { title: "Goals", snippet: "Your daily/weekly/monthly targets.", href: "/goals", source: "Pages" },
  { title: "Calendar", snippet: "Meetings, reminders, and team events.", href: "/calendar", source: "Pages" },
  { title: "Volume", snippet: "Personal PV and Ditto tracking.", href: "/volume", source: "Pages" },
  { title: "Leaderboard", snippet: "Team and individual rankings, streaks, milestones.", href: "/leaderboard", source: "Pages" },
  { title: "Assistant", snippet: "Role-play A/B/C-list conversations.", href: "/assistant", source: "Pages" },
  { title: "Onboarding", snippet: "New team member sessions.", href: "/onboarding", source: "Pages" },
  { title: "Games", snippet: "Diamond Run, Diamond Chase, Trivia.", href: "/games", source: "Pages" },
  { title: "Team", snippet: "Your downline's data (or the whole company, for admins).", href: "/team", source: "Pages" },
  { title: "My Profile", snippet: "Account number, spouse/upline linking, public profile.", href: "/profile", source: "Pages" },
];

function fromScripts(): SearchResult[] {
  return SCRIPTS.map((s) => ({
    title: s.question,
    snippet: s.answer,
    href: "/library?tab=scripts",
    source: "Scripts & FAQ",
  }));
}

function fromProducts(): SearchResult[] {
  return PRODUCTS.map((p) => ({
    title: `${p.name} (${p.brand})`,
    snippet: p.summary,
    href: "/library?tab=products",
    source: "Products",
  }));
}

function fromLeaders(): SearchResult[] {
  return LEADERS.map((l) => ({
    title: l.name,
    snippet: `${l.location} — ${l.occupations}`,
    href: "/library?tab=leaders",
    source: "Leaders",
  }));
}

function fromProcess(): SearchResult[] {
  const stages: SearchResult[] = PROCESS_STAGES.map((s) => ({
    title: s.stage,
    snippet: s.philosophy,
    href: "/library?tab=process",
    source: "Process",
  }));
  const questionnaire: SearchResult[] = QUESTIONNAIRE_QUESTIONS.map((q, i) => ({
    title: `Pre-Launch Questionnaire #${i + 1}`,
    snippet: q,
    href: "/library?tab=process",
    source: "Process",
  }));
  return [...stages, ...questionnaire];
}

function fromFirstMonth(): SearchResult[] {
  return FIRST_MONTH_STEPS.map((s, i) => ({
    title: `${i + 1}. ${s.step}`,
    snippet: s.substeps?.join(" · ") ?? "",
    href: "/library?tab=first_month",
    source: "Perfect First Month",
  }));
}

function fromAcquisition(): SearchResult[] {
  const guide: SearchResult[] = SAMPLE_BAG_GUIDE.map((g) => ({
    title: g.title,
    snippet: g.content,
    href: "/library?tab=acquisition",
    source: "Acquisition",
  }));
  const survey: SearchResult[] = SURVEY_QUESTIONS.map((q) => ({
    title: q.question,
    snippet: q.recommendations,
    href: "/library?tab=acquisition",
    source: "Acquisition",
  }));
  return [...guide, ...survey];
}

function fromAudiosAndBooks(): SearchResult[] {
  const audios: SearchResult[] = AUDIOS.map((a) => ({
    title: a.title,
    snippet: `${a.speaker} — ${a.summary}`,
    href: "/library?tab=audios",
    source: "Audios",
  }));
  const firstYear: SearchResult[] = FIRST_YEAR_BOOKS.map((b) => ({
    title: b.title,
    snippet: b.author,
    href: "/library?tab=books",
    source: "Books",
  }));
  const advanced: SearchResult[] = ADVANCED_LIBRARY.flatMap((cat) =>
    cat.books.map((b) => ({
      title: b.title,
      snippet: `${b.author} — ${cat.category}`,
      href: "/library?tab=books",
      source: "Books",
    }))
  );
  return [...audios, ...firstYear, ...advanced];
}

let cachedIndex: SearchResult[] | null = null;

export function getStaticSearchIndex(): SearchResult[] {
  if (cachedIndex) return cachedIndex;
  cachedIndex = [
    ...PAGE_SHORTCUTS,
    ...fromScripts(),
    ...fromProducts(),
    ...fromLeaders(),
    ...fromProcess(),
    ...fromFirstMonth(),
    ...fromAcquisition(),
    ...fromAudiosAndBooks(),
  ];
  return cachedIndex;
}

export function searchStatic(query: string, limit = 40): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return getStaticSearchIndex()
    .filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.snippet.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q)
    )
    .slice(0, limit);
}
