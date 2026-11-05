import { boundsFromPoints, distance, distanceToSegment, simplifyPath } from '../core/geometry';
import type { Bounds, Point } from '../core/types';

/**
 * "Draw to shape": classifies a free-hand stroke as a clean geometric shape.
 * Deliberately conservative - when unsure it returns null and the ink is kept.
 */
export type RecognizedShape =
  | { type: 'line'; from: Point; to: Point }
  | { type: 'rectangle' | 'ellipse' | 'diamond'; bounds: Bounds }
  | { type: 'triangle'; points: [Point, Point, Point] };

export function recognizeShape(points: readonly Point[], minSize = 20): RecognizedShape | null {
  if (points.length < 4) return null;
  const b = boundsFromPoints(points);
  const diag = Math.hypot(b.width, b.height);
  if (diag < minSize) return null;

  const start = points[0];
  const end = points[points.length - 1];
  let pathLen = 0;
  for (let i = 1; i < points.length; i++) pathLen += distance(points[i - 1], points[i]);

  // ── open stroke: straight line? ──
  const closed = distance(start, end) < Math.max(18, diag * 0.22);
  if (!closed) {
    const maxDev = Math.max(...points.map((p) => distanceToSegment(p, start, end)));
    const chord = distance(start, end);
    if (maxDev < Math.max(6, chord * 0.07) && pathLen < chord * 1.15) return { type: 'line', from: start, to: end };
    return null;
  }

  // ── closed stroke: count corners on a simplified outline ──
  const simplified = simplifyPath([...points], diag * 0.09);
  let corners = simplified.slice(0, -1); // last ≈ first
  if (corners.length > 1 && distance(corners[0], corners[corners.length - 1]) < diag * 0.15) corners = corners.slice(0, -1);
  corners = mergeClose(corners, diag * 0.12);

  if (corners.length === 3) {
    return { type: 'triangle', points: [corners[0], corners[1], corners[2]] };
  }
  if (corners.length === 4) {
    const box = [
      { x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height },
    ];
    const mids = [
      { x: b.x + b.width / 2, y: b.y }, { x: b.x + b.width, y: b.y + b.height / 2 },
      { x: b.x + b.width / 2, y: b.y + b.height }, { x: b.x, y: b.y + b.height / 2 },
    ];
    const near = (targets: Point[]) => corners.reduce((s, c) => s + Math.min(...targets.map((t) => distance(c, t))), 0) / 4;
    const toBox = near(box);
    const toMids = near(mids);
    if (toBox < diag * 0.12 && toBox < toMids) return { type: 'rectangle', bounds: b };
    if (toMids < diag * 0.12) return { type: 'diamond', bounds: b };
  }

  // ── ellipse: every point roughly on the bbox-inscribed ellipse ──
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const rx = b.width / 2 || 1;
  const ry = b.height / 2 || 1;
  const radii = points.map((p) => Math.hypot((p.x - cx) / rx, (p.y - cy) / ry));
  const mean = radii.reduce((a, c) => a + c, 0) / radii.length;
  const sd = Math.sqrt(radii.reduce((a, c) => a + (c - mean) ** 2, 0) / radii.length);
  if (sd < 0.12 && mean > 0.8 && mean < 1.1) return { type: 'ellipse', bounds: b };
  return null;
}

function mergeClose(pts: Point[], tol: number): Point[] {
  const out: Point[] = [];
  for (const p of pts) if (!out.length || distance(out[out.length - 1], p) > tol) out.push(p);
  if (out.length > 2 && distance(out[0], out[out.length - 1]) < tol) out.pop();
  return out;
}
