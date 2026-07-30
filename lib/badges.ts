import type { BadgeMetrics } from "./types";

// A video-game-style achievement layer on top of numbers already
// tracked elsewhere in the app (Core Run Streak, Volume, Pipeline
// Tracker) plus one new self-reported counter (books finished, via
// book_completions - there's no other way to know someone actually
// read something, unlike audios which already track a daily count).
// The catalog lives here, not the database - supabase/schema.sql's
// get_badge_metrics() computes the raw numbers, user_badges just
// records which badge_key a real person has actually earned.
//
// metric/threshold drive automatic detection: earned once
// metrics[metric] >= threshold (or, for the one boolean metric,
// has_goals, once it's true - threshold 1 means "true" there).
// "Longest ever" rather than "current" for anything streak-shaped, so
// a badge earned once stays earned even after the underlying streak
// later resets - see get_badge_metrics()'s own comment for why.
export type BadgeDefinition = {
  key: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  metric: keyof BadgeMetrics;
  threshold: number;
};

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Core Run Streak
  { key: "core_run_10", category: "Core Run Streak", label: "10-Day Core Run", description: "Complete a 10-day Core Run Streak.", icon: "🔥", metric: "longest_core_run_streak", threshold: 10 },
  { key: "core_run_30", category: "Core Run Streak", label: "30-Day Core Run", description: "Complete a 30-day Core Run Streak.", icon: "🔥", metric: "longest_core_run_streak", threshold: 30 },
  { key: "core_run_60", category: "Core Run Streak", label: "60-Day Core Run", description: "Complete a 60-day Core Run Streak.", icon: "🔥", metric: "longest_core_run_streak", threshold: 60 },
  { key: "core_run_90", category: "Core Run Streak", label: "90-Day Core Run", description: "Complete a 90-day Core Run Streak.", icon: "🔥", metric: "longest_core_run_streak", threshold: 90 },
  { key: "core_run_365", category: "Core Run Streak", label: "1-Year Core Run", description: "Complete a full year of Core Run Streak.", icon: "👑", metric: "longest_core_run_streak", threshold: 365 },

  // Monthly PV
  { key: "pv_150", category: "Monthly PV", label: "150 PV", description: "Hit 150+ PV in a single month.", icon: "💰", metric: "max_monthly_pv", threshold: 150 },
  { key: "pv_300", category: "Monthly PV", label: "Core 300", description: "Hit 300+ PV in a single month.", icon: "💰", metric: "max_monthly_pv", threshold: 300 },
  { key: "pv_600", category: "Monthly PV", label: "600 PV", description: "Hit 600+ PV in a single month.", icon: "💰", metric: "max_monthly_pv", threshold: 600 },
  { key: "pv_1000", category: "Monthly PV", label: "1000 PV", description: "Hit 1000+ PV in a single month.", icon: "💎", metric: "max_monthly_pv", threshold: 1000 },

  // Day 1 Ditto PV
  { key: "ditto_100", category: "Day 1 Ditto", label: "100 PV Ditto", description: "Hit 100+ PV on Day 1 Ditto in a single month.", icon: "📦", metric: "max_day1_ditto_pv", threshold: 100 },
  { key: "ditto_150", category: "Day 1 Ditto", label: "150 PV Ditto", description: "Hit 150+ PV on Day 1 Ditto in a single month.", icon: "📦", metric: "max_day1_ditto_pv", threshold: 150 },
  { key: "ditto_300", category: "Day 1 Ditto", label: "300 PV Ditto", description: "Hit 300+ PV on Day 1 Ditto in a single month.", icon: "📦", metric: "max_day1_ditto_pv", threshold: 300 },

  // Ditto Streak (consecutive months)
  { key: "ditto_streak_3", category: "Ditto Streak", label: "3 Months of Ditto", description: "100+ PV Day 1 Ditto, 3 months in a row.", icon: "🎯", metric: "longest_ditto_streak", threshold: 3 },
  { key: "ditto_streak_6", category: "Ditto Streak", label: "6 Months of Ditto", description: "100+ PV Day 1 Ditto, 6 months in a row.", icon: "🎯", metric: "longest_ditto_streak", threshold: 6 },
  { key: "ditto_streak_12", category: "Ditto Streak", label: "1 Year of Ditto", description: "100+ PV Day 1 Ditto, a full year in a row.", icon: "👑", metric: "longest_ditto_streak", threshold: 12 },

  // Core 300 Streak (consecutive months)
  { key: "core300_streak_3", category: "Core 300 Streak", label: "3 Months of Core 300", description: "300+ PV, 3 months in a row.", icon: "🏆", metric: "longest_core300_streak", threshold: 3 },
  { key: "core300_streak_6", category: "Core 300 Streak", label: "6 Months of Core 300", description: "300+ PV, 6 months in a row.", icon: "🏆", metric: "longest_core300_streak", threshold: 6 },
  { key: "core300_streak_12", category: "Core 300 Streak", label: "1 Year of Core 300", description: "300+ PV, a full year in a row.", icon: "👑", metric: "longest_core300_streak", threshold: 12 },

  // Audios in a Day
  { key: "audios_day_5", category: "Audios", label: "5 Audios in a Day", description: "Listen to 5 or more audios in one day.", icon: "🎧", metric: "max_audios_day", threshold: 5 },
  { key: "audios_day_10", category: "Audios", label: "10 Audios in a Day", description: "Listen to 10 or more audios in one day.", icon: "🎧", metric: "max_audios_day", threshold: 10 },

  // Audio Streak
  { key: "audios_week_streak", category: "Audios", label: "A Week of Audios", description: "5 or more audios a day, 7 days in a row.", icon: "🎧", metric: "longest_audio_streak", threshold: 7 },

  // Books in a Year
  { key: "books_10", category: "Books", label: "10 Books", description: "Finish 10 books in a year.", icon: "📚", metric: "max_books_in_a_year", threshold: 10 },
  { key: "books_20", category: "Books", label: "20 Books", description: "Finish 20 books in a year.", icon: "📚", metric: "max_books_in_a_year", threshold: 20 },
  { key: "books_30", category: "Books", label: "30 Books", description: "Finish 30 books in a year.", icon: "📚", metric: "max_books_in_a_year", threshold: 30 },
  { key: "books_40", category: "Books", label: "40 Books", description: "Finish 40 books in a year.", icon: "📚", metric: "max_books_in_a_year", threshold: 40 },
  { key: "books_50", category: "Books", label: "50 Books", description: "Finish 50 books in a year.", icon: "👑", metric: "max_books_in_a_year", threshold: 50 },

  // Questions in a Day
  { key: "questions_day_5", category: "Questions", label: "5 Questions in a Day", description: "Ask the question 5 times in one day.", icon: "💬", metric: "max_questions_day", threshold: 5 },
  { key: "questions_day_10", category: "Questions", label: "10 Questions in a Day", description: "Ask the question 10 times in one day.", icon: "💬", metric: "max_questions_day", threshold: 10 },
  { key: "questions_day_15", category: "Questions", label: "15 Questions in a Day", description: "Ask the question 15 times in one day.", icon: "💬", metric: "max_questions_day", threshold: 15 },
  { key: "questions_day_20", category: "Questions", label: "20 Questions in a Day", description: "Ask the question 20 times in one day.", icon: "💬", metric: "max_questions_day", threshold: 20 },

  // Questions in a Week
  { key: "questions_week_25", category: "Questions", label: "25 Questions in a Week", description: "Ask the question 25 times in one week.", icon: "💬", metric: "max_questions_week", threshold: 25 },
  { key: "questions_week_30", category: "Questions", label: "30 Questions in a Week", description: "Ask the question 30 times in one week.", icon: "💬", metric: "max_questions_week", threshold: 30 },

  // Yeses in a Day
  { key: "yeses_day_2", category: "Yeses", label: "2 Yeses in a Day", description: "Get 2 yeses in one day.", icon: "✅", metric: "max_yeses_day", threshold: 2 },
  { key: "yeses_day_5", category: "Yeses", label: "5 Yeses in a Day", description: "Get 5 yeses in one day.", icon: "✅", metric: "max_yeses_day", threshold: 5 },
  { key: "yeses_day_10", category: "Yeses", label: "10 Yeses in a Day", description: "Get 10 yeses in one day.", icon: "✅", metric: "max_yeses_day", threshold: 10 },

  // Yeses in a Week
  { key: "yeses_week_10", category: "Yeses", label: "10 Yeses in a Week", description: "Get 10 yeses in one week.", icon: "✅", metric: "max_yeses_week", threshold: 10 },
  { key: "yeses_week_15", category: "Yeses", label: "15 Yeses in a Week", description: "Get 15 yeses in one week.", icon: "✅", metric: "max_yeses_week", threshold: 15 },
  { key: "yeses_week_20", category: "Yeses", label: "20 Yeses in a Week", description: "Get 20 yeses in one week.", icon: "✅", metric: "max_yeses_week", threshold: 20 },
  { key: "yeses_week_25", category: "Yeses", label: "25 Yeses in a Week", description: "Get 25 yeses in one week.", icon: "✅", metric: "max_yeses_week", threshold: 25 },
  { key: "yeses_week_30", category: "Yeses", label: "30 Yeses in a Week", description: "Get 30 yeses in one week.", icon: "👑", metric: "max_yeses_week", threshold: 30 },

  // Goals
  { key: "goals_filled_out", category: "Goals", label: "Goals Set", description: "Fill out your goals.", icon: "🎯", metric: "has_goals", threshold: 1 },

  // QI1s in a Week (a badge for every number, 2 through 10)
  { key: "qi1_week_2", category: "QI1s (Weekly)", label: "2 QI1s in a Week", description: "Show 2 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 2 },
  { key: "qi1_week_3", category: "QI1s (Weekly)", label: "3 QI1s in a Week", description: "Show 3 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 3 },
  { key: "qi1_week_4", category: "QI1s (Weekly)", label: "4 QI1s in a Week", description: "Show 4 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 4 },
  { key: "qi1_week_5", category: "QI1s (Weekly)", label: "5 QI1s in a Week", description: "Show 5 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 5 },
  { key: "qi1_week_6", category: "QI1s (Weekly)", label: "6 QI1s in a Week", description: "Show 6 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 6 },
  { key: "qi1_week_7", category: "QI1s (Weekly)", label: "7 QI1s in a Week", description: "Show 7 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 7 },
  { key: "qi1_week_8", category: "QI1s (Weekly)", label: "8 QI1s in a Week", description: "Show 8 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 8 },
  { key: "qi1_week_9", category: "QI1s (Weekly)", label: "9 QI1s in a Week", description: "Show 9 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 9 },
  { key: "qi1_week_10", category: "QI1s (Weekly)", label: "10 QI1s in a Week", description: "Show 10 QI1s in a week.", icon: "👑", metric: "max_qi1_week", threshold: 10 },

  // QI1s in a Month
  { key: "qi1_month_8", category: "QI1s (Monthly)", label: "8 QI1s in a Month", description: "Show 8 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 8 },
  { key: "qi1_month_10", category: "QI1s (Monthly)", label: "10 QI1s in a Month", description: "Show 10 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 10 },
  { key: "qi1_month_15", category: "QI1s (Monthly)", label: "15 QI1s in a Month", description: "Show 15 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 15 },
  { key: "qi1_month_20", category: "QI1s (Monthly)", label: "20 QI1s in a Month", description: "Show 20 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 20 },
  { key: "qi1_month_25", category: "QI1s (Monthly)", label: "25 QI1s in a Month", description: "Show 25 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 25 },
  { key: "qi1_month_30", category: "QI1s (Monthly)", label: "30 QI1s in a Month", description: "Show 30 QI1s in a month.", icon: "👑", metric: "max_qi1_month", threshold: 30 },
];

export const BADGE_CATEGORIES: string[] = Array.from(new Set(BADGE_DEFINITIONS.map((b) => b.category)));

function metricValue(metrics: BadgeMetrics, key: keyof BadgeMetrics): number {
  const raw = metrics[key];
  return typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
}

export function isBadgeEarned(def: BadgeDefinition, metrics: BadgeMetrics): boolean {
  return metricValue(metrics, def.metric) >= def.threshold;
}

// For an unearned badge, how close the current metric is to its
// threshold (0-1) - drives a progress bar on the Badges tab so it
// feels like a video game ("you're at 23/30") rather than just
// locked/unlocked.
export function badgeProgress(def: BadgeDefinition, metrics: BadgeMetrics): number {
  const value = metricValue(metrics, def.metric);
  if (def.threshold <= 0) return value > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, value / def.threshold));
}
