import { describe, expect, it } from 'vitest';
import { LINE_HEIGHT } from '../core/constants';
import { DEFAULT_STYLE } from '../core/constants';
import type { TextElement } from '../core/types';
import { createText } from '../elements/factory';
import { elementRegistry } from '../elements/registry';
import { textBoxLines, textBoxSize } from '../elements/textMetrics';
import { fromExcalidraw, toExcalidraw } from '../persistence/excalidraw';

const SENTENCE = 'Feed generation fans out new posts to every follower timeline';
const text = (extra: Partial<TextElement> = {}): TextElement => ({ ...createText(DEFAULT_STYLE, { x: 100, y: 100 }, 1, SENTENCE), ...extra });

describe('text wrapping', () => {
  it('auto-width boxes fit their longest line; fixed-width boxes wrap and grow down', () => {
    const auto = text();
    expect(textBoxLines(auto)).toEqual([SENTENCE]);
    const fixed = { ...auto, width: 160, fixedWidth: true };
    const lines = textBoxLines(fixed);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join(' ')).toBe(SENTENCE); // no words lost or repeated
    const size = textBoxSize(fixed);
    expect(size.width).toBe(160);
    expect(size.height).toBe(Math.ceil(lines.length * fixed.fontSize * LINE_HEIGHT));
  });

  it('dragging a side handle sets a fixed width and keeps the font size', () => {
    const el = text();
    const h = elementRegistry.get(el);
    // squeeze to 40% width from the right edge (scale.y stays 1 for a side handle)
    const sx = 0.4;
    const map = (p: { x: number; y: number }) => ({ x: el.x + (p.x - el.x) * sx, y: p.y });
    const patch = h.transform(el, map, { x: sx, y: 1 }) as Partial<TextElement>;
    expect(patch.fixedWidth).toBe(true);
    expect(patch.fontSize).toBeUndefined(); // font untouched
    expect(patch.width).toBeCloseTo(el.width * sx, 5);
    expect(patch.height!).toBeGreaterThan(el.height);
    // a corner drag still scales the font, and a fixed box keeps wrapping at its scaled width
    const fixed = { ...el, ...patch } as TextElement;
    const corner = h.transform(fixed, (p) => ({ x: fixed.x + (p.x - fixed.x) * 2, y: fixed.y + (p.y - fixed.y) * 2 }), { x: 2, y: 2 }) as Partial<TextElement>;
    expect(corner.fontSize).toBeCloseTo(fixed.fontSize * 2, 5);
    expect(corner.width).toBeCloseTo(fixed.width * 2, 5);
  });

  it('round-trips through Excalidraw as autoResize: false', () => {
    const el = { ...text(), width: 160, fixedWidth: true };
    const out = toExcalidraw([{ ...el, height: textBoxSize(el).height }]);
    const ex = out.elements[0];
    expect(ex.autoResize).toBe(false);
    expect(ex.originalText).toBe(SENTENCE);
    expect((ex.text as string).split('\n').length).toBeGreaterThan(2);
    const back = fromExcalidraw(JSON.parse(JSON.stringify(out))).scene.elements[0] as TextElement;
    expect(back).toMatchObject({ type: 'text', text: SENTENCE, fixedWidth: true, width: 160 });
  });
});
