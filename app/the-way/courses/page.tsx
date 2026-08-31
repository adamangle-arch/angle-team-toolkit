"use client";

import { useEffect, useState } from "react";
import WayHeader from "@/components/way/WayHeader";
import CourseCard from "@/components/way/CourseCard";
import { SkeletonList } from "@/components/Skeleton";
import { useWayAuth } from "@/components/way/WayAuthGate";
import { waySupabase } from "@/lib/way/supabaseClient";
import type { Course, CourseWithProgress, LessonItem, LessonCompletion } from "@/lib/way/types";

export default function CoursesPage() {
  const { profile } = useWayAuth();
  const [courses, setCourses] = useState<CourseWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [{ data: courseRows, error: courseError }, { data: itemRows, error: itemError }, { data: completionRows, error: completionError }] =
        await Promise.all([
          waySupabase.from("courses").select("*").eq("is_published", true).order("order_index", { ascending: true }),
          waySupabase.from("lesson_items").select("id,course_id"),
          waySupabase.from("lesson_completions").select("lesson_item_id").eq("user_id", profile.id),
        ]);

      if (cancelled) return;

      const firstError = courseError || itemError || completionError;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      const items = (itemRows as Pick<LessonItem, "id" | "course_id">[]) ?? [];
      const completedItemIds = new Set(
        ((completionRows as Pick<LessonCompletion, "lesson_item_id">[]) ?? []).map((c) => c.lesson_item_id)
      );

      const withProgress: CourseWithProgress[] = ((courseRows as Course[]) ?? []).map((course) => {
        const courseItems = items.filter((i) => i.course_id === course.id);
        const completedItems = courseItems.filter((i) => completedItemIds.has(i.id)).length;
        return {
          ...course,
          totalItems: courseItems.length,
          completedItems,
        };
      });

      setCourses(withProgress);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  return (
    <>
      <WayHeader title="The Way" subtitle="Your discipleship journey" />
      <main className="page-main">
        {loading ? (
          <SkeletonList cards={4} />
        ) : error ? (
          <p className="empty-state">Couldn&apos;t load your courses: {error}</p>
        ) : courses.length === 0 ? (
          <p className="empty-state">No courses yet — check back soon.</p>
        ) : (
          courses.map((course) => <CourseCard key={course.id} course={course} />)
        )}
      </main>
    </>
  );
}
