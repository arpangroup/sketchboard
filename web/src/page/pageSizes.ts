import type { Bounds, PageSetup, PageSizeId } from '../core/types';

/** Paper sizes in millimetres (portrait). */
export const PAGE_SIZES: Record<Exclude<PageSizeId, 'infinite'>, { label: string; w: number; h: number }> = {
  A5: { label: 'A5', w: 148, h: 210 },
  A4: { label: 'A4', w: 210, h: 297 },
  A3: { label: 'A3', w: 297, h: 420 },
  A2: { label: 'A2', w: 420, h: 594 },
  Letter: { label: 'US Letter', w: 215.9, h: 279.4 },
  Legal: { label: 'US Legal', w: 215.9, h: 355.6 },
  Tabloid: { label: 'Tabloid', w: 279.4, h: 431.8 },
};

export const PAGE_SIZE_OPTIONS: Array<{ id: PageSizeId; label: string }> = [
  { id: 'infinite', label: 'Infinite canvas' },
  ...Object.entries(PAGE_SIZES).map(([id, s]) => ({ id: id as PageSizeId, label: s.label })),
];

/** CSS reference pixel: 96 px per inch. */
export const MM_TO_PX = 96 / 25.4;

export interface PageDimensions {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  marginPx: number;
}

export function getPageDimensions(setup: PageSetup): PageDimensions | null {
  if (setup.size === 'infinite') return null;
  const s = PAGE_SIZES[setup.size];
  const landscape = setup.orientation === 'landscape';
  const widthMm = landscape ? s.h : s.w;
  const heightMm = landscape ? s.w : s.h;
  return {
    widthMm,
    heightMm,
    widthPx: widthMm * MM_TO_PX,
    heightPx: heightMm * MM_TO_PX,
    marginPx: setup.marginMm * MM_TO_PX,
  };
}

/** The page sits at the world origin; this returns its rectangle in world coordinates. */
export function getPageBounds(setup: PageSetup): Bounds | null {
  const d = getPageDimensions(setup);
  return d ? { x: 0, y: 0, width: d.widthPx, height: d.heightPx } : null;
}

/** Printable area inside the margins, in world coordinates. */
export function getPrintableBounds(setup: PageSetup): Bounds | null {
  const d = getPageDimensions(setup);
  if (!d) return null;
  return {
    x: d.marginPx,
    y: d.marginPx,
    width: d.widthPx - d.marginPx * 2,
    height: d.heightPx - d.marginPx * 2,
  };
}
