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

// Of the three PRIMARY_EMAILS above, only this one actually owns the
// Gemini Assistant Google Group - Alex and Laura can't add/remove members
// from it, so the "add/remove someone from the Group" reminders on
// Candidate Roadmap and Team should only ever show to this account, not
// to every admin isPrimaryUser() would otherwise cover.
const GEMINI_GROUP_OWNER_EMAIL = "adamangle@icloud.com";

// An exception for Adam specifically (not the other two PRIMARY_EMAILS)
// on the Core Run Off Day cap (see OFF_DAY_CAP in app/streak/page.tsx) -
// same "runs the whole team's operations, not just their own business"
// reasoning as BADGE_EXCLUDED_EMAILS above, just for Off Days instead of
// Badges. This only lifts the cap on how many Off Days he can mark - a
// real day still has to either be logged or marked off to count; his
// streak isn't otherwise touched.
const UNLIMITED_OFF_DAY_EMAILS = ["adamangle@icloud.com"];

export function hasUnlimitedOffDays(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return UNLIMITED_OFF_DAY_EMAILS.some((e) => e.toLowerCase() === normalized);
}

export function isGeminiGroupOwner(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return normalized === GEMINI_GROUP_OWNER_EMAIL;
}

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
  { kind: "candidate_filtered_out", label: "Candidate filtered out" },
  { kind: "customer_sale_logged", label: "Customer sale logged" },
  { kind: "onboarding_completed", label: "Onboarding completed" },
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
  { kind: "engagement_filler", label: "Book/audio recommendations" },
  { kind: "story_liked", label: "Story liked" },
  { kind: "story_commented", label: "New comment on your story" },
  { kind: "budget_worksheet_completed", label: "Budget worksheet started" },
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
// constraint on profiles.theme_color in supabase/schema.sql. `swatch` can
// be a flat hex (solid picker circle) or a `linear-gradient(...)` string
// (multi-tone preview, e.g. USA/holiday/metallic themes) - the picker
// renders it with the `background` shorthand so both work. `ring` is
// always a solid hex, used for the active-swatch selection ring since a
// box-shadow color can't itself be a gradient.
export const THEME_COLORS = [
  { key: "amber", label: "Amber", swatch: "#f59e0b", ring: "#f59e0b" },
  { key: "blue", label: "Sky Blue", swatch: "#0ea5e9", ring: "#0ea5e9" },
  { key: "green", label: "Emerald", swatch: "#10b981", ring: "#10b981" },
  { key: "purple", label: "Violet", swatch: "#8b5cf6", ring: "#8b5cf6" },
  { key: "rose", label: "Rose", swatch: "#f43f5e", ring: "#f43f5e" },
  { key: "teal", label: "Teal", swatch: "#14b8a6", ring: "#14b8a6" },
  {
    key: "usa",
    label: "USA",
    swatch:
      "linear-gradient(135deg, #b22234 0%, #b22234 33%, #ffffff 33%, #ffffff 66%, #3c3b6e 66%, #3c3b6e 100%)",
    ring: "#3c3b6e",
  },
  { key: "christmas", label: "Christmas", swatch: "linear-gradient(135deg, #dc2626, #15803d)", ring: "#dc2626" },
  { key: "easter", label: "Easter", swatch: "linear-gradient(135deg, #f9a8d4, #c4b5fd, #fef08a)", ring: "#c4b5fd" },
  { key: "gold", label: "Gold", swatch: "linear-gradient(135deg, #fde68a, #d4af37, #92400e)", ring: "#d4af37" },
  { key: "silver", label: "Silver", swatch: "linear-gradient(135deg, #f1f5f9, #94a3b8, #475569)", ring: "#94a3b8" },
  { key: "metallic", label: "Metallic", swatch: "linear-gradient(135deg, #e8b795, #b76e45, #7c4a2d)", ring: "#b76e45" },
  { key: "sunset", label: "Sunset", swatch: "linear-gradient(135deg, #fb923c, #f472b6, #7c3aed)", ring: "#f472b6" },
  // Batch 2 - holidays, nature/elemental, gems/metals, mood/vibe, plus
  // the two Amway-pin-tier colors (Diamond ties into the app's own
  // Diamond icon on the Today tab). Same swatch/ring convention as
  // above: swatch is a light-to-dark gradient built from that theme's
  // own amber-light/amber-dark pair (so the picker preview always
  // matches what the app actually repaints to, never a color made up
  // just for the picker), ring is the solid amber value for the
  // selection ring.
  { key: "valentines", label: "Valentine's Day", swatch: "linear-gradient(135deg, #f9a8d4, #831843)", ring: "#ec4899" },
  { key: "stpatricks", label: "St. Patrick's Day", swatch: "linear-gradient(135deg, #a3e635, #14532d)", ring: "#22c55e" },
  { key: "harvest", label: "Thanksgiving", swatch: "linear-gradient(135deg, #fb923c, #7c2d12)", ring: "#c2410c" },
  { key: "hanukkah", label: "Hanukkah", swatch: "linear-gradient(135deg, #bfdbfe, #1e3a8a)", ring: "#2563eb" },
  { key: "newyears", label: "New Year's Eve", swatch: "linear-gradient(135deg, #fde047, #0f172a)", ring: "#eab308" },
  { key: "fireworks", label: "Fireworks", swatch: "linear-gradient(135deg, #fbbf24, #1e1b4b)", ring: "#e11d48" },
  { key: "ocean", label: "Ocean", swatch: "linear-gradient(135deg, #67e8f9, #164e63)", ring: "#0891b2" },
  { key: "forest", label: "Forest", swatch: "linear-gradient(135deg, #4ade80, #14532d)", ring: "#15803d" },
  { key: "desert", label: "Desert Canyon", swatch: "linear-gradient(135deg, #fdba74, #431407)", ring: "#9a3412" },
  { key: "lava", label: "Lava", swatch: "linear-gradient(135deg, #f97316, #1c1917)", ring: "#b91c1c" },
  { key: "aurora", label: "Aurora Borealis", swatch: "linear-gradient(135deg, #a5f3fc, #1e1b4b)", ring: "#22d3ee" },
  { key: "galaxy", label: "Galaxy", swatch: "linear-gradient(135deg, #f0abfc, #1e1b4b)", ring: "#7c3aed" },
  { key: "coral", label: "Coral Reef", swatch: "linear-gradient(135deg, #5eead4, #0e7490)", ring: "#fb7185" },
  { key: "starrynight", label: "Starry Night", swatch: "linear-gradient(135deg, #c7d2fe, #0f172a)", ring: "#6366f1" },
  { key: "ruby", label: "Ruby", swatch: "linear-gradient(135deg, #fb7185, #4c0519)", ring: "#be123c" },
  { key: "sapphire", label: "Sapphire", swatch: "linear-gradient(135deg, #60a5fa, #172554)", ring: "#1d4ed8" },
  { key: "amethyst", label: "Amethyst", swatch: "linear-gradient(135deg, #d8b4fe, #3b0764)", ring: "#9333ea" },
  { key: "rosegold", label: "Rose Gold", swatch: "linear-gradient(135deg, #fbcfe8, #9f5a4d)", ring: "#e8a598" },
  { key: "platinum", label: "Platinum", swatch: "linear-gradient(135deg, #f1f5f9, #64748b)", ring: "#cbd5e1" },
  { key: "copper", label: "Copper", swatch: "linear-gradient(135deg, #e8a87c, #7c3f1d)", ring: "#c2703c" },
  { key: "obsidian", label: "Obsidian", swatch: "linear-gradient(135deg, #c4b5fd, #0f0a1f)", ring: "#6d28d9" },
  { key: "opal", label: "Opal", swatch: "linear-gradient(135deg, #e0e7ff, #6366f1)", ring: "#a5b4fc" },
  { key: "pearl", label: "Pearl", swatch: "linear-gradient(135deg, #f8fafc, #94a3b8)", ring: "#e2e8f0" },
  { key: "cyberpunk", label: "Neon Cyberpunk", swatch: "linear-gradient(135deg, #67e8f9, #701a75)", ring: "#d946ef" },
  { key: "vaporwave", label: "Vaporwave", swatch: "linear-gradient(135deg, #fbcfe8, #7c3aed)", ring: "#2dd4bf" },
  { key: "pastel", label: "Pastel Dream", swatch: "linear-gradient(135deg, #ede9fe, #8b5cf6)", ring: "#c4b5fd" },
  { key: "monochrome", label: "Monochrome", swatch: "linear-gradient(135deg, #f4f4f5, #52525b)", ring: "#d4d4d8" },
  { key: "fire", label: "Fire", swatch: "linear-gradient(135deg, #fbbf24, #7f1d1d)", ring: "#ef4444" },
  { key: "ice", label: "Ice", swatch: "linear-gradient(135deg, #cffafe, #0e7490)", ring: "#67e8f9" },
  { key: "diamond", label: "Diamond", swatch: "linear-gradient(135deg, #e0f2fe, #0369a1)", ring: "#38bdf8" },
  { key: "foundersdiamond", label: "Founders Diamond", swatch: "linear-gradient(135deg, #7dd3fc, #082f49)", ring: "#0284c7" },
] as const;
// "custom" isn't in THEME_COLORS above - it has no fixed swatch/ring or
// :root[data-theme] block (see lib/applyTheme.ts) since it's an
// arbitrary hex someone picks on My Profile, not a preset. The picker
// renders it as its own color-input control, not a loop entry.
export type ThemeColor = (typeof THEME_COLORS)[number]["key"] | "custom";

