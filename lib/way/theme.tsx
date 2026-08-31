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

// Tailwind gradient stop classes for each course.color_theme, applied as
// `bg-gradient-to-br ${courseGradient(theme)}` on the card banner.
export const COURSE_GRADIENTS: Record<CourseColorTheme, string> = {
  amber: "from-amber-400 to-orange-600",
  indigo: "from-indigo-400 to-blue-700",
  emerald: "from-emerald-400 to-teal-700",
  rose: "from-rose-400 to-red-600",
  sky: "from-sky-400 to-blue-600",
  violet: "from-violet-400 to-purple-700",
  fuchsia: "from-fuchsia-400 to-pink-700",
  teal: "from-teal-400 to-cyan-700",
};

export function courseGradient(theme: CourseColorTheme): string {
  return COURSE_GRADIENTS[theme] ?? COURSE_GRADIENTS.amber;
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
