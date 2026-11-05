import rough from 'roughjs';
import type { Bounds, ColorMode, SketchElement } from '../core/types';
import { getColorTransformer } from '../renderer/colorModes';
import { drawElement } from '../renderer/drawElement';
import { drawDecorations } from '../renderer/CanvasRenderer';
import type { PageDecoration } from '../page/pageLayout';

export interface PngExportOptions {
  region: Bounds;
  colorMode: ColorMode;
  background: boolean;
  scale: number;
  decorations?: readonly PageDecoration[];
}

const MAX_CANVAS_PIXELS = 16_000_000;

export function renderToCanvas(elements: readonly SketchElement[], o: PngExportOptions): HTMLCanvasElement {
  let scale = o.scale;
  const area = o.region.width * o.region.height * scale * scale;
  if (area > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / area); // stay within browser limits

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(o.region.width * scale));
  canvas.height = Math.max(1, Math.ceil(o.region.height * scale));
  const ctx = canvas.getContext('2d')!;
  if (o.background) {
    ctx.fillStyle = getColorTransformer(o.colorMode).background('#ffffff');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, -o.region.x * scale, -o.region.y * scale);
  const rc = rough.canvas(canvas);
  for (const el of elements) drawElement(ctx, rc, el, o.colorMode);
  if (o.decorations?.length) drawDecorations(ctx, o.decorations, o.colorMode === 'color' ? '#6b7280' : '#000000');
  return canvas;
}

export function exportToPngBlob(elements: readonly SketchElement[], o: PngExportOptions): Promise<Blob> {
  const canvas = renderToCanvas(elements, o);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
}
