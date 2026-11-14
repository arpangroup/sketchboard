import type { Drawable } from 'roughjs/bin/core';
import type { RoughGenerator } from 'roughjs/bin/generator';
import { boundsFromPoints, distanceToPolyline } from '../../core/geometry';
import type { Arrowhead, Bounds, FreeDrawElement, LinearElement, Point } from '../../core/types';
import { highlighterSize, penSize, strokeOutlinePath } from '../strokeOutline';
import type { ElementHandler, PointMapper, ShapeOutput } from '../ElementHandler';
import { toRoughOptions } from '../roughOptions';

type PointElement = LinearElement | FreeDrawElement;

/**
 * Normalises absolute points into (x, y, width, height, points-relative) form.
 * Shared by drawing tools and transforms so the invariant "points are >= 0 relative to x/y"
 * always holds.
 */
export function pointsToElementGeometry(absolute: Point[]) {
  const b = boundsFromPoints(absolute);
  return {
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    points: absolute.map((p) => ({ x: p.x - b.x, y: p.y - b.y })),
  };
}

export const absolutePoints = (el: PointElement): Point[] =>
  el.points.map((p) => ({ x: p.x + el.x, y: p.y + el.y }));

/** Whether a line / arrow is drawn as a smooth curve through its points. */
export const isCurved = (el: LinearElement): boolean => el.points.length > 2 && !el.sharp && !el.polygon;

const bezier = (p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
};

/** Cubic pieces of the Catmull-Rom curve through `points` (ends doubled — same curve rough.js draws). */
function curvePieces(points: readonly Point[]): Array<[Point, Point, Point, Point]> {
  const p = [points[0], ...points, points[points.length - 1]];
  const out: Array<[Point, Point, Point, Point]> = [];
  for (let i = 1; i + 2 < p.length; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    out.push([p1, { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2]);
  }
  return out;
}

/** Points along the smooth curve through `points` (for hit-testing and arrowhead direction). */
export function curveSamples(points: readonly Point[], perSegment = 16): Point[] {
  if (points.length < 3) return [...points];
  const out: Point[] = [points[0]];
  for (const [a, b, c, d] of curvePieces(points)) for (let k = 1; k <= perSegment; k++) out.push(bezier(a, b, c, d, k / perSegment));
  return out;
}

/** Point halfway along segment `i` (between points i and i+1) as drawn — on the curve for curved lines. */
export function segmentMidpoint(el: LinearElement, i: number): Point {
  const a = el.points[i];
  const b = el.points[i + 1];
  if (!isCurved(el)) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const [p0, c1, c2, p1] = curvePieces(el.points)[i];
  return bezier(p0, c1, c2, p1, 0.5);
}

abstract class PointShapeHandler<T extends PointElement> implements ElementHandler<T> {
  abstract readonly type: T['type'];

  getBounds(el: T): Bounds {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }

  hitTest(el: T, p: Point, tolerance: number): boolean {
    const local = { x: p.x - el.x, y: p.y - el.y };
    const path = el.type !== 'freedraw' && isCurved(el as LinearElement) ? curveSamples(el.points) : el.points;
    return distanceToPolyline(local, path, this.isClosed(el)) <= tolerance + this.halfWidth(el);
  }

  protected isClosed(_el: T): boolean {
    return false;
  }

  protected halfWidth(el: T): number {
    return el.strokeWidth / 2;
  }

  transform(el: T, map: PointMapper): Partial<T> {
    return pointsToElementGeometry(absolutePoints(el).map(map)) as Partial<T>;
  }

  abstract generateShape(el: T, generator: RoughGenerator): ShapeOutput;
}

export class LinearHandler<T extends LinearElement = LinearElement> extends PointShapeHandler<T> {
  constructor(readonly type: T['type']) {
    super();
  }

  protected isClosed(el: T): boolean {
    return !!el.polygon;
  }

  generateShape(el: T, g: RoughGenerator): ShapeOutput {
    const opts = toRoughOptions(el);
    const pts = el.points.map((p) => [p.x, p.y] as [number, number]);
    const drawables: Drawable[] = [];
    if (pts.length < 2) return { drawables, paths: [] };
    if (el.polygon) {
      return { drawables: [g.polygon(pts, toRoughOptions(el, { fillable: true }))], paths: [] };
    }
    // rough.js bends a 3-point curve only *towards* its middle point; feed it two extra points sampled
    // from the true curve so it passes through the bend (and through the anchor the user dragged)
    const curvePts = pts.length === 3 ? curveSamples(el.points, 2).map((q) => [q.x, q.y] as [number, number]) : pts;
    drawables.push(pts.length === 2 ? g.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], opts) : el.sharp ? g.linearPath(pts, opts) : g.curve(curvePts, opts));

    // Arrowheads are always solid, even when the shaft is dashed; on curves they follow the curve's end.
    const headOpts = { ...opts, strokeLineDash: undefined, disableMultiStroke: false };
    const n = el.points.length;
    const curve = isCurved(el) ? curveSamples(el.points) : null;
    const endFrom = curve ? curve[curve.length - 4] : el.points[n - 2];
    const startFrom = curve ? curve[3] : el.points[1];
    const len = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    drawables.push(...arrowhead(g, el.endArrowhead, el.points[n - 1], endFrom, el, headOpts, len(el.points[n - 1], el.points[n - 2])));
    drawables.push(...arrowhead(g, el.startArrowhead, el.points[0], startFrom, el, headOpts, len(el.points[0], el.points[1])));
    return { drawables, paths: [] };
  }
}

