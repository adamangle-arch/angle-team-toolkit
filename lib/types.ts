import type { PipelineStageKey } from "./constants";

export type Profile = {
  id: string;
  email: string;
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

export type RecognitionEntry = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  event_date: string;
  note: string;
  created_at: string;
};

export type Goals = {
  user_id: string;
  vision: string;
  updated_at: string;
};

export type QuarterlyGoal = {
  id: string;
  user_id: string;
  quarter: string;
  text: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
};
