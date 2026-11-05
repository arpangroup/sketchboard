import type { Point } from '../core/types';

/**
 * Pressure-sensitive ink: turns a centre-line + pressures into a filled outline polygon
 * (like a real pen nib) instead of a constant-width stroke.
 *
 *  - stylus (Apple Pencil, Surface Pen, Wacom): real pressure per point
 *  - mouse / finger: pressure simulated from drawing speed (fast = thinner), with tapered ends
 */
export interface OutlineOptions {
  /** Nib diameter at full pressure (world px). */
  size: number;
  /** How much pressure affects width, 0..1. */
  thinning?: number;
  simulatePressure?: boolean;
}

const f = (n: number) => Math.round(n * 100) / 100;

/** Speed-based pressure for devices without a pressure sensor. */
export function simulatePressures(pts: readonly Point[]): number[] {
  const out: number[] = [];
  let prev = 0.5;
  for (let i = 0; i < pts.length; i++) {
    const d = i === 0 ? 0 : Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const target = Math.max(0.25, Math.min(1, 1 - d / 40));
    prev = prev + (target - prev) * 0.3; // smooth so width doesn't jitter
    out.push(prev);
  }
  return out;
}

/** Light smoothing of the centre line (stylus input is noisy at high sample rates). */
function smooth(pts: readonly Point[]): Point[] {
  if (pts.length < 3) return [...pts];
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    out.push({
      x: (pts[i - 1].x + pts[i].x * 2 + pts[i + 1].x) / 4,
      y: (pts[i - 1].y + pts[i].y * 2 + pts[i + 1].y) / 4,
    });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const circlePath = (c: Point, r: number) =>
  `M ${f(c.x - r)} ${f(c.y)} a ${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0 a ${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0 Z`;

export function strokeOutlinePath(points: readonly Point[], pressures: readonly number[], o: OutlineOptions): string {
  if (points.length === 0) return '';
  const thinning = o.thinning ?? 0.6;
  const simulated = o.simulatePressure || pressures.length !== points.length;
  const press = simulated ? simulatePressures(points) : [...pressures];
  const pts = smooth(points);
  const n = pts.length;

  const radius = (i: number) => {
    let r = (o.size / 2) * (1 - thinning + thinning * Math.max(0.05, Math.min(1, press[i])));
    if (simulated && n > 4) {
      // taper the first/last few points so mouse strokes look inked, not stamped
      const taper = Math.min(1, (i + 1) / 4, (n - i) / 4);
      r *= 0.4 + 0.6 * taper;
    }
    return Math.max(0.35, r);
  };

  if (n === 1 || (n === 2 && Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) < 0.5)) {
    return circlePath(pts[0], radius(0));
  }

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const r = radius(i);
    left.push({ x: pts[i].x - ty * r, y: pts[i].y + tx * r });
    right.push({ x: pts[i].x + ty * r, y: pts[i].y - tx * r });
  }

  // Quadratic curves through side midpoints keep the outline smooth.
  const side = (s: Point[]) => {
    let d = '';
    for (let i = 1; i < s.length - 1; i++) {
      d += ` Q ${f(s[i].x)} ${f(s[i].y)} ${f((s[i].x + s[i + 1].x) / 2)} ${f((s[i].y + s[i + 1].y) / 2)}`;
    }
    const last = s[s.length - 1];
    return d + ` L ${f(last.x)} ${f(last.y)}`;
  };
  const rEnd = radius(n - 1);
  const rStart = radius(0);
  const rightRev = [...right].reverse();
  return (
    `M ${f(left[0].x)} ${f(left[0].y)}` +
    side(left) +
    ` A ${f(rEnd)} ${f(rEnd)} 0 0 0 ${f(rightRev[0].x)} ${f(rightRev[0].y)}` + // round end cap
    side(rightRev) +
    ` A ${f(rStart)} ${f(rStart)} 0 0 0 ${f(left[0].x)} ${f(left[0].y)} Z` // round start cap
  );
}

/** Nib size for a pen stroke at a given stroke-width setting. */
export const penSize = (strokeWidth: number) => strokeWidth * 2.2 + 0.6;
/** Highlighter band width. */
export const highlighterSize = (strokeWidth: number) => 12 + strokeWidth * 5;
