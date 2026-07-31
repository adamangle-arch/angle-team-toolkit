import type { PipelineStageKey, GoalMetric, GoalPeriod, CallRatingType, CalendarEventType, ActivityLogKind } from "./constants";

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
  thinking_big_chapters_confirmed: boolean;
  dream_5_year: string;
  dream_10_year: string;
  dream_lifetime: string;
  onboarding_completed_at: string | null;
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

export type SentNotification = {
  id: string;
  created_at: string;
  kind:
    | "daily_stat_leaders"
    | "weekly_stat_leaders"
    | "monthly_stat_leaders"
    | "core_run_reminder"
    | "calendar_reminder"
    | "calendar_event_added"
    | "call_rating_submitted"
    | "core_run_completed"
    | "pipeline_5plus"
    | "onboarding_unlocked"
    | "games_unlocked"
    | "badge_earned";
  title: string;
  body: string;
  period_type: "daily" | "weekly" | "monthly" | null;
  period_start: string | null;
  user_id: string | null;
  recipient_count: number;
};

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

export type SaleCategory =
  | "XS"
  | "Nutrilite"
  | "Artistry"
  | "Amway Home"
  | "Satinique"
  | "G&H"
  | "Glister"
  | "iCook"
  | "Other";

export type DailySaleEntry = {
  sale_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  categories: SaleCategory[];
  amount: number;
  created_at: string;
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
  categories: SaleCategory[];
  amount: number;
  notes: string;
  created_at: string;
};

export type PipelinePeriod = {
  id: string;
  user_id: string;
  period_type: "daily" | "weekly" | "monthly";
  period_start: string;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
} & Record<PipelineStageKey, number>;

