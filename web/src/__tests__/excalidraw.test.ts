import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { FreeDrawElement, LinearElement, TableElement, TextElement } from '../core/types';
import { createFreeDraw, createShape, createTable, createText } from '../elements/factory';
import { fractionalIndex, fromExcalidraw, toExcalidraw } from '../persistence/excalidraw';
import { parseAnyScene } from '../persistence/importScene';

/** Minimal Excalidraw element with the fields excalidraw.com writes. */
const ex = (o: Record<string, unknown>) => ({
  angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1,
  strokeStyle: 'solid', roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1,
  version: 3, versionNonce: 5, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
  width: 100, height: 50, x: 0, y: 0, ...o,
});
const file = (elements: unknown[], files = {}) => ({ type: 'excalidraw', version: 2, source: 'https://excalidraw.com', elements, appState: { gridModeEnabled: false }, files });

describe('Excalidraw import', () => {
  it('skips deleted elements and keeps the live ones in stacking order', () => {
    const r = fromExcalidraw(file([
      ex({ id: 'gone', type: 'rectangle', isDeleted: true }),
      ex({ id: 'box', type: 'rectangle', roundness: { type: 3 }, x: -2578, y: 5172, width: 335, height: 242 }),
      ex({ id: 't', type: 'text', text: 'Hello Arpan Demo Test', originalText: 'Hello Arpan Demo Test', fontSize: 28, fontFamily: 6, textAlign: 'left', verticalAlign: 'top', containerId: null, lineHeight: 1.25, x: -2553, y: 5277, height: 35 }),
    ]));
    expect(r.scene.elements.map((e) => e.id)).toEqual(['box', 't']);
    const [box, text] = r.scene.elements;
    expect(box).toMatchObject({ type: 'rectangle', rounded: true, x: -2578, width: 335, roughness: 0 });
    expect(text).toMatchObject({ type: 'text', text: 'Hello Arpan Demo Test', fontFamily: 'Nunito', fontSize: 28 });
    expect(box.zIndex).toBeLessThan(text.zIndex);
  });

  it('maps arrows, arrowheads, elbow connectors and polygons', () => {
    const { elements } = fromExcalidraw(file([
      ex({ id: 'a', type: 'arrow', x: 10, y: 10, points: [[0, 0], [100, -40]], roundness: { type: 2 }, startArrowhead: null, endArrowhead: 'triangle_outline', startBinding: { elementId: 'x' }, endBinding: null }),
      ex({ id: 'e', type: 'arrow', x: 0, y: 0, points: [[0, 0], [50, 0], [50, 80]], elbowed: true, startArrowhead: 'circle', endArrowhead: 'arrow' }),
      ex({ id: 'p', type: 'line', x: 0, y: 0, points: [[0, 0], [40, 0], [20, 30], [0, 0]], polygon: true }),
    ])).scene;
    const [a, e, p] = elements as LinearElement[];
    expect(a).toMatchObject({ type: 'arrow', startArrowhead: 'none', endArrowhead: 'triangle_outline', x: 10, y: -30 });
    expect(a.points).toEqual([{ x: 0, y: 40 }, { x: 100, y: 0 }]); // re-based so points are >= 0
    expect(e).toMatchObject({ sharp: true, startArrowhead: 'dot', endArrowhead: 'arrow' });
    expect(p.polygon).toBe(true);
    expect(p.points).toHaveLength(3); // explicit closing point dropped
  });

  it('keeps rotation of boxes, text and images', () => {
    const { scene, notes } = fromExcalidraw(file([
      ex({ id: 'r', type: 'rectangle', width: 100, height: 20, angle: Math.PI / 2 }),
      ex({ id: 'c', type: 'ellipse', width: 60, height: 60, angle: 1 }),
      ex({ id: 't', type: 'text', text: 'tilted', fontSize: 20, fontFamily: 5, textAlign: 'center', angle: 0.3 }),
    ]));
    const [r, c, t] = scene.elements;
    expect(r).toMatchObject({ type: 'rectangle', width: 100, height: 20 });
    expect(r.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(c.type).toBe('ellipse');
    expect(t.angle).toBeCloseTo(0.3, 6);
    expect(notes).toEqual([]);
    // and back out
    const out = toExcalidraw(scene.elements);
    expect(out.elements[0].angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('imports pressure from pen strokes and image files', () => {
    const { scene } = fromExcalidraw(file(
      [
        ex({ id: 'f', type: 'freedraw', points: [[0, 0], [5, 5], [10, 2]], pressures: [0.2, 0.6, 0.9], simulatePressure: false, strokeWidth: 2 }),
        ex({ id: 'i', type: 'image', fileId: 'img1', status: 'saved', scale: [1, 1] }),
        ex({ id: 'q', type: 'selection' }),
      ],
      { img1: { id: 'img1', mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA', created: 1 } },
    ));
    const f = scene.elements[0] as FreeDrawElement;
    expect(f.pressures).toEqual([0.2, 0.6, 0.9]);
    expect(f.kind).toBe('pen');
    expect(scene.elements[1]).toMatchObject({ type: 'image', fileId: 'img1' });
    expect(scene.files?.img1.dataURL).toMatch(/^data:image\/png/);
  });

  it('parseAnyScene detects the format and rejects junk', () => {
    expect(parseAnyScene(JSON.stringify(file([ex({ id: 'b', type: 'diamond' })]))).format).toBe('excalidraw');
    expect(() => parseAnyScene('not json')).toThrow(/invalid JSON/);
    expect(() => parseAnyScene({ type: 'other' })).toThrow();
  });
});

describe('Excalidraw export', () => {
  it('writes valid, increasing fractional indices', () => {
    const keys = [0, 1, 61, 62, 63, 4000].map(fractionalIndex);
    expect(keys.slice(0, 3)).toEqual(['a0', 'a1', 'az']);
    expect([...keys].sort()).toEqual(keys);
  });

  it('round-trips shapes, text formatting and highlighter ink', () => {
    const rect = { ...createShape('rectangle', DEFAULT_STYLE, { x: 5, y: 6 }, 1), width: 80, height: 40, rounded: true };
    const text: TextElement = { ...createText(DEFAULT_STYLE, { x: 0, y: 100 }, 2, 'Bold idea'), fontWeight: 'bold', fontStyle: 'italic', fontFamily: 'Merriweather' };
    const ink: FreeDrawElement = { ...createFreeDraw(DEFAULT_STYLE, { x: 0, y: 0 }, 3, 'highlighter'), points: [{ x: 0, y: 0 }, { x: 30, y: 4 }], width: 30, height: 4 };
    const out = toExcalidraw([rect, text, ink]);
    expect(out.type).toBe('excalidraw');
    expect(out.elements.map((e) => e.type)).toEqual(['rectangle', 'text', 'freedraw']);
    expect(out.elements[0].roundness).toEqual({ type: 3 });
    expect(out.elements[1].fontFamily).toBe(6);

    const back = fromExcalidraw(JSON.parse(JSON.stringify(out))).scene.elements;
    expect(back[0]).toMatchObject({ type: 'rectangle', rounded: true, x: 5, width: 80 });
    expect(back[1]).toMatchObject({ text: 'Bold idea', fontWeight: 'bold', fontStyle: 'italic', fontFamily: 'Merriweather' });
    expect(back[2]).toMatchObject({ kind: 'highlighter', strokeWidth: ink.strokeWidth, opacity: ink.opacity });
  });

  it('exports a table as grouped cells and rebuilds it on import', () => {
    const t0 = createTable(DEFAULT_STYLE, { rows: 2, cols: 2, cellPadding: 8, headerRow: true, headerColor: '#e7f5ff', banded: false, textColor: '#111111' }, { x: 10, y: 20, width: 240, height: 80 }, 1);
    const table: TableElement = { ...t0, cells: [['Name', 'Qty'], ['Apples', '3']] };
    const out = toExcalidraw([table]);
    const rects = out.elements.filter((e) => e.type === 'rectangle');
    const texts = out.elements.filter((e) => e.type === 'text');
    expect(rects).toHaveLength(4);
    expect(texts).toHaveLength(4);
    expect(new Set(out.elements.flatMap((e) => e.groupIds)).size).toBe(1);
    expect(texts.every((t) => rects.some((r) => r.id === t.containerId))).toBe(true);

    // edit a cell "in Excalidraw", then import
    texts.find((t) => t.originalText === 'Apples')!.originalText = 'Pears';
    const back = fromExcalidraw(JSON.parse(JSON.stringify(out))).scene.elements;
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ type: 'table', rows: 2, cols: 2, x: 10, y: 20, headerRow: true, cellPadding: 8 });
    expect((back[0] as TableElement).cells).toEqual([['Name', 'Qty'], ['Pears', '3']]);
  });
});
