import { getToday } from "./dates";

// Accounts that can see every team member's data (Team tab: Members +
// Teams views). Must match the emails hardcoded in is_app_admin() in
// supabase/schema.sql.
export const PRIMARY_EMAILS = ["adamangle@icloud.com", "alexangle@me.com", "laurasangle@gmail.com"];

export function isPrimaryUser(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return PRIMARY_EMAILS.some((e) => e.toLowerCase() === normalized);
}

// Alex and Laura run the whole team rather than their own personal
// business inside it - Badges is a team-member feature, not something
// meant to apply to them, so their accounts don't earn badges, don't
// see the Badges tab, and don't show a Badges section on their profile.
export const BADGE_EXCLUDED_EMAILS = ["alexangle@me.com", "laurasangle@gmail.com"];

export function isBadgeExcluded(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return BADGE_EXCLUDED_EMAILS.some((e) => e.toLowerCase() === normalized);
}

// Meeting types the Rate a Call feature can score, each against its own
// rubric (lib/<type>-call-rating-prompt.txt) — must match the
// call_ratings.call_type check constraint in supabase/schema.sql.
export const CALL_RATING_TYPES = ["QI1", "QI2", "FU1", "FU2", "Questionnaire"] as const;
export type CallRatingType = (typeof CALL_RATING_TYPES)[number];

// Every kind of push notification this app sends, with the label shown
// both on the Notifications history page and the Notification
// Preferences mute toggles on My Profile - one shared list so the two
// screens can't drift out of sync with each other or with what
// notifyUsers()/the cron push routes actually send.
export const NOTIFICATION_KINDS = [
  { kind: "calendar_event_added", label: "New calendar event" },
  { kind: "call_rating_submitted", label: "Call rating submitted" },
  { kind: "core_run_completed", label: "Core Run completed" },
  { kind: "pipeline_5plus", label: "5+ active pipeline" },
  { kind: "onboarding_unlocked", label: "Onboarding unlocked" },
  { kind: "games_unlocked", label: "Games unlocked" },
  { kind: "badge_earned", label: "Badge earned" },
  { kind: "core_run_reminder", label: "Core Run reminder" },
  { kind: "calendar_reminder", label: "Calendar reminder" },
  { kind: "daily_stat_leaders", label: "Daily leaders" },
  { kind: "weekly_stat_leaders", label: "Weekly leaders" },
  { kind: "monthly_stat_leaders", label: "Monthly leaders" },
  { kind: "mission_reminder", label: "Today's Mission reminder" },
  { kind: "volume_reminder", label: "Volume reminder" },
  { kind: "goals_reminder", label: "Goals reminder" },
  { kind: "leaderboard_liked", label: "Leaderboard like" },
  { kind: "story_posted", label: "New story posted" },
  { kind: "candidate_launched", label: "Candidate launched" },
  { kind: "candidate_resource_completed", label: "Candidate completed a resource" },
  { kind: "prospect_link_visited", label: "Candidate viewed their link" },
  { kind: "member_resource_sent", label: "Resource sent to you" },
  { kind: "library_resource_added", label: "New library resource" },
  { kind: "streak_milestone_reached", label: "Streak milestone" },
  { kind: "downline_signup_linked", label: "New team member" },
  { kind: "trivia_streak_reminder", label: "Trivia streak reminder" },
  { kind: "app_inactive_reminder", label: "Haven't opened the app" },
  { kind: "streak_break_downline", label: "Downline streak ended" },
  { kind: "admin_weekly_report", label: "Weekly team report" },
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]["kind"];
export const NOTIFICATION_KIND_LABELS = Object.fromEntries(
  NOTIFICATION_KINDS.map((n) => [n.kind, n.label])
) as Record<NotificationKind, string>;

// Which unit someone tracks reading in - shared by Core Run's reading
// input (app/streak/page.tsx) and the Reading goal (app/goals/page.tsx)
// via profiles.reading_unit, so switching it on either page keeps both
// in sync.
export const READING_UNITS = [
  { key: "minutes", label: "Minutes" },
  { key: "pages", label: "Pages" },
] as const;
export type ReadingUnit = (typeof READING_UNITS)[number]["key"];

