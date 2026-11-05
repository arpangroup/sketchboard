import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { PageSetup } from '../core/types';
import { createShape } from '../elements/factory';
import { buildPrintSvg } from '../export/printService';
import { expandTokens, pageDecorations, pageRects, requiredPageCount } from '../page/pageLayout';

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
