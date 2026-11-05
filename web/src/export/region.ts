import { expandBounds, unionBounds } from '../core/geometry';
import type { Bounds, PageSetup, SketchElement } from '../core/types';
import { getElementBounds } from '../elements/registry';
import { allPagesBounds, requiredPageCount } from '../page/pageLayout';

/** What part of the board an export/print covers. */
export type ExportScope = 'page' | 'content' | 'selection';

export const contentBounds = (elements: readonly SketchElement[], padding = 0): Bounds | null => {
  const u = unionBounds(elements.map((e) => expandBounds(getElementBounds(e), e.strokeWidth)));
  return u ? expandBounds(u, padding) : null;
};

export function resolveRegion(
  scope: ExportScope,
  elements: readonly SketchElement[],
  pageSetup: PageSetup,
  padding = 20,
): Bounds {
  const fallback = { x: 0, y: 0, width: 800, height: 600 };
  if (scope === 'page') {
    return allPagesBounds(pageSetup, requiredPageCount(pageSetup, elements)) ?? contentBounds(elements, padding) ?? fallback;
  }
  return contentBounds(elements, padding) ?? fallback;
}

/** Which elements fall into the export (page scope keeps everything; clipping handles the rest). */
export function elementsForScope(
  scope: ExportScope,
  all: readonly SketchElement[],
  selectedIds: Record<string, true>,
): SketchElement[] {
  if (scope === 'selection') {
    const sel = all.filter((e) => selectedIds[e.id]);
    if (sel.length) return sel;
  }
  return [...all];
}
