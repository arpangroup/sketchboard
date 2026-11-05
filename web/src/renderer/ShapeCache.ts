import rough from 'roughjs';
import type { RoughGenerator } from 'roughjs/bin/generator';
import type { ColorMode, SketchElement } from '../core/types';
import type { ShapeOutput } from '../elements/ElementHandler';
import { elementRegistry } from '../elements/registry';
import { getColorTransformer } from './colorModes';

/**
 * Caches generated rough.js geometry. Shapes are generated in element-local space, so
 * MOVING an element (x/y change only) reuses the cached geometry - this is what keeps
 * dragging large selections smooth. The signature deliberately excludes x/y.
 */
interface Entry {
  sig: string;
  points: unknown;
  output: ShapeOutput;
}

function signature(el: SketchElement, mode: ColorMode): string {
  const parts: unknown[] = [
    mode, el.type, el.width, el.height, el.strokeColor, el.backgroundColor, el.fillStyle,
    el.strokeWidth, el.strokeStyle, el.roughness, el.seed,
  ];
  switch (el.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      parts.push(el.rounded);
      break;
    case 'line':
    case 'arrow':
      parts.push(el.startArrowhead, el.endArrowhead, el.polygon);
      break;
    case 'text':
      parts.push(el.text, el.fontSize, el.fontFamily, el.textAlign, el.fontWeight, el.fontStyle, el.underline);
      break;
    case 'freedraw':
      parts.push(el.kind);
      break;
    case 'image':
      parts.push(el.fileId);
      break;
    case 'table':
      parts.push(
        JSON.stringify(el.cells), el.colWidths.join(','), el.rowHeights.join(','), el.cellPadding, el.headerRow,
        el.headerColor, el.banded, el.textColor, el.fontSize, el.fontFamily, el.textAlign,
      );
      break;
  }
  return parts.join('|');
}

export class ShapeCache {
  private cache = new Map<string, Entry>();
  private generator: RoughGenerator = rough.generator();

  get(el: SketchElement, mode: ColorMode): ShapeOutput {
    const key = `${el.id}:${mode}`;
    const sig = signature(el, mode);
    const points = 'points' in el ? el.points : null;
    const hit = this.cache.get(key);
    if (hit && hit.sig === sig && hit.points === points) return hit.output;

    const transformed = getColorTransformer(mode).transformElement(el);
    const output = elementRegistry.get(transformed).generateShape(transformed, this.generator);
    this.cache.set(key, { sig, points, output });
    return output;
  }

  /** Drop entries for elements that no longer exist (call occasionally). */
  prune(liveIds: ReadonlySet<string>): void {
    for (const key of this.cache.keys()) {
      if (!liveIds.has(key.slice(0, key.indexOf(':')))) this.cache.delete(key);
    }
  }
}

/** Shared instance used by on-screen rendering and exports. */
export const shapeCache = new ShapeCache();
