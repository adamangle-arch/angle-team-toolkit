"use client";

import Link from "next/link";
import WayProgressBar from "@/components/way/WayProgressBar";
import { renderCourseIcon, courseColor } from "@/lib/way/theme";
import type { CourseWithProgress } from "@/lib/way/types";

export default function CourseCard({ course }: { course: CourseWithProgress }) {
  const pct = course.totalItems > 0 ? Math.round((course.completedItems / course.totalItems) * 100) : 0;
  const color = courseColor(course.color_theme);

  return (
    <Link href={`/the-way/courses/${course.id}`} className="way-card block space-y-3">
      <div
        className="flex items-center gap-3 rounded-[10px] p-4"
        style={{ background: color.bg, color: color.ink }}
      >
        {renderCourseIcon(course.icon, "h-6 w-6 shrink-0")}
        <p className="way-serif min-w-0 truncate text-lg font-semibold">{course.title}</p>
      </div>
      <p className="text-sm" style={{ color: "var(--way-text-dim)" }}>
        {course.description}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--way-text-dim)" }}>
          <span>
            {course.completedItems}/{course.totalItems} done
          </span>
          <span>{pct}%</span>
        </div>
        <WayProgressBar pct={pct} />
      </div>
      <span className="way-pill-accent">{course.completedItems > 0 ? "Continue lessons" : "View lessons"}</span>
    </Link>
  );
}
