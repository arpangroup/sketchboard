import type { Drawable } from 'roughjs/bin/core';
import type { RoughGenerator } from 'roughjs/bin/generator';
import type { Bounds, CodeElement, CodeMark, Point } from '../../core/types';
import { fontCss } from '../../core/fonts';
import { luminance } from '../../renderer/colorModes';
import { CODE_FONT, CODE_THEMES, type CodePalette, codeLayout } from '../code/codeLayout';
import { highlight, languageLabel, type TokenType } from '../code/highlight';
import type { ElementHandler, PointMapper, ShapeOutput, TextPrimitive } from '../ElementHandler';
import { fontString } from '../textMetrics';

/** Grey version of a colour, keeping any alpha. */
function toGray(c: string): string {
  const l = Math.round(luminance(c));
  const a = c.match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1];
  const hex = l.toString(16).padStart(2, '0');
  return a ? `rgba(${l}, ${l}, ${l}, ${a})` : `#${hex}${hex}${hex}`;
}

/** Palette for screen (theme) or print (grayscale / pure black on white). */
function palette(el: CodeElement): CodePalette & { markHatch: boolean } {
  const base = CODE_THEMES[el.theme] ?? CODE_THEMES.dark;
  if (el.printMode === 'blackwhite') {
    const black = '#000000';
    const tokens = Object.fromEntries(Object.keys(base.tokens).map((k) => [k, black])) as Record<TokenType, string>;
    const mark = { fill: black, bar: black };
    return {
      bg: '#ffffff',
      border: black,
      header: '#ffffff',
      headerText: black,
      gutter: black,
      tokens,
      marks: { yellow: mark, green: mark, red: mark, blue: mark },
      dots: [black, black, black],
      markHatch: true,
    };
  }
  if (el.printMode === 'grayscale') {
    const map = <T extends Record<string, string>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toGray(v)])) as T;
    return {
      bg: toGray(base.bg),
      border: toGray(base.border),
      header: toGray(base.header),
      headerText: toGray(base.headerText),
      gutter: toGray(base.gutter),
      tokens: map(base.tokens),
      marks: Object.fromEntries(Object.entries(base.marks).map(([k, m]) => [k, { fill: toGray(m.fill), bar: toGray(m.bar) }])) as CodePalette['marks'],
      dots: base.dots.map(toGray) as [string, string, string],
      markHatch: false,
    };
  }
  return { ...base, markHatch: false };
}

/**
 * Code blocks size themselves to their content (like text); resizing scales the font.
 * Rendering: rounded card + window header, marked-line bands, line numbers, and one text run per
 * same-coloured token span — shared by canvas, SVG export and print through ShapeOutput.
 */
export class CodeHandler implements ElementHandler<CodeElement> {
  readonly type = 'code' as const;

  getBounds(el: CodeElement): Bounds {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }

  hitTest(el: CodeElement, p: Point, tolerance: number): boolean {
    return p.x >= el.x - tolerance && p.x <= el.x + el.width + tolerance && p.y >= el.y - tolerance && p.y <= el.y + el.height + tolerance;
  }