// The subset of THEME_COLORS that are actual calendar holidays/civic
// days (as opposed to the gems/metals/nature/mood colorways, which are
// just a color choice, not a "theme") - these get real decorative flair
// app-wide via FestiveBackdrop, not just an accent-color swap, since a
// single recolored button doesn't read as "Christmas" or "the Fourth of
// July" the way an actual scatter of themed emoji does. Deliberately a
// separate lookup rather than a field on THEME_COLORS itself, so that
// array's shared tuple type (swatch/ring, used for every colorway) isn't
// forced to carry an optional field only 9 of ~40 entries ever use.
export const FESTIVE_THEME_EMOJI: Partial<Record<ThemeColor, string[]>> = {
  usa: ["🎆", "🇺🇸", "⭐", "🧨"],
  christmas: ["🎄", "❄️", "🎅", "🎁"],
  easter: ["🐣", "🌷", "🥚", "🐰"],
  valentines: ["💘", "🌹", "💕", "💌"],
  stpatricks: ["🍀", "☘️", "🌈", "🎩"],
  harvest: ["🦃", "🍂", "🥧", "🌽"],
  hanukkah: ["🕎", "✨", "🪔", "💙"],
  newyears: ["🎉", "🥂", "🎆", "🎊"],
  fireworks: ["🎆", "✨", "🎇", "💥"],
};

