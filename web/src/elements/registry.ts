import type { ElementType, Point, SketchElement } from '../core/types';
import { rotatedBounds, toLocal } from './rotation';
import type { ElementHandler } from './ElementHandler';
import { DiamondHandler, EllipseHandler, RectangleHandler } from './handlers/boxShapes';
import { FreeDrawHandler, LinearHandler } from './handlers/pointShapes';
import { ImageHandler } from './handlers/image';
import { TableHandler } from './handlers/table';
import { TextHandler } from './handlers/text';
import { FigureHandler } from './handlers/figure';
import { CodeHandler } from './handlers/code';
import { FrameHandler } from './handlers/frame';
import { MathHandler } from './handlers/math';

/**
 * Registry of element strategies. New element types are added by registering a handler -
 * nothing else in the codebase needs to change (Open/Closed principle).
 */
class ElementRegistry {
  private handlers = new Map<ElementType, ElementHandler>();

  register<T extends SketchElement>(handler: ElementHandler<T>): this {
    this.handlers.set(handler.type, handler as unknown as ElementHandler);
    return this;
  }

  get<T extends SketchElement>(el: T): ElementHandler<T> {
    const h = this.handlers.get(el.type);
    if (!h) throw new Error(`No handler registered for element type "${el.type}"`);
    return h as unknown as ElementHandler<T>;
  }
}

export const elementRegistry = new ElementRegistry()
  .register(new RectangleHandler())
  .register(new DiamondHandler())
  .register(new EllipseHandler())
  .register(new LinearHandler('line'))
  .register(new LinearHandler('arrow'))
  .register(new FreeDrawHandler())
  .register(new TextHandler())
  .register(new ImageHandler())
  .register(new MathHandler())
  .register(new TableHandler())
  .register(new FigureHandler())
  .register(new CodeHandler())
  .register(new FrameHandler());

/** Axis-aligned world bounds, including rotation. */
export const getElementBounds = (el: SketchElement) => rotatedBounds(el, elementRegistry.get(el).getBounds(el));

/** Unrotated box in the element's own frame (what selection handles of a single rotated element follow). */
export const getRawBounds = (el: SketchElement) => elementRegistry.get(el).getBounds(el);

/** Hit test that understands rotation: the point is turned into the element's own frame first. */
export const hitTestElement = (el: SketchElement, p: Point, tolerance: number) =>
  elementRegistry.get(el).hitTest(el, unflip(el, toLocal(el, p)), tolerance);

/** Mirrored elements are drawn flipped inside their box: mirror the point back before testing. */
export function unflip(el: SketchElement, p: Point): Point {
  if (!el.flipX && !el.flipY) return p;
  return {
    x: el.flipX ? el.x + el.width - (p.x - el.x) : p.x,
    y: el.flipY ? el.y + el.height - (p.y - el.y) : p.y,
  };
}
