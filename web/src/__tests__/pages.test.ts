import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { PageSetup } from '../core/types';
import { createShape } from '../elements/factory';
import { buildPrintSvg } from '../export/printService';
import { expandTokens, pageDecorations, pageRects, requiredPageCount } from '../page/pageLayout';
import { getPageDimensions, getPrintableBounds, MM_TO_PX, resolveMargins } from '../page/pageSizes';

const setup: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  marginMm: 10,
  title: 'Design review',
  header: { left: '{title}', center: '', right: '{date}' },
  footer: { left: 'Confidential', center: '', right: '' },
  pageNumbers: { enabled: true, position: 'footer-center', format: 'page-n-of-m' },
};
const rect = (y: number) => ({ ...createShape('rectangle', DEFAULT_STYLE, { x: 100, y }, 1), width: 100, height: 100 });

describe('page layout', () => {
  it('stacks pages and grows with content below the last page', () => {
    expect(requiredPageCount(setup, [rect(100)])).toBe(1);
    const h = pageRects(setup, 2)[1].y; // top of page 2
    expect(requiredPageCount(setup, [rect(h + 50)])).toBe(2);
    expect(requiredPageCount({ ...setup, pageCount: 4 }, [rect(100)])).toBe(4);
  });

  it('expands header/footer tokens and numbers every page', () => {
    const deco = pageDecorations(setup, 3, { date: '6/11/2026' });
    const texts = deco.map((d) => `${d.page}:${d.text}`);
    expect(texts).toContain('1:Design review');
    expect(texts).toContain('2:6/11/2026');
    expect(texts).toContain('3:Page 3 of 3');
    expect(texts).toContain('1:Confidential');
    expect(expandTokens('{page}/{pages}', { page: 2, pages: 5, title: '', date: '' })).toBe('2/5');
  });

  it('prints one sheet per page with its page number', () => {
    const h = pageRects(setup, 2)[1].y;
    const doc = buildPrintSvg({ elements: [rect(100), rect(h + 50)], pageSetup: setup, colorMode: 'blackwhite', scope: 'page' });
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[1]).toContain('Page 2 of 2');
  });
});

describe('per-side margins', () => {
  const base = { size: 'A4' as const, orientation: 'portrait' as const, marginMm: 10 };

  it('falls back to the uniform margin for older files', () => {
    expect(resolveMargins(base)).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
  });

  it('uses each side separately for the printable area', () => {
    const setup = { ...base, margins: { top: 25, right: 10, bottom: 15, left: 30 } };
    const p = getPrintableBounds(setup)!;
    const d = getPageDimensions(setup)!;
    expect(p.x).toBeCloseTo(30 * MM_TO_PX, 3);
    expect(p.y).toBeCloseTo(25 * MM_TO_PX, 3);
    expect(p.width).toBeCloseTo(d.widthPx - 40 * MM_TO_PX, 3);
    expect(p.height).toBeCloseTo(d.heightPx - 40 * MM_TO_PX, 3);
  });

  it('sanitises junk and shrinks margins that do not fit the paper', () => {
    expect(resolveMargins({ marginMm: 10, margins: { top: -5, right: Number.NaN, bottom: 500, left: 12 } })).toEqual({ top: 0, right: 10, bottom: 100, left: 12 });
    const d = getPageDimensions({ size: 'A5', orientation: 'portrait', marginMm: 0, margins: { top: 0, right: 100, bottom: 0, left: 100 } })!;
    expect((d.widthPx - d.margins.left - d.margins.right) / MM_TO_PX).toBeCloseTo(20, 3); // 20 mm always left to draw in
  });
});
