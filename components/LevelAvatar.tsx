import { frameTierForLevel, FRAME_TIER_CLASSES } from "@/lib/levels";

const SIZE_CLASSES: Record<"xs" | "sm" | "md" | "lg", string> = {
  xs: "h-6 w-6 text-xs",
  sm: "h-10 w-10 text-lg",
  md: "h-16 w-16 text-2xl",
  lg: "h-20 w-20 text-3xl",
};

const CHIP_SIZE_CLASSES: Record<"xs" | "sm" | "md" | "lg", string> = {
  xs: "h-3 min-w-3 text-[7px] -bottom-0.5 -right-0.5",
  sm: "h-4 min-w-4 text-[9px] -bottom-0.5 -right-0.5",
  md: "h-5 min-w-5 text-[10px] -bottom-1 -right-1",
  lg: "h-6 min-w-6 text-xs -bottom-1 -right-1",
};

// Shared avatar-with-level-frame - the profile photo (or a fallback emoji
// circle when there isn't one) wrapped in a ring that upgrades in color as
// the person levels up (see lib/levels.ts), plus an optional small level
// number chip. Used on My Profile, the public profile, and Leaderboard rows.
export default function LevelAvatar({
  photoUrl,
  level,
  name,
  size = "md",
  showLevelChip = true,
}: {
  photoUrl: string | null;
  level: number;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showLevelChip?: boolean;
}) {
  const tier = frameTierForLevel(level);
  const sizeClass = SIZE_CLASSES[size];
  const ringClass = FRAME_TIER_CLASSES[tier];

  return (
    <div className="relative inline-block shrink-0">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name ?? "Profile photo"}
          className={`${sizeClass} rounded-full object-cover ${ringClass}`}
        />
      ) : (
        <div
          className={`flex ${sizeClass} items-center justify-center rounded-full bg-navy ${ringClass}`}
        >
          🙂
        </div>
      )}
      {showLevelChip && (
        <span
          className={`absolute flex items-center justify-center rounded-full bg-amber px-1 font-bold text-navy ring-2 ring-navy ${CHIP_SIZE_CLASSES[size]}`}
        >
          {level}
        </span>
      )}
    </div>
  );
}
