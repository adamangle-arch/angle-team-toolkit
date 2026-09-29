// Geometry for the journey map (components/way/JourneyRoad.tsx) - a
// winding road that narrows into the distance toward a cross on the far
// hill, echoing the church's own "Come and Follow Me" artwork. Pure math,
// computed once at module load; the component only looks things up.

export type Pt = { x: number; y: number };

export const MAP_W = 300;
export const MAP_H = 350;

// Road enters from off the bottom-left edge, switchbacks through five
// stops (one per stage), and ends at the summit where the cross stands.
const LEAD_IN: Pt = { x: -24, y: 352 };
export const STOPS: Pt[] = [
  { x: 92, y: 326 },
  { x: 214, y: 284 },
  { x: 92, y: 242 },
  { x: 200, y: 204 },
  { x: 122, y: 172 },
];
export const SUMMIT: Pt = { x: 168, y: 128 };
export const SUN: Pt = { x: 168, y: 110 };

// Each stage's sign stands at the outside of its switchback, clear of the
// road itself, so the lantern can stand on the road at a stop without
// sitting on top of the sign.
export const SIGN_BASES: Pt[] = [
  { x: 60, y: 322 },
  { x: 252, y: 286 },
  { x: 54, y: 244 },
  { x: 234, y: 206 },
  { x: 92, y: 174 },
];

// 0 at the summit (far away), 1 at the first stop (up close).
export function depthAt(y: number): number {
  return Math.min(Math.max((y - SUMMIT.y) / (STOPS[0].y - SUMMIT.y), 0), 1);
}

export function perspectiveScale(y: number): number {
  return 0.58 + 0.42 * depthAt(y);
}

function roadWidthAt(y: number): number {
  return 4 + 17 * depthAt(y);
}

// --- Spline -----------------------------------------------------------

type Cubic = [Pt, Pt, Pt, Pt];

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });

// Catmull-Rom through every point, converted to cubic beziers, so the road
// passes smoothly through each stop instead of kinking at it.
function catmullRom(points: Pt[]): Cubic[] {
  const first = add(points[0], sub(points[0], points[1]));
  const last = add(points[points.length - 1], mul(sub(points[points.length - 1], points[points.length - 2]), 0.6));
  const chain = [first, ...points, last];
  const out: Cubic[] = [];
  for (let i = 1; i < chain.length - 2; i++) {
    const [p0, p1, p2, p3] = [chain[i - 1], chain[i], chain[i + 1], chain[i + 2]];
    out.push([p1, add(p1, mul(sub(p2, p0), 1 / 6)), sub(p2, mul(sub(p3, p1), 1 / 6)), p2]);
  }
  return out;
}

function cubicAt([p0, c1, c2, p1]: Cubic, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  };
}

// Segment 0 is the lead-in; segments 1..5 are the five stages' legs
// (stop i -> stop i+1, with the last leg ending at the summit).
const SEGMENTS = catmullRom([LEAD_IN, ...STOPS, SUMMIT]);
const SAMPLES_PER_SEGMENT = 48;

type Sample = Pt & { arc: number };

// One arc-length lookup table along the whole road, so a position can be
// turned into a point at an even walking pace rather than bunching up on
// the tighter curves (bezier `t` isn't proportional to distance).
const LUT: Sample[] = [];
const segmentStartArc: number[] = [];
{
  let arc = 0;
  let prev: Pt | null = null;
  SEGMENTS.forEach((seg, s) => {
    segmentStartArc[s] = arc;
    for (let k = s === 0 ? 0 : 1; k <= SAMPLES_PER_SEGMENT; k++) {
      const p = cubicAt(seg, k / SAMPLES_PER_SEGMENT);
      if (prev) arc += Math.hypot(p.x - prev.x, p.y - prev.y);
      LUT.push({ ...p, arc });
      prev = p;
    }
  });
  segmentStartArc[SEGMENTS.length] = arc;
}

const LEG_COUNT = STOPS.length;

// Arc distance along the road for a journey position in whole-stage units
// (see journeyPosition in lib/way/journey.ts).
export function arcForPosition(position: number): number {
  const clamped = Math.min(Math.max(position, 0), LEG_COUNT);
  const leg = Math.min(Math.floor(clamped), LEG_COUNT - 1);
  const local = clamped - leg;
  const start = segmentStartArc[leg + 1];
  const end = segmentStartArc[leg + 2];
  return start + (end - start) * local;
}

