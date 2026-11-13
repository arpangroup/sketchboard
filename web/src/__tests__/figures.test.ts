import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { FigureElement, FreeDrawElement, LinearElement } from '../core/types';
import { createFigure, createFreeDraw, createLinear } from '../elements/factory';
import { FIGURES, figureGeometry, getFigure } from '../elements/figures/figures';
import { elementRegistry } from '../elements/registry';
import { eraseFromStroke } from '../elements/partialErase';
import { pointsToElementGeometry } from '../elements/handlers/pointShapes';
import { fromExcalidraw, toExcalidraw } from '../persistence/excalidraw';
import { parseScene } from '../persistence/serialization';

const fig = (figure: string, w = 200, h = 120): FigureElement => ({ ...createFigure(figure, DEFAULT_STYLE, { x: 100, y: 50 }, 1), width: w, height: h });

describe('figure gallery', () => {
  it('every figure builds a finite, closed outline that fits (roughly) in its box', () => {
    expect(FIGURES.length).toBeGreaterThan(45);
    expect(new Set(FIGURES.map((f) => f.id)).size).toBe(FIGURES.length);
    for (const f of FIGURES) {
      const g = figureGeometry(f.id, 200, 120, f.tail);
      expect(g.outline.length > 10 && g.hull.length > 2).toBe(true);
      const pts = [...g.polylines, ...g.detailLines].flat();
      expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      if (!f.tail) {
        // non-callouts stay within their box (curves may bulge a hair)
        expect(pts.every((p) => p.x > -12 && p.x < 212 && p.y > -12 && p.y < 132)).toBe(true);
      }
    }
  });

  it('callout tails reach the tail point and are part of the bounds', () => {
    const el = fig('callout-rounded');
    const tip = { x: el.tail!.x * el.width, y: el.tail!.y * el.height };
    const g = figureGeometry(el.figure, el.width, el.height, el.tail);
    expect(g.hull.some((p) => Math.hypot(p.x - tip.x, p.y - tip.y) < 0.01)).toBe(true);
    const b = elementRegistry.get(el).getBounds(el);
    expect(b.y + b.height).toBeCloseTo(el.y + tip.y, 5);
    // a tail inside the body means a plain bubble
    const inside = figureGeometry('callout-rect', 200, 120, { x: 0.5, y: 0.5 });
    expect(inside.hull.some((p) => p.x === 100 && p.y === 60)).toBe(false);
  });

  it('hit-tests on the outline and (when filled) inside', () => {
    const el = fig('star-5');
    const h = elementRegistry.get(el);
    expect(h.hitTest(el, { x: el.x + 100, y: el.y + 1 }, 4)).toBe(true); // top point
    expect(h.hitTest(el, { x: el.x + 100, y: el.y + 70 }, 4)).toBe(false); // empty middle
    expect(h.hitTest({ ...el, backgroundColor: '#ffec99' }, { x: el.x + 100, y: el.y + 70 }, 4)).toBe(true);
    expect(h.hitTest(el, { x: el.x + 2, y: el.y + 2 }, 4)).toBe(false); // box corner outside the star
  });

  it('survives save/load and an Excalidraw round trip (including a moved tail)', () => {
    const el = { ...fig('callout-oval'), tail: { x: 1.3, y: -0.4 }, backgroundColor: '#a5d8ff' };
    expect(parseScene({ type: 'sketchboard', elements: [el] }).elements[0]).toMatchObject({ type: 'figure', figure: 'callout-oval', tail: { x: 1.3, y: -0.4 } });
    expect(parseScene({ type: 'sketchboard', elements: [{ ...el, figure: 'bogus' }] }).elements[0]).toMatchObject({ figure: 'fc-process' });

    const doc = fig('fc-multidocument');
    const ex = toExcalidraw([el, doc]);
    expect(ex.elements.every((e) => e.type === 'line')).toBe(true);
    const back = fromExcalidraw(JSON.parse(JSON.stringify(ex))).scene.elements as FigureElement[];
    expect(back.map((e) => e.figure)).toEqual(['callout-oval', 'fc-multidocument']);
    expect(back[0]).toMatchObject({ x: el.x, y: el.y, tail: el.tail, backgroundColor: '#a5d8ff' });
    expect(back[0].width).toBeCloseTo(el.width, 3);
  });

  it('every callout has a default tail and the gallery covers the requested families', () => {
    for (const id of ['callout-rect', 'callout-rounded', 'callout-oval', 'callout-cloud']) expect(getFigure(id)?.tail).toBeTruthy();
    for (const id of ['star-5', 'arrow-right', 'fc-decision', 'fc-document', 'fc-terminator', 'cloud', 'heart']) expect(getFigure(id)).toBeTruthy();
  });
});

describe('precision eraser', () => {
  const ink = (): FreeDrawElement => {
    const abs = Array.from({ length: 21 }, (_, i) => ({ x: i * 10, y: 0 }));
    return { ...createFreeDraw(DEFAULT_STYLE, { x: 0, y: 0 }, 5), ...pointsToElementGeometry(abs), pressures: abs.map(() => 0.5) };
  };

  it('cuts a stroke in two where the eraser crosses it', () => {
    const pieces = eraseFromStroke(ink(), { x: 100, y: -30 }, { x: 100, y: 30 }, 8)!;
    expect(pieces).toHaveLength(2);
    const [a, b] = pieces as FreeDrawElement[];
    expect(a.x).toBe(0);
    expect(a.x + a.width).toBeLessThan(95);
    expect(b.x).toBeGreaterThan(105);
    expect(b.x + b.width).toBe(200);
    expect(a.pressures.length).toBe(a.points.length);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(2);
  });

  it('leaves untouched strokes alone and can erase a stroke completely', () => {
    expect(eraseFromStroke(ink(), { x: 0, y: 50 }, { x: 200, y: 50 }, 8)).toBeNull();
    expect(eraseFromStroke(ink(), { x: -10, y: 0 }, { x: 210, y: 0 }, 8)).toEqual([]);
  });

  it('cuts long straight segments (few points) and keeps arrowheads on the surviving ends', () => {
    const arrow: LinearElement = { ...createLinear('arrow', DEFAULT_STYLE, { x: 0, y: 0 }, 1), ...pointsToElementGeometry([{ x: 0, y: 0 }, { x: 300, y: 0 }]), startArrowhead: 'dot', endArrowhead: 'arrow' };
    const pieces = eraseFromStroke(arrow, { x: 150, y: -20 }, { x: 150, y: 20 }, 10)! as LinearElement[];
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ startArrowhead: 'dot', endArrowhead: 'none' });
    expect(pieces[1]).toMatchObject({ startArrowhead: 'none', endArrowhead: 'arrow' });
  });
});
