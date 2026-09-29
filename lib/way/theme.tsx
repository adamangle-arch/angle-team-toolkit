import {
  BookOpen,
  Compass,
  Users,
  Flame,
  Heart,
  Star,
  Sparkles,
  Headphones,
  Video,
  ClipboardList,
  MessageCircle,
} from "lucide-react";
import type { CourseColorTheme, LessonItemType } from "./types";

// lucide-react's own "Cross" icon reads as a plain plus sign at icon
// size - its arms are close enough to equal length that the religious
// cross shape doesn't register. This is a genuine Latin cross instead:
// a short top arm and a long bottom arm either side of the crossbar,
// drawn in the same stroke style as the surrounding lucide icons so it
// sits in the set without looking out of place.
function WayCross({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="5" y1="8" x2="19" y2="8" />
    </svg>
  );
}

// Course.icon/lesson_items.type are picked from a fixed set of keys, and
// resolved below via a switch that returns an already-built element rather
// than a component reference assigned to a variable and rendered — the
// latter trips this project's "no components created during render" lint
// rule, since a value looked up from a Record can't be proven stable
// across renders the way a plain `<item.icon />` property access can.

export function renderCourseIcon(icon: string, className?: string) {
  switch (icon) {
    case "compass":
      return <Compass className={className} aria-hidden />;
    case "users":
      return <Users className={className} aria-hidden />;
    case "flame":
      return <Flame className={className} aria-hidden />;
    case "heart":
      return <Heart className={className} aria-hidden />;
    case "cross":
      return <WayCross className={className} />;
    case "star":
      return <Star className={className} aria-hidden />;
    case "sparkles":
      return <Sparkles className={className} aria-hidden />;
    case "book-open":
    default:
      return <BookOpen className={className} aria-hidden />;
  }
}

// Course banner background + the ink color that reads on it. Pulled from
// the church's own signpost-and-path artwork (signpost orange, deep and
// steel navy, trail-sign browns) rather than Tailwind's stock jewel-tone
// palette, so every course banner feels like it belongs to the same brand
// instead of a rainbow of unrelated hues.
export const COURSE_COLORS: Record<CourseColorTheme, { bg: string; ink: string }> = {
  amber: { bg: "#e07b35", ink: "#fdf6ec" },
  indigo: { bg: "#223a58", ink: "#f4ecdd" },
  emerald: { bg: "#16283f", ink: "#f4ecdd" },
  rose: { bg: "#b3432c", ink: "#fdf6ec" },
  sky: { bg: "#2f5578", ink: "#f4ecdd" },
  violet: { bg: "#8a5a2e", ink: "#fdf3e4" },
  fuchsia: { bg: "#6b4a35", ink: "#fdf3e4" },
  teal: { bg: "#3d6690", ink: "#f4ecdd" },
};

export function courseColor(theme: CourseColorTheme): { bg: string; ink: string } {
  return COURSE_COLORS[theme] ?? COURSE_COLORS.amber;
}

export function renderLessonTypeIcon(type: LessonItemType, className?: string) {
  switch (type) {
    case "video":
      return <Video className={className} aria-hidden />;
    case "audio":
      return <Headphones className={className} aria-hidden />;
    case "worksheet":
      return <ClipboardList className={className} aria-hidden />;
    case "discussion":
      return <MessageCircle className={className} aria-hidden />;
    case "reading":
    default:
      return <BookOpen className={className} aria-hidden />;
  }
}

export const LESSON_TYPE_LABELS: Record<LessonItemType, string> = {
  reading: "Reading",
  video: "Video",
  audio: "Audio",
  worksheet: "Worksheet",
  discussion: "Discussion",
};
