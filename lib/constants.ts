// Accounts that can see every team member's data (Team tab: Members +
// Teams views). Must match the emails hardcoded in is_app_admin() in
// supabase/schema.sql.
export const PRIMARY_EMAILS = ["adamangle@icloud.com", "alexangle@me.com", "laurasangle@gmail.com"];

export function isPrimaryUser(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return PRIMARY_EMAILS.some((e) => e.toLowerCase() === normalized);
}

// Meeting types the Rate a Call feature can score, each against its own
// rubric (lib/<type>-call-rating-prompt.txt) — must match the
// call_ratings.call_type check constraint in supabase/schema.sql.
export const CALL_RATING_TYPES = ["QI1", "QI2", "FU1", "FU2", "Questionnaire"] as const;
export type CallRatingType = (typeof CALL_RATING_TYPES)[number];

// Calendar event categories, each with its own color dot so a scan down
// the list tells candidate meetings apart from team events and personal
// reminders at a glance — must match the check constraint on
// calendar_events.event_type in supabase/schema.sql.
export const CALENDAR_EVENT_TYPES = [
  { key: "meeting", label: "Candidate Meeting", color: "#f59e0b" },
  { key: "team", label: "Team Event", color: "#38bdf8" },
  { key: "reminder", label: "Reminder", color: "#c084fc" },
  { key: "other", label: "Other", color: "#94a3b8" },
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number]["key"];

// Options for the per-event reminder picker - null means "no reminder"
// for this event. send-calendar-reminders/route.ts matches against
// whatever value is actually stored per event, not this list directly.
export const CALENDAR_REMINDER_OPTIONS: { minutes: number | null; label: string }[] = [
  { minutes: null, label: "No reminder" },
  { minutes: 10, label: "10 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
];

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
    label: "IS1",
    homework: "Write down questions from the info session.",
  },
  { label: "FU1", homework: "Follow up on questions from IS1." },
  {
    label: "IS2",
    homework: "Review IS2 materials and next steps.",
  },
  { label: "FU2", homework: "Follow up and prep for the Questionnaire." },
  {
    label: "Questionnaire",
    homework: "Complete the official Pre-Launch Questionnaire together.",
  },
  {
    label: "Offer Call",
    homework: "Decide together and confirm next steps.",
  },
];

// The step index a candidate must reach to count as "active in the
// pipeline" — index 1 is QI1, so this is "QI1 booked or beyond."
export const ACTIVE_PIPELINE_MIN_STEP = 1;

export type CandidateStepResource = {
  label: string;
  detail: string;
  url?: string;
};

// Prospect access (see app/prospect/page.tsx): whatever's assigned to a
// candidate's current step - and every step before it - shows up
// automatically in their code-gated resources view, so nobody has to
// manually text over the intro video or testimonial audio at the right
// moment. One entry per CANDIDATE_STEPS index above.
//
// PLACEHOLDER CONTENT - swap each of these for the real audio/video/link
// once you send it over, same as ONBOARDING_SESSIONS below.
export const CANDIDATE_STEP_RESOURCES: CandidateStepResource[][] = [
  // 0. Yes
  [],
  // 1. QI1
  [{ label: "🎥 Intro Video/Audio", detail: "Placeholder — swap in the real intro video/audio." }],
  // 2. QI2
  [{ label: "🎧 Testimonial Audio", detail: "Placeholder — swap in a real testimonial audio." }],
  // 3. IS1
  [],
  // 4. FU1
  [],
  // 5. IS2
  [],
  // 6. FU2
  [],
  // 7. Questionnaire
  [],
  // 8. Offer Call
  [],
];

// Goals: one target number per metric per period - a goal for Today, a
// separate one for This Week, and a separate one for This Month, each
// staying the same until manually changed (no live actual-vs-target
// display for most metrics - that caused repeated confusion and was
// dropped). Each period has its own item list rather than repeating the
// same six everywhere: daily is granular day-to-day activity, weekly/
// monthly step up to intermediate/late funnel milestones. Each row
// renders as `${prefix} [number] ${suffix}`, e.g. "Reading [20] minutes"
// or "[5] Story shares".
export type GoalMetric =
  | "read_minutes"
  | "audios"
  | "conversations"
  | "story_shares"
  | "questions"
  | "yeses"
  | "qi1s";

export type GoalPeriod = "daily" | "weekly" | "monthly";

export const GOAL_PERIODS: { key: GoalPeriod; label: string }[] = [
  { key: "daily", label: "Your goal today is:" },
  { key: "weekly", label: "Your goal this week is:" },
  { key: "monthly", label: "Your goal this month is:" },
];

type GoalItem = { key: GoalMetric; prefix: string; suffix: string };

