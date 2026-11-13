import type { RoughGenerator } from 'roughjs/bin/generator';
import { distanceToPolyline, normalizeBounds, pointInPolygon, unionBounds } from '../../core/geometry';
import type { Bounds, FigureElement, Point } from '../../core/types';
import { figureGeometry } from '../figures/figures';
import type { ElementHandler, PointMapper, ShapeOutput } from '../ElementHandler';
import { isTransparent, toRoughOptions } from '../roughOptions';

/** Absolute position of a callout's tail tip. */
export const tailPoint = (el: FigureElement): Point | null =>
  el.tail ? { x: el.x + el.tail.x * el.width, y: el.y + el.tail.y * el.height } : null;

/**
 * Strategy for gallery figures. The body box (x, y, w, h) scales the outline; a callout's tail is
 * stored relative to that box, so resizing keeps it pointing at the same relative spot.
 */
export class FigureHandler implements ElementHandler<FigureElement> {
  readonly type = 'figure' as const;

  getBounds(el: FigureElement): Bounds {
    const body = { x: el.x, y: el.y, width: el.width, height: el.height };
    const t = tailPoint(el);
    return t ? unionBounds([body, { x: t.x, y: t.y, width: 0, height: 0 }])! : body;
  }

  transform(el: FigureElement, map: PointMapper): Partial<FigureElement> {
    const a = map({ x: el.x, y: el.y });
    const b = map({ x: el.x + el.width, y: el.y + el.height });
    const r = normalizeBounds({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
    // a mirrored resize mirrors the tail too
    const tail = el.tail && { x: b.x < a.x ? 1 - el.tail.x : el.tail.x, y: b.y < a.y ? 1 - el.tail.y : el.tail.y };
    return { ...r, ...(tail ? { tail } : {}) };
  }

  hitTest(el: FigureElement, p: Point, tolerance: number): boolean {
    const g = figureGeometry(el.figure, el.width, el.height, el.tail);
    const local = { x: p.x - el.x, y: p.y - el.y };
    if (!isTransparent(el.backgroundColor) && g.polylines.some((pl) => pl.length > 2 && pointInPolygon(local, pl))) return true;
    const tol = tolerance + el.strokeWidth / 2;
    return [...g.polylines, ...g.detailLines].some((pl) => pl.length > 1 && distanceToPolyline(local, pl, false) <= tol);
  }

  generateShape(el: FigureElement, g: RoughGenerator): ShapeOutput {
    const geo = figureGeometry(el.figure, el.width, el.height, el.tail);
    const drawables = [g.path(geo.outline, toRoughOptions(el, { fillable: true }))];
    if (geo.details) drawables.push(g.path(geo.details, toRoughOptions(el)));
    return { drawables, paths: [] };
  }
}
