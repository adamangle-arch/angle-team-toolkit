"use client";

import Link from "next/link";
import ProgressBar from "@/components/ProgressBar";
import { renderCourseIcon, courseGradient } from "@/lib/way/theme";
import type { CourseWithProgress } from "@/lib/way/types";

export default function CourseCard({ course }: { course: CourseWithProgress }) {
  const pct = course.totalItems > 0 ? Math.round((course.completedItems / course.totalItems) * 100) : 0;

  return (
    <Link href={`/the-way/courses/${course.id}`} className="card block space-y-3">
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
            {course.completedItems}/{course.totalItems} done
          </span>
          <span>{pct}%</span>
        </div>
        <ProgressBar pct={pct} />
      </div>
      <span className="pill-amber inline-block text-xs">
        {course.completedItems > 0 ? "Continue lessons" : "View lessons"}
      </span>
    </Link>
  );
}