export function pointAtArc(arc: number): Pt {
  if (arc <= LUT[0].arc) return LUT[0];
  const lastSample = LUT[LUT.length - 1];
  if (arc >= lastSample.arc) return lastSample;
  let lo = 0;
  let hi = LUT.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LUT[mid].arc < arc) lo = mid;
    else hi = mid;
  }
  const a = LUT[lo];
  const b = LUT[hi];
  const t = (arc - a.arc) / (b.arc - a.arc || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export const ROAD_START_ARC = segmentStartArc[1];

// --- Ribbons (tapered road shapes) ------------------------------------

function samplesBetween(fromArc: number, toArc: number): Pt[] {
  const pts: Pt[] = [pointAtArc(fromArc)];
  for (const s of LUT) if (s.arc > fromArc && s.arc < toArc) pts.push(s);
  pts.push(pointAtArc(toArc));
  return pts;
}

// A filled outline following the road between two arc distances, its width
// shrinking with distance - one continuous shape, so the taper is smooth
// instead of stepping at each stop the way per-segment strokes would.
export function ribbonPath(fromArc: number, toArc: number, widthFactor: number): string {
  if (toArc - fromArc < 0.5) return "";
  const pts = samplesBetween(fromArc, toArc);
  const left: Pt[] = [];
  const right: Pt[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const half = (roadWidthAt(p.y) * widthFactor) / 2;
    left.push({ x: p.x + nx * half, y: p.y + ny * half });
    right.push({ x: p.x - nx * half, y: p.y - ny * half });
  });
  const f = (p: Pt) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  return `M${left.map(f).join(" L")} L${right.reverse().map(f).join(" L")} Z`;
}

export function centerlinePath(fromArc: number, toArc: number): string {
  const pts = samplesBetween(fromArc, toArc);
  return `M${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L")}`;
}

export const ROAD_TOTAL_ARC = LUT[LUT.length - 1].arc;
export const ROAD_OUTLINE = ribbonPath(0, ROAD_TOTAL_ARC, 1);
export const ROAD_EDGE = ribbonPath(0, ROAD_TOTAL_ARC, 1.22);
export const ROAD_CENTERLINE = centerlinePath(0, ROAD_TOTAL_ARC);

// Little lights scattered along the road every so often - the component
// shows the ones behind the lantern, so the path you've walked glitters.
export const SPARKLE_ARCS: number[] = [];
for (let arc = ROAD_START_ARC + 14; arc < ROAD_TOTAL_ARC - 6; arc += 19) SPARKLE_ARCS.push(arc);

// --- Scenery ------------------------------------------------------------

function pine(x: number, y: number, s: number): string {
  const h = 26 * s;
  const w = 9 * s;
  return [
    `M${x},${y - h} L${x - w * 0.55},${y - h * 0.52} L${x + w * 0.55},${y - h * 0.52} Z`,
    `M${x},${y - h * 0.76} L${x - w * 0.8},${y - h * 0.26} L${x + w * 0.8},${y - h * 0.26} Z`,
    `M${x},${y - h * 0.5} L${x - w},${y} L${x + w},${y} Z`,
    `M${x - 1.2 * s},${y} L${x + 1.2 * s},${y} L${x + 1.2 * s},${y + 3 * s} L${x - 1.2 * s},${y + 3 * s} Z`,
  ].join(" ");
}

export const TREES_FAR = [pine(30, 144, 0.42), pine(44, 148, 0.34), pine(248, 139, 0.4), pine(263, 135, 0.46), pine(279, 140, 0.36)].join(" ");
export const TREES_MID = [pine(16, 208, 0.72), pine(33, 214, 0.58), pine(58, 192, 0.5), pine(272, 198, 0.7), pine(289, 204, 0.6)].join(" ");
export const TREES_NEAR = [pine(20, 270, 0.8), pine(14, 300, 1.05), pine(290, 318, 1.1)].join(" ");

export const SUN_RAYS = Array.from({ length: 12 }, (_, k) => {
  const a = (k * Math.PI * 2) / 12;
  const spread = 0.07;
  const inner = 21;
  const outer = 62;
  const p = (r: number, ang: number) => `${(SUN.x + Math.cos(ang) * r).toFixed(2)},${(SUN.y + Math.sin(ang) * r).toFixed(2)}`;
  return `M${p(inner, a - spread)} L${p(outer, a)} L${p(inner, a + spread)} Z`;
}).join(" ");
