import type { Bounds, PageMargins, PageSetup, PageSizeId } from '../core/types';

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
  /** Per-side margins in px (world units), already clamped to fit the paper. */
  margins: PageMargins;
}

export const MAX_MARGIN_MM = 100;
/** The printable area is never squeezed below this (mm), however large the margins. */
const MIN_PRINTABLE_MM = 20;

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/**
 * Effective margins in mm: per-side `margins` when set, else the uniform `marginMm` (older files).
 * Values are sanitised (finite, 0..100 mm) because page setup arrives from files and peers.
 */
export function resolveMargins(setup: Pick<PageSetup, 'marginMm' | 'margins'>): PageMargins {
  const clean = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_MARGIN_MM, Math.max(0, v)) : null);
  const uniform = clean(setup.marginMm) ?? 10;
  const m = setup.margins;
  return {
    top: clean(m?.top) ?? uniform,
    right: clean(m?.right) ?? uniform,
    bottom: clean(m?.bottom) ?? uniform,
    left: clean(m?.left) ?? uniform,
  };
}

export const isUniformMargins = (m: PageMargins) => SIDES.every((s) => m[s] === m.top);

/** Shrinks opposite margins proportionally so at least MIN_PRINTABLE_MM is left in each direction. */
function fitMargins(m: PageMargins, widthMm: number, heightMm: number): PageMargins {
  const fit = (a: number, b: number, size: number): [number, number] => {
    const room = Math.max(0, size - MIN_PRINTABLE_MM);
    const total = a + b;
    return total <= room || total === 0 ? [a, b] : [(a / total) * room, (b / total) * room];
  };
  const [left, right] = fit(m.left, m.right, widthMm);
  const [top, bottom] = fit(m.top, m.bottom, heightMm);
  return { top, right, bottom, left };
}

export function getPageDimensions(setup: PageSetup): PageDimensions | null {
  if (setup.size === 'infinite') return null;
  const s = PAGE_SIZES[setup.size];
  const landscape = setup.orientation === 'landscape';
  const widthMm = landscape ? s.h : s.w;
  const heightMm = landscape ? s.w : s.h;
  const mm = fitMargins(resolveMargins(setup), widthMm, heightMm);
  return {
    widthMm,
    heightMm,
    widthPx: widthMm * MM_TO_PX,
    heightPx: heightMm * MM_TO_PX,
    margins: { top: mm.top * MM_TO_PX, right: mm.right * MM_TO_PX, bottom: mm.bottom * MM_TO_PX, left: mm.left * MM_TO_PX },
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
  const m = d.margins;
  return { x: m.left, y: m.top, width: d.widthPx - m.left - m.right, height: d.heightPx - m.top - m.bottom };
}
