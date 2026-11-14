import { LINE_HEIGHT } from '../core/constants';
import { fontCss } from '../core/fonts';
import type { FontFamily, FontStyle, FontWeight } from '../core/types';

export interface TextFormat {
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
}

export const fontString = (fontSize: number, family: FontFamily, f: TextFormat = {}): string =>
  `${f.fontStyle ?? 'normal'} ${f.fontWeight ?? 'normal'} ${fontSize}px ${fontCss(family)}`;

let ctx: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === 'undefined') return null;
  ctx = document.createElement('canvas').getContext('2d');
  return ctx;
}

/** Measures a multi-line text block. Falls back to an estimate outside the browser (tests). */
export function measureText(text: string, fontSize: number, family: FontFamily, format: TextFormat = {}) {
  const lines = text.split('\n');
  const c = context();
  let width = 0;
  if (c) c.font = fontString(fontSize, family, format);
  for (const line of lines) {
    const w = c ? c.measureText(line).width : line.length * fontSize * (format.fontWeight === 'bold' ? 0.6 : 0.55);
    width = Math.max(width, w);
  }
  const lineHeightPx = fontSize * LINE_HEIGHT;
  return { width: Math.ceil(width), height: Math.ceil(lines.length * lineHeightPx), lineHeightPx };
}

/**
 * Word-wraps text to `maxWidth` (explicit line breaks are kept; words longer than a line are split).
 * Used for shape labels, which wrap to the shape's width.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, family: FontFamily, format: TextFormat = {}): string[] {
  const c = context();
  if (c) c.font = fontString(fontSize, family, format);
  const width = (s: string) => (c ? c.measureText(s).width : s.length * fontSize * (format.fontWeight === 'bold' ? 0.6 : 0.55));
  const limit = Math.max(fontSize, maxWidth);
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const raw of para.split(' ')) {
      let word = raw;
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate) <= limit) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      line = '';
      // a single word wider than the line is broken across lines
      while (width(word) > limit && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && width(word.slice(0, n)) > limit) n--;
        out.push(word.slice(0, n));
        word = word.slice(n);
      }
      line = word;
    }
    out.push(line);
  }
  return out;
}
