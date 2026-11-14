import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { PageSetup } from '../core/types';
import { createShape } from '../elements/factory';
import { buildPrintSvg } from '../export/printService';
import { activeSections, expandTokens, pageDecorations, pageRects, requiredPageCount, sectionOfPage } from '../page/pageLayout';
import { addSection, removeSection, setOwnArea, updateSection } from '../page/sections';
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

describe('sections', () => {
  const base: PageSetup = {
    size: 'A4',
    orientation: 'portrait',
    marginMm: 10,
    title: 'Handbook',
    footer: { left: '{title}', center: '', right: '' },
    pageNumbers: { enabled: true, position: 'footer-right', format: 'page-n-of-m' },
  };
  const at = (deco: ReturnType<typeof pageDecorations>, page: number) => deco.filter((d) => d.page === page).map((d) => d.text);

  it('uses the default footer everywhere until a section starts', () => {
    const deco = pageDecorations(base, 2, { date: 'd' });
    expect(at(deco, 2)).toEqual(['Handbook', 'Page 2 of 2']);
  });

  it('gives a page range its own title and footer, linked header and default before it', () => {
    let s = addSection(base, 3).setup;
    const id = s.sections![0].id;
    s = updateSection(s, id, { title: 'Appendix', footer: { left: '{section} · draft', center: '', right: '' } });
    const deco = pageDecorations(s, 5, { date: 'd' });
    expect(at(deco, 2)).toEqual(['Handbook', 'Page 2 of 5']);
    expect(at(deco, 3)).toEqual(['Appendix · draft', 'Page 3 of 5']);
    expect(at(deco, 5)).toEqual(['Appendix · draft', 'Page 5 of 5']);
    expect(sectionOfPage(s, 4, 5)).toMatchObject({ first: 3, last: 5 });

    // restart numbering counts within the section; {title} becomes the section title
    s = updateSection(s, id, { restartNumbering: true, footer: { left: '{title}', center: '', right: '' } });
    expect(at(pageDecorations(s, 5, { date: 'd' }), 4)).toEqual(['Appendix', 'Page 2 of 3']);

    // a second section ends the first; linking the footer back uses the default again
    s = addSection(s, 5).setup;
    const second = s.sections!.find((x) => x.startPage === 5)!;
    s = setOwnArea(s, second.id, 'footer', false);
    expect(sectionOfPage(s, 4, 5)).toMatchObject({ first: 3, last: 4 });
    expect(at(pageDecorations(s, 5, { date: 'd' }), 5)[0]).toBe(second.title);

    // sections past the last page are ignored; removing them all leaves the default
    expect(activeSections({ ...s, sections: [{ id: 'x', startPage: 9 }] }, 5)).toEqual([]);
    s = removeSection(removeSection(s, id), second.id);
    expect(s.sections).toBeUndefined();
  });

  it('new sections start on a free page with a copy of the default footer', () => {
    const one = addSection(base, 2).setup;
    const two = addSection(one, 2);
    expect(two.section.startPage).toBe(3);
    expect(two.section.footer).toEqual(base.footer);
    expect(two.section.header).toBeUndefined();
  });

  it('prints each section’s footer on its own pages', () => {
    const s = updateSection(addSection(base, 2).setup, addSection(base, 2).section.id, {});
    const withTitle = { ...s, sections: s.sections!.map((x) => ({ ...x, title: 'Part B', footer: { left: 'B: {section}', center: '', right: '' } })) };
    const h = pageRects(withTitle, 2)[1].y;
    const doc = buildPrintSvg({ elements: [rect(100), rect(h + 50)], pageSetup: withTitle, colorMode: 'blackwhite', scope: 'page' });
    expect(doc.pages[0]).toContain('Handbook');
    expect(doc.pages[1]).toContain('B: Part B');
    expect(doc.pages[1]).not.toContain('Handbook');
  });
});
