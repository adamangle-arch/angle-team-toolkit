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
//
// Two badges (Full Spectrum, Perfectionist) can't be a raw number from
// get_badge_metrics() - they're a property of the catalog itself
// (category coverage) crossed with the earned-badge set, both of which
// only exist client-side. `special` marks these instead of
// `metric`/`threshold`; isBadgeEarned/badgeProgress below handle them
// separately, and lib/badgeEngine.ts evaluates them against the
// "as of this pass" earned-key set so they can trigger the same pass
// the last badge they need lands.
export type MetricBadgeDefinition = {
  key: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  metric: keyof BadgeMetrics;
  threshold: number;
};

export type MetaBadgeDefinition = {
  key: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  special: "full_spectrum" | "perfectionist";
};

export type BadgeDefinition = MetricBadgeDefinition | MetaBadgeDefinition;

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
  { key: "customer_survey_completed", category: "Customers", label: "Customer Survey", description: "Complete a customer survey.", icon: "📋", metric: "has_customer_survey", threshold: 1 },

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

  // Business Structure (a "leg" is a first-level recruit's entire line -
  // a linked spouse pair recruited directly counts as one leg, though
  // each spouse still counts individually toward total people)
  { key: "legs_3", category: "Business Structure", label: "3 Legs", description: "Have 3 different legs in your organization.", icon: "🌳", metric: "leg_count", threshold: 3 },
  { key: "legs_6", category: "Business Structure", label: "6 Legs", description: "Have 6 different legs in your organization.", icon: "🌳", metric: "leg_count", threshold: 6 },
  { key: "legs_12", category: "Business Structure", label: "12 Legs", description: "Have 12 different legs in your organization.", icon: "🌳", metric: "leg_count", threshold: 12 },
  { key: "legs_15", category: "Business Structure", label: "15 Legs", description: "Have 15 different legs in your organization.", icon: "🌳", metric: "leg_count", threshold: 15 },
  { key: "legs_20", category: "Business Structure", label: "20 Legs", description: "Have 20 different legs in your organization.", icon: "👑", metric: "leg_count", threshold: 20 },
  { key: "org_combo_3_10", category: "Business Structure", label: "3 Legs, 10 People", description: "3 legs and 10 total people in your organization.", icon: "🏢", metric: "has_org_combo_3_10", threshold: 1 },
  { key: "org_combo_6_25", category: "Business Structure", label: "6 Legs, 25 People", description: "6 legs and 25 total people in your organization.", icon: "🏢", metric: "has_org_combo_6_25", threshold: 1 },
  { key: "org_combo_6_50", category: "Business Structure", label: "6 Legs, 50 People", description: "6 legs and 50 total people in your organization.", icon: "🏢", metric: "has_org_combo_6_50", threshold: 1 },
  { key: "org_combo_9_75", category: "Business Structure", label: "9 Legs, 75 People", description: "9 legs and 75 total people in your organization.", icon: "🏢", metric: "has_org_combo_9_75", threshold: 1 },
  { key: "org_combo_12_100", category: "Business Structure", label: "12 Legs, 100 People", description: "12 legs and 100 total people in your organization.", icon: "👑", metric: "has_org_combo_12_100", threshold: 1 },

  // Legs with Volume (how many different legs are producing PV this month)
  { key: "legs_volume_3", category: "Legs with Volume", label: "3 Legs with Volume", description: "3 different legs producing volume this month.", icon: "💧", metric: "legs_with_volume", threshold: 3 },
  { key: "legs_volume_6", category: "Legs with Volume", label: "6 Legs with Volume", description: "6 different legs producing volume this month.", icon: "💧", metric: "legs_with_volume", threshold: 6 },
  { key: "legs_volume_12", category: "Legs with Volume", label: "12 Legs with Volume", description: "12 different legs producing volume this month.", icon: "💧", metric: "legs_with_volume", threshold: 12 },
  { key: "legs_volume_15", category: "Legs with Volume", label: "15 Legs with Volume", description: "15 different legs producing volume this month.", icon: "💧", metric: "legs_with_volume", threshold: 15 },
  { key: "legs_volume_20", category: "Legs with Volume", label: "20 Legs with Volume", description: "20 different legs producing volume this month.", icon: "👑", metric: "legs_with_volume", threshold: 20 },

  // Legs on Core Run (how many different legs have someone currently on a Core Run Streak)
  { key: "legs_core_run_3", category: "Legs on Core Run", label: "3 Legs on Core Run", description: "3 different legs with someone currently on a Core Run Streak.", icon: "🔥", metric: "legs_on_core_run", threshold: 3 },
  { key: "legs_core_run_6", category: "Legs on Core Run", label: "6 Legs on Core Run", description: "6 different legs with someone currently on a Core Run Streak.", icon: "🔥", metric: "legs_on_core_run", threshold: 6 },
  { key: "legs_core_run_12", category: "Legs on Core Run", label: "12 Legs on Core Run", description: "12 different legs with someone currently on a Core Run Streak.", icon: "🔥", metric: "legs_on_core_run", threshold: 12 },
  { key: "legs_core_run_15", category: "Legs on Core Run", label: "15 Legs on Core Run", description: "15 different legs with someone currently on a Core Run Streak.", icon: "🔥", metric: "legs_on_core_run", threshold: 15 },
  { key: "legs_core_run_20", category: "Legs on Core Run", label: "20 Legs on Core Run", description: "20 different legs with someone currently on a Core Run Streak.", icon: "👑", metric: "legs_on_core_run", threshold: 20 },

  // Legs Taking Action (how many different legs logged any pipeline activity this month)
  { key: "legs_action_3", category: "Legs Taking Action", label: "3 Legs Taking Action", description: "3 different legs with someone taking action this month.", icon: "⚡", metric: "legs_taking_action", threshold: 3 },
  { key: "legs_action_6", category: "Legs Taking Action", label: "6 Legs Taking Action", description: "6 different legs with someone taking action this month.", icon: "⚡", metric: "legs_taking_action", threshold: 6 },
  { key: "legs_action_12", category: "Legs Taking Action", label: "12 Legs Taking Action", description: "12 different legs with someone taking action this month.", icon: "⚡", metric: "legs_taking_action", threshold: 12 },
  { key: "legs_action_15", category: "Legs Taking Action", label: "15 Legs Taking Action", description: "15 different legs with someone taking action this month.", icon: "⚡", metric: "legs_taking_action", threshold: 15 },
  { key: "legs_action_20", category: "Legs Taking Action", label: "20 Legs Taking Action", description: "20 different legs with someone taking action this month.", icon: "👑", metric: "legs_taking_action", threshold: 20 },

  // Training & Events
  { key: "weekly_training_attended", category: "Training & Events", label: "Weekly Training", description: "Attend a weekly training.", icon: "🎓", metric: "has_weekly_training", threshold: 1 },
  { key: "monthly_masterclass_attended", category: "Training & Events", label: "Monthly Masterclass", description: "Attend a monthly masterclass.", icon: "🎓", metric: "has_monthly_masterclass", threshold: 1 },
  { key: "quarterly_conference_attended", category: "Training & Events", label: "Quarterly Conference", description: "Attend a quarterly conference.", icon: "🎪", metric: "has_quarterly_conference", threshold: 1 },

  // Sample Bags
  { key: "sample_bags_5", category: "Sample Bags", label: "5 Sample Bags", description: "Give out 5 sample bags.", icon: "🎁", metric: "sample_bags_given", threshold: 5 },
  { key: "sample_bags_10", category: "Sample Bags", label: "10 Sample Bags", description: "Give out 10 sample bags.", icon: "🎁", metric: "sample_bags_given", threshold: 10 },
  { key: "sample_bags_15", category: "Sample Bags", label: "15 Sample Bags", description: "Give out 15 sample bags.", icon: "🎁", metric: "sample_bags_given", threshold: 15 },
  { key: "sample_bags_20", category: "Sample Bags", label: "20 Sample Bags", description: "Give out 20 sample bags.", icon: "🎁", metric: "sample_bags_given", threshold: 20 },
  { key: "sample_bags_25", category: "Sample Bags", label: "25 Sample Bags", description: "Give out 25 sample bags.", icon: "👑", metric: "sample_bags_given", threshold: 25 },

  // AI Chat Practice
  { key: "grade_meeting_5", category: "AI Chat Practice", label: "Grade 5 Meetings", description: "Grade 5 meetings on the AI chat.", icon: "📞", metric: "call_ratings_count", threshold: 5 },
  { key: "grade_meeting_10", category: "AI Chat Practice", label: "Grade 10 Meetings", description: "Grade 10 meetings on the AI chat.", icon: "📞", metric: "call_ratings_count", threshold: 10 },
  { key: "grade_meeting_15", category: "AI Chat Practice", label: "Grade 15 Meetings", description: "Grade 15 meetings on the AI chat.", icon: "📞", metric: "call_ratings_count", threshold: 15 },
  { key: "grade_meeting_20", category: "AI Chat Practice", label: "Grade 20 Meetings", description: "Grade 20 meetings on the AI chat.", icon: "👑", metric: "call_ratings_count", threshold: 20 },
  { key: "story_practiced", category: "AI Chat Practice", label: "Story Practice", description: "Practice sharing your story with the AI chat.", icon: "📖", metric: "has_story_practiced", threshold: 1 },

  // App Habits
  { key: "daily_visitor", category: "App Habits", label: "Daily Visitor", description: "Open the app 30 days in a row.", icon: "📱", metric: "app_opened_streak", threshold: 30 },
  { key: "profile_complete", category: "App Habits", label: "Profile Complete", description: "Fill out every optional profile field.", icon: "📝", metric: "has_profile_complete", threshold: 1 },
  { key: "note_taker", category: "App Habits", label: "Note Taker", description: "Add notes to 10 different candidates.", icon: "🗒️", metric: "note_taker_count", threshold: 10 },

  // Depth & Duplication (going deeper than "legs," not just wider)
  { key: "third_generation", category: "Depth & Duplication", label: "Third Generation", description: "Have someone 3 levels deep in your downline.", icon: "🌲", metric: "max_downline_depth", threshold: 3 },
  { key: "fourth_generation", category: "Depth & Duplication", label: "Fourth Generation", description: "Have someone 4 levels deep in your downline.", icon: "🌲", metric: "max_downline_depth", threshold: 4 },
  { key: "fifth_generation", category: "Depth & Duplication", label: "Fifth Generation", description: "Have someone 5 levels deep in your downline.", icon: "👑", metric: "max_downline_depth", threshold: 5 },
  { key: "duplication_nation", category: "Depth & Duplication", label: "Duplication Nation", description: "3 different legs each have 3+ legs of their own.", icon: "🌲", metric: "has_duplication_nation", threshold: 1 },

  // Leadership & Recognition
  { key: "mentor", category: "Leadership & Recognition", label: "Mentor", description: "A downline member earns their own First Launch badge.", icon: "🎓", metric: "has_mentor", threshold: 1 },
  { key: "multiplier", category: "Leadership & Recognition", label: "Multiplier", description: "2 different downline members earn First Launch in the same month.", icon: "🎓", metric: "has_multiplier", threshold: 1 },
  { key: "shoutout", category: "Leadership & Recognition", label: "Shoutout", description: "Get liked 10 times on the Leaderboard.", icon: "👍", metric: "times_liked_received", threshold: 10 },
  { key: "fan_favorite", category: "Leadership & Recognition", label: "Fan Favorite", description: "Get liked 50 times on the Leaderboard.", icon: "👍", metric: "times_liked_received", threshold: 50 },
  { key: "cheerleader", category: "Leadership & Recognition", label: "Cheerleader", description: "Like 25 different Leaderboard entries yourself.", icon: "📣", metric: "likes_given", threshold: 25 },
  { key: "encourager", category: "Leadership & Recognition", label: "Encourager", description: "Like 100 different Leaderboard entries yourself.", icon: "📣", metric: "likes_given", threshold: 100 },

  // Data Hygiene
  { key: "learning_from_no", category: "Data Hygiene", label: "Learning from No", description: "Mark 10 candidates Filtered Out.", icon: "🧹", metric: "filtered_out_count", threshold: 10 },
  { key: "organized", category: "Data Hygiene", label: "Organized", description: "Every active candidate has notes filled in.", icon: "🧹", metric: "has_organized_pipeline", threshold: 1 },

  // Timing
  { key: "new_year_new_you", category: "Timing", label: "New Year New You", description: "Hit Core 300 in January.", icon: "🎉", metric: "has_new_year_core300", threshold: 1 },
  { key: "summer_push", category: "Timing", label: "Summer Push", description: "Hit Core 300 in June, July, and August of the same year.", icon: "☀️", metric: "has_summer_core300", threshold: 1 },

  // Referral Chains
  { key: "pay_it_forward", category: "Referral Chains", label: "Pay It Forward", description: "Someone you personally launched later launches their own first person.", icon: "🔗", metric: "has_pay_it_forward", threshold: 1 },
  { key: "chain_reaction", category: "Referral Chains", label: "Chain Reaction", description: "3 generations deep all launch someone in the same quarter.", icon: "🔗", metric: "has_chain_reaction", threshold: 1 },
  { key: "second_generation_growth", category: "Referral Chains", label: "Second Generation Growth", description: "Your downline's downline reaches 10 people.", icon: "🔗", metric: "second_gen_or_deeper_count", threshold: 10 },

  // Customers (lifetime/yearly totals)
  { key: "half_grand", category: "Customers", label: "Half Grand", description: "Log 500 lifetime customer sales.", icon: "💰", metric: "total_customer_sales", threshold: 500 },
  { key: "grand_total", category: "Customers", label: "Grand Total", description: "Log 1,000 lifetime customer sales.", icon: "👑", metric: "total_customer_sales", threshold: 1000 },
  { key: "century_of_sales", category: "Customers", label: "Century of Sales", description: "Log 100 customer sales in a single year.", icon: "💰", metric: "max_sales_year_count", threshold: 100 },

  // Team Culture
  { key: "resource_sharer", category: "Team Culture", label: "Resource Sharer", description: "Send a resource to 10 different candidates or team members.", icon: "📤", metric: "resource_recipients_count", threshold: 10 },

  // Support
  { key: "good_neighbor", category: "Support", label: "Good Neighbor", description: "Fill in pipeline numbers for a downline member on 5 different days.", icon: "🤝", metric: "good_neighbor_days", threshold: 5 },

  // Meta / Combo
  { key: "iron_streaker", category: "Meta / Combo", label: "Iron Streaker", description: "Earn every Core Run Streak milestone badge (10/30/60/90/365 days).", icon: "🔥", metric: "has_iron_streaker", threshold: 1 },
  { key: "full_spectrum", category: "Meta / Combo", label: "Full Spectrum", description: "Earn at least one badge from every category.", icon: "🌈", special: "full_spectrum" },
  { key: "perfectionist", category: "Meta / Combo", label: "Perfectionist", description: "Earn every badge in a single category.", icon: "💯", special: "perfectionist" },
  { key: "legend", category: "Meta / Combo", label: "Legend", description: "Earn 100 badges total.", icon: "👑", metric: "total_badges_earned", threshold: 100 },
];

