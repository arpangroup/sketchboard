import rough from 'roughjs';
import { boundsIntersect, expandBounds } from '../core/geometry';
import type { Bounds, ColorMode, SketchElement } from '../core/types';
import { getElementBounds } from '../elements/registry';
import { drawDecorations } from '../renderer/CanvasRenderer';
import { getColorTransformer } from '../renderer/colorModes';
import { drawElement } from '../renderer/drawElement';
import type { PageDecoration } from './pageLayout';

/**
 * Renders a miniature of one page into a canvas (for the Pages panel). Only elements that
 * touch the page are drawn, so cost scales with what's on the page, not the whole board.
 */
export function drawPageThumbnail(
  canvas: HTMLCanvasElement,
  o: {
    elements: readonly SketchElement[];
    page: Bounds;
    decorations: readonly PageDecoration[];
    colorMode: ColorMode;
    /** CSS width of the thumbnail */
    width: number;
    dpr: number;
  },
): void {
  const scale = (o.width / o.page.width) * o.dpr;
  const w = Math.round(o.page.width * scale);
  const h = Math.round(o.page.height * scale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = getColorTransformer(o.colorMode).background('#ffffff');
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, scale, -o.page.x * scale, -o.page.y * scale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(o.page.x, o.page.y, o.page.width, o.page.height);
  ctx.clip();
  const rc = rough.canvas(canvas);
  for (const el of o.elements) {
    if (boundsIntersect(expandBounds(getElementBounds(el), el.strokeWidth + 10), o.page)) drawElement(ctx, rc, el, o.colorMode);
  }
  if (o.decorations.length) drawDecorations(ctx, o.decorations, '#868e96');
  ctx.restore();
}