// App-wide accent colorways, picked on My Profile. `swatch` is just for
// the picker UI - the actual repaint happens via CSS custom-property
// overrides keyed by this same `key` as `data-theme` on <html> (see the
// ":root[data-theme=...]" blocks in app/globals.css), so every existing
// text-amber/bg-amber/border-amber usage across the app repaints without
// any component needing to know a colorway exists. Must match the check
// constraint on profiles.theme_color in supabase/schema.sql.
export const THEME_COLORS = [
  { key: "amber", label: "Amber", swatch: "#f59e0b" },
  { key: "blue", label: "Sky Blue", swatch: "#0ea5e9" },
  { key: "green", label: "Emerald", swatch: "#10b981" },
  { key: "purple", label: "Violet", swatch: "#8b5cf6" },
  { key: "rose", label: "Rose", swatch: "#f43f5e" },
  { key: "teal", label: "Teal", swatch: "#14b8a6" },
] as const;
export type ThemeColor = (typeof THEME_COLORS)[number]["key"];

// One-off/repeatable self-report actions with no other way to auto-detect
// them (same gap book_completions solved for reading) — must match the
// activity_logs.kind check constraint in supabase/schema.sql. Logged from
// the Badges tab's "Log Activity" card.
export const ACTIVITY_LOG_KINDS = [
  { key: "sample_bag_given", label: "Sample Bag Given" },
  { key: "customer_survey_completed", label: "Customer Survey Completed" },
  { key: "weekly_training_attended", label: "Weekly Training Attended" },
  { key: "monthly_masterclass_attended", label: "Monthly Masterclass Attended" },
  { key: "quarterly_conference_attended", label: "Quarterly Conference Attended" },
  { key: "story_practiced", label: "Practiced My Story with the Assistant" },
] as const;
export type ActivityLogKind = (typeof ACTIVITY_LOG_KINDS)[number]["key"];

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

// A "Candidate Meeting" event splits into two shades depending on
// calendar_events.is_downline_candidate: the normal amber above for your
// own candidate, this one when it's actually for a downline's candidate
// (e.g. filling in for them, or booked via "Book a Meeting" on their
// Roadmap card) - same color palette register as the other event-type
// colors, just a distinct hue so the two read apart from across a room.
export const DOWNLINE_CANDIDATE_MEETING_COLOR = "#34d399";

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

// How long a calendar event runs - drives both the end time shown next
// to the start time and how tall its block is on the Day view grid.
// Free-typed durations aren't worth the extra input for how this app is
// actually used (QI1s/QI2s/meetings all run one of a handful of standard
// lengths), so this is a picker rather than a number field.
export const CALENDAR_DURATION_OPTIONS = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1.5 hours" },
  { minutes: 120, label: "2 hours" },
] as const;

// How often an event repeats - "none" is the common case (a normal
// one-time event). Editing or deleting a recurring event always acts on
// the whole series (there's no per-occurrence override), so this stays a
// simple enum rather than a full RRULE - must match the check constraint
// on calendar_events.recurrence_freq in supabase/schema.sql.
export const CALENDAR_RECURRENCE_OPTIONS: { freq: "none" | "weekly" | "biweekly" | "monthly"; label: string }[] = [
  { freq: "none", label: "Doesn't repeat" },
  { freq: "weekly", label: "Weekly" },
  { freq: "biweekly", label: "Every 2 weeks" },
  { freq: "monthly", label: "Monthly" },
];

// Time zones a calendar event's start time can be entered in - the team
// is entirely US-based (see TEAMS below), so this is the standard 6 US
// zones rather than a full IANA city picker. Each key is a real IANA
// zone id (not a fixed UTC offset) specifically so Intl's timezone-aware
// formatting/conversion picks up daylight saving automatically instead
// of needing separate summer/winter entries - see lib/timezones.ts.
export const US_TIMEZONES = [
  { key: "America/New_York", label: "Eastern (ET)" },
  { key: "America/Chicago", label: "Central (CT)" },
  { key: "America/Denver", label: "Mountain (MT)" },
  { key: "America/Phoenix", label: "Arizona (no DST)" },
  { key: "America/Los_Angeles", label: "Pacific (PT)" },
  { key: "America/Anchorage", label: "Alaska (AKT)" },
  { key: "Pacific/Honolulu", label: "Hawaii (HT)" },
] as const;
export type UsTimeZone = (typeof US_TIMEZONES)[number]["key"];

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

// A candidate whose row hasn't been touched (step move, note, launch/
// filter) in this many days is worth a "follow up" nudge - candidates.
// updated_at is already stamped on every real edit (see updateCandidate()
// in app/pipeline/page.tsx), so this needs no new schema, just a
// threshold. Shared by Today's Mission (app/dashboard/page.tsx) and the
// per-candidate stale badge on the Candidate Roadmap (app/pipeline/page.tsx).
export const STALE_CANDIDATE_DAYS = 5;

