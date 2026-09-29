"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { renderCourseIcon } from "@/lib/way/theme";
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

// Two soft rolling-hill silhouettes behind the road, purely atmospheric -
// low enough opacity to never compete with the path or the waypoints.
function roadHills(): string[] {
  return [
    `M0,${VB_HEIGHT} L0,${VB_HEIGHT - 55} Q45,${VB_HEIGHT - 95} 90,${VB_HEIGHT - 65} T180,${VB_HEIGHT - 80} T${VB_WIDTH},${VB_HEIGHT - 50} L${VB_WIDTH},${VB_HEIGHT} Z`,
    `M0,${VB_HEIGHT} L0,${VB_HEIGHT - 25} Q60,${VB_HEIGHT - 55} 120,${VB_HEIGHT - 30} T${VB_WIDTH},${VB_HEIGHT - 20} L${VB_WIDTH},${VB_HEIGHT} Z`,
  ];
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
  const [hillFar, hillNear] = roadHills();
  const percent = Math.round(fraction * 100);

  return (
    <div className="way-card way-road" style={{ padding: "16px 12px 12px" }}>
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-1.5">
          <Compass className="h-4 w-4" style={{ color: "var(--way-accent)" }} aria-hidden />
          <p className="way-serif text-sm font-bold uppercase tracking-wide" style={{ color: "var(--way-text)" }}>
            Your Journey
          </p>
        </div>
        <p className="text-xs font-semibold" style={{ color: "var(--way-text-dim)" }}>
          {percent}% of the way
        </p>
      </div>

      {/* Waypoints/marker are positioned by percentage against THIS box
          specifically (not the outer card, which also contains the
          heading above) - aspect-ratio keeps it matching the SVG's own
          box exactly regardless of the card's actual rendered width. */}
      <div className="way-road-canvas" style={{ aspectRatio: `${VB_WIDTH} / ${VB_HEIGHT}` }}>
        <svg viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`} className="block w-full h-full" aria-hidden>
          <path d={hillFar} fill="var(--way-text)" opacity={0.05} />
          <path d={hillNear} fill="var(--way-text)" opacity={0.08} />

          <path d={d} fill="none" stroke="var(--way-border)" strokeWidth={5} strokeLinecap="round" strokeDasharray="2 9" />
          <path
            className="way-road-line-fill"
            d={d}
            fill="none"
            stroke="var(--way-accent)"
            strokeWidth={6}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${percent} 100`}
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
              {renderCourseIcon(course.icon, "h-4 w-4")}
            </Link>
          );
        })}

        <div
          className="way-road-marker way-road-you-are-here"
          style={{ left: pct(marker.x, VB_WIDTH), top: pct(marker.y, VB_HEIGHT) }}
          aria-hidden
        >
          <div className="way-road-you-are-here-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local asset, not user content. */}
          <img src="/the-way/legacy-church-mark.png" alt="" className="way-road-you-are-here-mark" />
        </div>
      </div>
    </div>
  );
}
