import type { PipelineStageKey } from "./constants";

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
};

export type TeamTotals = {
  team: string;
  member_count: number;
} & Record<PipelineStageKey, number>;

export type IndividualLeaderEntry = {
  category: PipelineStageKey;
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  value: number;
  user_id: string;
};

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
};

export type ActiveCandidatesEntry = {
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  active_count: number;
  user_id: string;
};

export type Qi1RhythmEntry = {
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  qi1: number;
  user_id: string;
};

export type DittoEntry = {
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  day1_ditto_pv: number;
  user_id: string;
};

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
};

export type AssistantMessage = {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  image_data?: string | null;
  created_at: string;
};