export type CandidateStepResource = {
  label: string;
  detail: string;
  url?: string;
  // Rough, best-guess reading/listening time - there's no way to measure
  // an external file's actual length from here, so treat these as
  // approximate and correct any you know the real runtime for.
  estimate?: string;
};

// Prospect access (see app/prospect/page.tsx): whatever's assigned to a
// candidate's current step - and every step before it - shows up
// automatically in their code-gated resources view, so nobody has to
// manually text over an audio or article at the right moment. One entry
// per CANDIDATE_STEPS index above.
//
// This is the team-wide DEFAULT set. An individual IBO can hide any of
// these defaults for their own candidates, or add their own at any step,
// from the "Candidate Resources" section of the Resources tab - see
// candidate_resource_overrides in supabase/schema.sql and
// get_candidate_resource_overrides() for how those per-IBO
// adds/removals get merged with this list at read time.
export const CANDIDATE_STEP_RESOURCES: CandidateStepResource[][] = [
  // 0. Yes
  [],
  // 1. QI1 - nothing yet: candidates don't get their access code until
  // QI2 is booked, so there's no one to receive anything at this step.
  [],
  // 2. QI2
  [
    {
      label: "📄 Summary: Business of the 21st Century",
      detail: "By Robert Kiyosaki.",
      url: "https://www.dropbox.com/scl/fi/i8w3xa044x2ulwsdz3dhf/FILE_5085.pdf?rlkey=6usnhsbvivt23l5loggb528jr&st=9x5tos9p&dl=0",
      estimate: "~20 min read",
    },
    {
      label: "📰 What Is Network Marketing?",
      detail: "Entrepreneur.com",
      url: "https://www.entrepreneur.com/building-a-business/marketing/types-of-marketing/what-is-network-marketing",
      estimate: "~5 min read",
    },
    {
      label: "📰 Why Gen Z Is Betting on Direct Selling",
      detail: "Entrepreneur.com — and why that matters for the future of work.",
      url: "https://apac.entrepreneur.com/news-and-trends/why-gen-z-is-betting-on-direct-selling-and-why-that-matters/498981",
      estimate: "~5 min read",
    },
  ],
  // 3. IS1
  [
    {
      label: "🎧 Digital Flea Market of Dreams",
      detail: "Podcast by John Resch.",
      url: "https://www.dropbox.com/scl/fi/hweysii7kmg5bouqffb0h/Digital-Flea-Market-of-Dreams.m4a?rlkey=1xj0oe66ffhew7i34rx7aau5d&st=0ako2bu6&dl=0",
      estimate: "~17 min listen",
    },
    {
      label: "📖 The Go-Giver",
      detail: "A Little Story About a Powerful Business Idea.",
      url: "https://static1.squarespace.com/static/60393221d492e05ee012873d/t/6a0a719fcc48ee3edc7304e8/1779069345436/The+Go-Giver_+A+Little+Story+About+a+Powerful+Business+Idea.pdf",
      estimate: "~2 hr read",
    },
  ],
  // 4. FU1
  [
    {
      label: "🎧 How Do You Want to Live?",
      detail: "By Alex and Laura Angle.",
      url: "https://www.dropbox.com/scl/fi/y4p9por067phvvbqrth1c/How-Do-You-Want-to-LIve-S15-1349-AUD.mp3?rlkey=j4oac7vz8tn7l11uac6oen2nx&st=q3gf0eho&dl=0",
      estimate: "~1 hr 12 min listen",
    },
    {
      label: "🎧 Financial Stability of the 21st Century",
      detail: "By Greg Duncan.",
      url: "https://www.dropbox.com/scl/fi/3nyufs0dzu18631ipdws4/NLA-Financial-Stability-in-the-21st-Century-L15-1347-AUD.mp3?rlkey=k6jfttm6qu2yu7vdeahjwjw7d&st=w6aj44pc&dl=0",
      estimate: "~1 hr 19 min listen",
    },
  ],
  // 5. IS2
  [
    {
      label: "📄 The 25 Laws of Doing the Impossible",
      detail: "By Patrick Bet-David.",
      url: "https://www.patrickbetdavid.com/wp-content/uploads/2014/09/Doing-the-Impossible-by-Patrick-Bet-David.pdf",
      estimate: "~2 hr read",
    },
    {
      label: "🎧 List Ditto Associate",
      detail: "A Successful Business Start — by Dirk and Laura Taylor.",
      url: "https://www.dropbox.com/scl/fi/aqva3wgmylgqtbrmq1cuk/NLA-List-Ditto-Associate-A-Successful-Business-Start-L15-1599-AUD.mp3?rlkey=q7qwyzqhltsvriaxjxxdnuvsw&st=xwloolsq&dl=0",
      estimate: "~42 min listen",
    },
  ],
  // 6. FU2
  [
    {
      label: "🎧 Dissatisfied",
      detail: "By Manny Winston.",
      url: "https://www.dropbox.com/scl/fi/0qwvy8fjneyujka5ktol4/Dissatisfied-L16-1961-AUD.mp3?rlkey=bfht15w18iks4d3ol055sh320&st=yjzjnrzh&dl=0",
      estimate: "~26 min listen",
    },
    {
      label: "🎧 At the Highest Level",
      detail: "By Mark Nathan.",
      url: "https://www.dropbox.com/scl/fi/uqu8f0lafz9pgt3n8lmln/NLA-At-the-Highest-Level-L14-1058-AUD.mp3?rlkey=3dns0ztlonxxb825akxy2ef88&st=y06uv48f&dl=0",
      estimate: "~50 min listen",
    },
  ],
  // 7. Questionnaire
  [],
  // 8. Offer Call
  [],
];

