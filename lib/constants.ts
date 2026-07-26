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

// Goals: one target number per metric, period-free - the same goal
// applies every day until manually changed (no separate daily/weekly/
// monthly targets). Each row renders as `${prefix} [number] ${suffix}`,
// e.g. "Reading [20] minutes+" or "[5] Story shares".
export type GoalMetric =
  | "read_minutes"
  | "audios"
  | "depth_texts"
  | "questions"
  | "story_shares"
  | "yeses";

export const GOAL_ITEMS: { key: GoalMetric; prefix: string; suffix: string }[] = [
  { key: "read_minutes", prefix: "Reading", suffix: "minutes+" },
  { key: "audios", prefix: "Listen to", suffix: "+ Audio" },
  { key: "depth_texts", prefix: "", suffix: "Depth texts" },
  { key: "questions", prefix: "", suffix: "Conversations" },
  { key: "story_shares", prefix: "", suffix: "Story shares" },
  { key: "yeses", prefix: "", suffix: "Yeses" },
];

// Short canonical labels for each CANDIDATE_STEPS index, for places (like
// the Daily Update summary) that want the next actual process milestone
// rather than the internal step label. "Yes" and the two "Audio & Reading"
// homework steps aren't real milestones in the process, so they roll
// forward to whichever named step comes next (QI1, IS1, IS2).
export const CANDIDATE_STEP_SHORT_LABELS = [
  "QI1",
  "QI1",
  "QI2",
  "IS1",
  "IS1",
  "FU1",
  "IS2",
  "IS2",
  "FU2",
  "Offer Call",
] as const;

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
  url?: string;
};

export type OnboardingSession = {
  title: string;
  description: string;
  resources: OnboardingResource[];
};

export const ONBOARDING_SESSIONS: OnboardingSession[] = [
  {
    title: "Session 1: Budget Session",
    description: "Build a healthy financial foundation.",
    resources: [
      {
        label: "🎧 Excited to Confident",
        detail:
          "Audio by Alex and Laura Angle — listen before your Budget Session.",
        url: "https://www.dropbox.com/scl/fi/nem1bqacjnfo4r3mtgraa/Excited-to-Confident-L22-3613-AUD.mp3?rlkey=0z1shlbvk28ndg7tfuk0p64za&st=revpnfob&dl=0",
      },
      {
        label: "📋 Homework: Budget Worksheet & Audio",
        detail:
          "Listen to the audio explaining how to fill out the budget, then bring your completed budget to your next meeting with your coach.",
        url: "https://www.dropbox.com/scl/fo/9provgioq5ijeudeaebt1/ACExQWjHLo9nFbsXm8gUBYE?rlkey=k2kadsk4wmc9h0am8nn13lxl1&st=8u9146yf&dl=0",
      },
      {
        label: "🎧 Welcome to the Success Journey",
        detail:
          "Audio by Andrew Tidwell — your coach will send this to you on the LTD app. Listen before your next meeting.",
      },
      {
        label: "🎧 Getting Through the First Year",
        detail:
          "Audio by Toby Ayers — your coach will send this to you on the LTD app. Listen before your next meeting.",
      },
    ],
  },
  {
    title: "Session 2: List Building",
    description: "Identify who you can help.",
    resources: [
      { label: "📖 List Building Guide", detail: "Replace with your list-building guide/reading." },
      { label: "✅ List Building Exercise", detail: "Replace with your actual list-building exercise." },
    ],
  },
  {
    title: "Session 3: Customer Acquisition",
    description: "Learn to create value through products.",
    resources: [
      { label: "🎥 Customer Acquisition Training", detail: "Replace with your training video link." },
      { label: "📖 Product Value Guide", detail: "Replace with your product/value reading." },
    ],
  },
  {
    title: "Session 4: Sharing Your Story",
    description: "Learn to confidently share with your A & B Lists.",
    resources: [
      { label: "🎥 Story Training Video", detail: "Replace with your story-sharing training link." },
      { label: "🎧 Story Examples Audio", detail: "Replace with example story audio." },
    ],
  },
  {
    title: "Session 5: 30-Day Core Run",
    description: "Establish the daily habits that create long-term momentum.",
    resources: [
      { label: "🎥 Core Run Training Video", detail: "Replace with your Core Run training video link." },
      {
        label: "🔥 Core Run Streak",
        detail: "Head to the Run Streak tab to start your daily Read/Listen/Daily Update/Story Share habit.",
      },
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
