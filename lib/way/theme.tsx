import {
  BookOpen,
  Compass,
  Users,
  Flame,
  Heart,
  Cross,
  Star,
  Sparkles,
  Headphones,
  Video,
  ClipboardList,
  MessageCircle,
} from "lucide-react";
import type { CourseColorTheme, LessonItemType } from "./types";

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
      return <Cross className={className} aria-hidden />;
    case "star":
      return <Star className={className} aria-hidden />;
    case "sparkles":
      return <Sparkles className={className} aria-hidden />;
    case "book-open":
    default:
      return <BookOpen className={className} aria-hidden />;
  }
}

// Flat, muted earth tones per course.color_theme (not Tailwind's stock
// saturated palette, not a glossy gradient) — banner background + the ink
// color that reads on it, keeping the calmer "waypoint marker" feel
// rather than a gamified dashboard badge.
export const COURSE_COLORS: Record<CourseColorTheme, { bg: string; ink: string }> = {
  amber: { bg: "#8a5a2e", ink: "#fdf3e4" },
  indigo: { bg: "#3d3a63", ink: "#eee9fb" },
  emerald: { bg: "#3f5c46", ink: "#eaf3ea" },
  rose: { bg: "#7a3f42", ink: "#fbe9ea" },
  sky: { bg: "#3c5566", ink: "#e8f1f5" },
  violet: { bg: "#5a4470", ink: "#f1e9f7" },
  fuchsia: { bg: "#75405d", ink: "#f8e9f0" },
  teal: { bg: "#2f5955", ink: "#e6f3f0" },
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