export type CandidateResourceOverrideEntry = {
  step: number;
  action: "add" | "remove";
  label: string;
  detail: string;
  url: string | null;
  estimate?: string | null;
};

// Merges a candidate owner's own customizations (see the "Candidate
// Resources" section of the Resources tab) into the team-wide defaults -
// a "remove" hides a default with that exact label for this step, an
// "add" is a resource this owner tacked on beyond the defaults. Shared
// between app/prospect/page.tsx (the candidate's own view) and
// app/pipeline/page.tsx (the IBO's read-only progress view), so both
// sides always agree on exactly which resources a candidate has.
export function effectiveResourcesForStep(
  step: number,
  overrides: CandidateResourceOverrideEntry[]
): CandidateStepResource[] {
  const removedLabels = new Set(
    overrides.filter((o) => o.step === step && o.action === "remove").map((o) => o.label)
  );
  const defaults = CANDIDATE_STEP_RESOURCES[step].filter((r) => !removedLabels.has(r.label));
  const added = overrides
    .filter((o) => o.step === step && o.action === "add")
    .map((o) => ({ label: o.label, detail: o.detail, url: o.url ?? undefined, estimate: o.estimate ?? undefined }));
  return [...defaults, ...added];
}

// Info Session (IS1 and IS2 steps): a candidate either attends in person
// (this week's flyer - see info_session_flyer in supabase/schema.sql,
// admin-managed since it's one shared weekly event for the whole team)
// or watches one of these fixed, recurring weekly virtual webinars. Each
// slot repeats every week at the same Eastern-time day/hour - see
// nextWebinarOccurrence() in lib/dates.ts for how "the next 4 available"
// gets computed from these at render time. IS1 and IS2 are two separate
// real sessions a candidate attends at two different points in the
// process, so a candidate tracks its own independent mode/slot/watched
// state for each (is1_* / is2_* columns on candidates).
export type WebinarSlot = {
  key: string;
  presenter: string;
  dayOfWeek: number; // 0 = Sunday ... 6 = Saturday
  hour: number; // 24-hour, America/New_York
  minute: number;
  url: string;
};

export const VIRTUAL_WEBINAR_SLOTS: WebinarSlot[] = [
  { key: "angle-mon-8pm", presenter: "Angle", dayOfWeek: 1, hour: 20, minute: 0, url: "https://my.demio.com/ref/nvtqS4vThpCENoRa" },
  { key: "angle-mon-10pm", presenter: "Angle", dayOfWeek: 1, hour: 22, minute: 0, url: "https://my.demio.com/ref/Iv1Rqa7pWz8RO7sA" },
  { key: "tucker-tue-8pm", presenter: "Tucker", dayOfWeek: 2, hour: 20, minute: 0, url: "https://my.demio.com/ref/jpulZageGwVUkWCA" },
  { key: "mcgrath-wed-8pm", presenter: "McGrath", dayOfWeek: 3, hour: 20, minute: 0, url: "https://my.demio.com/ref/Iucw3ro87EXMMKpc" },
  { key: "mcgrath-wed-10pm", presenter: "McGrath", dayOfWeek: 3, hour: 22, minute: 0, url: "https://my.demio.com/ref/qpzzsa37RO2odlQS" },
  { key: "angle-thu-7pm", presenter: "Angle", dayOfWeek: 4, hour: 19, minute: 0, url: "https://my.demio.com/ref/P7qAG7Bh6v2lBvgo" },
  { key: "angle-thu-9pm", presenter: "Angle", dayOfWeek: 4, hour: 21, minute: 0, url: "https://my.demio.com/ref/elvICLmsBoLVZJrl" },
  { key: "tucker-fri-7pm", presenter: "Tucker", dayOfWeek: 5, hour: 19, minute: 0, url: "https://my.demio.com/ref/Hqca6G6gHCcDKVQ0" },
  { key: "white-sat-1pm", presenter: "White", dayOfWeek: 6, hour: 13, minute: 0, url: "https://my.demio.com/ref/mnLPvecjzMEBHvNw" },
  { key: "angle-sat-3pm", presenter: "Angle", dayOfWeek: 6, hour: 15, minute: 0, url: "https://my.demio.com/ref/cISIlBoFrv6iuhR3" },
  { key: "mcgrath-sun-5pm", presenter: "McGrath", dayOfWeek: 0, hour: 17, minute: 0, url: "https://my.demio.com/ref/tv6ioRqN1ACh0Nf5" },
  { key: "mcgrath-sun-8pm", presenter: "McGrath", dayOfWeek: 0, hour: 20, minute: 0, url: "https://my.demio.com/ref/JeFs77UGWoyNHD6E" },
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
  estimate?: string;
};

