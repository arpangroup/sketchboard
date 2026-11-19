import { LINE_HEIGHT } from '../core/constants';
import { fontCss } from '../core/fonts';
import type { FontFamily, FontStyle, FontWeight, TextRun } from '../core/types';

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

/** What decides a text box's size: its text and font, and for a fixed-width box, its width. */
export interface TextBoxLike extends TextFormat {
  text: string;
  fontSize: number;
  fontFamily: FontFamily;
  width: number;
  fixedWidth?: boolean;
  underline?: boolean;
  /** The box's text colour (pieces with their own colour override it). */
  strokeColor?: string;
  runs?: TextRun[];
}

// ───────────────────────────── Rich text (bold / italic / underline on parts) ─────────────────────────────

/** A piece of text with its formatting worked out (the box's own style plus the piece's overrides). */
export interface StyledRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Own colour; unset = the box's colour. */
  color?: string;
}

const hasOverride = (r: TextRun) => r.b !== undefined || r.i !== undefined || r.u !== undefined || r.c !== undefined;
const sameColor = (a?: string, b?: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

/** The box's pieces with their real formatting, or null when the whole box looks the same. */
export function styledRuns(t: TextBoxLike): StyledRun[] | null {
  const runs = t.runs;
  if (!runs?.length || runs.map((r) => r.text).join('') !== t.text) return null;
  if (!runs.some(hasOverride)) return null;
  const bold = t.fontWeight === 'bold';
  const italic = t.fontStyle === 'italic';
  const underline = !!t.underline;
  return runs.map((r) => ({ text: r.text, bold: r.b ?? bold, italic: r.i ?? italic, underline: r.u ?? underline, ...(r.c ? { color: r.c } : {}) }));
}

/** Tidies pieces: joins neighbours that look the same, drops empty ones, and drops overrides that match the box. */
export function normalizeRuns(runs: readonly TextRun[], base: TextBoxLike): TextRun[] | undefined {
  const bold = base.fontWeight === 'bold';
  const italic = base.fontStyle === 'italic';
  const underline = !!base.underline;
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const run: TextRun = { text: r.text };
    if (r.b !== undefined && r.b !== bold) run.b = r.b;
    if (r.i !== undefined && r.i !== italic) run.i = r.i;
    if (r.u !== undefined && r.u !== underline) run.u = r.u;
    if (r.c && !sameColor(r.c, base.strokeColor)) run.c = r.c;
    const last = out[out.length - 1];
    if (last && last.b === run.b && last.i === run.i && last.u === run.u && sameColor(last.c, run.c)) last.text += run.text;
    else out.push(run);
  }
  return out.some(hasOverride) ? out : undefined;
}

/** Width of a piece in its own font. */
function runWidth(text: string, fontSize: number, family: FontFamily, bold: boolean, italic: boolean): number {
  const c = context();
  if (!c) return text.length * fontSize * (bold ? 0.6 : 0.55);
  c.font = fontString(fontSize, family, { fontWeight: bold ? 'bold' : 'normal', fontStyle: italic ? 'italic' : 'normal' });
  return c.measureText(text).width;
}

export interface RichLayout {
  lines: StyledRun[][];
  widths: number[];
  /** Left indent of each line (px): wrapped lines of a list item hang under its text, not its marker. */
  indents: number[];
}

/** "• " / "12. " at the start of a line (with any indent before it). */
const LIST_MARKER_RE = /^\s*(?:•|\d+[.)]) /;
export const hasListLines = (text: string): boolean => text.split('\n').some((l) => LIST_MARKER_RE.test(l));
/** Small gap before a list item's bullet / number, so it doesn't touch the box's edge (2 px at 20 px text). */
export const listGap = (fontSize: number): number => Math.max(2, fontSize * 0.1);

/**
 * Lays out formatted pieces into lines: breaks at new lines, and — with `maxWidth` — wraps at word
 * boundaries (a word wider than the line is split), measuring each piece in its own font.
 */
