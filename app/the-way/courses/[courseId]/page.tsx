"use client";

import { use, useEffect, useState } from "react";
import { CircleCheckBig, Circle, ExternalLink } from "lucide-react";
import WayHeader from "@/components/way/WayHeader";
import WayProgressBar from "@/components/way/WayProgressBar";
import MilestoneToast from "@/components/way/MilestoneToast";
import CompletionCelebration from "@/components/way/CompletionCelebration";
import { WaySkeletonList } from "@/components/way/WaySkeleton";
import { useWayAuth } from "@/components/way/WayAuthGate";
import { waySupabase } from "@/lib/way/supabaseClient";
import { renderCourseIcon, courseColor, renderLessonTypeIcon, LESSON_TYPE_LABELS } from "@/lib/way/theme";
import type { Course, LessonItem } from "@/lib/way/types";

const MILESTONE_THRESHOLDS = [25, 50, 75] as const;

export default function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { profile } = useWayAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [items, setItems] = useState<LessonItem[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);

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

  useEffect(() => {
    if (milestone === null) return;
    const timer = setTimeout(() => setMilestone(null), 3200);
    return () => clearTimeout(timer);
  }, [milestone]);

  async function toggleItem(itemId: string) {
    const wasCompleted = completedIds.has(itemId);
    const oldSize = completedIds.size;
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
      return;
    }

    // Milestones only fire on forward progress (checking something off,
    // not unchecking it), compared against pct just before this change.
    if (!wasCompleted && items.length > 0) {
      const oldPct = Math.round((oldSize / items.length) * 100);
      const newPct = Math.round(((oldSize + 1) / items.length) * 100);
      if (newPct >= 100 && oldPct < 100) {
        setShowCompletion(true);
      } else {
        const crossed = MILESTONE_THRESHOLDS.filter((t) => oldPct < t && newPct >= t).pop();
        if (crossed) setMilestone(crossed);
      }
    }
  }

  const pct = items.length > 0 ? Math.round((completedIds.size / items.length) * 100) : 0;
  const color = course ? courseColor(course.color_theme) : null;

  return (
    <>
      <WayHeader title={course?.title ?? "Course"} backHref="/the-way/courses" />
      <main className="way-page-main">
        {loading ? (
          <WaySkeletonList cards={3} />
        ) : error && !course ? (
          <p className="way-empty-state">Couldn&apos;t load this course: {error}</p>
        ) : !course || !color ? (
          <p className="way-empty-state">Course not found.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-[10px] p-4" style={{ background: color.bg, color: color.ink }}>
              {renderCourseIcon(course.icon, "h-6 w-6 shrink-0")}
              <p className="way-serif min-w-0 truncate text-lg font-semibold">{course.title}</p>
            </div>

            <p className="text-sm" style={{ color: "var(--way-text-dim)" }}>
              {course.description}
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--way-text-dim)" }}>
                <span>
                  {completedIds.size}/{items.length} done
                </span>
                <span>{pct}%</span>
              </div>
              <WayProgressBar pct={pct} />
            </div>

            {error && (
              <p className="text-xs" style={{ color: "var(--way-danger)" }}>
                {error}
              </p>
            )}

            {items.length === 0 ? (
              <p className="way-empty-state">No lessons in this course yet.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const done = completedIds.has(item.id);
                  return (
                    <div key={item.id} className="way-card flex items-start gap-3">
                      <button
                        type="button"
                        aria-label={done ? "Mark not done" : "Mark done"}
                        className="mt-0.5 shrink-0 active:scale-90"
                        onClick={() => toggleItem(item.id)}
                        disabled={savingId === item.id}
                      >
                        {done ? (
                          <CircleCheckBig className="h-6 w-6" style={{ color: "var(--way-accent-2)" }} aria-hidden />
                        ) : (
                          <Circle className="h-6 w-6" style={{ color: "var(--way-border)" }} aria-hidden />
                        )}
                      </button>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          {renderLessonTypeIcon(item.type, "h-3.5 w-3.5 shrink-0")}
                          <span
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: "var(--way-text-dim)" }}
                          >
                            {LESSON_TYPE_LABELS[item.type]}
                          </span>
                        </div>
                        <p
                          className="text-sm font-semibold"
                          style={{
                            color: done ? "var(--way-text-dim)" : "var(--way-text)",
                            textDecoration: done ? "line-through" : "none",
                          }}
                        >
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-sm" style={{ color: "var(--way-text-dim)" }}>
                            {item.description}
                          </p>
                        )}
                        {item.content_url && (
                          <a
                            href={item.content_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs underline"
                            style={{ color: "var(--way-accent)" }}
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
      {milestone !== null && <MilestoneToast pct={milestone} />}
      {showCompletion && course && (
        <CompletionCelebration
          courseTitle={course.title}
          completionMessage={course.completion_message}
          onDone={() => setShowCompletion(false)}
        />
      )}
    </>
  );
}
