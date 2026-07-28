// Progressive feature unlock: a brand-new signup only sees a handful of
// tabs, and more of the app opens up as their upline/admin unlocks each
// Onboarding session (profiles.onboarding_unlocked_through - the same
// field that already gates Onboarding session content itself). Anything
// not listed here defaults to session 1, i.e. available from signup
// (Today, Calendar, Leaderboard, Onboarding, Resources, My Profile,
// Search, More).
//
// Session 0 is a step below that: candidate accounts (invited via a
// Candidate Roadmap link, not yet Launched - see
// handle_candidate_launched() in supabase/schema.sql) start here and see
// only Resources, explicitly overridden to 0 below. Getting Launched
// bumps them straight to session 1, the same starting point every other
// new signup already begins at.
export const FEATURE_MIN_SESSION: Record<string, number> = {
  "/library": 0,
  "/contacts": 2,
  "/volume": 2,
  "/pipeline": 4,
  "/streak": 5,
  "/goals": 5,
  "/team": 5,
  "/games": 5,
  "/assistant": 5,
};

export function minSessionFor(path: string): number {
  return FEATURE_MIN_SESSION[path] ?? 1;
}
