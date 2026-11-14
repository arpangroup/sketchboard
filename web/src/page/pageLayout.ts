import type {
  Bounds,
  HeaderFooterSlot,
  HeaderFooterText,
  PageNumberFormat,
  PageNumberPosition,
  PageSection,
  PageSetup,
  SketchElement,
} from '../core/types';
import { getElementBounds } from '../elements/registry';
import { getPageDimensions } from './pageSizes';

/**
 * Multi-page document layout: pages are stacked vertically (like a word processor) starting at the
 * world origin, separated by PAGE_GAP. Drawing below the last page grows the document automatically.
 * Headers, footers and page numbers are *decorations*: computed from PageSetup, never stored as
 * elements, so they stay correct when pages are added or the page size changes.
 */
export const PAGE_GAP = 48;
export const MAX_PAGES = 200;
export const HEADER_FOOTER_FONT_SIZE = 12;

const EMPTY: HeaderFooterText = { left: '', center: '', right: '' };

export function pageRects(setup: PageSetup, count: number): Bounds[] {
  const d = getPageDimensions(setup);
  if (!d) return [];
  return Array.from({ length: count }, (_, i) => ({ x: 0, y: i * (d.heightPx + PAGE_GAP), width: d.widthPx, height: d.heightPx }));
}

/** Pages needed to hold every element (at least `setup.pageCount`). */
export function requiredPageCount(setup: PageSetup, elements: readonly SketchElement[]): number {
  const d = getPageDimensions(setup);
  if (!d) return 0;
  let bottom = 0;
  for (const el of elements) {
    const b = getElementBounds(el);
    // only content horizontally overlapping the page column extends the document
    if (b.x + b.width < 0 || b.x > d.widthPx) continue;
    bottom = Math.max(bottom, b.y + b.height);
  }
  const needed = Math.max(1, Math.ceil((bottom + PAGE_GAP / 2) / (d.heightPx + PAGE_GAP)));
  return Math.min(MAX_PAGES, Math.max(setup.pageCount ?? 1, needed));
}

export const allPagesBounds = (setup: PageSetup, count: number): Bounds | null => {
  const rects = pageRects(setup, count);
  if (!rects.length) return null;
  const last = rects[rects.length - 1];
  return { x: 0, y: 0, width: last.width, height: last.y + last.height };
};

const NUMBER_FORMATS: Record<PageNumberFormat, string> = {
  n: '{page}',
  'page-n': 'Page {page}',
  'page-n-of-m': 'Page {page} of {pages}',
  'n-of-m': '{page} / {pages}',
};

export const PAGE_NUMBER_FORMAT_OPTIONS: Array<{ id: PageNumberFormat; label: string }> = [
  { id: 'n', label: '1' },
  { id: 'page-n', label: 'Page 1' },
  { id: 'page-n-of-m', label: 'Page 1 of 3' },
  { id: 'n-of-m', label: '1 / 3' },
];

export function expandTokens(
  template: string,
  ctx: { page: number; pages: number; title: string; date: string; section?: string },
): string {
  return template
    .replace(/\{page\}/gi, String(ctx.page))
    .replace(/\{pages\}/gi, String(ctx.pages))
    .replace(/\{title\}/gi, ctx.title)
    .replace(/\{section\}/gi, ctx.section ?? '')
    .replace(/\{date\}/gi, ctx.date);
}

/** Sections that can apply to a document of `count` pages, sorted, one per start page (the last one wins). */
export function activeSections(setup: PageSetup, count = Infinity): PageSection[] {
  const byStart = new Map<number, PageSection>();
  for (const s of setup.sections ?? []) {
    const start = Math.round(s.startPage);
    if (start >= 1 && start <= count) byStart.set(start, s);
  }
  return [...byStart.values()].sort((a, b) => a.startPage - b.startPage);
}

/** The section a 1-based page belongs to (null = document default), with its page range. */
export function sectionOfPage(setup: PageSetup, page: number, count: number): { section: PageSection | null; first: number; last: number } {
  const list = activeSections(setup, count);
  let idx = -1;
  list.forEach((s, i) => {
    if (s.startPage <= page) idx = i;
  });
  const first = idx < 0 ? 1 : list[idx].startPage;
  const next = list[idx + 1];
  return { section: idx < 0 ? null : list[idx], first, last: next ? next.startPage - 1 : count };
}

/** Header/footer text for a page's section: its own if it has one, otherwise the document default. */
export function areaText(setup: PageSetup, section: PageSection | null, area: 'header' | 'footer'): HeaderFooterText {
  return (section?.[area] ?? setup[area]) ?? EMPTY;
}

/** The effective template for a slot, with the page number dropped into its chosen slot. */
export function slotTemplate(
  setup: PageSetup,
  area: 'header' | 'footer',
  slot: HeaderFooterSlot,
  section: PageSection | null = null,
): string {
  const text = areaText(setup, section, area)[slot] ?? '';
  const pn = setup.pageNumbers;
  if (pn?.enabled && pn.position === (`${area}-${slot}` as PageNumberPosition)) {
    const num = NUMBER_FORMATS[pn.format];
    return text.trim() ? `${text}  ·  ${num}` : num;
  }
  return text;
}

export const hasHeaderFooter = (setup: PageSetup): boolean =>
  setup.size !== 'infinite' &&
  (!!setup.pageNumbers?.enabled ||
    [null, ...(setup.sections ?? [])].some((sec) =>
      (['header', 'footer'] as const).some((a) => Object.values(areaText(setup, sec, a)).some((t) => t.trim())),
    ));

export interface PageDecoration {
  page: number;
  text: string;
  x: number;
  /** Text baseline */
  y: number;
  align: HeaderFooterSlot;
  fontSize: number;
}

/** Header/footer/page-number text items in world coordinates, for every page. */
export function pageDecorations(
  setup: PageSetup,
  count: number,
  opts: { date?: string; rects?: Bounds[] } = {},
): PageDecoration[] {
  const d = getPageDimensions(setup);
  if (!d || !hasHeaderFooter(setup)) return [];
  const rects = opts.rects ?? pageRects(setup, count);
  const date = opts.date ?? new Date().toLocaleDateString();
  const title = setup.title?.trim() || 'Untitled';
  const fs = HEADER_FOOTER_FONT_SIZE;
  // keep text inside the page even with tiny margins
  const m = d.margins;
  const insetLeft = Math.max(m.left, 16);
  const insetRight = Math.max(m.right, 16);
  const out: PageDecoration[] = [];
  rects.forEach((r, i) => {
    const { section, first, last } = sectionOfPage(setup, i + 1, rects.length);
    const restart = !!section?.restartNumbering;
    const ctx = {
      page: restart ? i + 2 - first : i + 1,
      pages: restart ? last - first + 1 : rects.length,
      title: section?.title?.trim() || title,
      section: section?.title?.trim() ?? '',
      date,
    };
    for (const area of ['header', 'footer'] as const) {
      const y =
        area === 'header'
          ? r.y + Math.max(m.top / 2 + fs * 0.35, fs + 4)
          : r.y + r.height - Math.max(m.bottom / 2 - fs * 0.35, 6);
      for (const slot of ['left', 'center', 'right'] as const) {
        const tpl = slotTemplate(setup, area, slot, section);
        if (!tpl.trim()) continue;
        const x = slot === 'left' ? r.x + insetLeft : slot === 'center' ? r.x + (m.left + r.width - m.right) / 2 : r.x + r.width - insetRight;
        out.push({ page: i + 1, text: expandTokens(tpl, ctx), x, y, align: slot, fontSize: fs });
      }
    }
  });
  return out;
}
