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

// Where you are along the path, in whole-stage units: 0 = standing at the
// first stage's sign, 1.5 = halfway through the second stage, n = every
// stage finished. Weighted evenly per stage (not by raw lesson count) so
// a 4-lesson stage and a 7-lesson stage each cover the same stretch of
// road - finishing stage 1 of 5 always reads as 1/5 of the way.
export function journeyPosition(courses: CourseWithProgress[]): number {
  const firstUnfinishedIndex = courses.findIndex((c) => coursePct(c) < 1);
  if (firstUnfinishedIndex === -1) return courses.length;
  return firstUnfinishedIndex + coursePct(courses[firstUnfinishedIndex]);
}
