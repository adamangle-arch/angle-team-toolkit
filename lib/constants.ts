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

// Candidate Roadmap: ordered steps with homework due at each step
export const CANDIDATE_STEPS: { label: string; homework: string }[] = [
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

// Call Log: call types
export const CALL_TYPES = ["QI1", "QI2", "IS1", "FU1", "IS2", "FU2", "Offer Call"] as const;

// First 30 Days: fixed categories (tasks come from the DB, seeded by schema.sql)
export const CHECKLIST_CATEGORIES = [
  "Build Your List",
  "Upline Communication",
  "Attend Events",
  "Listen & Read",
  "Try the Products",
] as const;

// Recognition Log: win types
export const RECOGNITION_TYPES = [
  "Launched",
  "Rank Advance",
  "First Customer",
  "First QI2",
  "Hit Core 300",
  "Other",
] as const;