  transform(el: CodeElement, map: PointMapper): Partial<CodeElement> {
    const a = map({ x: el.x, y: el.y });
    const b = map({ x: el.x + el.width, y: el.y + el.height });
    const scale = Math.abs(b.x - a.x) / Math.max(1, el.width);
    const fontSize = Math.min(96, Math.max(6, Math.round(el.fontSize * scale * 10) / 10));
    const l = codeLayout({ ...el, fontSize });
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), fontSize, width: l.width, height: l.height };
  }

  generateShape(el: CodeElement, g: RoughGenerator): ShapeOutput {
    const pal = palette(el);
    const l = codeLayout(el);
    const fs = el.fontSize;
    const W = el.width;
    const H = el.height;
    const r = Math.min(10, fs * 0.6);
    const solid = (fill: string) => ({ fill, fillStyle: 'solid', stroke: 'none', roughness: 0, seed: el.seed });
    const drawables: Drawable[] = [];

    // card
    const card =
      `M ${r} 0 L ${W - r} 0 Q ${W} 0 ${W} ${r} L ${W} ${H - r} Q ${W} ${H} ${W - r} ${H} ` +
      `L ${r} ${H} Q 0 ${H} 0 ${H - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
    drawables.push(g.path(card, { ...solid(pal.bg), stroke: 'none' }));
    // header band
    const hh = l.headerH;
    drawables.push(g.path(`M ${r} 0 L ${W - r} 0 Q ${W} 0 ${W} ${r} L ${W} ${hh} L 0 ${hh} L 0 ${r} Q 0 0 ${r} 0 Z`, solid(pal.header)));

    // marked lines
    const markOutlines: Drawable[] = [];
    if (pal.markHatch) {
      // Black & white print: a light grey band across the whole line (code stays readable), a box around each run
      // of consecutive marked lines and a bold bar at the left. Colours are told apart by the box's line style.
      const STYLE: Record<CodeMark, { dash?: number[]; width: number }> = {
        yellow: { width: 1.4 },
        red: { width: 2.6 },
        green: { dash: [7, 4], width: 1.4 },
        blue: { dash: [2, 3], width: 1.6 },
      };
      const runs: Array<{ from: number; to: number; mark: CodeMark }> = [];
      Object.entries(el.marks ?? {})
        .map(([k, m]) => ({ line: Number(k), mark: m }))
        .filter((m) => m.line >= 1 && m.line <= l.lines.length)
        .sort((a, b) => a.line - b.line)
        .forEach(({ line, mark }) => {
          const last = runs[runs.length - 1];
          if (last && last.to === line - 1 && last.mark === mark) last.to = line;
          else runs.push({ from: line, to: line, mark });
        });
      for (const run of runs) {
        const y = l.codeY + (run.from - 1) * l.lineH;
        const h = (run.to - run.from + 1) * l.lineH;
        const st = STYLE[run.mark] ?? STYLE.yellow;
        drawables.push(g.rectangle(2, y, W - 4, h, solid('#e6e6e6')));
        drawables.push(g.rectangle(2, y, Math.max(4, fs * 0.3), h, solid('#000000')));
        markOutlines.push(
          g.rectangle(2, y, W - 4, h, { stroke: '#000000', strokeWidth: st.width, strokeLineDash: st.dash, roughness: 0, fill: undefined, seed: el.seed + run.from }),
        );
      }
    }
    for (const [key, mark] of Object.entries(el.marks ?? {})) {
      const line = Number(key);
      if (!(line >= 1 && line <= l.lines.length)) continue;
      const c = pal.marks[mark] ?? pal.marks.yellow;
      const y = l.codeY + (line - 1) * l.lineH;
      if (pal.markHatch) {
        continue; // drawn per run above
      } else {
        drawables.push(g.rectangle(1, y, W - 2, l.lineH, solid(c.fill)));
        drawables.push(g.rectangle(1, y, Math.max(3, fs * 0.2), l.lineH, solid(c.bar)));
      }
    }

    drawables.push(...markOutlines);
    // border on top (sketchy when the element's sloppiness is up)
    drawables.push(g.path(card, { stroke: pal.border, strokeWidth: 1.2, roughness: Math.min(el.roughness, 1.5), bowing: 0.5, seed: el.seed, fill: undefined }));
    drawables.push(g.line(0, hh, W, hh, { stroke: pal.border, strokeWidth: 1, roughness: 0, seed: el.seed }));
    // window dots
    const dot = fs * 0.62;
    pal.dots.forEach((c, i) => drawables.push(g.circle(l.padX + dot / 2 + i * dot * 1.6, hh / 2, dot, solid(c))));

    const family = fontCss(CODE_FONT);
    const text = (s: string, color: string, o: { size?: number; italic?: boolean; bold?: boolean; align?: TextPrimitive['align']; width?: number } = {}): TextPrimitive => {
      const size = o.size ?? fs;
      const fmt = { fontStyle: o.italic ? ('italic' as const) : ('normal' as const), fontWeight: o.bold ? ('bold' as const) : ('normal' as const) };
      return {
        lines: [s],
        fontSize: size,
        font: fontString(size, CODE_FONT, fmt),
        align: o.align ?? 'left',
        color,
        width: o.width ?? 0,
        lineHeightPx: l.lineH * (size / fs),
        underline: false,
        family,
        fontWeight: fmt.fontWeight,
        fontStyle: fmt.fontStyle,
      };
    };

    const texts: NonNullable<ShapeOutput['texts']> = [];
    // header captions
    const small = fs * 0.78;
    const hy = (hh - l.lineH * (small / fs)) / 2;
    if (el.title) texts.push({ x: l.padX + dot * 5.6, y: hy, text: text(el.title, pal.headerText, { size: small, bold: true }) });
    if (el.showLanguage !== false) texts.push({ x: 0, y: hy, text: text(languageLabel(el.language), pal.headerText, { size: small, align: 'right', width: W - l.padX }) });

    // line numbers
    if (el.lineNumbers) {
      texts.push({
        x: l.padX,
        y: l.codeY,
        text: { ...text('', pal.gutter, { align: 'right', width: l.gutterW - l.charW * 1.2 }), lines: l.lines.map((_, i) => String(i + 1)) },
      });
    }

    // highlighted code: one text run per same-coloured span
    highlight(l.lines.join('\n'), el.language).forEach((tokens, row) => {
      let col = 0;
      const y = l.codeY + row * l.lineH;
      for (const t of tokens) {
        const start = col;
        col += t.text.length;
        if (!t.text.trim()) continue;
        const lead = t.text.length - t.text.trimStart().length;
        texts.push({
          x: l.codeX + (start + lead) * l.charW,
          y,
          text: text(t.text.trim(), pal.tokens[t.type], { italic: t.type === 'comment' }),
        });
      }
    });

    return { drawables, paths: [], texts };
  }
}
