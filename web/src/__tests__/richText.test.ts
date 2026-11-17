import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { TextElement } from '../core/types';
import { createText } from '../elements/factory';
import { elementRegistry } from '../elements/registry';
import { layoutRuns, normalizeRuns, styledRuns, textBoxSize } from '../elements/textMetrics';
import { exportToSvg } from '../export/svgExport';
import { fromExcalidraw, toExcalidraw } from '../persistence/excalidraw';

const TEXT = 'Only User A owns the lock';
const el = (extra: Partial<TextElement> = {}): TextElement => ({ ...createText(DEFAULT_STYLE, { x: 0, y: 0 }, 1, TEXT), ...extra });
const boldUserA = [{ text: 'Only ' }, { text: 'User A', b: true }, { text: ' owns the lock' }];

describe('bold / italic / underlined words', () => {
  it('works out each piece’s look from the box style plus its overrides', () => {
    const r = styledRuns(el({ runs: boldUserA }))!;
    expect(r.map((x) => [x.text, x.bold])).toEqual([['Only ', false], ['User A', true], [' owns the lock', false]]);
    // a box that is bold with one word set back to normal
    const r2 = styledRuns(el({ fontWeight: 'bold', runs: [{ text: 'Only ' }, { text: 'User A', b: false }, { text: ' owns the lock' }] }))!;
    expect(r2.map((x) => x.bold)).toEqual([true, false, true]);
    // stale pieces that no longer spell out the text are ignored
    expect(styledRuns(el({ text: 'changed', runs: boldUserA }))).toBeNull();
  });

  it('tidies pieces: joins look-alikes, drops overrides that match the box, drops all-plain', () => {
    expect(normalizeRuns([{ text: 'a', b: true }, { text: 'b', b: true }, { text: 'c' }], el())).toEqual([{ text: 'ab', b: true }, { text: 'c' }]);
    expect(normalizeRuns([{ text: 'abc', b: false }], el())).toBeUndefined(); // same as the box → nothing to keep
    expect(normalizeRuns([{ text: '' }, { text: 'x', i: true }], el())).toEqual([{ text: 'x', i: true }]);
  });

  it('lays pieces out into lines, wrapping between words and keeping each piece’s look', () => {
    const r = styledRuns(el({ runs: boldUserA }))!;
    const one = layoutRuns(r, null, 20, 'normal');
    expect(one.lines).toHaveLength(1);
    expect(one.lines[0].map((f) => f.text).join('')).toBe(TEXT);
    const wrapped = layoutRuns(r, 90, 20, 'normal');
    expect(wrapped.lines.length).toBeGreaterThan(2);
    expect(wrapped.lines.map((l) => l.map((f) => f.text).join('')).join(' ')).toBe(TEXT);
    expect(wrapped.lines.flat().some((f) => f.bold && f.text.includes('User'))).toBe(true);
    // new lines are kept
    expect(layoutRuns([{ text: 'a\nb', bold: false, italic: false, underline: false }], null, 20, 'normal').lines).toHaveLength(2);
  });

  it('measures bold words wider, and draws them as bold pieces in SVG', () => {
    const plain = textBoxSize(el());
    const bolded = textBoxSize(el({ runs: [{ text: TEXT, b: true }] }));
    expect(bolded.width).toBeGreaterThan(plain.width);
    const t = el({ runs: boldUserA });
    const shape = elementRegistry.get(t).generateShape(t, {} as never);
    expect(shape.text?.rich?.[0].map((f) => f.bold)).toEqual([false, true, false]);
    const svg = exportToSvg([t], { region: { x: 0, y: 0, width: 400, height: 40 }, colorMode: 'color', background: false, embedFonts: false });
    expect(svg).toContain('<tspan font-weight="bold" font-style="normal">User A</tspan>');
  });

  it('keeps the formatting through an Excalidraw file', () => {
    const t = el({ runs: boldUserA });
    const out = toExcalidraw([t]);
    expect(out.elements[0].text).toBe(TEXT); // Excalidraw shows plain text
    const back = fromExcalidraw(JSON.parse(JSON.stringify(out))).scene.elements[0] as TextElement;
    expect(back.runs).toEqual(boldUserA);
  });
});
