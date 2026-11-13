import type { SketchElement } from '../core/types';
import { renderToCanvas } from '../export/pngExport';
import { contentBounds } from '../export/region';

/** Small PNG preview of a drawing for the workspace grid (PNG, not SVG: it can't carry script). */
export function makeThumbnail(elements: readonly SketchElement[], maxW = 480, maxH = 320): string | undefined {
  const region = contentBounds(elements, 16);
  if (!region || typeof document === 'undefined') return undefined;
  const scale = Math.min(2, maxW / region.width, maxH / region.height);
  try {
    return renderToCanvas(elements, { region, colorMode: 'color', background: true, scale }).toDataURL('image/png');
  } catch {
    return undefined; // e.g. tainted canvas - save without a preview
  }
}
