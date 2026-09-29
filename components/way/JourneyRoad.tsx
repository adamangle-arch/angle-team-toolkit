"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { journeyPosition } from "@/lib/way/journey";
import {
  MAP_H,
  MAP_W,
  ROAD_CENTERLINE,
  ROAD_EDGE,
  ROAD_OUTLINE,
  ROAD_START_ARC,
  SIGN_BASES,
  SPARKLE_ARCS,
  STOPS,
  SUMMIT,
  SUN,
  SUN_RAYS,
  TREES_FAR,
  TREES_MID,
  TREES_NEAR,
  arcForPosition,
  perspectiveScale,
  pointAtArc,
  ribbonPath,
} from "@/lib/way/journeyMap";
import type { CourseWithProgress } from "@/lib/way/types";

type SignVisual = "upcoming" | "current" | "done";

function signVisual(index: number, position: number): SignVisual {
  const p = position + 1e-6;
  if (p < index) return "upcoming";
  if (p < index + 1) return "current";
  return "done";
}

function pct(v: number, total: number): string {
  return `${(v / total) * 100}%`;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

// The Courses page centerpiece: a winding road narrowing into the
// distance toward a cross on the far hill, with a sign for each stage at
// its switchback. On load a lantern walks the road from the start to
// where you actually are, lighting each sign as it passes and counting
// your percentage up - "your word is a lamp to my feet and a light to my
// path." Designed for the church's five stages; a shorter curriculum
// just uses the first stretches of road.
export default function JourneyRoad({ courses }: { courses: CourseWithProgress[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const reducedMotion = usePrefersReducedMotion();

  const stages = courses.slice(0, STOPS.length);
  const target = journeyPosition(stages);

  const [animated, setAnimated] = useState(0);
  const animatedRef = useRef(0);

  useEffect(() => {
    if (reducedMotion) return;
    const from = animatedRef.current;
    const to = target;
    if (Math.abs(to - from) < 1e-6) return;
    const duration = Math.min(3400, 900 + 620 * Math.abs(to - from));
    const delay = from === 0 ? 450 : 0;
    let start: number | undefined;
    let frame = 0;
    const step = (now: number) => {
      if (start === undefined) start = now + delay;
      const t = Math.min(Math.max((now - start) / duration, 0), 1);
      const value = from + (to - from) * easeInOutCubic(t);
      animatedRef.current = value;
      setAnimated(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reducedMotion]);

  if (stages.length === 0) return null;

  const position = reducedMotion ? target : animated;
  const travelerArc = arcForPosition(position);
  const traveler = pointAtArc(travelerArc);
  const travelerScale = perspectiveScale(traveler.y);
  const complete = target >= stages.length - 1e-6;
  const percent = Math.round((position / stages.length) * 100);

  const currentIndex = stages.findIndex((c) => c.totalItems === 0 || c.completedItems < c.totalItems);
  const stageLabel =
    currentIndex === -1
      ? "Journey complete"
      : `Stage ${currentIndex + 1} of ${stages.length} · ${stages[currentIndex].title}`;

  const ids = {
    sky: `${uid}-sky`,
    sunGlow: `${uid}-sunglow`,
    sunDisk: `${uid}-sundisk`,
    halo: `${uid}-halo`,
    blur: `${uid}-blur`,
  };

  return (
    <section
      className={`way-map way-fade-up ${complete ? "way-map--complete" : ""}`}
      aria-label={`Your journey: ${Math.round((target / stages.length) * 100)}% complete`}
    >
      <div className="way-map-canvas" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden>
          <defs>
            <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="150" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fdf7ee" />
              <stop offset="0.55" stopColor="#fbe7cd" />
              <stop offset="1" stopColor="#f5cc9b" />
            </linearGradient>
            <radialGradient id={ids.sunGlow} cx={SUN.x} cy={SUN.y} r="100" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ffd9a6" stopOpacity="0.95" />
              <stop offset="0.4" stopColor="#f8bf85" stopOpacity="0.4" />
              <stop offset="1" stopColor="#f8bf85" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={ids.sunDisk} cx="0.42" cy="0.38" r="0.7">
              <stop offset="0" stopColor="#fff0d6" />
              <stop offset="1" stopColor="#f08f3e" />
            </radialGradient>
            <radialGradient id={ids.halo}>
              <stop offset="0" stopColor="#ffb86b" stopOpacity="0.85" />
              <stop offset="0.5" stopColor="#f08a3a" stopOpacity="0.35" />
              <stop offset="1" stopColor="#f08a3a" stopOpacity="0" />
            </radialGradient>
            <filter id={ids.blur} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>

          {/* Sky, and the sun rising behind the summit */}
          <rect width={MAP_W} height={MAP_H} fill={`url(#${ids.sky})`} />
          <circle cx={SUN.x} cy={SUN.y} r="100" fill={`url(#${ids.sunGlow})`} />
          <path
            className="way-map-rays"
            style={{ transformOrigin: `${SUN.x}px ${SUN.y}px` }}
            d={SUN_RAYS}
            fill="#f3b06a"
          />
          <circle cx={SUN.x} cy={SUN.y} r="17" fill={`url(#${ids.sunDisk})`} />

          <g className="way-map-cloud" fill="#fffaf2" opacity="0.85">
            <ellipse cx="54" cy="78" rx="19" ry="5" />
            <circle cx="45" cy="74" r="6" />
            <circle cx="55" cy="70" r="8" />
            <circle cx="65" cy="74" r="6.5" />
          </g>
          <g className="way-map-cloud way-map-cloud--slow" fill="#fffaf2" opacity="0.75">
            <ellipse cx="246" cy="64" rx="16" ry="4.2" />
            <circle cx="238" cy="61" r="5" />
            <circle cx="247" cy="57" r="6.8" />
            <circle cx="256" cy="61" r="5.4" />
          </g>
          <g className="way-map-birds" fill="none" stroke="#16283f" strokeOpacity="0.5" strokeWidth="1.1" strokeLinecap="round">
            <path d="M96,72 q3,-3 6,0 q3,-3 6,0" />
            <path d="M112,63 q2.4,-2.4 4.8,0 q2.4,-2.4 4.8,0" />
          </g>

          {/* Mountains, the summit hill, and the valley the road climbs */}
          <path
            d="M0,118 L22,100 L44,108 L70,86 L96,106 L118,98 L140,116 L168,122 L196,114 L220,94 L244,104 L266,84 L286,98 L300,92 L300,350 L0,350 Z"
            fill="#9bb1c6"
          />
          <path d="M70,86 L84,96 L78,100 Z M266,84 L278,93 L271,96 Z M220,94 L230,101 L224,104 Z" fill="#b8c9d8" />
          <path
            d="M0,150 Q40,128 84,136 Q120,142 148,130 Q160,125 168,128 Q180,132 204,134 Q250,138 300,122 L300,350 L0,350 Z"
            fill="#5d7c9b"
          />
          <path d={TREES_FAR} fill="#48688a" />
          <path d="M0,196 Q70,176 136,184 Q170,188 210,178 Q260,166 300,172 L300,350 L0,350 Z" fill="#2f5075" />
          <path d={TREES_MID} fill="#1f3a5c" />
          <path d="M0,262 Q90,248 170,258 Q240,266 300,250 L300,350 L0,350 Z" fill="#22406a" />
          <path d="M0,318 Q110,306 200,318 Q260,326 300,312 L300,350 L0,350 Z" fill="#1a3252" />
          <path d={TREES_NEAR} fill="#132840" />

          {/* The cross on the summit, silhouetted against the sun */}
          <g stroke="#16283f" strokeWidth="3.2">
            <line x1={SUMMIT.x} y1={SUMMIT.y - 31} x2={SUMMIT.x} y2={SUMMIT.y + 1} />
            <line x1={SUMMIT.x - 8.5} y1={SUMMIT.y - 23} x2={SUMMIT.x + 8.5} y2={SUMMIT.y - 23} />
          </g>

          {/* The road */}
          <path d={ROAD_EDGE} fill="#c7b186" />
          <path d={ROAD_OUTLINE} fill="#f4ecdd" />
          <path d={ROAD_CENTERLINE} fill="none" stroke="#d6c39b" strokeWidth="1.1" strokeDasharray="4 6" />

          {/* The stretch you've walked, lit up */}
          <path d={ribbonPath(ROAD_START_ARC, travelerArc, 0.95)} fill="#f08a3a" opacity="0.55" filter={`url(#${ids.blur})`} />
          <path d={ribbonPath(ROAD_START_ARC, travelerArc, 0.42)} fill="#e07b35" />
          <path d={ribbonPath(ROAD_START_ARC, travelerArc, 0.14)} fill="#ffe2b8" />

          {SPARKLE_ARCS.filter((a) => a < travelerArc - 6).map((a, i) => {
            const p = pointAtArc(a);
            return (
              <circle
                key={a}
                className="way-map-sparkle"
                style={{ animationDelay: `${(i * 0.37) % 2.4}s` }}
                cx={p.x}
                cy={p.y}
                r={1.5 * perspectiveScale(p.y)}
                fill="#fff4dc"
              />
            );
          })}

          {STOPS.slice(0, stages.length).map((s, i) => {
            const reached = position + 1e-6 >= i;
            const r = 1.8 + 2.4 * perspectiveScale(s.y);
            return (
              <circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={r}
                fill={reached ? "#e07b35" : "#cdb88f"}
                stroke="#fff6e8"
                strokeWidth="0.9"
              />
            );
          })}

          {/* The lantern - you */}
          <g transform={`translate(${traveler.x.toFixed(2)} ${traveler.y.toFixed(2)}) scale(${travelerScale.toFixed(3)})`}>
            <circle className="way-map-halo" r="17" fill={`url(#${ids.halo})`} />
            <circle r="6.2" fill="#fff6e8" stroke="#e07b35" strokeWidth="2.6" />
            <circle r="2.1" fill="#e07b35" />
          </g>
        </svg>

        <div className="way-map-heading">
          <div className="min-w-0">
            <p className="way-map-eyebrow">Your Journey</p>
            <p className="way-map-stage">{stageLabel}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="way-map-percent">{percent}%</p>
            <p className="way-map-eyebrow">of the way</p>
          </div>
        </div>

        {stages.map((course, i) => {
          const visual = signVisual(i, position);
          const finalVisual = signVisual(i, target);
          const base = SIGN_BASES[i];
          const scale = Math.max(0.8, perspectiveScale(base.y));
          return (
            <Link
              key={course.id}
              href={`/the-way/courses/${course.id}`}
              aria-label={`${course.title} — ${finalVisual === "done" ? "completed" : finalVisual === "current" ? "in progress" : "not started yet"}`}
              className={`way-map-sign way-map-sign--${visual}`}
              style={
                {
                  left: pct(base.x, MAP_W),
                  top: pct(base.y, MAP_H),
                  zIndex: 10 - i,
                  "--way-sign-scale": scale,
                } as React.CSSProperties
              }
            >
              <span className="way-map-sign-board">
                {visual === "done" && (
                  <span className="way-map-sign-check way-pop" aria-hidden>
                    <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                  </span>
                )}
                {course.title}
              </span>
              <span className="way-map-sign-post" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
