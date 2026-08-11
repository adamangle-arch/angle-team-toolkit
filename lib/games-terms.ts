// Shared word pool for Word Scramble and Term of the Day - real
// vocabulary already used elsewhere in the app (pipeline stages, pin
// titles referenced in Leaders/Audios content, core program terms)
// rather than invented jargon, so a rep already recognizes every word.
export const GAME_TERMS: string[] = [
  "DIAMOND",
  "PLATINUM",
  "EMERALD",
  "RUBY",
  "PIPELINE",
  "QUESTIONNAIRE",
  "LEADERSHIP",
  "MENTOR",
  "STREAK",
  "LAUNCH",
  "PROSPECT",
  "CANDIDATE",
  "GOALS",
  "VOLUME",
  "BADGE",
  "DITTO",
  "MOMENTUM",
  "GRATITUDE",
  "COURAGE",
  "CONSISTENCY",
  "BELIEF",
  "VISION",
];

// Term of the Day is a fixed 5-letter Wordle-style board, so it draws from
// its own pool instead of GAME_TERMS (which has mixed lengths for Word
// Scramble). Each word ships with a short clue for the optional hint.
export const TERM_OF_DAY_WORDS: { word: string; hint: string }[] = [
  { word: "BADGE", hint: "You earn these for hitting milestones in the app." },
  { word: "GOALS", hint: "What you set at the start of a Core Run." },
  { word: "DITTO", hint: "What you say when someone already said what you were thinking." },
  { word: "TITLE", hint: "Diamond, Platinum, Emerald are all examples of one." },
  { word: "TEAMS", hint: "Your organization, plural." },
  { word: "LEADS", hint: "Prospects before they become candidates." },
  { word: "RANKS", hint: "Where you land on the pin levels." },
  { word: "CALLS", hint: "What you rate after talking with a candidate." },
  { word: "AWARD", hint: "Something worth logging on Recognition." },
  { word: "TRUST", hint: "What you build before someone joins your team." },
  { word: "VALUE", hint: "What you show a candidate before the pitch." },
  { word: "FOCUS", hint: "What a Core Run helps you keep." },
  { word: "MEDIA", hint: "The other app where some of the removed audios live." },
  { word: "SHARE", hint: "What you do with the business opportunity." },
  { word: "SPARK", hint: "What a great story creates in a candidate." },
  { word: "REACH", hint: "How far your network extends." },
  { word: "BONUS", hint: "Extra reward for hitting volume." },
  { word: "STAGE", hint: "Where you are on the Candidate Roadmap." },
  { word: "STORY", hint: "What you tell to build credibility." },
  { word: "VOICE", hint: "What you use on a call, not a text." },
];
