import type { MathElement, TextAlign } from '../../core/types';
import { mathBlocks } from './mathSource';
import { transformPath } from './svgPath';

/**
 * Turns LaTeX into a list of positioned vector pieces — glyphs, rules (fraction bars, overlines)
 * and SVG paths (square roots, tall brackets, arrows) — that the canvas renderer, SVG export and
 * print all draw the same way.
 *
 * KaTeX lays the formula out in a hidden part of the page; the pieces are then read back from the
 * browser's layout. KaTeX (and its fonts) load on first use, so the rest of the app stays small.
 * Layouts are made once at REF px and scaled to each element's font size.
 */
export const REF = 40;
/** Space between stacked equations, in em. */
const GAP = 0.6;
/** Room around the formula for overhanging italics, in em. */
const PAD = 0.15;

export type MathItem =
  | { k: 'glyph'; x: number; y: number; text: string; font: string; family: string; size: number; italic: boolean; bold: boolean; color?: string }
  | { k: 'rect'; x: number; y: number; w: number; h: number; color?: string }
  | {
      k: 'path';
      d: string;
      fill?: string | true;
      stroke?: string | true;
      strokeWidth?: number;
      clip?: { x: number; y: number; w: number; h: number };
    };

export interface MathLayout {
  width: number;
  height: number;
  items: MathItem[];
  /** KaTeX's messages for the parts it couldn't read (shown in red in the formula). */
  errors: string[];
}

type Katex = typeof import('katex').default;
let katex: Katex | null = null;
let loading: Promise<void> | null = null;
let revision = 0;
const listeners = new Set<() => void>();
const cache = new Map<string, MathLayout>();

/** Changes whenever layouts may have changed (KaTeX or one of its fonts arrived). */
export const mathRevision = (): number => revision;
export const isMathReady = (): boolean => katex !== null;

export function onMathChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  cache.clear();
  revision++;
  for (const fn of listeners) fn();
}

