import type { PipelineStageKey, GoalMetric, GoalPeriod } from "./constants";

export type Profile = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  photo_url: string | null;
  hometown: string | null;
  background: string | null;
  favorite_audio_1: string | null;
  favorite_audio_2: string | null;
  favorite_audio_3: string | null;
  favorite_book_1: string | null;
  favorite_book_2: string | null;
  favorite_book_3: string | null;
  team_impact: string | null;
  profile_prompted: boolean;
  household_id: string | null;
  account_number: string | null;
  upline_id: string | null;
  onboarding_unlocked_through: number;
  created_at: string;
};

// What get_public_profile returns — only the fields meant to be shared,
// never email or anything private.
export type PublicProfile = {
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  photo_url: string | null;
  hometown: string | null;
  background: string | null;
  favorite_audio_1: string | null;
  favorite_audio_2: string | null;
  favorite_audio_3: string | null;
  favorite_book_1: string | null;
  favorite_book_2: string | null;
  favorite_book_3: string | null;
  team_impact: string | null;
  current_streak: number;
  longest_streak: number;
  last_read_what: string | null;
  last_read_amount: string | null;
  last_listen_what: string | null;
  last_listen_count: number | null;
};

export type NewMember = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  created_at: string;
};

export type Liker = {
  entry_key: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

export type GameLeaderEntry = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  best_score: number;
};

export type MilestoneEntry = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  milestone_days: number;
  current_streak: number;
};

export type TeamTotals = {
  team: string;
  member_count: number;
} & Record<PipelineStageKey, number>;

// Household-shareable leaderboard entries (everything except streaks)
// carry partner_* fields — non-null when this person has a linked
// spouse, so the Leaderboard can show and link to both profiles.
type WithPartner = {
  partner_user_id: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
};

export type IndividualLeaderEntry = {
  category: PipelineStageKey;
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  value: number;
  user_id: string;
} & WithPartner;

export type StreakLeaderboardEntry = {
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  streak_days: number;
  user_id: string;
};

export type Core300Entry = {
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  pv: number;
  user_id: string;
} & WithPartner;

export type ActiveCandidatesEntry = {
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  active_count: number;
  user_id: string;
} & WithPartner;

export type Qi1RhythmEntry = {
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  qi1: number;
  user_id: string;
} & WithPartner;

export type DittoEntry = {
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  day1_ditto_pv: number;
  user_id: string;
} & WithPartner;

export type MonthlyPv = {
  id: string;
  user_id: string;
  period_start: string;
  pv: number;
  day1_ditto_pv: number;
  updated_at: string;
};

export type CustomerSale = {
  id: string;
  user_id: string;
  period_start: string;
  description: string;
  notes: string;
  created_at: string;
};

export type PipelinePeriod = {
  id: string;
  user_id: string;
  period_type: "weekly" | "monthly";
  period_start: string;
  created_at: string;
  updated_at: string;
} & Record<PipelineStageKey, number>;

export type Candidate = {
  id: string;
  user_id: string;
  name: string;
  current_step: number;
  notes: string;
  connected_date: string;
  launched: boolean;
  filtered_out: boolean;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  user_id: string;
  name: string;
  category: "A" | "B";
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type StreakDay = {
  id: string;
  user_id: string;
  day: string;
  read: boolean;
  listen: boolean;
  daily_update: boolean;
  story_share: boolean;
  read_what: string;
  read_amount: string;
  listen_what: string;
  listen_count: number;
  listen_items: string[];
  story_shares: number;
  questions: number;
  yeses: number;
  meetings: number;
  meeting_items: string[];
  read_minutes: number;
  depth_texts: number;
};

export type Goal = {
  id: string;
  user_id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target: number;
  updated_at: string;
};

export type CalendarEvent = {
  id: string;
  user_id: string;
  creator_id: string;
  title: string;
  notes: string;
  event_at: string;
  candidate_id: string | null;
  scope: "private" | "downline";
  created_at: string;
};

export type AssistantMessage = {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  image_data?: string | null;
  created_at: string;
};
