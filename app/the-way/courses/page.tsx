"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, CirclePlay, Sunrise } from "lucide-react";
import WayHeader from "@/components/way/WayHeader";
import CourseCard from "@/components/way/CourseCard";
import WayProgressBar from "@/components/way/WayProgressBar";
import { WaySkeletonList } from "@/components/way/WaySkeleton";
import { useWayAuth } from "@/components/way/WayAuthGate";
import { waySupabase } from "@/lib/way/supabaseClient";
import { computeStreak } from "@/lib/way/streak";
import { renderCourseIcon, courseColor } from "@/lib/way/theme";
import type { Course, CourseWithProgress, Devotional, LessonItem } from "@/lib/way/types";

type CompletionRow = { lesson_item_id: string; completed_at: string };

// Local calendar date as YYYY-MM-DD, matching devotionals.devotional_date
// (a plain date column) — deliberately the viewer's own local day, not a
// server/UTC one, so "today's devotional" flips over at their own midnight.
function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function CoursesPage() {
  const { profile } = useWayAuth();
  const [courses, setCourses] = useState<CourseWithProgress[]>([]);
  const [streak, setStreak] = useState(0);
  const [resumeCourse, setResumeCourse] = useState<CourseWithProgress | null>(null);
  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [
        { data: courseRows, error: courseError },
        { data: itemRows, error: itemError },
        { data: completionRows, error: completionError },
        { data: devotionalRow },
      ] = await Promise.all([
        waySupabase.from("courses").select("*").eq("is_published", true).order("order_index", { ascending: true }),
        waySupabase.from("lesson_items").select("id,course_id"),
        waySupabase.from("lesson_completions").select("lesson_item_id,completed_at").eq("user_id", profile.id),
        // Missing entirely just means no card today — not an error worth
        // blocking the rest of the page over.
        waySupabase.from("devotionals").select("*").eq("devotional_date", todayIso()).maybeSingle(),
      ]);

      if (cancelled) return;

      const firstError = courseError || itemError || completionError;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      setDevotional((devotionalRow as Devotional) ?? null);

      const items = (itemRows as Pick<LessonItem, "id" | "course_id">[]) ?? [];
      const completions = (completionRows as CompletionRow[]) ?? [];
      const completedAtByItemId = new Map(completions.map((c) => [c.lesson_item_id, c.completed_at]));

      let latestCourse: CourseWithProgress | null = null;
      let latestCompletedAt = "";

      const withProgress: CourseWithProgress[] = ((courseRows as Course[]) ?? []).map((course) => {
        const courseItems = items.filter((i) => i.course_id === course.id);
        const completedItems = courseItems.filter((i) => completedAtByItemId.has(i.id)).length;
        const withProgressCourse = { ...course, totalItems: courseItems.length, completedItems };

        if (completedItems > 0 && completedItems < courseItems.length) {
          const mostRecent = courseItems
            .map((i) => completedAtByItemId.get(i.id))
            .filter((d): d is string => Boolean(d))
            .sort()
            .pop();
          if (mostRecent && mostRecent > latestCompletedAt) {
            latestCompletedAt = mostRecent;
            latestCourse = withProgressCourse;
          }
        }

        return withProgressCourse;
      });

      setCourses(withProgress);
      setResumeCourse(latestCourse);
      setStreak(computeStreak(completions.map((c) => c.completed_at)));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  const resumeColor = resumeCourse ? courseColor(resumeCourse.color_theme) : null;
  const resumePct =
    resumeCourse && resumeCourse.totalItems > 0 ? Math.round((resumeCourse.completedItems / resumeCourse.totalItems) * 100) : 0;

  return (
    <>
      <WayHeader title="The Way" subtitle="Your discipleship journey" />
      <main className="way-page-main">
        {loading ? (
          <WaySkeletonList cards={4} />
        ) : error ? (
          <p className="way-empty-state">Couldn&apos;t load your courses: {error}</p>
        ) : courses.length === 0 ? (
          <p className="way-empty-state">No courses yet — check back soon.</p>
        ) : (
          <>
            {devotional && (
              <div className="way-card space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--way-text-dim)" }}>
                  <Sunrise className="h-3.5 w-3.5" aria-hidden />
                  Today
                </div>
                {devotional.verse_reference && (
                  <p className="way-serif text-base font-semibold" style={{ color: "var(--way-text)" }}>
                    {devotional.verse_reference}
                  </p>
                )}
                {devotional.verse_text && (
                  <p className="text-sm italic" style={{ color: "var(--way-text)" }}>
                    &ldquo;{devotional.verse_text}&rdquo;
                  </p>
                )}
                <p className="text-sm" style={{ color: "var(--way-text-dim)" }}>
                  {devotional.reflection}
                </p>
              </div>
            )}

            {streak > 0 && (
              <div className="way-pill inline-flex w-fit items-center gap-1.5">
                <Flame className="h-3.5 w-3.5" style={{ color: "var(--way-accent)" }} aria-hidden />
                {streak} day{streak === 1 ? "" : "s"} in a row
              </div>
            )}

            {resumeCourse && resumeColor && (
              <Link href={`/the-way/courses/${resumeCourse.id}`} className="way-card block space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--way-text-dim)" }}>
                  <CirclePlay className="h-3.5 w-3.5" aria-hidden />
                  Continue where you left off
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: resumeColor.bg, color: resumeColor.ink }}
                  >
                    {renderCourseIcon(resumeCourse.icon, "h-4 w-4")}
                  </div>
                  <p className="way-serif truncate text-base font-semibold" style={{ color: "var(--way-text)" }}>
                    {resumeCourse.title}
                  </p>
                </div>
                <WayProgressBar pct={resumePct} />
              </Link>
            )}

            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </>
        )}
      </main>
    </>
  );
}