export function layoutRuns(runs: readonly StyledRun[], maxWidth: number | null, fontSize: number, family: FontFamily): RichLayout {
  const w = (r: StyledRun, text = r.text) => runWidth(text, fontSize, family, r.bold, r.italic);
  // split into paragraphs of "tokens": spaces and words, each a list of pieces
  type Tok = { space: boolean; frags: StyledRun[] };
  const paragraphs: Tok[][] = [[]];
  for (const run of runs) {
    run.text.split('\n').forEach((chunk, ci) => {
      if (ci > 0) paragraphs.push([]);
      const para = paragraphs[paragraphs.length - 1];
      for (const part of chunk.split(/( +)/)) {
        if (!part) continue;
        const space = part.startsWith(' ');
        const frag = { ...run, text: part };
        const last = para[para.length - 1];
        if (last && last.space === space) last.frags.push(frag); // a word carrying on in another style
        else para.push({ space, frags: [frag] });
      }
    });
  }
  const lines: StyledRun[][] = [];
  const widths: number[] = [];
  const limit = maxWidth === null ? Infinity : Math.max(fontSize, maxWidth);
  const tokWidth = (t: Tok) => t.frags.reduce((s, f) => s + w(f), 0);
  const indents: number[] = [];
  for (const para of paragraphs) {
    let line: StyledRun[] = [];
    let lineW = 0;
    let pendingSpace: Tok | null = null;
    // a list item starts a little in from the edge; when it wraps, later lines start under its text
    const paraText = para.map((t) => t.frags.map((f) => f.text).join('')).join('');
    const marker = paraText.match(LIST_MARKER_RE)?.[0] ?? '';
    const gap = marker ? listGap(fontSize) : 0;
    const first = para[0]?.frags[0];
    const hang = marker && first && maxWidth !== null ? w(first, marker) : 0;
    let paraLines = 0;
    const indentNow = () => gap + (paraLines > 0 ? hang : 0);
    const curLimit = () => Math.max(fontSize, limit - indentNow());
    const flush = () => {
      lines.push(line);
      widths.push(lineW + indentNow());
      indents.push(indentNow());
      paraLines++;
      line = [];
      lineW = 0;
    };
    for (const tok of para) {
      if (tok.space) {
        pendingSpace = tok;
        continue;
      }
      const spaceW = pendingSpace && line.length ? tokWidth(pendingSpace) : 0;
      const wordW = tokWidth(tok);
      if (lineW + spaceW + wordW <= curLimit() || !line.length) {
        if (pendingSpace && (line.length || maxWidth === null)) {
          line.push(...pendingSpace.frags);
          lineW += tokWidth(pendingSpace);
        }
        if (wordW <= curLimit() || maxWidth === null) {
          line.push(...tok.frags);
          lineW += wordW;
        } else {
          // a word wider than the line: split it character by character
          for (const f of tok.frags) {
            for (const ch of f.text) {
              const cw = w(f, ch);
              if (lineW + cw > curLimit() && line.length) flush();
              line.push({ ...f, text: ch });
              lineW += cw;
            }
          }
        }
      } else {
        flush();
        line.push(...tok.frags);
        lineW = wordW;
      }
      pendingSpace = null;
    }
    if (pendingSpace && maxWidth === null) {
      line.push(...pendingSpace.frags);
      lineW += tokWidth(pendingSpace);
    }
    flush();
  }
  // join neighbouring pieces with the same look
  const merged = lines.map((l) =>
    l.reduce<StyledRun[]>((acc, f) => {
      const last = acc[acc.length - 1];
      if (last && last.bold === f.bold && last.italic === f.italic && last.underline === f.underline && sameColor(last.color, f.color)) last.text += f.text;
      else acc.push({ ...f });
      return acc;
    }, []),
  );
  return { lines: merged, widths, indents };
}

/** The box's text as formatted pieces (one plain piece when it has no formatted words). */
export const piecesOf = (t: TextBoxLike): StyledRun[] =>
  styledRuns(t) ?? [{ text: t.text, bold: t.fontWeight === 'bold', italic: t.fontStyle === 'italic', underline: !!t.underline }];

/** Lines a text box shows: wrapped at its width when it has a fixed width, else as typed. */
export const textBoxLines = (t: TextBoxLike): string[] => {
  const rich = styledRuns(t) ?? (hasListLines(t.text) ? piecesOf(t) : null);
  if (rich) return layoutRuns(rich, t.fixedWidth ? t.width : null, t.fontSize, t.fontFamily).lines.map((l) => l.map((f) => f.text).join(''));
  return t.fixedWidth ? wrapText(t.text || ' ', t.width, t.fontSize, t.fontFamily, t) : (t.text || ' ').split('\n');
};

/**
 * Size of a text box. Auto-width boxes fit their longest line; fixed-width boxes keep their width
 * and grow downwards as the text wraps. Formatted parts are measured in their own font.
 */
export function textBoxSize(t: TextBoxLike): { width: number; height: number } {
  // lists are laid out piece by piece too, for their indent (and hanging indent when wrapping)
  const rich = styledRuns(t) ?? (hasListLines(t.text) ? piecesOf(t) : null);
  if (rich) {
    const l = layoutRuns(rich, t.fixedWidth ? t.width : null, t.fontSize, t.fontFamily);
    return {
      width: t.fixedWidth ? t.width : Math.ceil(Math.max(1, ...l.widths)),
      height: Math.ceil(l.lines.length * t.fontSize * LINE_HEIGHT),
    };
  }
  if (!t.fixedWidth) {
    const m = measureText(t.text || ' ', t.fontSize, t.fontFamily, t);
    return { width: m.width, height: m.height };
  }
  return { width: t.width, height: Math.ceil(textBoxLines(t).length * t.fontSize * LINE_HEIGHT) };
}

/** Number of lines a box's text takes when wrapped at `width` (shape labels). */
export function wrappedLineCount(t: TextBoxLike, width: number): number {
  const rich = styledRuns(t) ?? (hasListLines(t.text) ? piecesOf(t) : null);
  if (rich) return layoutRuns(rich, width, t.fontSize, t.fontFamily).lines.length;
  return wrapText(t.text || ' ', width, t.fontSize, t.fontFamily, t).length;
}
