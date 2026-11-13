import type { Bounds, Point, SketchElement } from '../core/types';
import { absolutePoints, pointsToElementGeometry } from './handlers/pointShapes';

/**
 * Rotation model: box-like elements keep an `angle` (radians, clockwise) and are rotated around
 * the centre of their x/y/width/height box at draw time. Point-based elements (lines, arrows, ink)
 * never store an angle — rotating them rotates their points, so their geometry stays simple.
 */
export const TWO_PI = Math.PI * 2;

export const normalizeAngle = (a: number): number => {
  const r = a % TWO_PI;
  const n = r < 0 ? r + TWO_PI : r;
  return Math.abs(n) < 1e-9 || Math.abs(n - TWO_PI) < 1e-9 ? 0 : n;
};

export const angleOf = (el: SketchElement): number => (Number.isFinite(el.angle) ? (el.angle as number) : 0);

/** Lines, arrows and ink rotate by moving their points. */
export const bakesRotation = (el: SketchElement): boolean => el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw';

export const centerOf = (el: Pick<SketchElement, 'x' | 'y' | 'width' | 'height'>): Point => ({ x: el.x + el.width / 2, y: el.y + el.height / 2 });

export function rotatePoint(p: Point, c: Point, a: number): Point {
  if (!a) return p;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** World point → the element's unrotated frame (still world units). */
export const toLocal = (el: SketchElement, p: Point): Point => rotatePoint(p, centerOf(el), -angleOf(el));

/** World point of an element-frame point (inverse of toLocal). */
export const toWorld = (el: SketchElement, p: Point): Point => rotatePoint(p, centerOf(el), angleOf(el));

/** Axis-aligned bounds of a box after rotating it around the element's centre. */
export function rotatedBounds(el: SketchElement, b: Bounds): Bounds {
  const a = angleOf(el);
  if (!a) return b;
  const c = centerOf(el);
  const pts = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((p) => rotatePoint(p, c, a));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/**
 * Rotates elements by `delta` around `pivot` (the selection centre): every element orbits the
 * pivot and box-like ones also turn. Returns patches (no versioning — callers wrap in updateElement).
 */
export function rotateAround(el: SketchElement, delta: number, pivot: Point): Partial<SketchElement> {
  if (bakesRotation(el)) {
    const pts = absolutePoints(el as Extract<SketchElement, { points: Point[] }>).map((p) => rotatePoint(p, pivot, delta));
    return pointsToElementGeometry(pts) as Partial<SketchElement>;
  }
  const c = rotatePoint(centerOf(el), pivot, delta);
  return { x: c.x - el.width / 2, y: c.y - el.height / 2, angle: normalizeAngle(angleOf(el) + delta) };
}

/**
 * When a rotated element changes size (typing, column drag, font change), keep its top-left
 * corner fixed on screen instead of letting it drift as the rotation centre moves.
 */
export function keepTopLeft(before: SketchElement, after: Pick<SketchElement, 'x' | 'y' | 'width' | 'height'>): { x: number; y: number } {
  const a = angleOf(before);
  if (!a) return { x: after.x, y: after.y };
  const tl = rotatePoint({ x: before.x, y: before.y }, centerOf(before), a);
  const off = rotatePoint({ x: -after.width / 2, y: -after.height / 2 }, { x: 0, y: 0 }, a);
  const c = { x: tl.x - off.x, y: tl.y - off.y };
  return { x: c.x - after.width / 2, y: c.y - after.height / 2 };
}