// Independent of ThemeColor above (accent color) - picked on My
// Profile's "App Mode" card, applied via applyColorMode in
// lib/applyTheme.ts (sets/clears data-mode="light" on <html>, which the
// ":root[data-mode=\"light\"]" block in app/globals.css reads to flip
// --color-navy*/slate/white). Must match the check constraint on
// profiles.color_mode in supabase/schema.sql.
export const COLOR_MODES = [
  { key: "dark", label: "Dark" },
  { key: "light", label: "Light" },
] as const;
export type ColorMode = (typeof COLOR_MODES)[number]["key"];

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
  "Jones Team",
] as const;

// Pipeline Tracker: ordered stages
export const PIPELINE_STAGES = [
  { key: "conversations", label: "Conversations" },
  { key: "story_shares", label: "Story Shares" },
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
      label: "Summary: Business of the 21st Century",
      detail: "By Robert Kiyosaki.",
      url: "https://www.dropbox.com/scl/fi/i8w3xa044x2ulwsdz3dhf/FILE_5085.pdf?rlkey=6usnhsbvivt23l5loggb528jr&st=9x5tos9p&dl=0",
      estimate: "~20 min read",
    },
    {
      label: "What Is Network Marketing?",
      detail: "Entrepreneur.com",
      url: "https://www.entrepreneur.com/building-a-business/marketing/types-of-marketing/what-is-network-marketing",
      estimate: "~5 min read",
    },
    {
      label: "Why Gen Z Is Betting on Direct Selling",
      detail: "Entrepreneur.com — and why that matters for the future of work.",
      url: "https://apac.entrepreneur.com/news-and-trends/why-gen-z-is-betting-on-direct-selling-and-why-that-matters/498981",
      estimate: "~5 min read",
    },
  ],
  // 3. IS1
  [
    {
      label: "Digital Flea Market of Dreams",
      detail: "Podcast by John Resch.",
      url: "https://www.dropbox.com/scl/fi/hweysii7kmg5bouqffb0h/Digital-Flea-Market-of-Dreams.m4a?rlkey=1xj0oe66ffhew7i34rx7aau5d&st=0ako2bu6&dl=0",
      estimate: "~17 min listen",
    },
    {
      label: "The Go-Giver",
      detail: "A Little Story About a Powerful Business Idea.",
      url: "https://static1.squarespace.com/static/60393221d492e05ee012873d/t/6a0a719fcc48ee3edc7304e8/1779069345436/The+Go-Giver_+A+Little+Story+About+a+Powerful+Business+Idea.pdf",
      estimate: "~2 hr read",
    },
  ],
  // 4. FU1
  [
    {
      label: "How Do You Want to Live?",
      detail: "By Alex and Laura Angle.",
      url: "https://www.dropbox.com/scl/fi/y4p9por067phvvbqrth1c/How-Do-You-Want-to-LIve-S15-1349-AUD.mp3?rlkey=j4oac7vz8tn7l11uac6oen2nx&st=q3gf0eho&dl=0",
      estimate: "~1 hr 12 min listen",
    },
    {
      label: "Financial Stability of the 21st Century",
      detail: "By Greg Duncan.",
      url: "https://www.dropbox.com/scl/fi/3nyufs0dzu18631ipdws4/NLA-Financial-Stability-in-the-21st-Century-L15-1347-AUD.mp3?rlkey=k6jfttm6qu2yu7vdeahjwjw7d&st=w6aj44pc&dl=0",
      estimate: "~1 hr 19 min listen",
    },
  ],
  // 5. IS2
  [
    {
      label: "The 25 Laws of Doing the Impossible",
      detail: "By Patrick Bet-David.",
      url: "https://www.patrickbetdavid.com/wp-content/uploads/2014/09/Doing-the-Impossible-by-Patrick-Bet-David.pdf",
      estimate: "~2 hr read",
    },
    {
      label: "List Ditto Associate",
      detail: "A Successful Business Start — by Dirk and Laura Taylor.",
      url: "https://www.dropbox.com/scl/fi/aqva3wgmylgqtbrmq1cuk/NLA-List-Ditto-Associate-A-Successful-Business-Start-L15-1599-AUD.mp3?rlkey=q7qwyzqhltsvriaxjxxdnuvsw&st=xwloolsq&dl=0",
      estimate: "~42 min listen",
    },
  ],
  // 6. FU2
  [
    {
      label: "Dissatisfied",
      detail: "By Manny Winston.",
      url: "https://www.dropbox.com/scl/fi/0qwvy8fjneyujka5ktol4/Dissatisfied-L16-1961-AUD.mp3?rlkey=bfht15w18iks4d3ol055sh320&st=yjzjnrzh&dl=0",
      estimate: "~26 min listen",
    },
    {
      label: "At the Highest Level",
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

// The "How Does an IBO Earn Income" video (see app/prospect/page.tsx's
// FU1VideoCard) - exported so ClaimCandidateHistoryCard can link back to
// the same video for someone revisiting their pre-launch resources.
export const FU1_VIDEO_YOUTUBE_ID = "OdO2yddaCyc";

export type CandidateResourceOverrideEntry = {
  step: number;
  action: "add" | "remove";
  label: string;
  detail: string;
  url: string | null;
  estimate?: string | null;
};

// Pre-Launch Questionnaire (step 7) - the team's real 9-question
// document, answered in-app instead of over a call/paper copy so the
// IBO gets a written record of what the candidate actually said. Fixed
// editorial content, same "lives here, not a table" convention as
// STORY_PROMPTS/CANDIDATE_STEPS above.
export const QUESTIONNAIRE_QUESTIONS: string[] = [
  "Why do you feel that you would be a good investment of our time and resources, and what separates you from other potential candidates?",
  "What are you looking to accomplish through this opportunity? Why are you excited about that?",
  "What is the difference between Amway and LTD? What makes our program different than other network marketing businesses out there?",
  "What are the dates of the next Weekly Training, Monthly Masterclass, and Quarterly Major Conference? Why is attending each team event essential to a successful business?",
  "Are you willing to go through a budgeting session? If so, why do you feel this would be valuable to you?",
  "What are the monthly personal PV standards that we've discussed? Why is DITTO necessary for developing a stable, long-term business?",
  "Why is transparent and consistent communication with your mentor in all areas (life, business, finances, etc.) so important for a successful business?",
  "As you face adversity in life and in business, are you willing to press into the mentorship that is available to you? Why is it so important to avoid pulling away/trying to navigate obstacles on your own?",
  "Are there any other questions or concerns that you would like to address with us prior to moving forward?",
];

// Merges a candidate owner's own customizations (see the "Candidate
// Resources" section of the Resources tab) into the team-wide defaults -
// a "remove" hides a default with that exact label for this step, an
// "add" is a resource this owner tacked on beyond the defaults. Shared
// between app/prospect/page.tsx (the candidate's own view),
// app/pipeline/page.tsx (the IBO's read-only progress view), and
// components/ClaimCandidateHistoryCard.tsx (a launched IBO revisiting
// their own pre-launch resources), so everywhere always agrees on
// exactly which resources a candidate had.
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
        label: "📋 Fill Out Your Budget (in-app)",
        detail:
          "The same budget worksheet your coach has always used, now right here in the app - your mentor can see once it's marked complete.",
        url: "/budget",
      },
      {
        label: "🎧 How to Fill Out a Budget Sheet",
        detail:
          "A five-minute explanation on how to fill out your budget properly before meeting back up with your coach.",
        url: "https://www.dropbox.com/scl/fi/dhr72f5nf2sfizigwpxqi/How-To-Fill-Out-Budget-Sheet.m4a?rlkey=58h4eaufoelcnpp896xfwykbw&st=mvwit11f&dl=0",
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
        label: "📋 Build Your List (in-app)",
        detail: "Add names straight into your Contact Builder as you go through the worksheet — your mentor can see it fill in.",
        url: "/contacts",
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
        detail: `Read ${SESSION_4_READING_REQUIREMENT} — required to unlock this session. Confirmed on the Classroom tab while it was still locked.`,
      },
      {
        label: "📋 Homework: Contact Builder",
        detail: `Have ${SESSION_4_CONTACT_MINIMUM}+ names in your A/B list — also required to unlock this session. Tracked automatically and shown on the Classroom tab while it was still locked.`,
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

// My Budget (app/budget/page.tsx) - line items matching the Budget
// Session's worksheet exactly, so nothing gets lost bringing it in-app.
// `slug` is the jsonb key on budget_worksheets.{income,fixed_expenses,
// variable_expenses,debts,business_investments,savings} - stable once
// shipped, since renaming one here would silently orphan whatever a
// person already saved under the old slug. Labels can be edited freely;
// slugs can't. (The original sheet's Debt section actually reads "Auto
// Loan 1/2, Credit Card 1/2/3, Line of Credit 1/2, Student Loan 1, 3" -
// skipping "2" - corrected to 1/2 here rather than reproduced literally,
// since a visible gap would read as a bug in a polished form the way it
// doesn't in a spreadsheet.)
export const BUDGET_INCOME_ITEMS = [
  { slug: "income_1", label: "Monthly Income (net)" },
  { slug: "income_2", label: "Monthly Income (net)" },
  { slug: "other_income", label: "Other Income" },
] as const;

export type BudgetDueHalf = "first_half" | "second_half";
export const BUDGET_DUE_HALVES: { key: BudgetDueHalf; label: string }[] = [
  { key: "first_half", label: "1st–15th" },
  { key: "second_half", label: "15th–30th" },
];

export const BUDGET_FIXED_EXPENSE_ITEMS = [
  { slug: "rent_mortgage", label: "Rent/Mortgage" },
  { slug: "home_insurance", label: "Home Insurance" },
  { slug: "car_insurance", label: "Car Insurance" },
  { slug: "auto_maintenance", label: "Auto Maintenance" },
  { slug: "internet", label: "Internet" },
  { slug: "cable_satellite", label: "Cable/Satellite" },
  { slug: "charitable_donations", label: "Charitable Donations" },
  { slug: "membership_fees", label: "Membership Fees" },
  { slug: "health_insurance", label: "Health (Insurance, etc)" },
  { slug: "subscriptions", label: "Subscriptions" },
  { slug: "property_tax", label: "Property Tax" },
  { slug: "home_phone", label: "Home Phone" },
  { slug: "cell_phone_1", label: "Cell Phone 1" },
  { slug: "cell_phone_2", label: "Cell Phone 2" },
  { slug: "tuition", label: "Tuition" },
  { slug: "trash", label: "Trash" },
  { slug: "gas_home", label: "Gas (Home)" },
  { slug: "water", label: "Water" },
  { slug: "electric", label: "Electric" },
  { slug: "sewage", label: "Sewage" },
  { slug: "alarm", label: "Alarm" },
  { slug: "life_insurance", label: "Life Insurance" },
  { slug: "day_care", label: "Day Care" },
  { slug: "tithing", label: "Tithing" },
  { slug: "fixed_other", label: "Other" },
] as const;

export const BUDGET_VARIABLE_EXPENSE_ITEMS = [
  { slug: "groceries", label: "Food - Groceries" },
  { slug: "eating_out", label: "Food - Eating Out" },
  { slug: "gas_car", label: "Gas - Car" },
  { slug: "miscellaneous", label: "Miscellaneous" },
  { slug: "gifts", label: "Gifts" },
  { slug: "pets", label: "Pets" },
  { slug: "babysitting", label: "Babysitting" },
  { slug: "variable_other_1", label: "Other" },
  { slug: "variable_other_2", label: "Other" },
] as const;

export const BUDGET_DEBT_ITEMS = [
  { slug: "auto_loan_1", label: "Auto Loan 1" },
  { slug: "auto_loan_2", label: "Auto Loan 2" },
  { slug: "credit_card_1", label: "Credit Card 1" },
  { slug: "credit_card_2", label: "Credit Card 2" },
  { slug: "credit_card_3", label: "Credit Card 3" },
  { slug: "line_of_credit_1", label: "Line of Credit 1" },
  { slug: "line_of_credit_2", label: "Line of Credit 2" },
  { slug: "student_loan_1", label: "Student Loan 1" },
  { slug: "student_loan_2", label: "Student Loan 2" },
  { slug: "debt_other_1", label: "Other" },
  { slug: "debt_other_2", label: "Other" },
] as const;

// Amway DITTO™ is split out of this section into its own Cash Flow line
// (see computeBudgetTotals in lib/budget.ts) - everything else here
// rolls up into "LTD Suggested Investments," matching the sheet's own
// Cash Flow breakdown exactly. Keep "ditto_order" as the first slug if
// this list is ever reordered - computeBudgetTotals reads it by slug,
// not position, but the sheet's own layout leads with it too.
export const BUDGET_INVESTMENT_ITEMS = [
  { slug: "ditto_order", label: "Amway DITTO™ Scheduled Order" },
  { slug: "ltd_subscription", label: "LTD Subscription*" },
  { slug: "info_sessions", label: "Info Sessions" },
  { slug: "masterclass_events", label: "Masterclass Events" },
  { slug: "conferences", label: "Conferences" },
  { slug: "business_supplies", label: "Business Supplies" },
  { slug: "additional_travel", label: "Additional Travel Expenses" },
  { slug: "investment_other", label: "Other" },
] as const;

export const BUDGET_SAVINGS_ITEMS = [
  { slug: "savings", label: "Savings" },
  { slug: "emergency_fund", label: "Emergency Fund" },
  { slug: "investments", label: "Investments" },
  { slug: "savings_other_1", label: "Other" },
  { slug: "savings_other_2", label: "Other" },
] as const;

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
  "Post the car ride, coffee shop, or waiting room where you got your business done today.",
  "Post yourself getting ready before a meeting or event - the 'before' moment.",
  "Post a screenshot of a review or testimonial from a happy customer.",
  "Post the moment you found out you qualified for something - Core Run, a bonus, a rank.",
  "Post a picture of your team or a teammate you're grateful for today.",
  "Post your 'yes list' - who you're reaching out to this week.",
  "Post a before-you-knew-this-existed vs. now comparison.",
  "Post the reason you keep showing up, even on the hard days.",
  "Post yourself trying a new product for the first time.",
  "Post what a normal Tuesday looks like for you now that you're building this.",
  "Post the person you're most excited to help this week - and why.",
  "Post a lesson you learned the hard way in this business.",
  "Post your workspace setup for a call or Zoom meeting.",
  "Post the audio or podcast episode that changed how you think about this business.",
  "Post your notes from a call, webinar, or training you just got off of.",
  "Post the last message you sent inviting someone to look at the business.",
  "Post a picture of your first check, or what you're working toward with your next one.",
  "Post a stat from inside this app you're proud of.",
  "Post the moment someone told you 'no' and what you did next.",
  "Post a candid shot from your actual day - no staging, just real life while building this.",
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
