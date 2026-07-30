import { BADGE_DEFINITIONS } from "./badges";

// Avatar/leveling system, layered on top of the existing Badges catalog -
// every badge already carries a `points` value (see lib/badges.ts's own
// comment for how those were derived), so a person's total is just the
// sum of whatever they've earned.
const POINTS_BY_KEY: Record<string, number> = Object.fromEntries(
  BADGE_DEFINITIONS.map((b) => [b.key, b.points])
);

export function pointsForBadgeKeys(keys: string[]): number {
  return keys.reduce((sum, key) => sum + (POINTS_BY_KEY[key] ?? 0), 0);
}

const LEVEL_BASE = 100;
const LEVEL_EXPONENT = 1.6;
export const MAX_LEVEL = 40;

// Cumulative points needed to REACH each level - level 1 needs 0 (everyone
// starts there). The exponent means each level takes progressively more
// than the last, so even someone who earned every one of the 300 badges
// (22,532 points total, all at 3x/0.3x multipliers already applied) tops
// out a little past level 30 rather than blowing past a linear curve -
// intentionally aspirational, not something a normal level of activity
// reaches quickly.
const LEVEL_THRESHOLDS: number[] = Array.from({ length: MAX_LEVEL + 1 }, (_, level) =>
  level <= 1 ? 0 : Math.round(LEVEL_BASE * Math.pow(level, LEVEL_EXPONENT))
);

export function levelForPoints(points: number): number {
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (points >= LEVEL_THRESHOLDS[l]) level = l;
    else break;
  }
  return level;
}

export type LevelProgress = {
  level: number;
  points: number;
  currentLevelPoints: number;
  nextLevelPoints: number | null;
  progress: number; // 0-1 toward next level, 1 if already at MAX_LEVEL
};

export function levelProgress(points: number): LevelProgress {
  const level = levelForPoints(points);
  const currentLevelPoints = LEVEL_THRESHOLDS[level];
  const nextLevelPoints = level < MAX_LEVEL ? LEVEL_THRESHOLDS[level + 1] : null;
  const progress = nextLevelPoints
    ? Math.max(0, Math.min(1, (points - currentLevelPoints) / (nextLevelPoints - currentLevelPoints)))
    : 1;
  return { level, points, currentLevelPoints, nextLevelPoints, progress };
}

export type FrameTier = "none" | "bronze" | "silver" | "gold" | "diamond";

export function frameTierForLevel(level: number): FrameTier {
  if (level >= 30) return "diamond";
  if (level >= 20) return "gold";
  if (level >= 10) return "silver";
  if (level >= 5) return "bronze";
  return "none";
}

// Tailwind ring classes per tier - applied around the profile photo (or
// its fallback emoji circle) so leveling up is visible without needing
// separate avatar art.
export const FRAME_TIER_CLASSES: Record<FrameTier, string> = {
  none: "ring-2 ring-navy-lighter",
  bronze: "ring-[3px] ring-amber-800",
  silver: "ring-[3px] ring-slate-300",
  gold: "ring-[3px] ring-amber ring-offset-2 ring-offset-navy",
  diamond:
    "ring-[3px] ring-cyan-300 ring-offset-2 ring-offset-navy shadow-[0_0_14px_rgba(103,232,249,0.55)]",
};

export const FRAME_TIER_LABELS: Record<FrameTier, string> = {
  none: "Unranked",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};
