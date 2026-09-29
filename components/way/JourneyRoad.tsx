"use client";

import Link from "next/link";
import { CircleCheckBig } from "lucide-react";
import { courseStates, journeyFraction } from "@/lib/way/journey";
import type { CourseWithProgress } from "@/lib/way/types";

// Five hand-placed stops forming a gentle S-curve, echoing the winding
// path in the church's own "Come and Follow Me" artwork. Fixed rather
// than computed from course count, since the path is a piece of art, not
// a data visualization - it's designed for exactly 5 stages.
const WAYPOINTS = [
  { x: 40, y: 26 },
  { x: 214, y: 62 },
  { x: 58, y: 116 },
  { x: 226, y: 168 },
  { x: 92, y: 216 },
];

const VB_WIDTH = 260;
const VB_HEIGHT = 240;

function roadPath(): string {
  const [p0, p1, p2, p3, p4] = WAYPOINTS;
  return [
    `M${p0.x},${p0.y}`,
    `Q${(p0.x + p1.x) / 2},${p0.y - 18} ${p1.x},${p1.y}`,
    `Q${(p1.x + p2.x) / 2},${p1.y + 30} ${p2.x},${p2.y}`,
    `Q${(p2.x + p3.x) / 2},${p2.y + 30} ${p3.x},${p3.y}`,
    `Q${(p3.x + p4.x) / 2},${p3.y + 30} ${p4.x},${p4.y}`,
  ].join(" ");
}

// Interpolates a point along the WAYPOINTS polyline (straight segments,
// not the drawn curve's bezier bulge) for a 0-1 progress fraction - close
// enough to the visible road for a marker, without the complexity of
// walking an actual bezier path.
function pointAtFraction(fraction: number): { x: number; y: number } {
  const segments = WAYPOINTS.length - 1;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const scaled = clamped * segments;
  const segIndex = Math.min(Math.floor(scaled), segments - 1);
  const localT = scaled - segIndex;
  const a = WAYPOINTS[segIndex];
  const b = WAYPOINTS[segIndex + 1];
  return { x: a.x + (b.x - a.x) * localT, y: a.y + (b.y - a.y) * localT };
}

function pct(x: number, total: number): string {
  return `${(x / total) * 100}%`;
}

export default function JourneyRoad({ courses }: { courses: CourseWithProgress[] }) {
  if (courses.length === 0) return null;

  const states = courseStates(courses);
  const fraction = journeyFraction(courses);
  const marker = pointAtFraction(fraction);
  const d = roadPath();

  return (
    <div className="way-card way-road" style={{ padding: "20px 12px 12px" }}>
      <svg viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`} className="block w-full h-auto" aria-hidden>
        <path d={d} fill="none" stroke="var(--way-border)" strokeWidth={5} strokeLinecap="round" />
        <path
          className="way-road-line-fill"
          d={d}
          fill="none"
          stroke="var(--way-accent)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray="2 10"
        />
      </svg>

      {courses.slice(0, WAYPOINTS.length).map((course, i) => {
        const state = states[i];
        const point = WAYPOINTS[i];
        return (
          <Link
            key={course.id}
            href={`/the-way/courses/${course.id}`}
            aria-label={`${course.title} — ${state === "done" ? "completed" : state === "current" ? "in progress" : "not started"}`}
            className={`way-road-marker way-road-waypoint ${state === "done" ? "way-road-waypoint--done" : ""} ${state === "current" ? "way-road-waypoint--current" : ""}`}
            style={{ left: pct(point.x, VB_WIDTH), top: pct(point.y, VB_HEIGHT) }}
          >
            {state === "done" ? <CircleCheckBig className="h-4 w-4" aria-hidden /> : i + 1}
          </Link>
        );
      })}

      <div
        className="way-road-marker way-road-you-are-here"
        style={{ left: pct(marker.x, VB_WIDTH), top: pct(marker.y, VB_HEIGHT) }}
        aria-hidden
      />
    </div>
  );
}
