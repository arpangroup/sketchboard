import { normalizeBounds, pointInBounds } from '../../core/geometry';
import type { Bounds, ImageElement, Point } from '../../core/types';
import type { ElementHandler, PointMapper, ShapeOutput } from '../ElementHandler';

export class ImageHandler implements ElementHandler<ImageElement> {
  readonly type = 'image' as const;

  getBounds(el: ImageElement): Bounds {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }

  hitTest(el: ImageElement, p: Point, tolerance: number): boolean {
    return pointInBounds(p, this.getBounds(el), tolerance);
  }

  transform(el: ImageElement, map: PointMapper): Partial<ImageElement> {
    const a = map({ x: el.x, y: el.y });
    const b = map({ x: el.x + el.width, y: el.y + el.height });
    return normalizeBounds({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
  }

  generateShape(el: ImageElement): ShapeOutput {
    return { drawables: [], paths: [], image: { fileId: el.fileId, width: el.width, height: el.height } };
  }
}
