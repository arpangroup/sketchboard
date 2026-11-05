import type { RoughGenerator } from 'roughjs/bin/generator';
import { distanceToPolyline, normalizeBounds, pointInPolygon } from '../../core/geometry';
import type { Bounds, Point, ShapeElement } from '../../core/types';
import type { ElementHandler, PointMapper, ShapeOutput } from '../ElementHandler';
import { isTransparent, toRoughOptions } from '../roughOptions';

/**
 * Template-method style base for shapes defined by a bounding box
 * (rectangle, diamond, ellipse). Subclasses only describe their outline.
 */
abstract class BoxShapeHandler<T extends ShapeElement> implements ElementHandler<T> {
  abstract readonly type: T['type'];

  getBounds(el: T): Bounds {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }

  transform(el: T, map: PointMapper): Partial<T> {
    const a = map({ x: el.x, y: el.y });
    const b = map({ x: el.x + el.width, y: el.y + el.height });
    return normalizeBounds({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }) as Partial<T>;
  }

  hitTest(el: T, p: Point, tolerance: number): boolean {
    const local = { x: p.x - el.x, y: p.y - el.y };
    if (!isTransparent(el.backgroundColor) && this.contains(el, local)) return true;
    return this.distanceToOutline(el, local) <= tolerance;
  }

  protected abstract contains(el: T, local: Point): boolean;
  protected abstract distanceToOutline(el: T, local: Point): number;
  abstract generateShape(el: T, generator: RoughGenerator): ShapeOutput;
}

const rectCorners = (w: number, h: number): Point[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

export class RectangleHandler extends BoxShapeHandler<ShapeElement> {
  readonly type = 'rectangle' as const;

  protected contains(el: ShapeElement, p: Point): boolean {
    return p.x >= 0 && p.y >= 0 && p.x <= el.width && p.y <= el.height;
  }

  protected distanceToOutline(el: ShapeElement, p: Point): number {
    return distanceToPolyline(p, rectCorners(el.width, el.height), true);
  }

  generateShape(el: ShapeElement, g: RoughGenerator): ShapeOutput {
    const { width: w, height: h } = el;
    const opts = toRoughOptions(el, { fillable: true });
    if (el.rounded && w > 4 && h > 4) {
      const r = Math.min(w, h, 128) * 0.2;
      const d =
        `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} ` +
        `Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0`;
      return { drawables: [g.path(d, opts)], paths: [] };
    }
    return { drawables: [g.rectangle(0, 0, w, h, opts)], paths: [] };
  }
}

export class DiamondHandler extends BoxShapeHandler<ShapeElement> {
  readonly type = 'diamond' as const;

  private corners(el: ShapeElement): Point[] {
    const { width: w, height: h } = el;
    return [
      { x: w / 2, y: 0 },
      { x: w, y: h / 2 },
      { x: w / 2, y: h },
      { x: 0, y: h / 2 },
    ];
  }

  protected contains(el: ShapeElement, p: Point): boolean {
    return pointInPolygon(p, this.corners(el));
  }

  protected distanceToOutline(el: ShapeElement, p: Point): number {
    return distanceToPolyline(p, this.corners(el), true);
  }

  generateShape(el: ShapeElement, g: RoughGenerator): ShapeOutput {
    const pts = this.corners(el).map((c) => [c.x, c.y] as [number, number]);
    return { drawables: [g.polygon(pts, toRoughOptions(el, { fillable: true }))], paths: [] };
  }
}

export class EllipseHandler extends BoxShapeHandler<ShapeElement> {
  readonly type = 'ellipse' as const;

  protected contains(el: ShapeElement, p: Point): boolean {
    const rx = el.width / 2;
    const ry = el.height / 2;
    if (rx === 0 || ry === 0) return false;
    return ((p.x - rx) / rx) ** 2 + ((p.y - ry) / ry) ** 2 <= 1;
  }

  protected distanceToOutline(el: ShapeElement, p: Point): number {
    const rx = Math.max(el.width / 2, 0.001);
    const ry = Math.max(el.height / 2, 0.001);
    const nx = (p.x - rx) / rx;
    const ny = (p.y - ry) / ry;
    const r = Math.hypot(nx, ny);
    // Approximate distance: radial deviation scaled by the local radius.
    const angle = Math.atan2(ny, nx);
    const localRadius = Math.hypot(rx * Math.cos(angle), ry * Math.sin(angle));
    return Math.abs(r - 1) * localRadius;
  }

  generateShape(el: ShapeElement, g: RoughGenerator): ShapeOutput {
    const opts = toRoughOptions(el, { fillable: true });
    return {
      drawables: [g.ellipse(el.width / 2, el.height / 2, el.width, el.height, opts)],
      paths: [],
    };
  }
}
