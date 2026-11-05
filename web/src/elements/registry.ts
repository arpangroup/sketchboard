import type { ElementType, SketchElement } from '../core/types';
import type { ElementHandler } from './ElementHandler';
import { DiamondHandler, EllipseHandler, RectangleHandler } from './handlers/boxShapes';
import { FreeDrawHandler, LinearHandler } from './handlers/pointShapes';
import { ImageHandler } from './handlers/image';
import { TableHandler } from './handlers/table';
import { TextHandler } from './handlers/text';

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
  .register(new TableHandler());

export const getElementBounds = (el: SketchElement) => elementRegistry.get(el).getBounds(el);
