import { LINE_HEIGHT } from '../../core/constants';
import { pointInBounds } from '../../core/geometry';
import type { Bounds, Point, TextElement } from '../../core/types';
import type { ElementHandler, PointMapper, ShapeOutput } from '../ElementHandler';
import { fontString, layoutRuns, styledRuns, textBoxLines, textBoxSize, wrapText } from '../textMetrics';
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
    const a = map({ x: el.x, y: el.y });
    const b = map({ x: el.x + el.width, y: el.y + el.height });
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    // a side handle (width only) makes it a fixed-width box: same font, text wraps at the new width
    if (scale.y === 1 && scale.x !== 1 && !el.containerId) {
      const width = Math.max(el.fontSize, Math.abs(b.x - a.x));
      const size = textBoxSize({ ...el, width, fixedWidth: true });
      return { x, y, width, height: size.height, fixedWidth: true };
    }
    // corners scale the font; a fixed-width box keeps wrapping at its scaled width
    const factor = Math.max(Math.abs(scale.y), 0.05);
    const fontSize = Math.max(4, el.fontSize * factor);
    const size = textBoxSize({ ...el, fontSize, width: el.width * factor });
    return { x, y, fontSize, ...size };
  }

  generateShape(el: TextElement): ShapeOutput {
    // shape labels and fixed-width boxes wrap at their width; formatted parts are laid out piece by piece
    const wrapAt = el.containerId || el.fixedWidth ? el.width : null;
    const styled = styledRuns(el);
    const rich = styled ? layoutRuns(styled, wrapAt, el.fontSize, el.fontFamily).lines : undefined;
    return {
      drawables: [],
      paths: [],
      text: {
        lines: rich
          ? rich.map((l) => l.map((f) => f.text).join(''))
          : el.containerId
            ? wrapText(el.text, el.width, el.fontSize, el.fontFamily, el)
            : el.fixedWidth
              ? textBoxLines(el)
              : el.text.split('\n'),
        rich,
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