export const BADGE_CATEGORIES: string[] = Array.from(new Set(BADGE_DEFINITIONS.map((b) => b.category)));

function metricValue(metrics: BadgeMetrics, key: keyof BadgeMetrics): number {
  const raw = metrics[key];
  return typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
}

// Full Spectrum: at least one earned badge (from earnedKeys) in every
// category. Categories with zero regular badges can't happen today, but
// this doesn't assume it - an empty category is just never satisfied.
function hasFullSpectrum(earnedKeys: Set<string>): boolean {
  return BADGE_CATEGORIES.every((cat) =>
    BADGE_DEFINITIONS.some((b) => b.category === cat && earnedKeys.has(b.key))
  );
}

// Perfectionist: every badge in some category earned. Excludes Full
// Spectrum/Perfectionist themselves from the "required" set for
// whichever category they're in (Meta / Combo) - otherwise that one
// category could never be completed, since Perfectionist would require
// having already earned Perfectionist.
function hasPerfectionist(earnedKeys: Set<string>): boolean {
  return BADGE_CATEGORIES.some((cat) => {
    const required = BADGE_DEFINITIONS.filter((b) => b.category === cat && !("special" in b));
    return required.length > 0 && required.every((b) => earnedKeys.has(b.key));
  });
}

// earnedKeys is only needed for the two "special" meta badges - every
// other (metric-driven) badge ignores it, so callers that only care
// about those can omit it.
export function isBadgeEarned(
  def: BadgeDefinition,
  metrics: BadgeMetrics,
  earnedKeys?: Set<string>
): boolean {
  if ("special" in def) {
    if (!earnedKeys) return false;
    return def.special === "full_spectrum" ? hasFullSpectrum(earnedKeys) : hasPerfectionist(earnedKeys);
  }
  return metricValue(metrics, def.metric) >= def.threshold;
}

// For an unearned badge, how close the current metric is to its
// threshold (0-1) - drives a progress bar on the Badges tab so it
// feels like a video game ("you're at 23/30") rather than just
// locked/unlocked.
export function badgeProgress(
  def: BadgeDefinition,
  metrics: BadgeMetrics,
  earnedKeys?: Set<string>
): number {
  if ("special" in def) {
    const keys = earnedKeys ?? new Set<string>();
    if (def.special === "full_spectrum") {
      const covered = BADGE_CATEGORIES.filter((cat) =>
        BADGE_DEFINITIONS.some((b) => b.category === cat && keys.has(b.key))
      ).length;
      return BADGE_CATEGORIES.length > 0 ? covered / BADGE_CATEGORIES.length : 0;
    }
    let best = 0;
    for (const cat of BADGE_CATEGORIES) {
      const required = BADGE_DEFINITIONS.filter((b) => b.category === cat && !("special" in b));
      if (required.length === 0) continue;
      const earnedCount = required.filter((b) => keys.has(b.key)).length;
      best = Math.max(best, earnedCount / required.length);
    }
    return best;
  }
  const value = metricValue(metrics, def.metric);
  if (def.threshold <= 0) return value > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, value / def.threshold));
}
