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

  // Contacts
  { key: "master_lister", category: "Contacts", label: "Master Lister", description: "Have 100 names on your A/B list.", icon: "📇", metric: "max_ab_contacts", threshold: 100 },
  { key: "list_refresh", category: "Contacts", label: "List Refresh", description: "Add 25 new names to your A/B list in a month.", icon: "📇", metric: "max_contacts_added_month", threshold: 25 },

  // Customers
  { key: "first_sale", category: "Customers", label: "First Sale", description: "Log your first customer sale.", icon: "🛍️", metric: "total_customer_sales", threshold: 1 },
  { key: "customer_builder", category: "Customers", label: "Customer Builder", description: "Log 10 customer sales.", icon: "🛍️", metric: "total_customer_sales", threshold: 10 },
  { key: "customer_champion", category: "Customers", label: "Customer Champion", description: "Log 25 customer sales.", icon: "🛍️", metric: "total_customer_sales", threshold: 25 },
  { key: "big_ticket", category: "Customers", label: "Big Ticket", description: "Log a single sale of 100+ PV.", icon: "💵", metric: "max_single_sale_pv", threshold: 100 },
  { key: "sales_month", category: "Customers", label: "Sales Month", description: "300+ PV in customer sales in one month.", icon: "💵", metric: "max_sales_month_pv", threshold: 300 },

  // Pipeline Beyond QI1
  { key: "is1_regular", category: "Pipeline Beyond QI1", label: "IS1 Regular", description: "5 IS1s in a month.", icon: "🗓️", metric: "max_is1_month", threshold: 5 },
  { key: "is2_regular", category: "Pipeline Beyond QI1", label: "IS2 Regular", description: "5 IS2s in a month.", icon: "🗓️", metric: "max_is2_month", threshold: 5 },
  { key: "fu1_finisher", category: "Pipeline Beyond QI1", label: "FU1 Finisher", description: "10 FU1s in a month.", icon: "✔️", metric: "max_fu1_month", threshold: 10 },
  { key: "fu1_finisher_team", category: "Pipeline Beyond QI1", label: "FU1 Finisher (Team)", description: "10 FU1s in a month, you and your downline combined.", icon: "✔️", metric: "max_fu1_month_team", threshold: 10 },
  { key: "fu2_finisher", category: "Pipeline Beyond QI1", label: "FU2 Finisher", description: "10 FU2s in a month.", icon: "✔️", metric: "max_fu2_month", threshold: 10 },
  { key: "fu2_finisher_team", category: "Pipeline Beyond QI1", label: "FU2 Finisher (Team)", description: "10 FU2s in a month, you and your downline combined.", icon: "✔️", metric: "max_fu2_month_team", threshold: 10 },

  // Launches
  { key: "first_launch", category: "Launches", label: "First Launch", description: "Launch your first team member.", icon: "🚀", metric: "total_launches", threshold: 1 },
  { key: "launch_streak", category: "Launches", label: "Launch Streak", description: "Launch someone 3 months in a row.", icon: "🚀", metric: "longest_launch_streak", threshold: 3 },
  { key: "team_builder", category: "Launches", label: "Team Builder", description: "5 total launches, you and your downline combined.", icon: "🚀", metric: "total_launches_team", threshold: 5 },
  { key: "team_builder_pro", category: "Launches", label: "Team Builder Pro", description: "10 total launches, you and your downline combined.", icon: "🚀", metric: "total_launches_team", threshold: 10 },
  { key: "team_builder_elite", category: "Launches", label: "Team Builder Elite", description: "25 total launches, you and your downline combined.", icon: "👑", metric: "total_launches_team", threshold: 25 },

  // Speed
  { key: "fast_starter", category: "Speed", label: "Fast Starter", description: "Launch a team member within 30 days of their Yes.", icon: "⚡", metric: "has_fast_launch", threshold: 1 },

  // Consistency
  { key: "perfect_week", category: "Consistency", label: "Perfect Week", description: "Every Core Run component, 7 days straight.", icon: "🔥", metric: "longest_core_run_streak", threshold: 7 },
  { key: "perfect_month", category: "Consistency", label: "Perfect Month", description: "Core Run every single day of a calendar month.", icon: "🌕", metric: "has_perfect_month", threshold: 1 },
  { key: "comeback_kid", category: "Consistency", label: "Comeback Kid", description: "Rebuild a 10+ day Core Run Streak after breaking one.", icon: "💪", metric: "core_run_streak_count_10plus", threshold: 2 },

  // Calendar & Meetings
  { key: "meeting_machine", category: "Calendar & Meetings", label: "Meeting Machine", description: "10 meetings in a week.", icon: "📅", metric: "max_meetings_week", threshold: 10 },
  { key: "booked_solid", category: "Calendar & Meetings", label: "Booked Solid", description: "20 meetings in a month.", icon: "📅", metric: "max_meetings_month", threshold: 20 },

  // Team Culture
  { key: "team_regular", category: "Team Culture", label: "Team Regular", description: "Attend 5 different Team Events.", icon: "📸", metric: "team_events_attended", threshold: 5 },

  // Household
  { key: "better_together", category: "Household", label: "Better Together", description: "Link your spouse's account.", icon: "💑", metric: "has_spouse_linked", threshold: 1 },

  // Growing Others
  { key: "fast_learner", category: "Growing Others", label: "Fast Learner", description: "Finish all 5 Onboarding sessions within 60 days of signing up.", icon: "🎓", metric: "has_fast_onboarding", threshold: 1 },

  // Meta / Combo
  { key: "triple_threat", category: "Meta / Combo", label: "Triple Threat", description: "Core 300 + 100 PV Ditto + a full month of Core Run, same month.", icon: "🎖️", metric: "has_triple_threat", threshold: 1 },
  { key: "grand_slam", category: "Meta / Combo", label: "Grand Slam", description: "Earn 10 badges total.", icon: "🎖️", metric: "total_badges_earned", threshold: 10 },
  { key: "half_century", category: "Meta / Combo", label: "Half Century", description: "Earn 25 badges total.", icon: "🎖️", metric: "total_badges_earned", threshold: 25 },
  { key: "century_club", category: "Meta / Combo", label: "Century Club", description: "Earn 50 badges total.", icon: "👑", metric: "total_badges_earned", threshold: 50 },

  // Longevity
  { key: "twelve_for_twelve", category: "Longevity", label: "Twelve for Twelve", description: "Hit Core 300 in 12 different calendar months, lifetime.", icon: "📆", metric: "distinct_core300_months", threshold: 12 },

  // Games
  { key: "high_scorer", category: "Games", label: "High Scorer", description: "Beat your own Diamond Run high score 5 times.", icon: "🎮", metric: "times_improved", threshold: 5 },
  { key: "trivia_streak", category: "Games", label: "Trivia Streak", description: "7-day Trivia streak.", icon: "🧠", metric: "longest_trivia_streak", threshold: 7 },
  { key: "trivia_master", category: "Games", label: "Trivia Master", description: "30-day Trivia streak.", icon: "🧠", metric: "longest_trivia_streak", threshold: 30 },

  // Wildcard
  { key: "weekend_warrior", category: "Wildcard", label: "Weekend Warrior", description: "Log meetings on both Saturday and Sunday, same weekend.", icon: "🏖️", metric: "has_weekend_warrior", threshold: 1 },
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
