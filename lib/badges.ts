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
//
// `points` feeds the avatar/leveling system (lib/levels.ts) - not
// uniform across badges since some are far more substantial than
// others. Within a shared metric (e.g. the 5 Core Run Streak milestones)
// points scale by position from easiest to hardest; a badge with no
// siblings on its metric is a flat mid-value, bumped up if it already
// carries a crown icon; the 5 `special` badges are the flat max, being
// cross-category achievements. Categories that are core business-building
// (QIs, Launches, Business Structure, growing your network/team) carry a
// 3x multiplier; Games carries 0.3x. These were tuned by hand against a
// generated draft, not derived at runtime - there's no live formula here,
// just the numbers that came out of that pass.
export type MetricBadgeDefinition = {
  key: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  metric: keyof BadgeMetrics;
  threshold: number;
  points: number;
};

export type MetaBadgeDefinition = {
  key: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  special: "full_spectrum" | "perfectionist" | "well_rounded" | "collector" | "balanced_portfolio";
  points: number;
};

export type BadgeDefinition = MetricBadgeDefinition | MetaBadgeDefinition;

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Core Run Streak
  { key: "core_run_10", category: "Core Run Streak", label: "10-Day Core Run", description: "Complete a 10-day Core Run Streak.", icon: "🔥", metric: "longest_core_run_streak", threshold: 10, points: 20 },
  { key: "core_run_30", category: "Core Run Streak", label: "30-Day Core Run", description: "Complete a 30-day Core Run Streak.", icon: "🔥", metric: "longest_core_run_streak", threshold: 30, points: 35 },
  { key: "core_run_60", category: "Core Run Streak", label: "60-Day Core Run", description: "Complete a 60-day Core Run Streak.", icon: "🔥", metric: "longest_core_run_streak", threshold: 60, points: 50 },
  { key: "core_run_90", category: "Core Run Streak", label: "90-Day Core Run", description: "Complete a 90-day Core Run Streak.", icon: "🔥", metric: "longest_core_run_streak", threshold: 90, points: 65 },
  { key: "core_run_365", category: "Core Run Streak", label: "1-Year Core Run", description: "Complete a full year of Core Run Streak.", icon: "👑", metric: "longest_core_run_streak", threshold: 365, points: 80 },

  // Monthly PV
  { key: "pv_150", category: "Monthly PV", label: "150 PV", description: "Hit 150+ PV in a single month.", icon: "💰", metric: "max_monthly_pv", threshold: 150, points: 20 },
  { key: "pv_300", category: "Monthly PV", label: "Core 300", description: "Hit 300+ PV in a single month.", icon: "💰", metric: "max_monthly_pv", threshold: 300, points: 40 },
  { key: "pv_600", category: "Monthly PV", label: "600 PV", description: "Hit 600+ PV in a single month.", icon: "💰", metric: "max_monthly_pv", threshold: 600, points: 60 },
  { key: "pv_1000", category: "Monthly PV", label: "1000 PV", description: "Hit 1000+ PV in a single month.", icon: "💎", metric: "max_monthly_pv", threshold: 1000, points: 80 },

  // Day 1 Ditto PV
  { key: "ditto_100", category: "Day 1 Ditto", label: "100 PV Ditto", description: "Hit 100+ PV on Day 1 Ditto in a single month.", icon: "📦", metric: "max_day1_ditto_pv", threshold: 100, points: 20 },
  { key: "ditto_150", category: "Day 1 Ditto", label: "150 PV Ditto", description: "Hit 150+ PV on Day 1 Ditto in a single month.", icon: "📦", metric: "max_day1_ditto_pv", threshold: 150, points: 50 },
  { key: "ditto_300", category: "Day 1 Ditto", label: "300 PV Ditto", description: "Hit 300+ PV on Day 1 Ditto in a single month.", icon: "📦", metric: "max_day1_ditto_pv", threshold: 300, points: 80 },

  // Ditto Streak (consecutive months)
  { key: "ditto_streak_3", category: "Ditto Streak", label: "3 Months of Ditto", description: "100+ PV Day 1 Ditto, 3 months in a row.", icon: "🎯", metric: "longest_ditto_streak", threshold: 3, points: 20 },
  { key: "ditto_streak_6", category: "Ditto Streak", label: "6 Months of Ditto", description: "100+ PV Day 1 Ditto, 6 months in a row.", icon: "🎯", metric: "longest_ditto_streak", threshold: 6, points: 50 },
  { key: "ditto_streak_12", category: "Ditto Streak", label: "1 Year of Ditto", description: "100+ PV Day 1 Ditto, a full year in a row.", icon: "👑", metric: "longest_ditto_streak", threshold: 12, points: 80 },

  // Core 300 Streak (consecutive months)
  { key: "core300_streak_3", category: "Core 300 Streak", label: "3 Months of Core 300", description: "300+ PV, 3 months in a row.", icon: "🏆", metric: "longest_core300_streak", threshold: 3, points: 20 },
  { key: "core300_streak_6", category: "Core 300 Streak", label: "6 Months of Core 300", description: "300+ PV, 6 months in a row.", icon: "🏆", metric: "longest_core300_streak", threshold: 6, points: 40 },
  { key: "core300_streak_12", category: "Core 300 Streak", label: "1 Year of Core 300", description: "300+ PV, a full year in a row.", icon: "👑", metric: "longest_core300_streak", threshold: 12, points: 60 },

  // Audios in a Day
  { key: "audios_day_5", category: "Audios", label: "5 Audios in a Day", description: "Listen to 5 or more audios in one day.", icon: "🎧", metric: "max_audios_day", threshold: 5, points: 20 },
  { key: "audios_day_10", category: "Audios", label: "10 Audios in a Day", description: "Listen to 10 or more audios in one day.", icon: "🎧", metric: "max_audios_day", threshold: 10, points: 80 },

  // Audio Streak
  { key: "audios_week_streak", category: "Audios", label: "A Week of Audios", description: "5 or more audios a day, 7 days in a row.", icon: "🎧", metric: "longest_audio_streak", threshold: 7, points: 30 },

  // Books in a Year
  { key: "books_10", category: "Books", label: "10 Books", description: "Finish 10 books in a year.", icon: "📚", metric: "max_books_in_a_year", threshold: 10, points: 20 },
  { key: "books_20", category: "Books", label: "20 Books", description: "Finish 20 books in a year.", icon: "📚", metric: "max_books_in_a_year", threshold: 20, points: 35 },
  { key: "books_30", category: "Books", label: "30 Books", description: "Finish 30 books in a year.", icon: "📚", metric: "max_books_in_a_year", threshold: 30, points: 50 },
  { key: "books_40", category: "Books", label: "40 Books", description: "Finish 40 books in a year.", icon: "📚", metric: "max_books_in_a_year", threshold: 40, points: 65 },
  { key: "books_50", category: "Books", label: "50 Books", description: "Finish 50 books in a year.", icon: "👑", metric: "max_books_in_a_year", threshold: 50, points: 80 },

  // Questions in a Day
  { key: "questions_day_5", category: "Questions", label: "5 Questions in a Day", description: "Ask the question 5 times in one day.", icon: "💬", metric: "max_questions_day", threshold: 5, points: 20 },
  { key: "questions_day_10", category: "Questions", label: "10 Questions in a Day", description: "Ask the question 10 times in one day.", icon: "💬", metric: "max_questions_day", threshold: 10, points: 40 },
  { key: "questions_day_15", category: "Questions", label: "15 Questions in a Day", description: "Ask the question 15 times in one day.", icon: "💬", metric: "max_questions_day", threshold: 15, points: 60 },
  { key: "questions_day_20", category: "Questions", label: "20 Questions in a Day", description: "Ask the question 20 times in one day.", icon: "💬", metric: "max_questions_day", threshold: 20, points: 80 },

  // Questions in a Week
  { key: "questions_week_25", category: "Questions", label: "25 Questions in a Week", description: "Ask the question 25 times in one week.", icon: "💬", metric: "max_questions_week", threshold: 25, points: 20 },
  { key: "questions_week_30", category: "Questions", label: "30 Questions in a Week", description: "Ask the question 30 times in one week.", icon: "💬", metric: "max_questions_week", threshold: 30, points: 80 },

  // Yeses in a Day
  { key: "yeses_day_2", category: "Yeses", label: "2 Yeses in a Day", description: "Get 2 yeses in one day.", icon: "✅", metric: "max_yeses_day", threshold: 2, points: 20 },
  { key: "yeses_day_5", category: "Yeses", label: "5 Yeses in a Day", description: "Get 5 yeses in one day.", icon: "✅", metric: "max_yeses_day", threshold: 5, points: 50 },
  { key: "yeses_day_10", category: "Yeses", label: "10 Yeses in a Day", description: "Get 10 yeses in one day.", icon: "✅", metric: "max_yeses_day", threshold: 10, points: 80 },

  // Yeses in a Week
  { key: "yeses_week_10", category: "Yeses", label: "10 Yeses in a Week", description: "Get 10 yeses in one week.", icon: "✅", metric: "max_yeses_week", threshold: 10, points: 20 },
  { key: "yeses_week_15", category: "Yeses", label: "15 Yeses in a Week", description: "Get 15 yeses in one week.", icon: "✅", metric: "max_yeses_week", threshold: 15, points: 35 },
  { key: "yeses_week_20", category: "Yeses", label: "20 Yeses in a Week", description: "Get 20 yeses in one week.", icon: "✅", metric: "max_yeses_week", threshold: 20, points: 50 },
  { key: "yeses_week_25", category: "Yeses", label: "25 Yeses in a Week", description: "Get 25 yeses in one week.", icon: "✅", metric: "max_yeses_week", threshold: 25, points: 65 },
  { key: "yeses_week_30", category: "Yeses", label: "30 Yeses in a Week", description: "Get 30 yeses in one week.", icon: "👑", metric: "max_yeses_week", threshold: 30, points: 80 },

  // Goals
  { key: "goals_filled_out", category: "Goals", label: "Goals Set", description: "Fill out your goals.", icon: "🎯", metric: "has_goals", threshold: 1, points: 30 },

  // QI1s in a Week (a badge for every number, 2 through 10)
  { key: "qi1_week_2", category: "QI1s (Weekly)", label: "2 QI1s in a Week", description: "Show 2 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 2, points: 60 },
  { key: "qi1_week_3", category: "QI1s (Weekly)", label: "3 QI1s in a Week", description: "Show 3 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 3, points: 82 },
  { key: "qi1_week_4", category: "QI1s (Weekly)", label: "4 QI1s in a Week", description: "Show 4 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 4, points: 105 },
  { key: "qi1_week_5", category: "QI1s (Weekly)", label: "5 QI1s in a Week", description: "Show 5 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 5, points: 128 },
  { key: "qi1_week_6", category: "QI1s (Weekly)", label: "6 QI1s in a Week", description: "Show 6 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 6, points: 150 },
  { key: "qi1_week_7", category: "QI1s (Weekly)", label: "7 QI1s in a Week", description: "Show 7 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 7, points: 172 },
  { key: "qi1_week_8", category: "QI1s (Weekly)", label: "8 QI1s in a Week", description: "Show 8 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 8, points: 195 },
  { key: "qi1_week_9", category: "QI1s (Weekly)", label: "9 QI1s in a Week", description: "Show 9 QI1s in a week.", icon: "🗓️", metric: "max_qi1_week", threshold: 9, points: 218 },
  { key: "qi1_week_10", category: "QI1s (Weekly)", label: "10 QI1s in a Week", description: "Show 10 QI1s in a week.", icon: "👑", metric: "max_qi1_week", threshold: 10, points: 240 },

  // QI1s in a Month
  { key: "qi1_month_8", category: "QI1s (Monthly)", label: "8 QI1s in a Month", description: "Show 8 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 8, points: 60 },
  { key: "qi1_month_10", category: "QI1s (Monthly)", label: "10 QI1s in a Month", description: "Show 10 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 10, points: 96 },
  { key: "qi1_month_15", category: "QI1s (Monthly)", label: "15 QI1s in a Month", description: "Show 15 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 15, points: 132 },
  { key: "qi1_month_20", category: "QI1s (Monthly)", label: "20 QI1s in a Month", description: "Show 20 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 20, points: 168 },
  { key: "qi1_month_25", category: "QI1s (Monthly)", label: "25 QI1s in a Month", description: "Show 25 QI1s in a month.", icon: "📅", metric: "max_qi1_month", threshold: 25, points: 204 },
  { key: "qi1_month_30", category: "QI1s (Monthly)", label: "30 QI1s in a Month", description: "Show 30 QI1s in a month.", icon: "👑", metric: "max_qi1_month", threshold: 30, points: 240 },

  // Contacts
  { key: "master_lister", category: "Contacts", label: "Master Lister", description: "Have 100 names on your A/B list.", icon: "📇", metric: "max_ab_contacts", threshold: 100, points: 60 },
  { key: "list_refresh", category: "Contacts", label: "List Refresh", description: "Add 25 new names to your A/B list in a month.", icon: "📇", metric: "max_contacts_added_month", threshold: 25, points: 60 },

  // Customers
  { key: "first_sale", category: "Customers", label: "First Sale", description: "Log your first customer sale.", icon: "🛍️", metric: "total_customer_sales", threshold: 1, points: 20 },
  { key: "customer_builder", category: "Customers", label: "Customer Builder", description: "Log 10 customer sales.", icon: "🛍️", metric: "total_customer_sales", threshold: 10, points: 32 },
  { key: "customer_champion", category: "Customers", label: "Customer Champion", description: "Log 25 customer sales.", icon: "🛍️", metric: "total_customer_sales", threshold: 25, points: 44 },
  { key: "big_ticket", category: "Customers", label: "Big Ticket", description: "Log a single sale of 100+ PV.", icon: "💵", metric: "max_single_sale_pv", threshold: 100, points: 30 },
  { key: "sales_month", category: "Customers", label: "Sales Month", description: "300+ PV in customer sales in one month.", icon: "💵", metric: "max_sales_month_pv", threshold: 300, points: 20 },
  { key: "customer_survey_completed", category: "Customers", label: "Customer Survey", description: "Complete a customer survey.", icon: "📋", metric: "has_customer_survey", threshold: 1, points: 30 },

  // Pipeline Beyond QI1
  { key: "is1_regular", category: "Pipeline Beyond QI1", label: "IS1 Regular", description: "5 IS1s in a month.", icon: "🗓️", metric: "max_is1_month", threshold: 5, points: 90 },
  { key: "is2_regular", category: "Pipeline Beyond QI1", label: "IS2 Regular", description: "5 IS2s in a month.", icon: "🗓️", metric: "max_is2_month", threshold: 5, points: 90 },
  { key: "fu1_finisher", category: "Pipeline Beyond QI1", label: "FU1 Finisher", description: "10 FU1s in a month.", icon: "✔️", metric: "max_fu1_month", threshold: 10, points: 90 },
  { key: "fu1_finisher_team", category: "Pipeline Beyond QI1", label: "FU1 Finisher (Team)", description: "10 FU1s in a month, you and your downline combined.", icon: "✔️", metric: "max_fu1_month_team", threshold: 10, points: 90 },
  { key: "fu2_finisher", category: "Pipeline Beyond QI1", label: "FU2 Finisher", description: "10 FU2s in a month.", icon: "✔️", metric: "max_fu2_month", threshold: 10, points: 90 },
  { key: "fu2_finisher_team", category: "Pipeline Beyond QI1", label: "FU2 Finisher (Team)", description: "10 FU2s in a month, you and your downline combined.", icon: "✔️", metric: "max_fu2_month_team", threshold: 10, points: 90 },

  // Launches
  { key: "first_launch", category: "Launches", label: "First Launch", description: "Launch your first team member.", icon: "🚀", metric: "total_launches", threshold: 1, points: 90 },
  { key: "launch_streak", category: "Launches", label: "Launch Streak", description: "Launch someone 3 months in a row.", icon: "🚀", metric: "longest_launch_streak", threshold: 3, points: 60 },
  { key: "team_builder", category: "Launches", label: "Team Builder", description: "5 total launches, you and your downline combined.", icon: "🚀", metric: "total_launches_team", threshold: 5, points: 60 },
  { key: "team_builder_pro", category: "Launches", label: "Team Builder Pro", description: "10 total launches, you and your downline combined.", icon: "🚀", metric: "total_launches_team", threshold: 10, points: 150 },
  { key: "team_builder_elite", category: "Launches", label: "Team Builder Elite", description: "25 total launches, you and your downline combined.", icon: "👑", metric: "total_launches_team", threshold: 25, points: 240 },

  // Speed
  { key: "fast_starter", category: "Speed", label: "Fast Starter", description: "Launch a team member within 30 days of their Yes.", icon: "⚡", metric: "has_fast_launch", threshold: 1, points: 30 },

  // Consistency
  { key: "perfect_week", category: "Consistency", label: "Perfect Week", description: "Every Core Run component, 7 days straight.", icon: "🔥", metric: "longest_core_run_streak", threshold: 7, points: 30 },
  { key: "perfect_month", category: "Consistency", label: "Perfect Month", description: "Core Run every single day of a calendar month.", icon: "🌕", metric: "has_perfect_month", threshold: 1, points: 30 },
  { key: "comeback_kid", category: "Consistency", label: "Comeback Kid", description: "Rebuild a 10+ day Core Run Streak after breaking one.", icon: "💪", metric: "core_run_streak_count_10plus", threshold: 2, points: 30 },

  // Calendar & Meetings
  { key: "meeting_machine", category: "Calendar & Meetings", label: "Meeting Machine", description: "10 meetings in a week.", icon: "📅", metric: "max_meetings_week", threshold: 10, points: 20 },
  { key: "booked_solid", category: "Calendar & Meetings", label: "Booked Solid", description: "20 meetings in a month.", icon: "📅", metric: "max_meetings_month", threshold: 20, points: 20 },

  // Team Culture
  { key: "team_regular", category: "Team Culture", label: "Team Regular", description: "Attend 5 different Team Events.", icon: "📸", metric: "team_events_attended", threshold: 5, points: 30 },

  // Household
  { key: "better_together", category: "Household", label: "Better Together", description: "Link your spouse's account.", icon: "💑", metric: "has_spouse_linked", threshold: 1, points: 30 },

  // Growing Others
  { key: "fast_learner", category: "Growing Others", label: "Fast Learner", description: "Finish all 5 Onboarding sessions within 60 days of signing up.", icon: "🎓", metric: "has_fast_onboarding", threshold: 1, points: 90 },

  // Meta / Combo
  { key: "triple_threat", category: "Meta / Combo", label: "Triple Threat", description: "Core 300 + 100 PV Ditto + a full month of Core Run, same month.", icon: "🎖️", metric: "has_triple_threat", threshold: 1, points: 30 },
  { key: "grand_slam", category: "Meta / Combo", label: "Grand Slam", description: "Earn 10 badges total.", icon: "🎖️", metric: "total_badges_earned", threshold: 10, points: 20 },
  { key: "half_century", category: "Meta / Combo", label: "Half Century", description: "Earn 25 badges total.", icon: "🎖️", metric: "total_badges_earned", threshold: 25, points: 32 },
  { key: "century_club", category: "Meta / Combo", label: "Century Club", description: "Earn 50 badges total.", icon: "👑", metric: "total_badges_earned", threshold: 50, points: 60 },

  // Longevity
  { key: "twelve_for_twelve", category: "Longevity", label: "Twelve for Twelve", description: "Hit Core 300 in 12 different calendar months, lifetime.", icon: "📆", metric: "distinct_core300_months", threshold: 12, points: 80 },

  // Games
  { key: "high_scorer", category: "Games", label: "High Scorer", description: "Beat your own Diamond Run high score 5 times.", icon: "🎮", metric: "times_improved", threshold: 5, points: 9 },
  { key: "trivia_streak", category: "Games", label: "Trivia Streak", description: "7-day Trivia streak.", icon: "🧠", metric: "longest_trivia_streak", threshold: 7, points: 6 },
  { key: "trivia_master", category: "Games", label: "Trivia Master", description: "30-day Trivia streak.", icon: "🧠", metric: "longest_trivia_streak", threshold: 30, points: 24 },

  // Wildcard
  { key: "weekend_warrior", category: "Wildcard", label: "Weekend Warrior", description: "Log meetings on both Saturday and Sunday, same weekend.", icon: "🏖️", metric: "has_weekend_warrior", threshold: 1, points: 30 },

  // Business Structure (a "leg" is a first-level recruit's entire line -
  // a linked spouse pair recruited directly counts as one leg, though
  // each spouse still counts individually toward total people)
  { key: "legs_3", category: "Business Structure", label: "3 Legs", description: "Have 3 different legs in your organization.", icon: "🌳", metric: "leg_count", threshold: 3, points: 60 },
  { key: "legs_6", category: "Business Structure", label: "6 Legs", description: "Have 6 different legs in your organization.", icon: "🌳", metric: "leg_count", threshold: 6, points: 105 },
  { key: "legs_12", category: "Business Structure", label: "12 Legs", description: "Have 12 different legs in your organization.", icon: "🌳", metric: "leg_count", threshold: 12, points: 150 },
  { key: "legs_15", category: "Business Structure", label: "15 Legs", description: "Have 15 different legs in your organization.", icon: "🌳", metric: "leg_count", threshold: 15, points: 195 },
  { key: "legs_20", category: "Business Structure", label: "20 Legs", description: "Have 20 different legs in your organization.", icon: "👑", metric: "leg_count", threshold: 20, points: 240 },
  { key: "org_combo_3_10", category: "Business Structure", label: "3 Legs, 10 People", description: "3 legs and 10 total people in your organization.", icon: "🏢", metric: "has_org_combo_3_10", threshold: 1, points: 90 },
  { key: "org_combo_6_25", category: "Business Structure", label: "6 Legs, 25 People", description: "6 legs and 25 total people in your organization.", icon: "🏢", metric: "has_org_combo_6_25", threshold: 1, points: 90 },
  { key: "org_combo_6_50", category: "Business Structure", label: "6 Legs, 50 People", description: "6 legs and 50 total people in your organization.", icon: "🏢", metric: "has_org_combo_6_50", threshold: 1, points: 90 },
  { key: "org_combo_9_75", category: "Business Structure", label: "9 Legs, 75 People", description: "9 legs and 75 total people in your organization.", icon: "🏢", metric: "has_org_combo_9_75", threshold: 1, points: 90 },
  { key: "org_combo_12_100", category: "Business Structure", label: "12 Legs, 100 People", description: "12 legs and 100 total people in your organization.", icon: "👑", metric: "has_org_combo_12_100", threshold: 1, points: 180 },

  // Legs with Volume (how many different legs are producing PV this month)
  { key: "legs_volume_3", category: "Legs with Volume", label: "3 Legs with Volume", description: "3 different legs producing volume this month.", icon: "💧", metric: "legs_with_volume", threshold: 3, points: 60 },
  { key: "legs_volume_6", category: "Legs with Volume", label: "6 Legs with Volume", description: "6 different legs producing volume this month.", icon: "💧", metric: "legs_with_volume", threshold: 6, points: 105 },
  { key: "legs_volume_12", category: "Legs with Volume", label: "12 Legs with Volume", description: "12 different legs producing volume this month.", icon: "💧", metric: "legs_with_volume", threshold: 12, points: 150 },
  { key: "legs_volume_15", category: "Legs with Volume", label: "15 Legs with Volume", description: "15 different legs producing volume this month.", icon: "💧", metric: "legs_with_volume", threshold: 15, points: 195 },
  { key: "legs_volume_20", category: "Legs with Volume", label: "20 Legs with Volume", description: "20 different legs producing volume this month.", icon: "👑", metric: "legs_with_volume", threshold: 20, points: 240 },

  // Legs on Core Run (how many different legs have someone currently on a Core Run Streak)
  { key: "legs_core_run_3", category: "Legs on Core Run", label: "3 Legs on Core Run", description: "3 different legs with someone currently on a Core Run Streak.", icon: "🔥", metric: "legs_on_core_run", threshold: 3, points: 60 },
  { key: "legs_core_run_6", category: "Legs on Core Run", label: "6 Legs on Core Run", description: "6 different legs with someone currently on a Core Run Streak.", icon: "🔥", metric: "legs_on_core_run", threshold: 6, points: 105 },
  { key: "legs_core_run_12", category: "Legs on Core Run", label: "12 Legs on Core Run", description: "12 different legs with someone currently on a Core Run Streak.", icon: "🔥", metric: "legs_on_core_run", threshold: 12, points: 150 },
  { key: "legs_core_run_15", category: "Legs on Core Run", label: "15 Legs on Core Run", description: "15 different legs with someone currently on a Core Run Streak.", icon: "🔥", metric: "legs_on_core_run", threshold: 15, points: 195 },
  { key: "legs_core_run_20", category: "Legs on Core Run", label: "20 Legs on Core Run", description: "20 different legs with someone currently on a Core Run Streak.", icon: "👑", metric: "legs_on_core_run", threshold: 20, points: 240 },

  // Legs Taking Action (how many different legs logged any pipeline activity this month)
  { key: "legs_action_3", category: "Legs Taking Action", label: "3 Legs Taking Action", description: "3 different legs with someone taking action this month.", icon: "⚡", metric: "legs_taking_action", threshold: 3, points: 60 },
  { key: "legs_action_6", category: "Legs Taking Action", label: "6 Legs Taking Action", description: "6 different legs with someone taking action this month.", icon: "⚡", metric: "legs_taking_action", threshold: 6, points: 105 },
  { key: "legs_action_12", category: "Legs Taking Action", label: "12 Legs Taking Action", description: "12 different legs with someone taking action this month.", icon: "⚡", metric: "legs_taking_action", threshold: 12, points: 150 },
  { key: "legs_action_15", category: "Legs Taking Action", label: "15 Legs Taking Action", description: "15 different legs with someone taking action this month.", icon: "⚡", metric: "legs_taking_action", threshold: 15, points: 195 },
  { key: "legs_action_20", category: "Legs Taking Action", label: "20 Legs Taking Action", description: "20 different legs with someone taking action this month.", icon: "👑", metric: "legs_taking_action", threshold: 20, points: 240 },

  // Training & Events
  { key: "weekly_training_attended", category: "Training & Events", label: "Weekly Training", description: "Attend a weekly training.", icon: "🎓", metric: "has_weekly_training", threshold: 1, points: 30 },
  { key: "monthly_masterclass_attended", category: "Training & Events", label: "Monthly Masterclass", description: "Attend a monthly masterclass.", icon: "🎓", metric: "has_monthly_masterclass", threshold: 1, points: 30 },
  { key: "quarterly_conference_attended", category: "Training & Events", label: "Quarterly Conference", description: "Attend a quarterly conference.", icon: "🎪", metric: "has_quarterly_conference", threshold: 1, points: 30 },

  // Sample Bags
  { key: "sample_bags_5", category: "Sample Bags", label: "5 Sample Bags", description: "Give out 5 sample bags.", icon: "🎁", metric: "sample_bags_given", threshold: 5, points: 20 },
  { key: "sample_bags_10", category: "Sample Bags", label: "10 Sample Bags", description: "Give out 10 sample bags.", icon: "🎁", metric: "sample_bags_given", threshold: 10, points: 32 },
  { key: "sample_bags_15", category: "Sample Bags", label: "15 Sample Bags", description: "Give out 15 sample bags.", icon: "🎁", metric: "sample_bags_given", threshold: 15, points: 44 },
  { key: "sample_bags_20", category: "Sample Bags", label: "20 Sample Bags", description: "Give out 20 sample bags.", icon: "🎁", metric: "sample_bags_given", threshold: 20, points: 56 },
  { key: "sample_bags_25", category: "Sample Bags", label: "25 Sample Bags", description: "Give out 25 sample bags.", icon: "👑", metric: "sample_bags_given", threshold: 25, points: 68 },

  // AI Chat Practice
  { key: "grade_meeting_5", category: "AI Chat Practice", label: "Grade 5 Meetings", description: "Grade 5 meetings on the AI chat.", icon: "📞", metric: "call_ratings_count", threshold: 5, points: 20 },
  { key: "grade_meeting_10", category: "AI Chat Practice", label: "Grade 10 Meetings", description: "Grade 10 meetings on the AI chat.", icon: "📞", metric: "call_ratings_count", threshold: 10, points: 35 },
  { key: "grade_meeting_15", category: "AI Chat Practice", label: "Grade 15 Meetings", description: "Grade 15 meetings on the AI chat.", icon: "📞", metric: "call_ratings_count", threshold: 15, points: 50 },
  { key: "grade_meeting_20", category: "AI Chat Practice", label: "Grade 20 Meetings", description: "Grade 20 meetings on the AI chat.", icon: "👑", metric: "call_ratings_count", threshold: 20, points: 65 },
  { key: "story_practiced", category: "AI Chat Practice", label: "Story Practice", description: "Practice sharing your story with the AI chat.", icon: "📖", metric: "has_story_practiced", threshold: 1, points: 30 },

  // App Habits
  { key: "daily_visitor", category: "App Habits", label: "Daily Visitor", description: "Open the app 30 days in a row.", icon: "📱", metric: "app_opened_streak", threshold: 30, points: 20 },
  { key: "profile_complete", category: "App Habits", label: "Profile Complete", description: "Fill out every optional profile field.", icon: "📝", metric: "has_profile_complete", threshold: 1, points: 30 },
  { key: "note_taker", category: "App Habits", label: "Note Taker", description: "Add notes to 10 different candidates.", icon: "🗒️", metric: "note_taker_count", threshold: 10, points: 30 },

  // Depth & Duplication (going deeper than "legs," not just wider)
  { key: "third_generation", category: "Depth & Duplication", label: "3 Layers Deep", description: "Have a leg that's 3 layers deep.", icon: "🌲", metric: "max_downline_depth", threshold: 3, points: 60 },
  { key: "fourth_generation", category: "Depth & Duplication", label: "4 Layers Deep", description: "Have a leg that's 4 layers deep.", icon: "🌲", metric: "max_downline_depth", threshold: 4, points: 150 },
  { key: "fifth_generation", category: "Depth & Duplication", label: "5 Layers Deep", description: "Have a leg that's 5 layers deep.", icon: "👑", metric: "max_downline_depth", threshold: 5, points: 240 },
  { key: "duplication_nation", category: "Depth & Duplication", label: "Duplication Nation", description: "3 different legs each have 3+ legs of their own.", icon: "🌲", metric: "has_duplication_nation", threshold: 1, points: 90 },

  // Leadership & Recognition
  { key: "mentor", category: "Leadership & Recognition", label: "Mentor", description: "A downline member earns their own First Launch badge.", icon: "🎓", metric: "has_mentor", threshold: 1, points: 90 },
  { key: "multiplier", category: "Leadership & Recognition", label: "Multiplier", description: "2 different downline members earn First Launch in the same month.", icon: "🎓", metric: "has_multiplier", threshold: 1, points: 90 },
  { key: "shoutout", category: "Leadership & Recognition", label: "Shoutout", description: "Get liked 10 times on the Leaderboard.", icon: "👍", metric: "times_liked_received", threshold: 10, points: 60 },
  { key: "fan_favorite", category: "Leadership & Recognition", label: "Fan Favorite", description: "Get liked 50 times on the Leaderboard.", icon: "👍", metric: "times_liked_received", threshold: 50, points: 240 },
  { key: "cheerleader", category: "Leadership & Recognition", label: "Cheerleader", description: "Like 25 different Leaderboard entries yourself.", icon: "📣", metric: "likes_given", threshold: 25, points: 60 },
  { key: "encourager", category: "Leadership & Recognition", label: "Encourager", description: "Like 100 different Leaderboard entries yourself.", icon: "📣", metric: "likes_given", threshold: 100, points: 240 },

  // Data Hygiene
  { key: "learning_from_no", category: "Data Hygiene", label: "Learning from No", description: "Mark 10 candidates Filtered Out.", icon: "🧹", metric: "filtered_out_count", threshold: 10, points: 30 },
  { key: "organized", category: "Data Hygiene", label: "Organized", description: "Every active candidate has notes filled in.", icon: "🧹", metric: "has_organized_pipeline", threshold: 1, points: 30 },

  // Timing
  { key: "new_year_new_you", category: "Timing", label: "New Year New You", description: "Hit Core 300 in January.", icon: "🎉", metric: "has_new_year_core300", threshold: 1, points: 30 },
  { key: "summer_push", category: "Timing", label: "Summer Push", description: "Hit Core 300 in June, July, and August of the same year.", icon: "☀️", metric: "has_summer_core300", threshold: 1, points: 30 },

  // Referral Chains
  { key: "pay_it_forward", category: "Referral Chains", label: "Pay It Forward", description: "Someone you personally launched later launches their own first person.", icon: "🔗", metric: "has_pay_it_forward", threshold: 1, points: 90 },
  { key: "chain_reaction", category: "Referral Chains", label: "Chain Reaction", description: "3 layers deep all launch someone in the same quarter.", icon: "🔗", metric: "has_chain_reaction", threshold: 1, points: 90 },
  { key: "second_generation_growth", category: "Referral Chains", label: "Second Layer Growth", description: "Your downline's next layer reaches 10 people.", icon: "🔗", metric: "second_gen_or_deeper_count", threshold: 10, points: 90 },

  // Customers (lifetime/yearly totals)
  { key: "half_grand", category: "Customers", label: "Half Grand", description: "Log 500 lifetime customer sales.", icon: "💰", metric: "total_customer_sales", threshold: 500, points: 68 },
  { key: "grand_total", category: "Customers", label: "Grand Total", description: "Log 1,000 lifetime customer sales.", icon: "👑", metric: "total_customer_sales", threshold: 1000, points: 80 },
  { key: "century_of_sales", category: "Customers", label: "Century of Sales", description: "Log 100 customer sales in a single year.", icon: "💰", metric: "max_sales_year_count", threshold: 100, points: 20 },

  // Team Culture
  { key: "resource_sharer", category: "Team Culture", label: "Resource Sharer", description: "Send a resource to 10 different candidates or team members.", icon: "📤", metric: "resource_recipients_count", threshold: 10, points: 30 },

  // Support
  { key: "good_neighbor", category: "Support", label: "Good Neighbor", description: "Fill in pipeline numbers for a downline member on 5 different days.", icon: "🤝", metric: "good_neighbor_days", threshold: 5, points: 30 },

  // Meta / Combo
  { key: "iron_streaker", category: "Meta / Combo", label: "Iron Streaker", description: "Earn every Core Run Streak milestone badge (10/30/60/90/365 days).", icon: "🔥", metric: "has_iron_streaker", threshold: 1, points: 30 },
  { key: "full_spectrum", category: "Meta / Combo", label: "Full Spectrum", description: "Earn at least one badge from every category.", icon: "🌈", special: "full_spectrum", points: 100 },
  { key: "perfectionist", category: "Meta / Combo", label: "Perfectionist", description: "Earn every badge in a single category.", icon: "💯", special: "perfectionist", points: 100 },
  { key: "legend", category: "Meta / Combo", label: "Legend", description: "Earn 100 badges total.", icon: "👑", metric: "total_badges_earned", threshold: 100, points: 60 },

  // Firsts
  { key: "first_candidate", category: "Firsts", label: "First Candidate", description: "Add your very first candidate to the Roadmap.", icon: "🌟", metric: "total_candidates_added", threshold: 1, points: 90 },
  { key: "first_contact", category: "Firsts", label: "First Contact", description: "Add your very first contact.", icon: "🌟", metric: "total_contacts_count", threshold: 1, points: 90 },
  { key: "first_qi1", category: "Firsts", label: "First QI1", description: "Book your very first QI1.", icon: "🌟", metric: "has_first_qi1", threshold: 1, points: 90 },

  // Onboarding Milestones
  { key: "onboarding_session_2", category: "Onboarding Milestones", label: "Session 2 Unlocked", description: "Reach Onboarding Session 2.", icon: "🎓", metric: "onboarding_sessions_unlocked", threshold: 2, points: 20 },
  { key: "onboarding_session_3", category: "Onboarding Milestones", label: "Session 3 Unlocked", description: "Reach Onboarding Session 3.", icon: "🎓", metric: "onboarding_sessions_unlocked", threshold: 3, points: 40 },
  { key: "onboarding_session_4", category: "Onboarding Milestones", label: "Session 4 Unlocked", description: "Reach Onboarding Session 4.", icon: "🎓", metric: "onboarding_sessions_unlocked", threshold: 4, points: 60 },
  { key: "onboarding_graduate", category: "Onboarding Milestones", label: "Graduate", description: "Reach Onboarding Session 5 - fully unlocked.", icon: "👑", metric: "onboarding_sessions_unlocked", threshold: 5, points: 80 },

  // Pipeline Beyond QI1
  { key: "full_funnel", category: "Pipeline Beyond QI1", label: "Full Funnel", description: "Take a candidate all the way through the roadmap to Launched.", icon: "🚰", metric: "has_full_funnel", threshold: 1, points: 90 },
  { key: "questionnaire_closer", category: "Pipeline Beyond QI1", label: "Questionnaire Closer", description: "5 Questionnaires completed in a month.", icon: "📋", metric: "max_questionnaire_month", threshold: 5, points: 90 },

  // Contacts
  { key: "list_builder_elite", category: "Contacts", label: "List Builder Elite", description: "Have 200 names on your A/B list.", icon: "📇", metric: "max_ab_contacts", threshold: 200, points: 120 },
  { key: "big_list_energy", category: "Contacts", label: "Big List Energy", description: "Have 300 names on your A/B list.", icon: "👑", metric: "max_ab_contacts", threshold: 300, points: 180 },

  // Calendar & Meetings
  { key: "calendar_planner", category: "Calendar & Meetings", label: "Calendar Planner", description: "Schedule 10 events in a month.", icon: "📅", metric: "max_calendar_events_month", threshold: 10, points: 30 },

  // Notifications
  { key: "caught_up", category: "Notifications", label: "Caught Up", description: "Read every notification you've ever received.", icon: "🔔", metric: "has_caught_up_notifications", threshold: 1, points: 30 },

  // Games
  { key: "trivia_perfectionist", category: "Games", label: "Trivia Perfectionist", description: "A perfect 5/5 Trivia day, 10 different days.", icon: "🧠", metric: "total_perfect_trivia_days", threshold: 10, points: 6 },
  { key: "trivia_century", category: "Games", label: "Trivia Century", description: "A perfect 5/5 Trivia day, 100 different days lifetime.", icon: "👑", metric: "total_perfect_trivia_days", threshold: 100, points: 24 },
  { key: "diamond_chase_rookie", category: "Games", label: "Diamond Chase Rookie", description: "Play your first Diamond Chase game.", icon: "🐍", metric: "has_played_diamond_chase", threshold: 1, points: 9 },
  { key: "diamond_chase_pro", category: "Games", label: "Diamond Chase Pro", description: "Beat your own Diamond Chase high score 5 times.", icon: "🐍", metric: "diamond_chase_times_improved", threshold: 5, points: 9 },
  { key: "high_roller", category: "Games", label: "High Roller", description: "Score 50+ in a single Diamond Run.", icon: "🎮", metric: "max_diamond_run_score", threshold: 50, points: 6 },
  { key: "marathon_runner", category: "Games", label: "Marathon Runner", description: "Score 100+ in a single Diamond Run.", icon: "👑", metric: "max_diamond_run_score", threshold: 100, points: 24 },

  // Consistency
  { key: "weekday_warrior", category: "Consistency", label: "Weekday Warrior", description: "Core Run every weekday, 4 straight weeks.", icon: "💼", metric: "longest_weekday_streak_weeks", threshold: 4, points: 30 },
  { key: "slow_and_steady", category: "Consistency", label: "Slow and Steady", description: "Log at least some PV, 12 consecutive months.", icon: "🐢", metric: "longest_any_pv_streak", threshold: 12, points: 30 },

  // Business Structure
  { key: "team_of_5", category: "Business Structure", label: "Team of Five", description: "5 people total in your downline, any depth.", icon: "👥", metric: "total_downline_people", threshold: 5, points: 60 },
  { key: "team_of_10", category: "Business Structure", label: "Team of Ten", description: "10 people total in your downline, any depth.", icon: "👥", metric: "total_downline_people", threshold: 10, points: 96 },
  { key: "team_of_20", category: "Business Structure", label: "Team of Twenty", description: "20 people total in your downline, any depth.", icon: "👥", metric: "total_downline_people", threshold: 20, points: 132 },
  { key: "team_of_50", category: "Business Structure", label: "Team of Fifty", description: "50 people total in your downline, any depth.", icon: "👥", metric: "total_downline_people", threshold: 50, points: 168 },
  { key: "team_of_100", category: "Business Structure", label: "Team of a Hundred", description: "100 people total in your downline, any depth.", icon: "👑", metric: "total_downline_people", threshold: 100, points: 204 },
  { key: "team10_qi1_8", category: "Business Structure", label: "Team of 10, 8 QI1s", description: "10 people total in your downline, plus 8 QI1s combined in a month.", icon: "🏢", metric: "has_team10_qi1_8", threshold: 1, points: 90 },

  // Goals
  { key: "own_your_story", category: "Goals", label: "Own Your Story", description: "Fill in all three of your Dreams fields.", icon: "📖", metric: "has_dreams_filled", threshold: 1, points: 30 },
  { key: "vision_board", category: "Goals", label: "Vision Board", description: "Have a daily, weekly, and monthly Goal all set at once.", icon: "🎯", metric: "distinct_goal_periods_count", threshold: 3, points: 30 },
  { key: "goal_getter", category: "Goals", label: "Goal Getter", description: "Hit your own stated Questions/Yeses/QI1s goal.", icon: "🎯", metric: "has_goal_getter", threshold: 1, points: 30 },

  // Household
  { key: "household_streak", category: "Household", label: "Household Streak", description: "You and your linked spouse both have an active 30+ day Core Run Streak at the same time.", icon: "💑", metric: "has_household_streak", threshold: 1, points: 30 },

  // Audios
  { key: "audiophile", category: "Audios", label: "Audiophile", description: "500 lifetime audios listened.", icon: "🎧", metric: "total_audios_lifetime", threshold: 500, points: 30 },

  // Books
  { key: "bookworm", category: "Books", label: "Bookworm", description: "20 lifetime books finished.", icon: "📚", metric: "total_books_lifetime", threshold: 20, points: 20 },

  // Leadership & Recognition
  { key: "whole_team", category: "Leadership & Recognition", label: "The Whole Team", description: "Every person in your direct downline has earned at least 1 badge.", icon: "🌟", metric: "has_whole_team", threshold: 1, points: 90 },

  // Longevity
  { key: "anniversary", category: "Longevity", label: "Anniversary", description: "It's been 1+ year since your first personal launch.", icon: "🎂", metric: "has_anniversary", threshold: 1, points: 30 },

  // Meta / Combo
  { key: "well_rounded", category: "Meta / Combo", label: "Well-Rounded", description: "Earn badges from 3 different categories in the same week.", icon: "🌟", special: "well_rounded", points: 100 },

  // Customers
  { key: "product_explorer", category: "Customers", label: "Product Explorer", description: "Log a sale in 3 different product categories.", icon: "🧴", metric: "distinct_product_categories_count", threshold: 3, points: 20 },
  { key: "full_line", category: "Customers", label: "Full Line", description: "Log a sale in every product category, lifetime.", icon: "👑", metric: "distinct_product_categories_count", threshold: 9, points: 80 },
  { key: "xs_specialist", category: "Customers", label: "XS Specialist", description: "Log 10 XS sales.", icon: "🧴", metric: "xs_sales_count", threshold: 10, points: 30 },
  { key: "home_essentials", category: "Customers", label: "Home Essentials", description: "Log 10 Amway Home sales.", icon: "🧴", metric: "amway_home_sales_count", threshold: 10, points: 30 },
  { key: "repeat_customer", category: "Customers", label: "Repeat Customer", description: "Log 3+ sales for the same customer.", icon: "🔁", metric: "has_repeat_customer", threshold: 1, points: 30 },
  { key: "big_month", category: "Customers", label: "Big Month", description: "Log 5+ separate sales in a single month.", icon: "🛍️", metric: "max_sales_count_month", threshold: 5, points: 20 },

  // Story & Depth
  { key: "storyteller", category: "Story & Depth", label: "Storyteller", description: "20 story shares logged in a month.", icon: "📣", metric: "max_story_shares_month", threshold: 20, points: 30 },
  { key: "storyteller_legend", category: "Story & Depth", label: "Storyteller Legend", description: "100 story shares logged lifetime.", icon: "👑", metric: "total_story_shares_lifetime", threshold: 100, points: 60 },

  // AI Chat Practice
  { key: "well_rehearsed", category: "AI Chat Practice", label: "Well-Rehearsed", description: "Grade a call for every type (QI1/QI2/FU1/FU2/Questionnaire).", icon: "📞", metric: "distinct_call_rating_types_count", threshold: 5, points: 30 },
  { key: "qi2_specialist", category: "AI Chat Practice", label: "QI2 Specialist", description: "Grade 10 QI2 calls.", icon: "📞", metric: "qi2_ratings_count", threshold: 10, points: 20 },
  { key: "fu1_specialist", category: "AI Chat Practice", label: "FU1 Specialist", description: "Grade 10 FU1 calls.", icon: "📞", metric: "fu1_ratings_count", threshold: 10, points: 20 },
  { key: "fu2_specialist", category: "AI Chat Practice", label: "FU2 Specialist", description: "Grade 10 FU2 calls.", icon: "📞", metric: "fu2_ratings_count", threshold: 10, points: 20 },

  // Info Sessions
  { key: "info_session_regular", category: "Info Sessions", label: "Info Session Regular", description: "10 candidates watch their Info Session.", icon: "🎥", metric: "info_sessions_watched_count", threshold: 10, points: 30 },
  { key: "webinar_warrior", category: "Info Sessions", label: "Webinar Warrior", description: "10 candidates choose the virtual webinar option.", icon: "💻", metric: "virtual_session_candidates_count", threshold: 10, points: 30 },
  { key: "in_person_preferred", category: "Info Sessions", label: "In-Person Preferred", description: "10 candidates choose the in-person option.", icon: "🤝", metric: "in_person_session_candidates_count", threshold: 10, points: 30 },

  // Reading
  { key: "page_turner", category: "Reading", label: "Page Turner", description: "Log a single day with 60+ minutes read.", icon: "📖", metric: "max_read_minutes_day", threshold: 60, points: 30 },
  { key: "marathon_reader", category: "Reading", label: "Marathon Reader", description: "500 lifetime read minutes logged.", icon: "📖", metric: "total_read_minutes_lifetime", threshold: 500, points: 30 },

  // Growing Others
  { key: "fully_resourced", category: "Growing Others", label: "Fully Resourced", description: "A candidate completes every resource sent to them.", icon: "🎓", metric: "has_fully_resourced", threshold: 1, points: 90 },
  { key: "patient_teacher", category: "Growing Others", label: "Patient Teacher", description: "Grant an Onboarding unlock to 5 different downline members.", icon: "🎓", metric: "patient_teacher_count", threshold: 5, points: 60 },

  // Household
  { key: "team_player", category: "Household", label: "Team Player", description: "You and your spouse both log a Core Run on the same day, 30 different days.", icon: "💑", metric: "household_core_run_together_days", threshold: 30, points: 30 },

  // Calendar & Meetings
  { key: "meeting_logger", category: "Calendar & Meetings", label: "Meeting Logger", description: "50 lifetime meetings logged.", icon: "📅", metric: "total_meetings_lifetime", threshold: 50, points: 40 },
  { key: "meeting_century", category: "Calendar & Meetings", label: "Meeting Century", description: "100 lifetime meetings logged.", icon: "👑", metric: "total_meetings_lifetime", threshold: 100, points: 60 },

  // Games
  { key: "triple_player", category: "Games", label: "Triple Player", description: "Play Diamond Run, Diamond Chase, and Trivia at least once each.", icon: "🎮", metric: "has_played_all_games", threshold: 1, points: 9 },
  { key: "diamond_chase_century", category: "Games", label: "Diamond Chase Century", description: "Score 100+ in a single Diamond Chase run.", icon: "🐍", metric: "max_diamond_chase_score", threshold: 100, points: 6 },
  { key: "diamond_chase_legend", category: "Games", label: "Diamond Chase Legend", description: "Score 200+ in a single Diamond Chase run.", icon: "👑", metric: "max_diamond_chase_score", threshold: 200, points: 18 },

  // Speed
  { key: "weekend_booker", category: "Speed", label: "Weekend Booker", description: "Book a QI1 on a Saturday or Sunday.", icon: "⚡", metric: "has_weekend_qi1", threshold: 1, points: 30 },

  // Consistency
  { key: "no_zero_days", category: "Consistency", label: "No Zero Days", description: "Log something in Core Run every day for 60 days straight.", icon: "🔥", metric: "longest_any_component_streak", threshold: 60, points: 20 },

  // Leadership & Recognition
  { key: "rising_tide", category: "Leadership & Recognition", label: "Rising Tide", description: "3 different downline members each hit Core 300 in the same month.", icon: "🌊", metric: "has_rising_tide", threshold: 1, points: 90 },
  { key: "team_ditto", category: "Leadership & Recognition", label: "Team Ditto", description: "3 different downline members each hit 100+ PV Day 1 Ditto in the same month.", icon: "📦", metric: "has_team_ditto", threshold: 1, points: 90 },

  // App Habits
  { key: "weekend_visitor", category: "App Habits", label: "Weekend Visitor", description: "Open the app both Saturday and Sunday, 8 different weekends.", icon: "📱", metric: "weekend_visitor_count", threshold: 8, points: 20 },

  // Depth & Duplication
  { key: "wide_and_deep", category: "Depth & Duplication", label: "Wide and Deep", description: "6+ legs, with at least one 3+ layers deep.", icon: "🌳", metric: "has_wide_and_deep", threshold: 1, points: 90 },

  // Referral Chains
  { key: "legacy_builder", category: "Referral Chains", label: "Legacy Builder", description: "Someone 4 layers deep launches their own first person.", icon: "🔗", metric: "has_legacy_builder", threshold: 1, points: 90 },

  // Meta / Combo
  { key: "collector", category: "Meta / Combo", label: "Collector", description: "Earn at least 1 badge in 10 different categories.", icon: "🧩", special: "collector", points: 100 },
  { key: "halfway_there", category: "Meta / Combo", label: "Halfway There", description: "Earn 150 badges total.", icon: "🎖️", metric: "total_badges_earned", threshold: 150, points: 68 },

  // Growing Others
  { key: "patient_teacher_pro", category: "Growing Others", label: "Patient Teacher Pro", description: "Grant an Onboarding unlock to 10 different downline members.", icon: "🎓", metric: "patient_teacher_count", threshold: 10, points: 150 },
  { key: "onboarding_champion", category: "Growing Others", label: "Onboarding Champion", description: "Grant an Onboarding unlock to 20 different downline members.", icon: "👑", metric: "patient_teacher_count", threshold: 20, points: 240 },
  { key: "mentors_mentor", category: "Growing Others", label: "Mentor's Mentor", description: "Someone you personally onboarded later grants an Onboarding unlock themselves.", icon: "🎓", metric: "has_mentors_mentor", threshold: 1, points: 90 },

  // AI Chat Practice
  { key: "qi2_veteran", category: "AI Chat Practice", label: "QI2 Veteran", description: "Grade 25 QI2 calls.", icon: "📞", metric: "qi2_ratings_count", threshold: 25, points: 80 },
  { key: "fu1_veteran", category: "AI Chat Practice", label: "FU1 Veteran", description: "Grade 25 FU1 calls.", icon: "📞", metric: "fu1_ratings_count", threshold: 25, points: 80 },
  { key: "fu2_veteran", category: "AI Chat Practice", label: "FU2 Veteran", description: "Grade 25 FU2 calls.", icon: "📞", metric: "fu2_ratings_count", threshold: 25, points: 80 },
  { key: "questionnaire_veteran", category: "AI Chat Practice", label: "Questionnaire Veteran", description: "Grade 25 Questionnaire calls.", icon: "📞", metric: "questionnaire_ratings_count", threshold: 25, points: 30 },
  { key: "grade_meeting_icon", category: "AI Chat Practice", label: "Grade Meeting Icon", description: "Grade 30 meetings on the AI chat.", icon: "👑", metric: "call_ratings_count", threshold: 30, points: 80 },

  // Calendar & Meetings
  { key: "meeting_legend", category: "Calendar & Meetings", label: "Meeting Legend", description: "200 lifetime meetings logged.", icon: "👑", metric: "total_meetings_lifetime", threshold: 200, points: 80 },
  { key: "meeting_machine_pro", category: "Calendar & Meetings", label: "Meeting Machine Pro", description: "15 meetings in a week.", icon: "📅", metric: "max_meetings_week", threshold: 15, points: 80 },
  { key: "booked_solid_pro", category: "Calendar & Meetings", label: "Booked Solid Pro", description: "30 meetings in a month.", icon: "📅", metric: "max_meetings_month", threshold: 30, points: 80 },
  { key: "meeting_notes", category: "Calendar & Meetings", label: "Meeting Notes", description: "20 lifetime meetings logged.", icon: "🗒️", metric: "total_meetings_lifetime", threshold: 20, points: 20 },

  // Story & Depth
  { key: "storyteller_icon", category: "Story & Depth", label: "Storyteller Icon", description: "250 story shares logged lifetime.", icon: "👑", metric: "total_story_shares_lifetime", threshold: 250, points: 80 },

  // Books
  { key: "marathon_reader_pro", category: "Books", label: "Marathon Reader Pro", description: "50 lifetime books finished.", icon: "📚", metric: "total_books_lifetime", threshold: 50, points: 50 },

  // Games
  { key: "diamond_chase_icon", category: "Games", label: "Diamond Chase Icon", description: "Score 300+ in a single Diamond Chase run.", icon: "👑", metric: "max_diamond_chase_score", threshold: 300, points: 24 },
  { key: "streak_gamer", category: "Games", label: "Streak Gamer", description: "A 14-day Trivia streak while also on an active 14+ day Core Run Streak.", icon: "🧠", metric: "has_streak_gamer", threshold: 1, points: 9 },
  { key: "trivia_grinder", category: "Games", label: "Trivia Grinder", description: "500 lifetime Trivia questions answered correctly.", icon: "🧠", metric: "total_trivia_correct_lifetime", threshold: 500, points: 9 },

  // App Habits
  { key: "weekend_visitor_pro", category: "App Habits", label: "Weekend Visitor Pro", description: "Open the app both Saturday and Sunday, 20 different weekends.", icon: "📱", metric: "weekend_visitor_count", threshold: 20, points: 80 },
  { key: "daily_visitor_icon", category: "App Habits", label: "Daily Visitor Icon", description: "Open the app 60 days in a row.", icon: "📱", metric: "app_opened_streak", threshold: 60, points: 50 },
  { key: "daily_visitor_legend", category: "App Habits", label: "Daily Visitor Legend", description: "Open the app 100 days in a row.", icon: "👑", metric: "app_opened_streak", threshold: 100, points: 80 },

  // Sample Bags
  { key: "sample_bag_icon", category: "Sample Bags", label: "Sample Bag Icon", description: "Give out 50 sample bags.", icon: "👑", metric: "sample_bags_given", threshold: 50, points: 80 },

  // Customers
  { key: "customer_champion_pro", category: "Customers", label: "Customer Champion Pro", description: "Log 50 customer sales.", icon: "🛍️", metric: "total_customer_sales", threshold: 50, points: 56 },
  { key: "big_month_pro", category: "Customers", label: "Big Month Pro", description: "10+ separate sales logged in a single month.", icon: "🛍️", metric: "max_sales_count_month", threshold: 10, points: 80 },
  { key: "sales_month_pro", category: "Customers", label: "Sales Month Pro", description: "500+ PV in customer sales in one month.", icon: "💵", metric: "max_sales_month_pv", threshold: 500, points: 80 },
  { key: "century_of_sales_pro", category: "Customers", label: "Century of Sales Pro", description: "150 customer sales logged in a single year.", icon: "👑", metric: "max_sales_year_count", threshold: 150, points: 80 },

  // Contacts
  { key: "list_builder_icon", category: "Contacts", label: "List Builder Icon", description: "Have 400 names on your A/B list.", icon: "👑", metric: "max_ab_contacts", threshold: 400, points: 240 },
  { key: "list_refresh_pro", category: "Contacts", label: "List Refresh Pro", description: "Add 50 new names to your A/B list in a month.", icon: "📇", metric: "max_contacts_added_month", threshold: 50, points: 240 },
  { key: "full_circle", category: "Contacts", label: "Full Circle", description: "Convert a Contact into a Candidate.", icon: "🔄", metric: "has_full_circle", threshold: 1, points: 90 },

  // Business Structure
  { key: "team_of_200", category: "Business Structure", label: "Team of Two Hundred", description: "200 people total in your downline, any depth.", icon: "👑", metric: "total_downline_people", threshold: 200, points: 240 },
  { key: "steady_growth", category: "Business Structure", label: "Steady Growth", description: "Add at least 1 new leg every quarter for a full year.", icon: "🌱", metric: "has_steady_growth", threshold: 1, points: 90 },

  // Consistency
  { key: "no_zero_days_pro", category: "Consistency", label: "No Zero Days Pro", description: "Log something in Core Run every day for 120 days straight.", icon: "👑", metric: "longest_any_component_streak", threshold: 120, points: 80 },
  { key: "second_wind", category: "Consistency", label: "Second Wind", description: "Rebuild a 30+ day Core Run Streak after it broke, twice.", icon: "💪", metric: "core_run_streak_count_30plus", threshold: 2, points: 30 },

  // Meta / Combo
  { key: "halfway_there_plus", category: "Meta / Combo", label: "Halfway There Plus", description: "Earn 200 badges total.", icon: "👑", metric: "total_badges_earned", threshold: 200, points: 80 },
  { key: "balanced_portfolio", category: "Meta / Combo", label: "Balanced Portfolio", description: "Earn 5+ badges in 5 different categories.", icon: "⚖️", special: "balanced_portfolio", points: 100 },
  { key: "speed_collector", category: "Meta / Combo", label: "Speed Collector", description: "Earn 10 badges within your first 30 days of signing up.", icon: "⚡", metric: "badges_within_30_days_count", threshold: 10, points: 30 },
  { key: "triple_crown", category: "Meta / Combo", label: "Triple Crown", description: "Core 300 + a 30-day Core Run Streak + 10 QI1s, all in the same month.", icon: "👑", metric: "has_triple_crown", threshold: 1, points: 60 },
  { key: "all_in", category: "Meta / Combo", label: "All In", description: "An active candidate, an active goal, and an active Core Run Streak, all at once.", icon: "🎰", metric: "has_all_in", threshold: 1, points: 30 },

  // Push & Calendar
  { key: "notified", category: "Push & Calendar", label: "Notified", description: "Turn on Daily Reminder push notifications.", icon: "🔔", metric: "has_push_subscription", threshold: 1, points: 30 },
  { key: "team_broadcaster", category: "Push & Calendar", label: "Team Broadcaster", description: "Schedule a calendar event visible to your whole downline.", icon: "📢", metric: "has_team_broadcaster", threshold: 1, points: 30 },

  // Profile
  { key: "say_cheese", category: "Profile", label: "Say Cheese", description: "Upload a profile photo.", icon: "📸", metric: "has_profile_photo", threshold: 1, points: 30 },
  { key: "home_team", category: "Profile", label: "Home Team", description: "Fill in your hometown.", icon: "🏠", metric: "has_hometown_filled", threshold: 1, points: 30 },
  { key: "audiophiles_picks", category: "Profile", label: "Audiophile's Picks", description: "Fill in all three Top Favorite Audios.", icon: "🎧", metric: "has_favorite_audios_filled", threshold: 1, points: 30 },
  { key: "bookshelf_picks", category: "Profile", label: "Bookshelf Picks", description: "Fill in all three Top Favorite Books.", icon: "📚", metric: "has_favorite_books_filled", threshold: 1, points: 30 },

  // Audios
  { key: "audio_curator", category: "Audios", label: "Audio Curator", description: "Listen to 20 distinct audio titles, lifetime.", icon: "🎧", metric: "distinct_audio_titles_count", threshold: 20, points: 20 },
  { key: "audio_connoisseur", category: "Audios", label: "Audio Connoisseur", description: "Listen to 50 distinct audio titles, lifetime.", icon: "👑", metric: "distinct_audio_titles_count", threshold: 50, points: 80 },

  // Household
  { key: "shared_vision", category: "Household", label: "Shared Vision", description: "You and your spouse both fill in all three Dreams fields.", icon: "💑", metric: "has_shared_vision", threshold: 1, points: 30 },

  // Leadership & Recognition
  { key: "founders_circle", category: "Leadership & Recognition", label: "Founder's Circle", description: "3 of your direct recruits each build their own team of 5+.", icon: "🌟", metric: "has_founders_circle", threshold: 1, points: 90 },

  // Pipeline Beyond QI1
  { key: "roadmap_regular", category: "Pipeline Beyond QI1", label: "Roadmap Regular", description: "Have 10 candidates active in your pipeline at once.", icon: "🗺️", metric: "current_active_candidates_count", threshold: 10, points: 90 },

  // Assistant
  { key: "screenshot_sharer", category: "Assistant", label: "Screenshot Sharer", description: "Attach a photo to an Assistant conversation.", icon: "📎", metric: "has_screenshot_shared", threshold: 1, points: 30 },

  // Wildcard
  { key: "leap_day", category: "Wildcard", label: "Leap Day", description: "Log a Core Run on February 29th.", icon: "🐸", metric: "has_leap_day_core_run", threshold: 1, points: 30 },
  { key: "new_years_day", category: "Wildcard", label: "New Year's Day", description: "Log a Core Run on January 1st.", icon: "🎊", metric: "has_new_years_core_run", threshold: 1, points: 30 },
  { key: "independence_day", category: "Wildcard", label: "Independence Day", description: "Log a Core Run on July 4th.", icon: "🎆", metric: "has_independence_day_core_run", threshold: 1, points: 30 },

  // Longevity
  { key: "consistency_champion", category: "Longevity", label: "Consistency Champion", description: "Hit Core 300 in 3 different calendar months, lifetime.", icon: "📆", metric: "distinct_core300_months", threshold: 3, points: 20 },

  // Team Culture
  { key: "team_spirit", category: "Team Culture", label: "Team Spirit", description: "Attend a Team Event within 30 days of signing up.", icon: "📸", metric: "has_team_spirit", threshold: 1, points: 30 },

  // QI1s (Monthly) - consecutive-month streaks, not just a single month's count
  { key: "qi1_month8_streak_2", category: "QI1s (Monthly)", label: "8 QI1s, 2 Months Running", description: "8+ QI1s in a month, 2 months in a row.", icon: "📅", metric: "longest_qi1_month_8_streak", threshold: 2, points: 60 },
  { key: "qi1_month8_streak_3", category: "QI1s (Monthly)", label: "8 QI1s, 3 Months Running", description: "8+ QI1s in a month, 3 months in a row.", icon: "📅", metric: "longest_qi1_month_8_streak", threshold: 3, points: 105 },
  { key: "qi1_month8_streak_6", category: "QI1s (Monthly)", label: "8 QI1s, 6 Months Running", description: "8+ QI1s in a month, 6 months in a row.", icon: "📅", metric: "longest_qi1_month_8_streak", threshold: 6, points: 150 },
  { key: "qi1_month8_streak_9", category: "QI1s (Monthly)", label: "8 QI1s, 9 Months Running", description: "8+ QI1s in a month, 9 months in a row.", icon: "📅", metric: "longest_qi1_month_8_streak", threshold: 9, points: 195 },
  { key: "qi1_month8_streak_12", category: "QI1s (Monthly)", label: "8 QI1s, a Full Year Running", description: "8+ QI1s in a month, 12 months in a row.", icon: "👑", metric: "longest_qi1_month_8_streak", threshold: 12, points: 240 },
  { key: "qi1_month10_streak_2", category: "QI1s (Monthly)", label: "10 QI1s, 2 Months Running", description: "10+ QI1s in a month, 2 months in a row.", icon: "📅", metric: "longest_qi1_month_10_streak", threshold: 2, points: 60 },
  { key: "qi1_month10_streak_3", category: "QI1s (Monthly)", label: "10 QI1s, 3 Months Running", description: "10+ QI1s in a month, 3 months in a row.", icon: "📅", metric: "longest_qi1_month_10_streak", threshold: 3, points: 105 },
  { key: "qi1_month10_streak_6", category: "QI1s (Monthly)", label: "10 QI1s, 6 Months Running", description: "10+ QI1s in a month, 6 months in a row.", icon: "📅", metric: "longest_qi1_month_10_streak", threshold: 6, points: 150 },
  { key: "qi1_month10_streak_9", category: "QI1s (Monthly)", label: "10 QI1s, 9 Months Running", description: "10+ QI1s in a month, 9 months in a row.", icon: "📅", metric: "longest_qi1_month_10_streak", threshold: 9, points: 195 },
  { key: "qi1_month10_streak_12", category: "QI1s (Monthly)", label: "10 QI1s, a Full Year Running", description: "10+ QI1s in a month, 12 months in a row.", icon: "👑", metric: "longest_qi1_month_10_streak", threshold: 12, points: 240 },

  // Business Structure - legs launched within a single calendar year
  { key: "legs_year_12", category: "Business Structure", label: "12 Legs in a Year", description: "Launch 12 different legs within a single calendar year.", icon: "🌳", metric: "max_legs_launched_year", threshold: 12, points: 60 },
  { key: "legs_year_15", category: "Business Structure", label: "15 Legs in a Year", description: "Launch 15 different legs within a single calendar year.", icon: "🌳", metric: "max_legs_launched_year", threshold: 15, points: 150 },
  { key: "legs_year_20", category: "Business Structure", label: "20 Legs in a Year", description: "Launch 20 different legs within a single calendar year.", icon: "👑", metric: "max_legs_launched_year", threshold: 20, points: 240 },

  // Core 300 Streak
  { key: "core300_streak_24", category: "Core 300 Streak", label: "2 Years of Core 300", description: "300+ PV, 24 months in a row.", icon: "👑", metric: "longest_core300_streak", threshold: 24, points: 80 },

  // Launches
  { key: "launch_streak_6", category: "Launches", label: "6-Month Launch Streak", description: "Launch someone 6 months in a row.", icon: "🚀", metric: "longest_launch_streak", threshold: 6, points: 240 },

  // Books
  { key: "library_legend", category: "Books", label: "Library Legend", description: "75 lifetime books finished.", icon: "👑", metric: "total_books_lifetime", threshold: 75, points: 80 },
];

export const BADGE_CATEGORIES: string[] = Array.from(new Set(BADGE_DEFINITIONS.map((b) => b.category)));

function metricValue(metrics: BadgeMetrics, key: keyof BadgeMetrics): number {
  const raw = metrics[key];
  return typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
}

// badge_key -> earned_at (ISO string). A Map rather than a Set since
// Well-Rounded needs the earned_at timestamps too, not just which keys
// are earned - Full Spectrum/Perfectionist only ever call .has() on it,
// so they don't care that it's richer than a plain set.
export type EarnedBadgeMap = Map<string, string>;

// Full Spectrum: at least one earned badge (from earnedKeys) in every
// category. Categories with zero regular badges can't happen today, but
// this doesn't assume it - an empty category is just never satisfied.
function hasFullSpectrum(earnedKeys: EarnedBadgeMap): boolean {
  return BADGE_CATEGORIES.every((cat) =>
    BADGE_DEFINITIONS.some((b) => b.category === cat && earnedKeys.has(b.key))
  );
}

// Perfectionist: every badge in some category earned. Excludes Full
// Spectrum/Perfectionist/Well-Rounded themselves from the "required" set
// for whichever category they're in (Meta / Combo) - otherwise that one
// category could never be completed, since Perfectionist would require
// having already earned Perfectionist.
function hasPerfectionist(earnedKeys: EarnedBadgeMap): boolean {
  return BADGE_CATEGORIES.some((cat) => {
    const required = BADGE_DEFINITIONS.filter((b) => b.category === cat && !("special" in b));
    return required.length > 0 && required.every((b) => earnedKeys.has(b.key));
  });
}

// Monday-anchored week bucket key - doesn't need to be a strictly
// compliant ISO week number, just consistent enough that two dates in
// the same Mon-Sun week produce the same key.
function weekBucketKey(isoDate: string): string {
  const d = new Date(isoDate);
  const dayIndex = (d.getUTCDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dayIndex);
  return monday.toISOString().slice(0, 10);
}

// How many distinct categories were earned in each badge's own week,
// keeping only the best week - Well-Rounded is earned once that best
// reaches 3, and the same number (capped at 1) drives its progress bar.
function bestWellRoundedWeekCount(earnedKeys: EarnedBadgeMap): number {
  const categoriesByWeek = new Map<string, Set<string>>();
  for (const [key, earnedAt] of earnedKeys) {
    const def = BADGE_DEFINITIONS.find((b) => b.key === key);
    if (!def) continue;
    const week = weekBucketKey(earnedAt);
    const set = categoriesByWeek.get(week) ?? new Set<string>();
    set.add(def.category);
    categoriesByWeek.set(week, set);
  }
  let best = 0;
  for (const set of categoriesByWeek.values()) best = Math.max(best, set.size);
  return best;
}

// Collector: at least one earned badge in 10 different categories -
// same idea as Full Spectrum, just a lower bar (10, not every category).
function collectorCategoryCount(earnedKeys: EarnedBadgeMap): number {
  return BADGE_CATEGORIES.filter((cat) =>
    BADGE_DEFINITIONS.some((b) => b.category === cat && earnedKeys.has(b.key))
  ).length;
}

// Balanced Portfolio: how many categories have 5+ earned badges in
// them - a higher bar per-category than Collector/Full Spectrum, which
// only ever need 1.
function categoriesWithFiveBadges(earnedKeys: EarnedBadgeMap): number {
  return BADGE_CATEGORIES.filter((cat) => {
    const earnedInCat = BADGE_DEFINITIONS.filter(
      (b) => b.category === cat && earnedKeys.has(b.key)
    ).length;
    return earnedInCat >= 5;
  }).length;
}

// earnedKeys is only needed for the "special" meta badges - every other
// (metric-driven) badge ignores it, so callers that only care about
// those can omit it.
export function isBadgeEarned(
  def: BadgeDefinition,
  metrics: BadgeMetrics,
  earnedKeys?: EarnedBadgeMap
): boolean {
  if ("special" in def) {
    if (!earnedKeys) return false;
    if (def.special === "full_spectrum") return hasFullSpectrum(earnedKeys);
    if (def.special === "perfectionist") return hasPerfectionist(earnedKeys);
    if (def.special === "well_rounded") return bestWellRoundedWeekCount(earnedKeys) >= 3;
    if (def.special === "collector") return collectorCategoryCount(earnedKeys) >= 10;
    return categoriesWithFiveBadges(earnedKeys) >= 5;
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
  earnedKeys?: EarnedBadgeMap
): number {
  if ("special" in def) {
    const keys = earnedKeys ?? new Map<string, string>();
    if (def.special === "full_spectrum") {
      const covered = BADGE_CATEGORIES.filter((cat) =>
        BADGE_DEFINITIONS.some((b) => b.category === cat && keys.has(b.key))
      ).length;
      return BADGE_CATEGORIES.length > 0 ? covered / BADGE_CATEGORIES.length : 0;
    }
    if (def.special === "well_rounded") {
      return Math.max(0, Math.min(1, bestWellRoundedWeekCount(keys) / 3));
    }
    if (def.special === "collector") {
      return Math.max(0, Math.min(1, collectorCategoryCount(keys) / 10));
    }
    if (def.special === "balanced_portfolio") {
      return Math.max(0, Math.min(1, categoriesWithFiveBadges(keys) / 5));
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
