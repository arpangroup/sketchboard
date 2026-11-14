import { LINE_HEIGHT } from '../../core/constants';
import { pointInBounds } from '../../core/geometry';
import type { Bounds, Point, TextElement } from '../../core/types';
import type { ElementHandler, PointMapper, ShapeOutput } from '../ElementHandler';
import { fontString, measureText, wrapText } from '../textMetrics';
import { fontCss } from '../../core/fonts';

export class TextHandler implements ElementHandler<TextElement> {
  readonly type = 'text' as const;

  getBounds(el: TextElement): Bounds {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }

  hitTest(el: TextElement, p: Point, tolerance: number): boolean {
    return pointInBounds(p, this.getBounds(el), tolerance);
  }

  /** Text scales by font size (uniformly, driven by the vertical scale). */
  transform(el: TextElement, map: PointMapper, scale: { x: number; y: number }): Partial<TextElement> {
    const factor = Math.max(Math.abs(scale.y), 0.05);
    const fontSize = Math.max(4, el.fontSize * factor);
    const a = map({ x: el.x, y: el.y });
    const b = map({ x: el.x + el.width, y: el.y + el.height });
    const m = measureText(el.text, fontSize, el.fontFamily, el);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), fontSize, width: m.width, height: m.height };
  }

  generateShape(el: TextElement): ShapeOutput {
    return {
      drawables: [],
      paths: [],
      text: {
        // shape labels wrap to the width of their shape
        lines: el.containerId ? wrapText(el.text, el.width, el.fontSize, el.fontFamily, el) : el.text.split('\n'),
        fontSize: el.fontSize,
        font: fontString(el.fontSize, el.fontFamily, el),
        align: el.textAlign,
        color: el.strokeColor,
        width: el.width,
        lineHeightPx: el.fontSize * LINE_HEIGHT,
        underline: !!el.underline,
        family: fontCss(el.fontFamily),
        fontWeight: el.fontWeight ?? 'normal',
        fontStyle: el.fontStyle ?? 'normal',
      },
    };
  }
}
