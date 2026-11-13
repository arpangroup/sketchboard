import type { CodeElement, CodeMark, CodeTheme } from '../../core/types';
import { fontString } from '../textMetrics';
import type { TokenType } from './highlight';

/** Monospace font used by code blocks (JetBrains Mono, loaded on demand). */
export const CODE_FONT = 'code';
export const CODE_LINE_HEIGHT = 1.5;
const TAB = '    ';

export interface CodeLayout {
  lines: string[];
  charW: number;
  lineH: number;
  padX: number;
  padY: number;
  headerH: number;
  gutterW: number;
  /** x where code text starts (element-local) */
  codeX: number;
  /** y of the first code line's top (element-local) */
  codeY: number;
  width: number;
  height: number;
}

let ctx: CanvasRenderingContext2D | null = null;
const charWidthCache = new Map<string, number>();
/** Width of one monospace character at a font size. */
export function charWidth(fontSize: number): number {
  const font = fontString(fontSize, CODE_FONT);
  const cached = charWidthCache.get(font);
  if (cached) return cached;
  if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
  let w = fontSize * 0.6;
  if (ctx) {
    ctx.font = font;
    w = ctx.measureText('M'.repeat(40)).width / 40;
  }
  charWidthCache.set(font, w);
  return w;
}
/** Call after web fonts finish loading so widths are re-measured. */
export const resetCodeMetrics = () => charWidthCache.clear();

export const codeLines = (code: string) => code.replace(/\r\n?/g, '\n').replace(/\t/g, TAB).split('\n');

/** Geometry of a code block, derived from its content (blocks size to fit; resizing scales the font). */
export function codeLayout(el: Pick<CodeElement, 'code' | 'fontSize' | 'lineNumbers' | 'title'>): CodeLayout {
  const fs = el.fontSize;
  const lines = codeLines(el.code);
  const charW = charWidth(fs);
  const lineH = Math.round(fs * CODE_LINE_HEIGHT * 100) / 100;
  const padX = fs * 1;
  const padY = fs * 0.75;
  const headerH = fs * 2.1;
  const digits = String(lines.length).length;
  const gutterW = el.lineNumbers ? (Math.max(2, digits) + 1.5) * charW : 0;
  const codeX = padX + gutterW;
  const codeY = headerH + padY;
  const cols = Math.max(24, ...lines.map((l) => l.length), (el.title?.length ?? 0) + 18);
  return {
    lines,
    charW,
    lineH,
    padX,
    padY,
    headerH,
    gutterW,
    codeX,
    codeY,
    width: codeX + cols * charW + padX,
    height: codeY + lines.length * lineH + padY,
  };
}

/** 1-based line under an element-local y (null outside the code area). */
export function lineAt(el: CodeElement, localY: number): number | null {
  const l = codeLayout(el);
  const i = Math.floor((localY - l.codeY) / l.lineH);
  return i >= 0 && i < l.lines.length ? i + 1 : null;
}

/** "2, 4-6" → [2, 4, 5, 6] (1-based, clamped to the block). */
export function parseLineList(text: string, max: number): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!m) continue;
    let a = Number(m[1]);
    let b = Number(m[2] ?? m[1]);
    if (a > b) [a, b] = [b, a];
    for (let i = Math.max(1, a); i <= Math.min(max, b, a + 500); i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

/** [2,3,4,7] → "2-4, 7" */
export function formatLineList(lines: number[]): string {
  const sorted = [...lines].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(', ');
}

export interface CodePalette {
  bg: string;
  border: string;
  header: string;
  headerText: string;
  gutter: string;
  tokens: Record<TokenType, string>;
  marks: Record<CodeMark, { fill: string; bar: string }>;
  dots: [string, string, string];
}

export const CODE_THEMES: Record<CodeTheme, CodePalette> = {
  light: {
    bg: '#f6f8fa',
    border: '#d0d7de',
    header: '#eaeef2',
    headerText: '#57606a',
    gutter: '#8c959f',
    tokens: {
      plain: '#24292f',
      keyword: '#cf222e',
      string: '#0a3069',
      number: '#0550ae',
      comment: '#6e7781',
      function: '#8250df',
      type: '#953800',
      literal: '#0550ae',
      property: '#0550ae',
      tag: '#116329',
      attr: '#0550ae',
      punct: '#57606a',
    },
    marks: {
      yellow: { fill: 'rgba(255, 212, 59, 0.38)', bar: '#f59f00' },
      green: { fill: 'rgba(64, 192, 87, 0.22)', bar: '#2f9e44' },
      red: { fill: 'rgba(250, 82, 82, 0.2)', bar: '#e03131' },
      blue: { fill: 'rgba(77, 171, 247, 0.24)', bar: '#1971c2' },
    },
    dots: ['#ff6b6b', '#fcc419', '#51cf66'],
  },
  dark: {
    bg: '#282c34',
    border: '#3b4048',
    header: '#21252b',
    headerText: '#9da5b4',
    gutter: '#636d83',
    tokens: {
      plain: '#abb2bf',
      keyword: '#c678dd',
      string: '#98c379',
      number: '#d19a66',
      comment: '#7f848e',
      function: '#61afef',
      type: '#e5c07b',
      literal: '#d19a66',
      property: '#e06c75',
      tag: '#e06c75',
      attr: '#d19a66',
      punct: '#abb2bf',
    },
    marks: {
      yellow: { fill: 'rgba(255, 212, 59, 0.2)', bar: '#fcc419' },
      green: { fill: 'rgba(81, 207, 102, 0.18)', bar: '#51cf66' },
      red: { fill: 'rgba(255, 107, 107, 0.2)', bar: '#ff6b6b' },
      blue: { fill: 'rgba(77, 171, 247, 0.22)', bar: '#4dabf7' },
    },
    dots: ['#ff5f56', '#ffbd2e', '#27c93f'],
  },
};

export const MARK_COLORS: Array<{ id: CodeMark; label: string; swatch: string }> = [
  { id: 'yellow', label: 'Highlight (yellow)', swatch: '#ffd43b' },
  { id: 'green', label: 'Added / good (green)', swatch: '#51cf66' },
  { id: 'red', label: 'Removed / problem (red)', swatch: '#ff6b6b' },
  { id: 'blue', label: 'Note (blue)', swatch: '#4dabf7' },
];
