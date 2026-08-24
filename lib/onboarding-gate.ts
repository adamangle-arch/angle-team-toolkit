// Progressive feature unlock: a brand-new signup only sees a handful of
// tabs, and more of the app opens up as their upline/admin unlocks each
// Onboarding session (profiles.onboarding_unlocked_through - the same
// field that already gates Onboarding session content itself). Anything
// not listed here defaults to session 1, i.e. available from signup
// (Today, Calendar, Leaderboard, Core Run Streak, Onboarding, My Profile,
// Search, More).
//
// Core Run used to sit at session 5 alongside Resources/Team/Games/
// Assistant, but unlike those it isn't tied to a specific curriculum
// topic the way /contacts lines up with Session 2 ("List Building") or
// /pipeline waiting until Session 4 - it's the daily habit tracker
// (Read/Listen/Daily Update/Story Share) everything else in the app
// treats as foundational (streaks, badges, Games unlocking). Gating it
// behind 4 sessions worth of onboarding just loses however many days of
// streak-building momentum someone has right when it's highest, so it's
// available from signup now like Today/Calendar/Leaderboard are.
//
// Resources requires full completion (same tier as Team/Games) rather
// than session 1 like it used to - once real PDF/audio links live there
// (the Books/Audios tabs auto-link to whatever's in the Optional
// Resources library), it stops being a safe "browse everything on day
// one" area and becomes something to earn by actually finishing
// onboarding instead of self-serving ahead of it.
//
// Assistant dropped from session 5 to session 1: a candidate could
// already reach the team's AI assistant before they ever signed up (see
// the Gemini Assistant resource on /prospect), so gating a brand-new
// IBO's own account behind 4 sessions of onboarding took access away
// the moment they launched, right when they'd want it most.
export const FEATURE_MIN_SESSION: Record<string, number> = {
  "/contacts": 2,
  "/volume": 2,
  "/pipeline": 4,
  "/library": 5,
  "/goals": 5,
  "/team": 5,
  "/games": 5,
  "/insights": 5,
};

export function minSessionFor(path: string): number {
  return FEATURE_MIN_SESSION[path] ?? 1;
}
