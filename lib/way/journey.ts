import type { CourseWithProgress } from "./types";

export type CourseJourneyState = "default" | "current" | "done";

function coursePct(course: CourseWithProgress): number {
  return course.totalItems > 0 ? course.completedItems / course.totalItems : 0;
}

// The first not-yet-finished course, in order_index order, is "current" -
// everything before it is "done", everything after is the plain default
// state. If every course is finished, nothing is "current" (the whole
// path is walked). Courses with zero lesson items yet (no content added)
// count as not-yet-finished so they can still become "current".
export function courseStates(courses: CourseWithProgress[]): CourseJourneyState[] {
  const firstUnfinishedIndex = courses.findIndex((c) => coursePct(c) < 1);
  return courses.map((_, i) => {
    if (firstUnfinishedIndex === -1) return "done";
    if (i < firstUnfinishedIndex) return "done";
    if (i === firstUnfinishedIndex) return "current";
    return "default";
  });
}

// Overall progress through the 5-stage path as a 0-1 fraction, weighted
// evenly by course (not by raw lesson-item count) so courses with very
// different lesson counts don't distort how far along the road you look -
// finishing course 1 of 5 always reads as 1/5 of the way, whether it had
// 4 lessons or 7.
export function journeyFraction(courses: CourseWithProgress[]): number {
  if (courses.length === 0) return 0;
  const firstUnfinishedIndex = courses.findIndex((c) => coursePct(c) < 1);
  if (firstUnfinishedIndex === -1) return 1;
  return (firstUnfinishedIndex + coursePct(courses[firstUnfinishedIndex])) / courses.length;
}