function arrowhead(
  g: RoughGenerator,
  kind: Arrowhead,
  tip: Point,
  from: Point,
  el: LinearElement,
  opts: ReturnType<typeof toRoughOptions>,
  /** Length of the end segment (sizes the head); defaults to the tip–from distance. */
  segmentLength?: number,
): Drawable[] {
  if (kind === 'none') return [];
  const dirLen = Math.hypot(tip.x - from.x, tip.y - from.y);
  if (dirLen < 0.01) return [];
  const segLen = segmentLength ?? dirLen;
  if (segLen < 1) return [];
  const size = Math.min(18 + el.strokeWidth * 3, segLen * 0.6);
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const at = (a: number, len = size): [number, number] => [
    tip.x - Math.cos(angle + a) * len,
    tip.y - Math.sin(angle + a) * len,
  ];
  const spread = Math.PI / 7;
  switch (kind) {
    case 'arrow': {
      const [x1, y1] = at(spread);
      const [x2, y2] = at(-spread);
      return [g.line(tip.x, tip.y, x1, y1, opts), g.line(tip.x, tip.y, x2, y2, opts)];
    }
    case 'triangle':
    case 'triangle_outline':
      return [
        g.polygon([[tip.x, tip.y], at(spread), at(-spread)], {
          ...opts,
          // hollow heads are filled with paper colour so the shaft doesn't show through
          fill: kind === 'triangle' ? el.strokeColor : '#ffffff',
          fillStyle: 'solid',
        }),
      ];
    case 'diamond':
    case 'diamond_outline': {
      const len = size * 1.15;
      const back: [number, number] = [tip.x - Math.cos(angle) * len, tip.y - Math.sin(angle) * len];
      const sideLen = (len / 2) / Math.cos(Math.PI / 6);
      return [
        g.polygon([[tip.x, tip.y], at(Math.PI / 6, sideLen), back, at(-Math.PI / 6, sideLen)], {
          ...opts,
          fill: kind === 'diamond' ? el.strokeColor : '#ffffff',
          fillStyle: 'solid',
        }),
      ];
    }
    case 'bar': {
      const half = size / 2;
      const px = Math.cos(angle + Math.PI / 2) * half;
      const py = Math.sin(angle + Math.PI / 2) * half;
      return [g.line(tip.x - px, tip.y - py, tip.x + px, tip.y + py, opts)];
    }
    case 'dot': {
      const d = Math.max(6, size * 0.5);
      const cx = tip.x - Math.cos(angle) * (d / 2);
      const cy = tip.y - Math.sin(angle) * (d / 2);
      return [g.circle(cx, cy, d, { ...opts, fill: el.strokeColor, fillStyle: 'solid' })];
    }
    default:
      return [];
  }
}

export class FreeDrawHandler extends PointShapeHandler<FreeDrawElement> {
  readonly type = 'freedraw' as const;

  protected halfWidth(el: FreeDrawElement): number {
    return (el.kind === 'highlighter' ? highlighterSize(el.strokeWidth) : penSize(el.strokeWidth)) / 2;
  }

  generateShape(el: FreeDrawElement): ShapeOutput {
    if (el.kind === 'highlighter') {
      // constant-width translucent band that tints (multiplies) whatever is underneath
      return {
        drawables: [],
        paths: [{
          d: smoothPath(el.points),
          stroke: el.strokeColor,
          strokeWidth: highlighterSize(el.strokeWidth),
          opacity: 0.45,
          blend: 'multiply',
          lineCap: 'butt',
        }],
      };
    }
    // pressure-sensitive filled outline (real nib feel)
    const d = strokeOutlinePath(el.points, el.pressures ?? [], { size: penSize(el.strokeWidth) });
    return { drawables: [], paths: [{ d, fill: el.strokeColor }] };
  }
}

/** Smooth polyline through midpoints with quadratic curves - gives natural pen strokes. */
export function smoothPath(pts: readonly Point[]): string {
  if (pts.length === 0) return '';
  const f = (n: number) => Math.round(n * 100) / 100;
  if (pts.length < 3) {
    const last = pts[pts.length - 1];
    return `M ${f(pts[0].x)} ${f(pts[0].y)} L ${f(last.x + 0.01)} ${f(last.y + 0.01)}`;
  }
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${f(pts[i].x)} ${f(pts[i].y)} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${f(last.x)} ${f(last.y)}`;
  return d;
}
