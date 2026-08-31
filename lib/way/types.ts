export type WayRole = "member" | "mentor" | "admin";

export type CourseColorTheme =
  | "amber"
  | "indigo"
  | "emerald"
  | "rose"
  | "sky"
  | "violet"
  | "fuchsia"
  | "teal";

export type LessonItemType = "reading" | "video" | "audio" | "worksheet" | "discussion";

export type WayProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: WayRole;
  mentor_id: string | null;
  unlocked_through: number;
  welcome_video_watched_at: string | null;
  created_at: string;
};

export type Course = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  color_theme: CourseColorTheme;
  order_index: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type LessonItem = {
  id: string;
  course_id: string;
  type: LessonItemType;
  title: string;
  description: string | null;
  content_url: string | null;
  order_index: number;
  created_at: string;
};

export type LessonCompletion = {
  id: string;
  user_id: string;
  lesson_item_id: string;
  completed_at: string;
};

// A course plus the pieces the Courses list page needs to render its
// progress readout, computed client-side from
// courses + lesson_items + lesson_completions rather than stored
// redundantly on the course itself. Every published course is open to
// everyone from the start - no sequential unlock gating - so this has no
// locked/unlocked field.
export type CourseWithProgress = Course & {
  totalItems: number;
  completedItems: number;
};
