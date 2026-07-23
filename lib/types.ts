import type { PipelineStageKey } from "./constants";

export type PipelinePeriod = {
  id: string;
  period_type: "weekly" | "monthly";
  period_start: string;
  created_at: string;
  updated_at: string;
} & Record<PipelineStageKey, number>;

export type Candidate = {
  id: string;
  name: string;
  current_step: number;
  notes: string;
  launched: boolean;
  created_at: string;
  updated_at: string;
};

export type ChecklistSettings = {
  id: number;
  start_date: string;
};

export type ChecklistTask = {
  id: string;
  category: string;
  task_key: string;
  label: string;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
};

export type Contact = {
  id: string;
  name: string;
  category: "A" | "B";
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type CallLogEntry = {
  id: string;
  candidate_name: string;
  call_type: string;
  score: number;
  notes: string;
  created_at: string;
};

export type StreakDay = {
  id: string;
  day: string;
  read: boolean;
  listen: boolean;
  associate: boolean;
  events: boolean;
};

export type RecognitionEntry = {
  id: string;
  name: string;
  type: string;
  event_date: string;
  note: string;
  created_at: string;
};

export type Goals = {
  id: number;
  vision: string;
  updated_at: string;
};

export type QuarterlyGoal = {
  id: string;
  quarter: string;
  text: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
};