const READING = { key: "read_minutes", prefix: "Reading", suffix: "minutes" } as const;
const LISTEN = { key: "audios", prefix: "Listen to", suffix: "Audio" } as const;
const CONVERSATIONS = { key: "conversations", prefix: "", suffix: "Conversations" } as const;
const STORY_SHARES = { key: "story_shares", prefix: "", suffix: "Story shares" } as const;
const QUESTIONS = { key: "questions", prefix: "", suffix: "Questions" } as const;
const YESES = { key: "yeses", prefix: "", suffix: "Yeses" } as const;
const QI1S = { key: "qi1s", prefix: "", suffix: "QI1s" } as const;

export const GOAL_ITEMS_BY_PERIOD: Record<GoalPeriod, GoalItem[]> = {
  daily: [READING, LISTEN, CONVERSATIONS, STORY_SHARES, QUESTIONS, YESES],
  weekly: [QUESTIONS, YESES, QI1S],
  monthly: [YESES, QI1S],
};

// Short canonical labels for each CANDIDATE_STEPS index, for places (like
// the Daily Update summary) that want the next actual process milestone
// rather than the internal step label. "Yes" isn't a real milestone in
// the process, so it rolls forward to QI1.
export const CANDIDATE_STEP_SHORT_LABELS = [
  "QI1",
  "QI1",
  "QI2",
  "IS1",
  "FU1",
  "IS2",
  "FU2",
  "Questionnaire",
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

// Session 4 ("Sharing Your Story") shouldn't unlock until someone has put
// real work into their A/B list - not the full 100 Session 2 asks for
// eventually, but enough (50) that they actually have people to practice
// story-sharing on. Checked against category 'A'/'B' rows in `contacts`
// (not 'Customer' - that's a separate list). Single source of truth for
// both the Team tab's Unlock Next gate and the Onboarding page's own
// progress readout.
export const SESSION_4_CONTACT_MINIMUM = 50;

// Session 4 also requires having read specific chapters of the Session 2
// "First Year Books" pick (see FIRST_YEAR_BOOKS in library-data.ts) -
// self-reported via profiles.thinking_big_chapters_confirmed, since
// there's no way to verify reading the way contact count can be counted.
export const SESSION_4_READING_REQUIREMENT = "chapters 2, 12, and 13 of The Magic of Thinking Big";

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
          "Audio by Andrew Tidwell — your coach will send this to you on the LTD media app. Listen before your next meeting.",
      },
      {
        label: "🎧 Getting Through the First Year",
        detail:
          "Audio by Toby Ayers — your coach will send this to you on the LTD media app. Listen before your next meeting.",
      },
      {
        label: "🎥 Budgeting Talk",
        detail: "Video by Michael and Ashley Koebel.",
        url: "https://onedrive.live.com/?qt=allmyphotos&photosData=%2Fshare%2FC3BD18A001D78AD7%218727%3Fithint%3Dvideo%26e%3DeP7aU4%26migratedtospo%3Dtrue&cid=C3BD18A001D78AD7&id=C3BD18A001D78AD7%218727&redeem=aHR0cHM6Ly8xZHJ2Lm1zL3YvYy9jM2JkMThhMDAxZDc4YWQ3L0VkZUsxd0dnR0wwZ2dNTVhJZ0FBQUFBQlhDNURySjFva0FrNF9jYXRWQWs1aEE%5FZT1lUDdhVTQ&v=photos",
      },
    ],
  },
  {
    title: "Session 2: List Building",
    description: "Identify who you can help — the LTD \"Building Your List\" exercise.",
    resources: [
      {
        label: "📋 Why Build a List?",
        detail:
          "Successful business owners put themselves in a position to win by developing a list of names of everyone they know. Why everyone? It's the starting point for building a solid organization and customer base. The biggest error IBOs make is deciding whether or not contacts are open minded to additional income. If your list doesn't contain at least 100 names, you could be prejudging.",
      },
      {
        label: "📄 List Builder Worksheet",
        detail:
          "The official worksheet — work through it name by name: sources to start with, first names, occupations, professionals you rely on, and lifestyle prompts.",
        url: "https://www.dropbox.com/scl/fi/uk77jor2r0zbqjqewy81c/List-Builder.jpg?rlkey=5ddroczo5hp2mhzlqdb9mbzsz&st=vel3s2wu&dl=0",
      },
      {
        label: "🎧 Crush Your List",
        detail: "Audio by Jim Mueller and John Resch — listen before working through your worksheet.",
        url: "https://www.dropbox.com/scl/fi/u0882axmar8z7hqasf110/Crudh-your-List.m4a?rlkey=rjqmmqtn30vqpkwi1liyjosgk&st=ikn3lgnt&dl=0",
      },
      {
        label: "🎧 Normalize the Work",
        detail:
          "Audio by Kyle and Austin Brown, and Hunter and Vanessa Lindsay — your coach will send this to you on the LTD media app. Listen before your next meeting.",
      },
      {
        label: "🎧 Networking is Normal",
        detail:
          "Audio by Derrick and Jill Kosek — your coach will send this to you on the LTD media app. Listen before your next meeting.",
      },
    ],
  },
  {
    title: "Session 3: Customers",
    description: "Learn to create value through products.",
    resources: [
      {
        label: "🎥 Customer Survey Training",
        detail: "Video by Laura Angle — watch before doing customer surveys.",
        url: "https://www.youtube.com/watch?v=-4e9twlrGDk",
      },
      {
        label: "🎥 Sample Bag Video",
        detail: "Your upline will send this to you on the LTD messaging app. Watch before your next meeting.",
      },
      {
        label: "🎧 Earn the Sale",
        detail: "Audio by Adam Ladenburger — your mentor will gift this to you on the LTD Media app.",
      },
      {
        label: "🎧 Crushing VCS",
        detail:
          "Audio by Derrick and Jill Kosek — available on the Sales and Profitability Hub in the LTD Media app.",
      },
      {
        label: "🎧 The Customer Experience",
        detail:
          "Audio by Tyler Sheridan — available on the Sales and Profitability Hub in the LTD Media app.",
      },
      {
        label: "📚 Sales and Profitability Hub",
        detail:
          "Once you're in the Hub on the LTD Media app, study and check out all the other resources there too — they're all built around creating customers.",
      },
      {
        label: "📚 Resources: Customers Tab",
        detail: "The Customer Survey questions and Sample Bag guide both live here — come back anytime.",
        url: "/library?tab=acquisition",
      },
      {
        label: "📚 Resources: Products Tab",
        detail: "PV for every product lives here — come back anytime.",
        url: "/library?tab=products",
      },
    ],
  },
  {
    title: "Session 4: Sharing Your Story",
    description: "Learn to confidently share with your A & B Lists.",
    resources: [
      {
        label: "📖 Reading",
        detail: `Read ${SESSION_4_READING_REQUIREMENT} — required to unlock this session. Confirm it further up this page while it's still locked.`,
      },
      {
        label: "📋 Homework: Contact Builder",
        detail: `Have ${SESSION_4_CONTACT_MINIMUM}+ names in your A/B list — also required to unlock this session. Tracked automatically and shown further up this page while it's still locked.`,
      },
      {
        label: "🎧 Ditch the Pitch",
        detail: "Audio by Drew Tidwell — found in the First 90 Days tab on the LTD Media app.",
      },
      {
        label: "🎧 Unrattled",
        detail: "Audio by Drew Tidwell — your mentor will gift this to you on the LTD Media app.",
      },
      {
        label: "🎧 A Compelling Story",
        detail: "Audio by Drew Tidwell — your mentor will gift this to you on the LTD Media app.",
      },
    ],
  },
  {
    title: "Session 5: 30-Day Core Run",
    description: "Establish the daily habits that create long-term momentum.",
    resources: [
      {
        label: "🎥 The Phases",
        detail:
          "Video by Alex Angle — how to establish the productive habits that create long-term momentum in your business.",
        url: "https://youtu.be/evGVhOBtizs",
      },
      {
        label: "🎧 Homework: First Round Draft Pick",
        detail: "Audio by Mark and Meredith Nathan — listen to this for your Session 5 homework.",
        url: "https://www.dropbox.com/scl/fi/217gvovuxyyui3zpcl8gl/First-Round-Draft-Pick-S11-0054-AUD.mp3?rlkey=nr7rv7u9iunt9itl4obilhpy6&st=8h9cka6w&dl=0",
      },
      {
        label: "🎧 Mentally Shredded",
        detail: "Audio by Chase and Bethany McIlroy — your mentor will gift this to you on the LTD Media app.",
      },
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
  "Yes",
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

// Contact Builder: simpler two-state status shown for the Customer List
// instead of the full networking pipeline above (a customer isn't
// walking through QI1/QI2/etc).
export const CUSTOMER_STATUSES = ["Not yet asked", "Contacted"] as const;

// Contact Builder: optional "how do you know them" memory-jogger tags,
// shown as quick-pick chips in Add Contact.
export const CONNECTION_TAGS = [
  "Family",
  "Friend",
  "Coworkers",
  "Gym",
  "Church",
  "Neighbor",
  "College",
  "High School",
  "Social Media",
] as const;

// Contact Builder: optional "best way to reconnect" single-pick, shown
// alongside the connection tags in Add Contact.
export const RECONNECT_METHODS = ["Text", "Instagram", "Facebook", "Snapchat", "Other"] as const;
