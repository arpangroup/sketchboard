import rough from 'roughjs';
import type { Bounds, ColorMode, SketchElement } from '../core/types';
import { fontImportUrls } from '../core/fonts';
import type { TextPrimitive } from '../elements/ElementHandler';
import { getColorTransformer } from '../renderer/colorModes';
import { textAnchorX, textBaselineY } from '../renderer/drawElement';
import { shapeCache } from '../renderer/ShapeCache';
import { imageFilterFor } from '../renderer/drawElement';
import { fileStore } from '../files/FileStore';
import type { PageDecoration } from '../page/pageLayout';

const generator = rough.generator();

export const FONT_IMPORT_URL =
  'https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Inter:wght@400;600&family=JetBrains+Mono&display=swap';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const n = (v: number) => Math.round(v * 100) / 100;

/** Only web/mail links are written out (never javascript: and friends). */
const safeLink = (link?: string): string | null => (link && /^(https?:|mailto:|tel:)/i.test(link.trim()) ? link.trim() : null);

/** Renders elements as SVG markup (group per element), in world coordinates. */
export function elementsToSvgMarkup(elements: readonly SketchElement[], mode: ColorMode): string {
  const out: string[] = [];
  for (const el of elements) {
    const shape = shapeCache.get(el, mode);
    const opacity = mode === 'blackwhite' ? 1 : el.opacity / 100;
    const angle = el.angle ?? 0;
    const rotate = angle ? ` rotate(${n((angle * 180) / Math.PI)} ${n(el.width / 2)} ${n(el.height / 2)})` : '';
    const href = safeLink(el.link);
    if (href) out.push(`<a href="${esc(href)}" target="_blank">`);
    out.push(`<g transform="translate(${n(el.x)} ${n(el.y)})${rotate}"${opacity < 1 ? ` opacity="${opacity}"` : ''}>`);
    const flipped = !!(el.flipX || el.flipY);
    if (flipped) {
      out.push(`<g transform="translate(${el.flipX ? n(el.width) : 0} ${el.flipY ? n(el.height) : 0}) scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1})">`);
    }

    for (const d of shape.drawables) {
      const dash = d.options.strokeLineDash?.join(' ');
      generator.toPaths(d).forEach((p, i) => {
        const isStroke = d.sets[i]?.type === 'path';
        out.push(
          `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill}"` +
            ` stroke-linecap="round"${isStroke && dash ? ` stroke-dasharray="${dash}"` : ''}/>`,
        );
      });
    }
    if (shape.image) {
      const file = fileStore.get(shape.image.fileId);
      const filter = imageFilterFor(mode);
      if (file) {
        out.push(
          `<image href="${file.dataURL}" width="${n(shape.image.width)}" height="${n(shape.image.height)}"` +
            ` preserveAspectRatio="none"${filter !== 'none' ? ` style="filter:${filter}"` : ''}/>`,
        );
      }
    }
    for (const p of shape.paths) {
      const extra =
        (p.opacity !== undefined ? ` opacity="${p.opacity}"` : '') +
        (p.blend ? ` style="mix-blend-mode:${p.blend}"` : '');
      out.push(
        `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'none'}"` +
          ` stroke-width="${p.strokeWidth ?? 1}" stroke-linecap="${p.lineCap ?? 'round'}" stroke-linejoin="round"${extra}/>`,
      );
    }
    if (flipped) out.push('</g>');
    if (shape.text) out.push(textBlockToSvg(shape.text, 0, 0));
    for (const cell of shape.texts ?? []) out.push(textBlockToSvg(cell.text, cell.x, cell.y));
    out.push('</g>');
    if (href) out.push('</a>');
  }
  return out.join('');
}

function textBlockToSvg(t: TextPrimitive, ox: number, oy: number): string {
  const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start';
  if (t.rich) {
    // one <text> per line, one <tspan> per formatted piece (the anchor aligns the whole line)
    return t.rich
      .map((line, i) => {
        const spans = line
          .map(
            (f) =>
              `<tspan${f.bold ? ' font-weight="bold"' : ' font-weight="normal"'}${f.italic ? ' font-style="italic"' : ' font-style="normal"'}` +
              `${f.underline ? ' text-decoration="underline"' : ''}${f.color ? ` fill="${esc(f.color)}"` : ''}>${esc(f.text)}</tspan>`,
          )
          .join('');
        const indent = t.align === 'right' ? 0 : t.align === 'center' ? (t.indents?.[i] ?? 0) / 2 : (t.indents?.[i] ?? 0);
        return (
          `<text x="${n(ox + textAnchorX(t) + indent)}" y="${n(oy + textBaselineY(t, i))}" font-family="${esc(t.family)}"` +
          ` font-size="${t.fontSize}" fill="${t.color}" text-anchor="${anchor}" style="white-space:pre">${spans}</text>`
        );
      })
      .join('');
  }
  const fmt =
    (t.fontWeight === 'bold' ? ' font-weight="bold"' : '') +
    (t.fontStyle === 'italic' ? ' font-style="italic"' : '') +
    (t.underline ? ' text-decoration="underline"' : '');
  return t.lines
    .map(
      (line, i) =>
        `<text x="${n(ox + textAnchorX(t))}" y="${n(oy + textBaselineY(t, i))}" font-family="${esc(t.family)}"` +
        ` font-size="${t.fontSize}" fill="${t.color}" text-anchor="${anchor}"${fmt} style="white-space:pre">${esc(line)}</text>`,
    )
    .join('');
}

/** Header/footer/page-number text as SVG. */
export function decorationsToSvg(items: readonly PageDecoration[], color: string): string {
  return items
    .map((d) => {
      const anchor = d.align === 'center' ? 'middle' : d.align === 'right' ? 'end' : 'start';
      return (
        `<text x="${n(d.x)}" y="${n(d.y)}" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="${d.fontSize}"` +
        ` fill="${color}" text-anchor="${anchor}" style="white-space:pre">${esc(d.text)}</text>`
      );
    })
    .join('');
}

/** @import rules for every web font the exported text uses. */
export function fontImportCss(elements: readonly SketchElement[]): string {
  const families = elements.flatMap((e) => (e.type === 'text' || e.type === 'table' ? [e.fontFamily] : []));
  return [FONT_IMPORT_URL, ...fontImportUrls(families)].map((u) => `@import url('${u}');`).join('');
}

export interface SvgExportOptions {
  region: Bounds;
  colorMode: ColorMode;
  background: boolean;
  /** Physical output size (for print). Defaults to region size in px. */
  physicalSize?: { width: string; height: string };
  embedFonts?: boolean;
  /** Header/footer text to include (page-scope exports). */
  decorations?: readonly PageDecoration[];
}

export function exportToSvg(elements: readonly SketchElement[], o: SvgExportOptions): string {
  const r = o.region;
  const bg = getColorTransformer(o.colorMode).background('#ffffff');
  const width = o.physicalSize?.width ?? `${Math.ceil(r.width)}`;
  const height = o.physicalSize?.height ?? `${Math.ceil(r.height)}`;
  const fonts = o.embedFonts !== false ? `<defs><style>${fontImportCss(elements)}</style></defs>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"` +
    ` viewBox="${n(r.x)} ${n(r.y)} ${n(r.width)} ${n(r.height)}">` +
    fonts +
    (o.background ? `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" fill="${bg}"/>` : '') +
    elementsToSvgMarkup(elements, o.colorMode) +
    decorationsToSvg(o.decorations ?? [], o.colorMode === 'color' ? '#6b7280' : '#000000') +
    '</svg>'
  );
}
