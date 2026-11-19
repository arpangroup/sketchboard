import type { Bounds, MathElement, Point } from '../../core/types';
import { fontCss } from '../../core/fonts';
import { luminance } from '../../renderer/colorModes';
import type { ElementHandler, MathPrimitive, PointMapper, ShapeOutput } from '../ElementHandler';
import { type MathItem, mathBox, mathLayout, REF } from '../math/mathLayout';

/** Grey of the same lightness (grayscale print). */
function toGray(c: string): string {
  const h = Math.round(luminance(c)).toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

/**
 * LaTeX formulae. The box fits the rendered maths (like text); resizing scales the font.
 * Pieces without their own colour (\color{…}) take the element's colour, so recolouring is instant.
 */
export class MathHandler implements ElementHandler<MathElement> {
  readonly type = 'math' as const;

  getBounds(el: MathElement): Bounds {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }

  hitTest(el: MathElement, p: Point, tolerance: number): boolean {
    return p.x >= el.x - tolerance && p.x <= el.x + el.width + tolerance && p.y >= el.y - tolerance && p.y <= el.y + el.height + tolerance;
  }

  transform(el: MathElement, map: PointMapper): Partial<MathElement> {
    const a = map({ x: el.x, y: el.y });
    const b = map({ x: el.x + el.width, y: el.y + el.height });
    const scale = Math.abs(b.x - a.x) / Math.max(1, el.width);
    const fontSize = Math.min(400, Math.max(6, Math.round(el.fontSize * scale * 10) / 10));
    const box = mathBox({ ...el, fontSize });
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), fontSize, ...box };
  }

  generateShape(el: MathElement): ShapeOutput {
    const layout = mathLayout(el.latex, el.textAlign);
    if (!layout) {
      // KaTeX still loading: show the source, small and grey
      const fs = el.fontSize * 0.5;
      return {
        drawables: [],
        paths: [],
        text: {
          lines: el.latex.split('\n'),
          fontSize: fs,
          font: `${fs}px ${fontCss('code')}`,
          family: fontCss('code'),
          align: 'left',
          color: '#868e96',
          width: el.width,
          lineHeightPx: fs * 1.3,
          underline: false,
          fontWeight: 'normal',
          fontStyle: 'normal',
        },
      };
    }
    const own = el.strokeColor;
    const map = (c: string | undefined): string | undefined =>
      c === undefined ? undefined : el.printMode === 'blackwhite' ? '#000000' : el.printMode === 'grayscale' ? toGray(c) : c;
    const items: MathItem[] =
      el.printMode
        ? layout.items.map((it) => {
            if (it.k === 'path') {
              return { ...it, fill: typeof it.fill === 'string' ? map(it.fill) : it.fill, stroke: typeof it.stroke === 'string' ? map(it.stroke) : it.stroke };
            }
            return { ...it, color: map(it.color) };
          })
        : layout.items;
    const math: MathPrimitive = { items, scale: el.fontSize / REF, color: own };
    return { drawables: [], paths: [], math };
  }
}