export type OnboardingSession = {
  title: string;
  description: string;
  resources: OnboardingResource[];
};

export type OnboardingResourceOverrideEntry = {
  session: number;
  action: "add" | "remove";
  label: string;
  detail: string;
  url: string | null;
  estimate?: string | null;
};

// Merges an IBO's own customizations (see the "Onboarding Resources"
// section of the Resources tab) into the team-wide defaults - same
// remove-hides/add-tacks-on merge as effectiveResourcesForStep, but keyed
// by onboarding session number (1-5) instead of candidate step.
export function effectiveResourcesForSession(
  session: number,
  defaults: OnboardingResource[],
  overrides: OnboardingResourceOverrideEntry[]
): OnboardingResource[] {
  const removedLabels = new Set(
    overrides.filter((o) => o.session === session && o.action === "remove").map((o) => o.label)
  );
  const kept = defaults.filter((r) => !removedLabels.has(r.label));
  const added = overrides
    .filter((o) => o.session === session && o.action === "add")
    .map((o) => ({ label: o.label, detail: o.detail, url: o.url ?? undefined, estimate: o.estimate ?? undefined }));
  return [...kept, ...added];
}

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

// Stories: one rotates in as "today's prompt" via getTodayStoryPrompt()
// below - fixed editorial content, so it lives here as a plain list
// rather than a database table, same as CANDIDATE_STEP_RESOURCES/
// ONBOARDING_SESSIONS.
export const STORY_PROMPTS = [
  "Post yourself using your products out in public.",
  "Post yourself doing a meeting for your business.",
  "Post a team event or get-together.",
  "Post where you're going to meet people today.",
  "Post yourself sharing your story with someone.",
  "Post a customer who loves your products.",
  "Post your 'why' - what you're building this business for.",
  "Post yourself reading or listening to something that's growing you today.",
  "Post a win from today - a Yes, a QI1 booked, a sale, anything.",
  "Post your workspace, or wherever you get your business done.",
  "Post a shoutout to someone on your team who's crushing it.",
  "Post the book or audio you're currently working through.",
  "Post your calendar for today - what's on it.",
  "Post a picture from a recent team training or masterclass.",
  "Post your favorite product and why you actually use it.",
  "Post a photo of yourself before you started this business - then and now.",
  "Post your goals board, vision board, or written goals.",
  "Post yourself out prospecting - a coffee shop, gym, wherever you're talking to people.",
  "Post a highlight from this week you're proud of.",
  "Post a 'day in the life' - three photos from today.",
  "Post a stat from this app you're proud of - your streak, level, or a badge you earned.",
  "Post a family photo - who you're building this for.",
  "Post a recent Info Session or webinar you hosted or attended.",
  "Post the moment you decided to start this business.",
  "Post a photo with your upline or mentor.",
  "Post what financial freedom would let you do - the real reason behind the reason.",
  "Post the last conference, event, or company function you attended.",
  "Post the person who believed in you before you believed in yourself.",
  "Post your favorite memory from a team event.",
  "Post the leader or mentor whose example you're following.",
  "Post the product you can't live without and why.",
  "Post a place you're going today specifically to meet new people.",
] as const;

// A hash of the calendar date string rather than a day-of-year count -
// deterministic and identical across every device for the same local
// calendar day (see getToday() in lib/dates.ts), with no leap-year/
// year-boundary edge cases to think about.
export function getTodayStoryPrompt(): string {
  const dateStr = getToday();
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % STORY_PROMPTS.length;
  return STORY_PROMPTS[index];
}
