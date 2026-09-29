"use client";

import Link from "next/link";
import WayProgressBar from "@/components/way/WayProgressBar";
import CourseSign from "@/components/way/CourseSign";
import { renderCourseIcon } from "@/lib/way/theme";
import type { CourseWithProgress } from "@/lib/way/types";

export default function CourseCard({ course }: { course: CourseWithProgress }) {
  const pct = course.totalItems > 0 ? Math.round((course.completedItems / course.totalItems) * 100) : 0;

  return (
    <Link href={`/the-way/courses/${course.id}`} className="way-card block space-y-3">
      <CourseSign icon={renderCourseIcon(course.icon, "h-6 w-6")} title={course.title} />
      <p className="text-center text-sm" style={{ color: "var(--way-text-dim)" }}>
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
      <span className="way-pill-accent mx-auto block w-fit">
        {course.completedItems > 0 ? "Continue lessons" : "View lessons"}
      </span>
    </Link>
  );
}
