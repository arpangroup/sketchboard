import type { PageSection, PageSetup, SketchElement } from '../core/types';
import { getElementBounds } from '../elements/registry';
import { getPageDimensions } from './pageSizes';
import { MAX_PAGES, PAGE_GAP } from './pageLayout';

/**
 * Inserting and deleting pages. Pages are stacked top to bottom, so a page is a horizontal band of
 * the board: inserting one moves everything from that page down by one page, deleting one removes
 * its content and moves everything below it up. Elements belong to the page their centre is on.
 * Page sections (own header / footer) keep covering the same pages.
 */

/** Distance from one page's top to the next one's. */
export function pageStride(setup: PageSetup): number | null {
  const d = getPageDimensions(setup);
  return d ? d.heightPx + PAGE_GAP : null;
}

/** 0-based page an element sits on (by its centre); the gap below a page counts as that page. */
export function pageOfElement(el: SketchElement, stride: number): number {
  const b = getElementBounds(el);
  return Math.max(0, Math.floor((b.y + b.height / 2) / stride));
}

const moveSections = (sections: PageSection[] | undefined, fromPage: number, by: number): PageSection[] | undefined =>
  sections?.map((s) => (s.startPage >= fromPage ? { ...s, startPage: Math.max(1, s.startPage + by) } : s));

export interface PageEdit {
  /** Element patches (moves) and ids to delete. */
  moves: Map<string, { y: number }>;
  deletes: string[];
  setup: PageSetup;
}

/**
 * A blank page at position `at` (0 = before the first page, `count` = after the last).
 * Returns null when there's no room (page limit) or the board is an infinite canvas.
 */
export function insertPage(setup: PageSetup, count: number, elements: readonly SketchElement[], at: number): PageEdit | null {
  const stride = pageStride(setup);
  if (!stride || count >= MAX_PAGES) return null;
  const index = Math.max(0, Math.min(count, Math.round(at)));
  const moves = new Map<string, { y: number }>();
  for (const el of elements) {
    if (!el.isDeleted && pageOfElement(el, stride) >= index) moves.set(el.id, { y: el.y + stride });
  }
  return {
    moves,
    deletes: [],
    setup: { ...setup, pageCount: count + 1, sections: moveSections(setup.sections, index + 1, 1) },
  };
}

/**
 * Removes page `index` (0-based) and what is on it; later pages move up. The last remaining page
 * can't be deleted. Sections that started on the deleted page now start on the page that took its place.
 */
export function deletePage(setup: PageSetup, count: number, elements: readonly SketchElement[], index: number): PageEdit | null {
  const stride = pageStride(setup);
  if (!stride || count <= 1 || index < 0 || index >= count) return null;
  const moves = new Map<string, { y: number }>();
  const deletes: string[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    const page = pageOfElement(el, stride);
    if (page === index) deletes.push(el.id);
    else if (page > index) moves.set(el.id, { y: el.y - stride });
  }
  // a section that started on the removed page keeps its start number (the next page takes over);
  // sections further down move up one
  const sections = moveSections(setup.sections, index + 2, -1);
  const seen = new Set<number>();
  const unique = sections?.filter((s) => (seen.has(s.startPage) ? false : (seen.add(s.startPage), true)));
  return { moves, deletes, setup: { ...setup, pageCount: count - 1, sections: unique?.length ? unique : undefined } };
}

/** Whether a page has anything on it. */
export const pageIsEmpty = (setup: PageSetup, elements: readonly SketchElement[], index: number): boolean => {
  const stride = pageStride(setup);
  return !stride || !elements.some((el) => !el.isDeleted && pageOfElement(el, stride) === index);
};