export type Candidate = {
  id: string;
  user_id: string;
  creator_id: string;
  name: string;
  current_step: number;
  notes: string;
  connected_date: string;
  launched: boolean;
  launched_at: string | null;
  filtered_out: boolean;
  access_code: string | null;
  is1_session_mode: "in_person" | "virtual" | null;
  is1_webinar_slot: string | null;
  is1_webinar_selected_at: string | null;
  is1_watched: boolean;
  is1_watched_at: string | null;
  is2_session_mode: "in_person" | "virtual" | null;
  is2_webinar_slot: string | null;
  is2_webinar_selected_at: string | null;
  is2_watched: boolean;
  is2_watched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InfoSessionFlyer = {
  image_url: string | null;
  speaker_name: string | null;
};

export type InfoSessionSpeaker = {
  id: string;
  name: string;
  image_url: string;
  created_at: string;
};

export type CandidateResourceOverride = {
  id: string;
  user_id: string;
  step: number;
  action: "add" | "remove";
  label: string;
  detail: string;
  url: string | null;
  estimate: string | null;
  created_at: string;
};

export type CandidateSpecificResource = {
  id: string;
  candidate_id: string;
  label: string;
  detail: string;
  url: string | null;
  estimate: string | null;
  sent_by: string;
  created_at: string;
};

export type OptionalResourceKind = "audio" | "reading" | "other";

export type OptionalResource = {
  id: string;
  label: string;
  detail: string;
  url: string | null;
  estimate: string | null;
  kind: OptionalResourceKind;
  created_at: string;
};

export type OnboardingResourceOverride = {
  id: string;
  user_id: string;
  session: number;
  action: "add" | "remove";
  label: string;
  detail: string;
  url: string | null;
  estimate: string | null;
  created_at: string;
};

export type MemberResource = {
  id: string;
  recipient_id: string;
  label: string;
  detail: string;
  url: string | null;
  estimate: string | null;
  sent_by: string;
  created_at: string;
};

export type Contact = {
  id: string;
  user_id: string;
  name: string;
  category: "A" | "B" | "Customer";
  status: string;
  notes: string;
  connection_tags: string[];
  reconnect_method: string;
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
  read_items: string[];
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
  reminder_sent: boolean;
  event_type: CalendarEventType;
  reminder_minutes_before: number | null;
};

export type CompanyEvent = {
  id: string;
  title: string;
  notes: string;
  event_at: string;
  created_by: string | null;
  created_at: string;
};

export type TeamEventAlbum = {
  id: string;
  title: string;
  event_date: string;
  created_by: string | null;
  created_at: string;
};

export type EventMedia = {
  id: string;
  album_id: string;
  storage_path: string;
  media_url: string;
  media_type: "photo" | "video";
  caption: string;
  uploaded_by: string | null;
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

export type CallRating = {
  id: string;
  user_id: string;
  call_type: CallRatingType;
  candidate_id: string | null;
  candidate_name: string;
  transcript: string;
  analysis: string;
  overall_score: number | null;
  created_at: string;
};

export type UserBadge = {
  id: string;
  user_id: string;
  badge_key: string;
  earned_at: string;
};

export type BookCompletion = {
  id: string;
  user_id: string;
  completed_at: string;
};

export type EventAttendance = {
  id: string;
  user_id: string;
  album_id: string;
  created_at: string;
};

export type ActivityLog = {
  id: string;
  user_id: string;
  kind: ActivityLogKind;
  created_at: string;
};

// Shape of get_badge_metrics() - one row of every raw number
// lib/badges.ts's thresholds get compared against.
export type BadgeMetrics = {
  longest_core_run_streak: number;
  max_monthly_pv: number;
  max_day1_ditto_pv: number;
  longest_core300_streak: number;
  longest_ditto_streak: number;
  max_audios_day: number;
  longest_audio_streak: number;
  max_questions_day: number;
  max_yeses_day: number;
  max_questions_week: number;
  max_yeses_week: number;
  max_qi1_week: number;
  max_qi1_month: number;
  has_goals: boolean;
  max_books_in_a_year: number;
  max_ab_contacts: number;
  max_contacts_added_month: number;
  total_customer_sales: number;
  max_single_sale_pv: number;
  max_sales_month_pv: number;
  max_is1_month: number;
  max_is2_month: number;
  max_fu1_month: number;
  max_fu1_month_team: number;
  max_fu2_month: number;
  max_fu2_month_team: number;
  total_launches: number;
  longest_launch_streak: number;
  total_launches_team: number;
  has_fast_launch: boolean;
  has_perfect_month: boolean;
  core_run_streak_count_10plus: number;
  max_meetings_week: number;
  max_meetings_month: number;
  team_events_attended: number;
  has_spouse_linked: boolean;
  has_fast_onboarding: boolean;
  has_triple_threat: boolean;
  total_badges_earned: number;
  distinct_core300_months: number;
  times_improved: number;
  longest_trivia_streak: number;
  has_weekend_warrior: boolean;
  leg_count: number;
  total_downline_people: number;
  has_org_combo_3_10: boolean;
  has_org_combo_6_25: boolean;
  has_org_combo_6_50: boolean;
  has_org_combo_9_75: boolean;
  has_org_combo_12_100: boolean;
  legs_with_volume: number;
  legs_on_core_run: number;
  legs_taking_action: number;
  call_ratings_count: number;
  sample_bags_given: number;
  has_customer_survey: boolean;
  has_weekly_training: boolean;
  has_monthly_masterclass: boolean;
  has_quarterly_conference: boolean;
  has_story_practiced: boolean;
  app_opened_streak: number;
  has_profile_complete: boolean;
  note_taker_count: number;
  max_downline_depth: number;
  has_duplication_nation: boolean;
  has_mentor: boolean;
  has_multiplier: boolean;
  times_liked_received: number;
  likes_given: number;
  filtered_out_count: number;
  has_organized_pipeline: boolean;
  has_new_year_core300: boolean;
  has_summer_core300: boolean;
  has_pay_it_forward: boolean;
  has_chain_reaction: boolean;
  second_gen_or_deeper_count: number;
  max_sales_year_count: number;
  resource_recipients_count: number;
  good_neighbor_days: number;
  has_iron_streaker: boolean;
  total_candidates_added: number;
  total_contacts_count: number;
  has_first_qi1: boolean;
  onboarding_sessions_unlocked: number;
  has_full_funnel: boolean;
  max_questionnaire_month: number;
  max_calendar_events_month: number;
  has_caught_up_notifications: boolean;
  total_perfect_trivia_days: number;
  has_played_diamond_chase: boolean;
  diamond_chase_times_improved: number;
  max_diamond_run_score: number;
  longest_weekday_streak_weeks: number;
  longest_any_pv_streak: number;
  max_qi1_month_team: number;
  has_team10_qi1_8: boolean;
  has_dreams_filled: boolean;
  distinct_goal_periods_count: number;
  has_goal_getter: boolean;
  has_household_streak: boolean;
  total_audios_lifetime: number;
  total_books_lifetime: number;
  has_whole_team: boolean;
  has_anniversary: boolean;
  distinct_product_categories_count: number;
  xs_sales_count: number;
  amway_home_sales_count: number;
  max_story_shares_month: number;
  total_story_shares_lifetime: number;
  distinct_call_rating_types_count: number;
  qi2_ratings_count: number;
  fu1_ratings_count: number;
  fu2_ratings_count: number;
  info_sessions_watched_count: number;
  virtual_session_candidates_count: number;
  in_person_session_candidates_count: number;
  max_read_minutes_day: number;
  total_read_minutes_lifetime: number;
  has_fully_resourced: boolean;
  household_core_run_together_days: number;
  total_meetings_lifetime: number;
  has_played_all_games: boolean;
  max_diamond_chase_score: number;
  has_weekend_qi1: boolean;
  longest_any_component_streak: number;
  has_repeat_customer: boolean;
  max_sales_count_month: number;
  has_rising_tide: boolean;
  has_team_ditto: boolean;
  patient_teacher_count: number;
  weekend_visitor_count: number;
  has_wide_and_deep: boolean;
  has_legacy_builder: boolean;
  questionnaire_ratings_count: number;
  has_push_subscription: boolean;
  has_team_broadcaster: boolean;
  has_profile_photo: boolean;
  has_hometown_filled: boolean;
  has_favorite_audios_filled: boolean;
  has_favorite_books_filled: boolean;
  distinct_audio_titles_count: number;
  has_streak_gamer: boolean;
  has_shared_vision: boolean;
  has_founders_circle: boolean;
  has_steady_growth: boolean;
  has_full_circle: boolean;
  current_active_candidates_count: number;
  has_mentors_mentor: boolean;
  has_screenshot_shared: boolean;
  total_trivia_correct_lifetime: number;
  has_leap_day_core_run: boolean;
  has_new_years_core_run: boolean;
  has_independence_day_core_run: boolean;
  badges_within_30_days_count: number;
  has_triple_crown: boolean;
  core_run_streak_count_30plus: number;
  has_all_in: boolean;
  has_team_spirit: boolean;
  longest_qi1_month_8_streak: number;
  longest_qi1_month_10_streak: number;
  max_legs_launched_year: number;
};
