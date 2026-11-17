import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { ColorMode, SketchElement } from '../core/types';
import type { TextPrimitive } from '../elements/ElementHandler';
import { shapeCache } from './ShapeCache';
import { fileStore } from '../files/FileStore';

/** Baseline offset shared by canvas & SVG so text lines up identically in both. */
export const textBaselineY = (t: TextPrimitive, lineIndex: number): number =>
  lineIndex * t.lineHeightPx + (t.lineHeightPx - t.fontSize) / 2 + t.fontSize * 0.8;

export const textAnchorX = (t: TextPrimitive): number =>
  t.align === 'center' ? t.width / 2 : t.align === 'right' ? t.width : 0;

/** CSS filter that applies the print colour mode to raster images. */
export const imageFilterFor = (mode: ColorMode): string =>
  mode === 'grayscale' ? 'grayscale(1)' : mode === 'blackwhite' ? 'grayscale(1) contrast(1.6)' : 'none';

function drawImage(ctx: CanvasRenderingContext2D, fileId: string, w: number, h: number, mode: ColorMode): void {
  const img = fileStore.getImage(fileId);
  if (!img) {
    // placeholder while decoding / before a collaborator's file arrives
    ctx.save();
    ctx.fillStyle = 'rgba(134,142,150,0.12)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(134,142,150,0.6)';
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(0, 0, w, h);
    ctx.restore();
    return;
  }
  const filter = imageFilterFor(mode);
  if (filter !== 'none') ctx.filter = filter;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = 'none';
}

/** Draws one element onto a 2D context already transformed to world space. */
export function drawElement(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  el: SketchElement,
  mode: ColorMode,
  alpha = 1,
): void {
  const shape = shapeCache.get(el, mode);
  ctx.save();
  ctx.globalAlpha = (mode === 'blackwhite' ? 1 : el.opacity / 100) * alpha;
  ctx.translate(el.x, el.y);
  const angle = el.angle ?? 0;
  if (angle) {
    // rotate around the centre of the element's box
    ctx.translate(el.width / 2, el.height / 2);
    ctx.rotate(angle);
    ctx.translate(-el.width / 2, -el.height / 2);
  }

  // mirrored shapes/images: flip the drawing inside its box (text is never mirrored)
  const flipped = !!(el.flipX || el.flipY);
  if (flipped) {
    ctx.save();
    ctx.translate(el.flipX ? el.width : 0, el.flipY ? el.height : 0);
    ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  }

  for (const d of shape.drawables) rc.draw(d);

  if (shape.image) drawImage(ctx, shape.image.fileId, shape.image.width, shape.image.height, mode);

  if (shape.paths.length) {
    ctx.lineJoin = 'round';
    const baseAlpha = ctx.globalAlpha;
    for (const p of shape.paths) {
      ctx.lineCap = p.lineCap ?? 'round';
      ctx.globalAlpha = baseAlpha * (p.opacity ?? 1);
      ctx.globalCompositeOperation = p.blend ?? 'source-over';
      const path = new Path2D(p.d);
      if (p.fill) {
        ctx.fillStyle = p.fill;
        ctx.fill(path);
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.strokeWidth ?? 1;
        ctx.stroke(path);
      }
    }
    ctx.globalAlpha = baseAlpha;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (flipped) ctx.restore();

  if (shape.text) drawTextBlock(ctx, shape.text, 0, 0);
  for (const cell of shape.texts ?? []) drawTextBlock(ctx, cell.text, cell.x, cell.y);
  ctx.restore();
}

/** CSS font for one formatted piece of a text block. */
export const runFont = (t: TextPrimitive, bold: boolean, italic: boolean): string =>
  `${italic ? 'italic' : 'normal'} ${bold ? 'bold' : 'normal'} ${t.fontSize}px ${t.family}`;

function drawTextBlock(ctx: CanvasRenderingContext2D, t: TextPrimitive, ox: number, oy: number): void {
  ctx.fillStyle = t.color;
  ctx.textBaseline = 'alphabetic';
  if (t.rich) return drawRichText(ctx, t, ox, oy);
  ctx.font = t.font;
  ctx.textAlign = t.align;
  const x = ox + textAnchorX(t);
  t.lines.forEach((line, i) => {
    const y = oy + textBaselineY(t, i);
    ctx.fillText(line, x, y);
    if (t.underline && line) {
      const w = ctx.measureText(line).width;
      const start = t.align === 'center' ? x - w / 2 : t.align === 'right' ? x - w : x;
      ctx.fillRect(start, y + t.fontSize * 0.12, w, Math.max(1, t.fontSize / 16));
    }
  });
}

/** Lines of differently formatted pieces, drawn one after another from the aligned start of each line. */
function drawRichText(ctx: CanvasRenderingContext2D, t: TextPrimitive, ox: number, oy: number): void {
  ctx.textAlign = 'left';
  t.rich!.forEach((line, i) => {
    const y = oy + textBaselineY(t, i);
    const widths = line.map((f) => {
      ctx.font = runFont(t, f.bold, f.italic);
      return ctx.measureText(f.text).width;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let x = ox + (t.align === 'center' ? (t.width - total) / 2 : t.align === 'right' ? t.width - total : 0);
    line.forEach((f, k) => {
      ctx.font = runFont(t, f.bold, f.italic);
      ctx.fillStyle = f.color ?? t.color;
      ctx.fillText(f.text, x, y);
      if (f.underline && f.text.trim()) ctx.fillRect(x, y + t.fontSize * 0.12, widths[k], Math.max(1, t.fontSize / 16));
      x += widths[k];
    });
  });
}
