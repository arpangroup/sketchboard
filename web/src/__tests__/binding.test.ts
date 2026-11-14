import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { LinearElement, SketchElement } from '../core/types';
import { createLinear, createShape } from '../elements/factory';
import { anchorFor, anchorPoint, BIND_GAP, bindableAt, boundArrowGeometry, edgePoint, insideShape } from '../elements/binding';
import { pointsToElementGeometry } from '../elements/handlers/pointShapes';
import { remapCopies } from '../elements/structure';
import { fromExcalidraw, toExcalidraw } from '../persistence/excalidraw';

const box = (x: number, y: number, type: 'rectangle' | 'ellipse' | 'diamond' = 'rectangle') => ({
  ...createShape(type, DEFAULT_STYLE, { x, y }, 1),
  width: 100,
  height: 60,
});
const arrow = (a: { x: number; y: number }, b: { x: number; y: number }, extra: Partial<LinearElement> = {}): LinearElement => ({
  ...createLinear('arrow', DEFAULT_STYLE, a, 2),
  ...pointsToElementGeometry([a, b]),
  ...extra,
});
const ends = (a: LinearElement) => [a.points[0], a.points[a.points.length - 1]].map((p) => ({ x: Math.round(p.x + a.x), y: Math.round(p.y + a.y) }));
const lookup = (els: SketchElement[]) => (id: string) => els.find((e) => e.id === id);

describe('arrow binding', () => {
  it('aims a centre-bound end at the middle and stops on the outline with a gap', () => {
    const left = box(0, 0);
    const right = box(300, 0);
    const a = arrow({ x: 110, y: 30 }, { x: 290, y: 30 }, {
      startBinding: { elementId: left.id, anchor: { x: 0.5, y: 0.5 } },
      endBinding: { elementId: right.id, anchor: { x: 0.5, y: 0.5 } },
    });
    // move the right box down: the arrow follows, ends on both outlines
    const moved = { ...right, y: 200 };
    const geo = boundArrowGeometry(a, lookup([left, moved]))!;
    const next = { ...a, ...geo } as LinearElement;
    const [s, e] = ends(next);
    expect(insideShape(left, s)).toBe(false);
    expect(insideShape(moved, e)).toBe(false);
    expect(insideShape(left, s, BIND_GAP + 1)).toBe(true); // just outside the left box
    expect(insideShape(moved, e, BIND_GAP + 1)).toBe(true); // just outside the moved box
    expect(e.y).toBeGreaterThan(150); // it really followed the box down
  });

  it('pins an end dropped near an edge, and aims at the centre when dropped well inside', () => {
    const b = box(0, 0);
    expect(anchorFor(b, { x: 50, y: 30 })).toEqual({ x: 0.5, y: 0.5 });
    expect(anchorFor(b, { x: 100, y: 15 })).toEqual({ x: 1, y: 0.25 });
    expect(anchorPoint(b, { x: 1, y: 0.25 })).toEqual({ x: 100, y: 15 });
  });

  it('finds the outline of ellipses and diamonds, and the shape under an end', () => {
    const e = box(0, 0, 'ellipse');
    const p = edgePoint(e, { x: -100, y: 30 }, { x: 50, y: 30 }, 0);
    expect(p.x).toBeCloseTo(0, 1);
    const d = box(0, 0, 'diamond');
    expect(insideShape(d, { x: 5, y: 5 })).toBe(false); // corner of the box is outside the diamond
    expect(bindableAt([box(0, 0), d], { x: 50, y: 30 }, 4, new Set())?.id).toBe(d.id); // topmost
    expect(bindableAt([box(0, 0)], { x: 400, y: 400 }, 4, new Set())).toBeNull();
  });

  it('leaves the arrow alone while its shape is deleted, and keeps bends in between', () => {
    const t = box(300, 0);
    const bent = { ...arrow({ x: 0, y: 0 }, { x: 290, y: 30 }), ...pointsToElementGeometry([{ x: 0, y: 0 }, { x: 150, y: -80 }, { x: 290, y: 30 }]) } as LinearElement;
    const a = { ...bent, endBinding: { elementId: t.id, anchor: { x: 0.5, y: 0.5 } } };
    expect(boundArrowGeometry(a, lookup([{ ...t, isDeleted: true }]))).toBeNull();
    const geo = boundArrowGeometry(a, lookup([{ ...t, x: 500 }]))!;
    const next = { ...a, ...geo } as LinearElement;
    expect(next.points).toHaveLength(3);
    expect(Math.round(next.points[1].x + next.x)).toBe(150); // the bend didn't move
  });

  it('copies stay attached only to shapes copied with them', () => {
    const s = box(0, 0);
    const a = arrow({ x: 110, y: 30 }, { x: 290, y: 30 }, { startBinding: { elementId: s.id, anchor: { x: 0.5, y: 0.5 } }, endBinding: { elementId: 'other', anchor: { x: 0.5, y: 0.5 } } });
    const [, ca] = remapCopies([s, a], [{ ...s, id: 's2' }, { ...a, id: 'a2' }]) as [SketchElement, LinearElement];
    expect(ca.startBinding?.elementId).toBe('s2');
    expect(ca.endBinding).toBeUndefined();
  });

  it('round-trips through Excalidraw as startBinding / endBinding + boundElements', () => {
    const l = box(0, 0);
    const r = box(300, 0);
    const a = arrow({ x: 104, y: 30 }, { x: 296, y: 30 }, {
      startBinding: { elementId: l.id, anchor: { x: 0.5, y: 0.5 } },
      endBinding: { elementId: r.id, anchor: { x: 0, y: 0.5 } },
    });
    const out = toExcalidraw([l, r, a]);
    const ex = out.elements;
    expect(ex[0].boundElements).toEqual([{ type: 'arrow', id: a.id }]);
    expect(ex[2].startBinding).toMatchObject({ elementId: l.id });
    expect(ex[2].endBinding).toMatchObject({ elementId: r.id, fixedPoint: [0, 0.5] });
    const back = fromExcalidraw(JSON.parse(JSON.stringify(out))).scene.elements[2] as LinearElement;
    expect(back.startBinding).toEqual({ elementId: l.id, anchor: { x: 0.5, y: 0.5 } });
    expect(back.endBinding).toEqual({ elementId: r.id, anchor: { x: 0, y: 0.5 } });
  });
});
