// Progressive feature unlock: a brand-new signup only sees a handful of
// tabs, and more of the app opens up as their upline/admin unlocks each
// Onboarding session (profiles.onboarding_unlocked_through - the same
// field that already gates Onboarding session content itself). Anything
// not listed here defaults to session 1, i.e. available from signup
// (Today, Calendar, Leaderboard, Onboarding, My Profile, Search, More).
//
// Resources requires full completion (same tier as Team/Games/
// Assistant) rather than session 1 like it used to - once real PDF/
// audio links live there (the Books/Audios tabs auto-link to whatever's
// in the Optional Resources library), it stops being a safe "browse
// everything on day one" area and becomes something to earn by actually
// finishing onboarding instead of self-serving ahead of it.
export const FEATURE_MIN_SESSION: Record<string, number> = {
  "/contacts": 2,
  "/volume": 2,
  "/pipeline": 4,
  "/library": 5,
  "/streak": 5,
  "/goals": 5,
  "/team": 5,
  "/games": 5,
  "/assistant": 5,
};

export function minSessionFor(path: string): number {
  return FEATURE_MIN_SESSION[path] ?? 1;
}
