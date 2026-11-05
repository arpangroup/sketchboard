import type { ColorMode, PageSetup, SketchElement } from '../core/types';
import { getPageDimensions } from '../page/pageSizes';
import { contentBounds } from './region';
import { decorationsToSvg, elementsToSvgMarkup, fontImportCss } from './svgExport';
import { pageDecorations, pageRects, requiredPageCount } from '../page/pageLayout';

export type PrintScope = 'page' | 'fit';

export interface PrintOptions {
  elements: readonly SketchElement[];
  pageSetup: PageSetup;
  colorMode: ColorMode;
  /** 'page' = print the page frame exactly as drawn; 'fit' = scale the whole drawing onto the page. */
  scope: PrintScope;
}

export interface PrintDocument {
  /** One standalone SVG per sheet of paper. */
  pages: string[];
  /** First page (handy for previews / tests). */
  svg: string;
  widthMm: number;
  heightMm: number;
}

/**
 * Builds print-ready SVG pages sized in millimetres for the chosen paper (vector → crisp at any
 * printer resolution). 'page' prints every board page as drawn, with headers, footers and page
 * numbers; 'fit' scales the whole drawing onto a single sheet.
 */
export function buildPrintSvg(o: PrintOptions): PrintDocument {
  // An infinite canvas still needs paper: default to A4, oriented to match the drawing.
  let setup = o.pageSetup;
  let scope = o.scope;
  if (setup.size === 'infinite') {
    const c = contentBounds(o.elements);
    setup = { ...setup, size: 'A4', orientation: c && c.width > c.height ? 'landscape' : 'portrait' };
    scope = 'fit';
  }
  const page = getPageDimensions(setup)!;
  const n = (v: number) => Math.round(v * 100) / 100;
  const body = elementsToSvgMarkup(o.elements, o.colorMode);
  const decoColor = o.colorMode === 'color' ? '#6b7280' : '#000000';
  const wrap = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${page.widthMm}mm" height="${page.heightMm}mm"` +
    ` viewBox="0 0 ${n(page.widthPx)} ${n(page.heightPx)}">${inner}</svg>`;

  const pages: string[] = [];
  if (scope === 'page') {
    const rects = pageRects(setup, requiredPageCount(setup, o.elements));
    const deco = pageDecorations(setup, rects.length, { rects });
    rects.forEach((r, i) => {
      // shift world → page-local so the same scene markup is clipped to this sheet
      const items = deco.filter((d) => d.page === i + 1).map((d) => ({ ...d, x: d.x - r.x, y: d.y - r.y }));
      pages.push(
        wrap(
          `<svg x="0" y="0" width="${n(r.width)}" height="${n(r.height)}" viewBox="${n(r.x)} ${n(r.y)} ${n(r.width)} ${n(r.height)}">` +
            body +
            '</svg>' +
            decorationsToSvg(items, decoColor),
        ),
      );
    });
  } else {
    const c = contentBounds(o.elements, 10) ?? { x: 0, y: 0, width: 1, height: 1 };
    const m = page.marginPx;
    const deco = pageDecorations(setup, 1, { rects: [{ x: 0, y: 0, width: page.widthPx, height: page.heightPx }] });
    pages.push(
      wrap(
        `<svg x="${n(m)}" y="${n(m)}" width="${n(page.widthPx - 2 * m)}" height="${n(page.heightPx - 2 * m)}"` +
          ` viewBox="${n(c.x)} ${n(c.y)} ${n(c.width)} ${n(c.height)}" preserveAspectRatio="xMidYMid meet">` +
          body +
          '</svg>' +
          decorationsToSvg(deco, decoColor),
      ),
    );
  }
  return { pages, svg: pages[0], widthMm: page.widthMm, heightMm: page.heightMm };
}

/** Prints via a hidden iframe so the app UI is never part of the printout. */
export async function printScene(o: PrintOptions): Promise<void> {
  const { pages, widthMm, heightMm } = buildPrintSvg(o);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>SketchBoard print</title>
<style>${fontImportCss(o.elements)}</style>
<style>
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  svg { display: block; width: ${widthMm}mm; height: ${heightMm}mm; }
  .sheet { break-after: page; page-break-after: always; }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
</style></head><body>${pages.map((p) => `<div class="sheet">${p}</div>`).join('')}</body></html>`);
  doc.close();

  const win = iframe.contentWindow!;
  try {
    await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* fonts are best-effort */
  }
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  win.focus();
  win.print();
  setTimeout(cleanup, 60_000); // safety net if afterprint never fires
}