const KATEX_FONTS = ['KaTeX_Main', 'KaTeX_Math', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4', 'KaTeX_AMS'];

/** Loads KaTeX, its stylesheet and its main fonts (once). */
export function loadMath(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')])
    .then(async ([mod]) => {
      katex = (mod as unknown as { default: Katex }).default ?? (mod as unknown as Katex);
      changed();
      // fonts are only fetched once something uses them: ask for the common ones up front
      if (document.fonts) {
        await Promise.allSettled([
          ...KATEX_FONTS.map((f) => document.fonts.load(`${REF}px ${f}`)),
          document.fonts.load(`italic ${REF}px KaTeX_Math`),
          document.fonts.load(`bold ${REF}px KaTeX_Main`),
        ]);
        changed();
        // later fonts (fraktur, script, …) re-measure when they arrive
        document.fonts.addEventListener('loadingdone', (e) => {
          const faces = (e as FontFaceSetLoadEvent).fontfaces ?? [];
          if (faces.some((f) => f.family.replace(/["']/g, '').startsWith('KaTeX'))) changed();
        });
      }
    })
    .catch((err) => {
      loading = null;
      console.warn('[SketchBoard] Could not load the maths renderer', err);
    });
  return loading;
}

/** KaTeX's HTML for a source (each equation in display mode), for previews; null until KaTeX has loaded. */
export function renderMathHtml(source: string): string | null {
  if (!katex) return null;
  const k = katex;
  return mathBlocks(source)
    .map((b) => k.renderToString(b, { displayMode: true, throwOnError: false, strict: 'ignore', output: 'html', trust: false }))
    .join('');
}

let host: HTMLDivElement | null = null;
const SENTINEL = 'rgb(1, 2, 3)'; // "the element's own colour"

function measuringHost(): HTMLDivElement {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.className = 'sb-math-measure';
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'absolute',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    fontSize: `${REF}px`,
    color: SENTINEL,
    whiteSpace: 'nowrap',
    lineHeight: 'normal',
    contain: 'layout style',
  });
  const style = document.createElement('style');
  style.textContent = '.sb-math-measure .katex-display{margin:0!important}.sb-math-measure .katex{font-size:1em!important}';
  host.append(style);
  document.body.append(host);
  return host;
}

/** "rgb(224, 49, 49)" → "#e03131"; undefined for the element's own colour. */
function colorOf(css: string): string | undefined {
  if (!css || css === SENTINEL || css === 'none' || css === 'currentcolor') return undefined;
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/);
  if (!m) return css;
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number.parseFloat(m[4]);
  return `#${h(+m[1])}${h(+m[2])}${h(+m[3])}${a < 1 ? h(a * 255) : ''}`;
}

const transparent = (css: string) => !css || css === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(css);

/** The layout for a formula, or null until KaTeX has loaded (call loadMath()). */
export function mathLayout(latex: string, align: TextAlign = 'center'): MathLayout | null {
  if (!katex || typeof document === 'undefined') return null;
  const key = `${align}\u0000${latex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = measure(katex, latex, align);
  if (cache.size > 300) cache.clear();
  cache.set(key, out);
  return out;
}

function measure(k: Katex, latex: string, align: TextAlign): MathLayout {
  const root = measuringHost();
  const blocks = mathBlocks(latex);
  const wraps = blocks.map((src) => {
    const div = document.createElement('div');
    div.style.display = 'inline-block';
    div.style.verticalAlign = 'top';
    try {
      k.render(src, div, { displayMode: true, throwOnError: false, strict: 'ignore', output: 'html', trust: false, maxExpand: 500 });
    } catch (err) {
      div.textContent = src;
      div.style.color = '#cc0000';
      div.title = String((err as Error).message ?? err);
    }
    const line = document.createElement('div');
    line.append(div);
    root.append(line);
    return div;
  });

  // a zero-size box before each run of text marks the text's baseline (its bottom edge)
  const runs: Array<{ text: Text; mark: HTMLSpanElement }> = [];
  for (const w of wraps) {
    const walker = document.createTreeWalker(w, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.textContent ?? '').trim()) texts.push(n as Text);
    for (const text of texts) {
      const mark = document.createElement('span');
      mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;margin:0;padding:0';
      text.before(mark);
      runs.push({ text, mark });
    }
  }

  const pad = PAD * REF;
  const boxes = wraps.map((w) => w.getBoundingClientRect());
  const width = Math.max(1, ...boxes.map((b) => b.width)) + 2 * pad;
  const items: MathItem[] = [];
  const errors: string[] = [];
  let top = pad;
  const runOf = new Map(runs.map((r) => [r.text, r.mark]));

  wraps.forEach((w, bi) => {
    const box = boxes[bi];
    const left = pad + (align === 'left' ? 0 : align === 'right' ? width - 2 * pad - box.width : (width - 2 * pad - box.width) / 2);
    const ox = box.left - left;
    const oy = box.top - top;
    for (const e of w.querySelectorAll('.katex-error')) errors.push(e.getAttribute('title') ?? 'Invalid LaTeX');
    if (w.title) errors.push(w.title);

    const clipFor = (el: Element) => {
      let c: { l: number; t: number; r: number; b: number } | null = null;
      for (let a = el.parentElement; a && a !== w; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const r = a.getBoundingClientRect();
        c = c ? { l: Math.max(c.l, r.left), t: Math.max(c.t, r.top), r: Math.min(c.r, r.right), b: Math.min(c.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
      }
      return c ? { x: c.l - ox, y: c.t - oy, w: Math.max(0, c.r - c.l), h: Math.max(0, c.b - c.t) } : undefined;
    };

    const svgPieces = (svg: SVGSVGElement) => {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const vb = svg.viewBox?.baseVal;
      let sx = 1;
      let sy = 1;
      let tx = r.left;
      let ty = r.top;
      if (vb && vb.width > 0 && vb.height > 0) {
        const par = (svg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet').trim();
        const fx = r.width / vb.width;
        const fy = r.height / vb.height;
        if (par.startsWith('none')) {
          sx = fx;
          sy = fy;
          tx = r.left - vb.x * sx;
          ty = r.top - vb.y * sy;
        } else {
          const s = par.includes('slice') ? Math.max(fx, fy) : Math.min(fx, fy);
          sx = sy = s;
          const ax = par.includes('xMin') ? 0 : par.includes('xMax') ? 1 : 0.5;
          const ay = par.includes('YMin') ? 0 : par.includes('YMax') ? 1 : 0.5;
          tx = r.left + ax * (r.width - vb.width * s) - vb.x * s;
          ty = r.top + ay * (r.height - vb.height * s) - vb.y * s;
        }
      }
      // the svg's own box clips too (KaTeX's long square-root and arrow paths rely on it)
      const own = { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height };
      const outer = clipFor(svg);
      const clip = outer
        ? (() => {
            const x = Math.max(own.x, outer.x);
            const y = Math.max(own.y, outer.y);
            return { x, y, w: Math.max(0, Math.min(own.x + own.w, outer.x + outer.w) - x), h: Math.max(0, Math.min(own.y + own.h, outer.y + outer.h) - y) };
          })()
        : own;
      for (const shape of svg.querySelectorAll('path, line, rect')) {
        const cs = getComputedStyle(shape);
        let d: string | null = null;
        if (shape.tagName === 'path') d = shape.getAttribute('d');
        else if (shape.tagName === 'line') {
          const a = (n: string) => (shape as SVGLineElement)[n as 'x1'].baseVal.value;
          d = `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`;
        } else {
          const b = (shape as SVGRectElement).getBBox();
          d = `M${b.x} ${b.y}h${b.width}v${b.height}h${-b.width}z`;
        }
        if (!d) continue;
        const fill = cs.fill === 'none' || cs.fillOpacity === '0' ? undefined : (colorOf(cs.fill) ?? true);
        const stroke = cs.stroke === 'none' || !Number.parseFloat(cs.strokeWidth) ? undefined : (colorOf(cs.stroke) ?? true);
        if (!fill && !stroke) continue;
        items.push({
          k: 'path',
          d: transformPath(d, sx, sy, tx - ox, ty - oy),
          ...(fill ? { fill } : {}),
          ...(stroke ? { stroke, strokeWidth: Number.parseFloat(cs.strokeWidth) * sx } : {}),
          clip,
        });
      }
    };

    const visit = (el: Element) => {
      if (el instanceof SVGSVGElement) return svgPieces(el);
      if (!(el instanceof HTMLElement)) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return; // (everything here is invisible: the measuring box is hidden)
      const r = el.getBoundingClientRect();
      if (!transparent(cs.backgroundColor) && r.width && r.height) {
        items.push({ k: 'rect', x: r.left - ox, y: r.top - oy, w: r.width, h: r.height, color: colorOf(cs.backgroundColor) });
      }
      // rules: fraction bars, \overline, \underline, \hline, \boxed … are CSS borders
      const side = (s: 'Top' | 'Bottom' | 'Left' | 'Right') => {
        const bw = Number.parseFloat(cs[`border${s}Width`]);
        if (!bw || cs[`border${s}Style`] === 'none' || transparent(cs[`border${s}Color`])) return;
        const color = colorOf(cs[`border${s}Color`]);
        const x = r.left - ox;
        const y = r.top - oy;
        if (s === 'Top') items.push({ k: 'rect', x, y, w: r.width, h: bw, color });
        if (s === 'Bottom') items.push({ k: 'rect', x, y: y + r.height - bw, w: r.width, h: bw, color });
        if (s === 'Left') items.push({ k: 'rect', x, y, w: bw, h: r.height, color });
        if (s === 'Right') items.push({ k: 'rect', x: x + r.width - bw, y, w: bw, h: r.height, color });
      };
      side('Top');
      side('Bottom');
      side('Left');
      side('Right');
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const mark = runOf.get(child as Text);
          const text = (child.textContent ?? '').replace(/ /g, ' ');
          if (!mark || !text.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(child);
          const tr = range.getBoundingClientRect();
          const size = Number.parseFloat(cs.fontSize);
          const italic = cs.fontStyle !== 'normal';
          const bold = (Number.parseInt(cs.fontWeight, 10) || 400) >= 600;
          items.push({
            k: 'glyph',
            x: tr.left - ox,
            y: mark.getBoundingClientRect().bottom - oy,
            text,
            family: cs.fontFamily,
            size,
            italic,
            bold,
            font: `${italic ? 'italic' : 'normal'} ${bold ? 'bold' : 'normal'} ${size}px ${cs.fontFamily}`,
            color: colorOf(cs.color),
          });
        } else if (child instanceof Element) visit(child);
      }
    };
    visit(w);
    top += box.height + GAP * REF;
  });

  const height = Math.max(REF, top - GAP * REF + pad);
  while (root.childNodes.length > 1) root.lastChild!.remove();
  return { width, height, items, errors: [...new Set(errors)] };
}

/** Size of a maths element for its formula and font size (an estimate until KaTeX has loaded). */
export function mathBox(el: Pick<MathElement, 'latex' | 'fontSize' | 'textAlign'>): { width: number; height: number } {
  const s = el.fontSize / REF;
  const l = mathLayout(el.latex, el.textAlign);
  if (l) return { width: l.width * s, height: l.height * s };
  // placeholder: the source text in a small monospace font
  const lines = el.latex.split('\n');
  const ch = el.fontSize * 0.5;
  return { width: Math.max(4 * ch, ...lines.map((x) => x.length * ch * 0.6)) + 8, height: Math.max(el.fontSize, lines.length * ch * 1.3) + 8 };
}
