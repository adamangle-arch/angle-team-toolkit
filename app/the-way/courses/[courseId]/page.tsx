"use client";

import { use, useEffect, useState } from "react";
import { CircleCheckBig, Circle, ExternalLink } from "lucide-react";
import WayHeader from "@/components/way/WayHeader";
import ProgressBar from "@/components/ProgressBar";
import { SkeletonList } from "@/components/Skeleton";
import { useWayAuth } from "@/components/way/WayAuthGate";
import { waySupabase } from "@/lib/way/supabaseClient";
import { renderCourseIcon, courseGradient, renderLessonTypeIcon, LESSON_TYPE_LABELS } from "@/lib/way/theme";
import type { Course, LessonItem } from "@/lib/way/types";

export default function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { profile } = useWayAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [items, setItems] = useState<LessonItem[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: courseRow, error: courseError } = await waySupabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .single();

      if (cancelled) return;
      if (courseError) {
        setError(courseError.message);
        setLoading(false);
        return;
      }

      const { data: itemRows, error: itemError } = await waySupabase
        .from("lesson_items")
        .select("*")
        .eq("course_id", courseId)
        .order("order_index", { ascending: true });

      const itemIds = ((itemRows as LessonItem[] | null) ?? []).map((i) => i.id);
      const { data: completionRows, error: completionError } =
        itemIds.length === 0
          ? { data: [], error: null }
          : await waySupabase
              .from("lesson_completions")
              .select("lesson_item_id")
              .eq("user_id", profile.id)
              .in("lesson_item_id", itemIds);

      if (cancelled) return;

      const firstError = itemError || completionError;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      setCourse(courseRow as Course);
      setItems((itemRows as LessonItem[]) ?? []);
      setCompletedIds(new Set(((completionRows as { lesson_item_id: string }[]) ?? []).map((c) => c.lesson_item_id)));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [courseId, profile.id]);

  async function toggleItem(itemId: string) {
    const wasCompleted = completedIds.has(itemId);
    setSavingId(itemId);

    // Optimistic — reverted below if the write fails.
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (wasCompleted) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

    const { error } = wasCompleted
      ? await waySupabase.from("lesson_completions").delete().eq("user_id", profile.id).eq("lesson_item_id", itemId)
      : await waySupabase.from("lesson_completions").insert({ user_id: profile.id, lesson_item_id: itemId });

    setSavingId(null);

    if (error) {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        if (wasCompleted) next.add(itemId);
        else next.delete(itemId);
        return next;
      });
      setError(`Couldn't save that: ${error.message}`);
    }
  }

  const pct = items.length > 0 ? Math.round((completedIds.size / items.length) * 100) : 0;

  return (
    <>
      <WayHeader title={course?.title ?? "Course"} backHref="/the-way/courses" />
      <main className="page-main">
        {loading ? (
          <SkeletonList cards={3} />
        ) : error && !course ? (
          <p className="empty-state">Couldn&apos;t load this course: {error}</p>
        ) : !course ? (
          <p className="empty-state">Course not found.</p>
        ) : (
          <>
            <div
              className={`flex items-center gap-3 rounded-xl bg-gradient-to-br p-4 ${courseGradient(course.color_theme)}`}
            >
              {renderCourseIcon(course.icon, "h-7 w-7 shrink-0 text-white")}
              <p className="min-w-0 truncate text-lg font-bold text-white">{course.title}</p>
            </div>

            <p className="text-sm text-slate-300">{course.description}</p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {completedIds.size}/{items.length} done
                </span>
                <span>{pct}%</span>
              </div>
              <ProgressBar pct={pct} />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            {items.length === 0 ? (
              <p className="empty-state">No lessons in this course yet.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const done = completedIds.has(item.id);
                  return (
                    <div key={item.id} className="card flex items-start gap-3">
                      <button
                        type="button"
                        aria-label={done ? "Mark not done" : "Mark done"}
                        className="mt-0.5 shrink-0 active:scale-90"
                        onClick={() => toggleItem(item.id)}
                        disabled={savingId === item.id}
                      >
                        {done ? (
                          <CircleCheckBig className="h-6 w-6 text-amber" aria-hidden />
                        ) : (
                          <Circle className="h-6 w-6 text-slate-600" aria-hidden />
                        )}
                      </button>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          {renderLessonTypeIcon(item.type, "h-3.5 w-3.5 shrink-0 text-slate-400")}
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            {LESSON_TYPE_LABELS[item.type]}
                          </span>
                        </div>
                        <p className={`text-sm font-semibold ${done ? "text-slate-400 line-through" : "text-white"}`}>
                          {item.title}
                        </p>
                        {item.description && <p className="text-sm text-slate-400">{item.description}</p>}
                        {item.content_url && (
                          <a
                            href={item.content_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-amber-light underline"
                          >
                            Open <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
