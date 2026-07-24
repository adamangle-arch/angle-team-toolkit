// Accounts that can see every team member's data (Team tab: Members +
// Teams views). Must match the emails hardcoded in is_app_admin() in
// supabase/schema.sql.
export const PRIMARY_EMAILS = ["adamangle@icloud.com", "alexangle@me.com"];

export function isPrimaryUser(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return PRIMARY_EMAILS.some((e) => e.toLowerCase() === normalized);
}

// The fixed list of teams someone can belong to. Must match the check
// constraint on profiles.team in supabase/schema.sql.
export const TEAMS = [
  "Angle Team",
  "AA2 Team",
  "Tucker Team",
  "Scheerer Team",
  "Abbott Team",
  "TX Team",
  "Rodgers Team",
  "Jones Team",
  "Koebel Team",
] as const;

// Pipeline Tracker: ordered stages
export const PIPELINE_STAGES = [
  { key: "questions", label: "Questions" },
  { key: "yeses", label: "Yeses" },
  { key: "qi1", label: "QI1" },
  { key: "qi2", label: "QI2" },
  { key: "is1", label: "IS1" },
  { key: "fu1", label: "FU1" },
  { key: "is2", label: "IS2" },
  { key: "fu2", label: "FU2" },
  { key: "questionnaire", label: "Questionnaire" },
  { key: "launches", label: "Launches" },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"];

// Candidate Roadmap: ordered steps with homework due at each step.
// A candidate only counts toward "active in the pipeline" once they've
// moved past step 0 (Yes) — i.e. once a QI1 is actually booked.
export const CANDIDATE_STEPS: { label: string; homework: string }[] = [
  { label: "Yes", homework: "Get a QI1 booked with them." },
  { label: "QI1", homework: "Send the intro video/audio before the call." },
  { label: "QI2", homework: "Listen to a testimonial audio before the call." },
  {
    label: "Audio & Reading",
    homework: "Complete the assigned audio + reading before Info Session 1.",
  },
  {
    label: "Info Session 1",
    homework: "Write down questions from the info session.",
  },
  { label: "FU1", homework: "Follow up on questions from Info Session 1." },
  {
    label: "Audio & Reading",
    homework: "Complete the second audio + reading assignment before Info Session 2.",
  },
  {
    label: "Info Session 2",
    homework: "Review Info Session 2 materials and next steps.",
  },
  { label: "FU2", homework: "Follow up and prep for the offer call." },
  {
    label: "Offer Call",
    homework: "Decide together and confirm next steps.",
  },
];

// The step index a candidate must reach to count as "active in the
// pipeline" — index 1 is QI1, so this is "QI1 booked or beyond."
export const ACTIVE_PIPELINE_MIN_STEP = 1;

// Core Run Streak milestones — based on the longest streak ever hit
// (get_longest_streak), so a badge earned once stays earned even after a
// later streak resets.
export const STREAK_MILESTONES = [
  { days: 7, label: "1 Week" },
  { days: 30, label: "30 Days" },
  { days: 90, label: "90 Days" },
  { days: 182, label: "6 Months" },
  { days: 365, label: "1 Year" },
] as const;

// Onboarding: session 1 is unlocked for everyone from signup; each
// further session requires an explicit grant from an upline or admin
// (see grant_next_onboarding_session() in supabase/schema.sql). This is
// placeholder content — swap in your real videos/reading/checklists.
export type OnboardingResource = {
  label: string;
  detail: string;
};

export type OnboardingSession = {
  title: string;
  description: string;
  resources: OnboardingResource[];
};

export const ONBOARDING_SESSIONS: OnboardingSession[] = [
  {
    title: "Session 1: Welcome & Getting Started",
    description: "The basics — what to expect, mindset, and your first steps.",
    resources: [
      { label: "🎥 Welcome Video", detail: "Replace with your real welcome video link." },
      { label: "📖 Read", detail: "Replace with your onboarding reading assignment." },
      { label: "✅ First Steps Checklist", detail: "Replace with your actual first-steps checklist." },
    ],
  },
  {
    title: "Session 2: Building Your List",
    description: "How to build and organize your A/B contact list.",
    resources: [
      { label: "🎥 Training Video", detail: "Replace with your list-building training link." },
      { label: "📖 Read", detail: "Replace with your assigned reading." },
    ],
  },
  {
    title: "Session 3: The Invite",
    description: "How to invite confidently and handle common responses.",
    resources: [
      { label: "🎥 Training Video", detail: "Replace with your invite training link." },
      { label: "🎧 Audio", detail: "Replace with your invite-scripts audio." },
    ],
  },
  {
    title: "Session 4: Presenting & Follow-Up",
    description: "Running QI1/QI2 and following up effectively.",
    resources: [
      { label: "🎥 Training Video", detail: "Replace with your presentation training link." },
      { label: "📖 Read", detail: "Replace with your follow-up reading assignment." },
    ],
  },
  {
    title: "Session 5: Launch & Beyond",
    description: "Getting your new team member launched and building momentum.",
    resources: [
      { label: "🎥 Training Video", detail: "Replace with your launch training link." },
      { label: "✅ Launch Checklist", detail: "Replace with your actual launch checklist." },
    ],
  },
];

// A/B Contact List: pipeline status dropdown options
export const CONTACT_STATUSES = [
  "Not yet asked",
  "Asked",
  "Yes / Watching video",
  "QI1",
  "QI2",
  "IS1",
  "FU1",
  "IS2",
  "FU2",
  "Questionnaire",
  "Launched",
  "Not interested",
] as const;
