import { distance, distanceToSegment } from '../core/geometry';
import { generateId, randomInteger } from '../core/utils';
import type { FreeDrawElement, LinearElement, Point, SketchElement } from '../core/types';
import { absolutePoints, pointsToElementGeometry } from './handlers/pointShapes';
import { highlighterSize, penSize } from './strokeOutline';

/** Elements the precision eraser can cut: ink and lines/arrows. Shapes and text are left alone. */
export type ErasableElement = FreeDrawElement | LinearElement;

export const isPartiallyErasable = (el: SketchElement): el is ErasableElement =>
  !el.locked && !el.isDeleted && (el.type === 'freedraw' || el.type === 'line' || el.type === 'arrow');

/** Half the visible thickness of a stroke (ink nib / line width). */
export function strokeHalfWidth(el: ErasableElement): number {
  if (el.type === 'freedraw') return (el.kind === 'highlighter' ? highlighterSize(el.strokeWidth) : penSize(el.strokeWidth)) / 2;
  return el.strokeWidth / 2;
}

/** Inserts points so no gap is longer than `step` (pressures interpolated alongside). */
function densify(points: Point[], pressures: number[] | null, step: number, closed: boolean) {
  const pts = closed && points.length > 2 ? [...points, points[0]] : points;
  const prs = pressures && closed && points.length > 2 ? [...pressures, pressures[0]] : pressures;
  const outP: Point[] = [];
  const outR: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const a = pts[i - 1];
      const b = pts[i];
      const n = Math.min(400, Math.floor(distance(a, b) / step));
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        outP.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        if (prs) outR.push(prs[i - 1] + (prs[i] - prs[i - 1]) * t);
      }
    }
    outP.push(pts[i]);
    if (prs) outR.push(prs[i]);
  }
  return { points: outP, pressures: prs ? outR : null };
}

const pathLength = (pts: Point[]) => pts.reduce((s, p, i) => (i ? s + distance(pts[i - 1], p) : 0), 0);

/**
 * Cuts the part of a stroke that the eraser (a disc of `radius` swept from a to b) touches.
 * Returns null if the stroke isn't touched, otherwise the remaining pieces (possibly none) —
 * each a new element; the caller deletes the original.
 */
export function eraseFromStroke(el: ErasableElement, a: Point, b: Point, radius: number): ErasableElement[] | null {
  const half = strokeHalfWidth(el);
  const reach = radius + half * 0.5;
  // quick reject on bounds
  const minX = Math.min(a.x, b.x) - reach - half;
  const maxX = Math.max(a.x, b.x) + reach + half;
  const minY = Math.min(a.y, b.y) - reach - half;
  const maxY = Math.max(a.y, b.y) + reach + half;
  if (el.x > maxX || el.y > maxY || el.x + el.width < minX || el.y + el.height < minY) return null;

  const abs = absolutePoints(el);
  const pressures = el.type === 'freedraw' && el.pressures.length === el.points.length ? el.pressures : null;
  const closed = el.type !== 'freedraw' && !!el.polygon;
  const dense = densify(abs, pressures, Math.max(radius / 2, 0.5), closed);
  const keep = dense.points.map((p) => distanceToSegment(p, a, b) > reach);
  if (keep.every(Boolean)) return null;

  // runs of consecutive kept points become the new pieces
  const runs: Array<[number, number]> = [];
  let start = -1;
  keep.forEach((k, i) => {
    if (k && start < 0) start = i;
    if ((!k || i === keep.length - 1) && start >= 0) {
      runs.push([start, k ? i : i - 1]);
      start = -1;
    }
  });
  const last = dense.points.length - 1;
  const pieces: ErasableElement[] = [];
  runs.forEach(([s, e], i) => {
    const pts = dense.points.slice(s, e + 1);
    if (pts.length < 2 || pathLength(pts) < Math.max(half, 1)) return; // drop crumbs
    const common = {
      ...pointsToElementGeometry(pts),
      id: generateId(),
      seed: randomInteger(),
      version: 1,
      versionNonce: randomInteger(),
      updatedAt: Date.now(),
      zIndex: el.zIndex + i * 1e-6,
    };
    if (el.type === 'freedraw') {
      pieces.push({ ...el, ...common, pressures: dense.pressures ? dense.pressures.slice(s, e + 1) : [] });
    } else {
      pieces.push({
        ...el,
        ...common,
        polygon: false,
        // arrowheads stay only on the ends that survive
        startArrowhead: s === 0 && !closed ? el.startArrowhead : 'none',
        endArrowhead: e === last && !closed ? el.endArrowhead : 'none',
      });
    }
  });
  return pieces;
}
