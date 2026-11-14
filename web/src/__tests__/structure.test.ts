import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { FigureElement, FrameElement, ImageElement, LinearElement, SketchElement } from '../core/types';
import { createFigure, createFrame, createImage, createLinear, createShape, createText } from '../elements/factory';
import { hitTestElement } from '../elements/registry';
import { curveSamples, isCurved, segmentMidpoint } from '../elements/handlers/pointShapes';
import { canHoldLabel, LABEL_PADDING, labelNeedsLayout, labelWidth, layoutLabel, withLabels } from '../elements/boundText';
import {
  containingFrame,
  expandToGroups,
  flipPatches,
  frameBoxFor,
  framePatches,
  groupPatches,
  normalizeLink,
  remapCopies,
  ungroupPatches,
  withFrameChildren,
} from '../elements/structure';
import { fromExcalidraw, toExcalidraw } from '../persistence/excalidraw';
import { exportToSvg } from '../export/svgExport';

const box = (x: number, y: number, z = 1) => ({ ...createShape('rectangle', DEFAULT_STYLE, { x, y }, z), width: 40, height: 20 });
const apply = <T extends SketchElement>(els: T[], patches: Map<string, Partial<SketchElement>>): T[] =>
  els.map((e) => ({ ...e, ...(patches.get(e.id) ?? {}) }) as T);

describe('groups', () => {
  it('groups, selects the whole group from one member, and ungroups one level at a time', () => {
    const [a, b, c] = [box(0, 0), box(100, 0), box(200, 0)];
    let els = apply([a, b, c], groupPatches([a, b])!.patches);
    expect(expandToGroups(els, [a.id]).sort()).toEqual([a.id, b.id].sort());
    expect(expandToGroups(els, [c.id])).toEqual([c.id]);
    // group the group with c: nested
    els = apply(els, groupPatches(els)!.patches);
    expect(els[0].groupIds).toHaveLength(2);
    expect(expandToGroups(els, [c.id])).toHaveLength(3);
    expect(groupPatches(els)).toBeNull(); // already exactly one group
    els = apply(els, ungroupPatches(els));
    expect(expandToGroups(els, [a.id]).sort()).toEqual([a.id, b.id].sort()); // inner group survives
    els = apply(els, ungroupPatches(els));
    expect(els.every((e) => !e.groupIds)).toBe(true);
  });

  it('copies get their own group and frame ids', () => {
    const f = createFrame({ x: 0, y: 0, width: 300, height: 200 }, 0);
    const [a, b] = apply([box(10, 10), box(60, 10)], groupPatches([box(0, 0), box(0, 0)])!.patches).map((e) => ({ ...e, frameId: f.id }));
    const g = { ...a, groupIds: ['g1'] };
    const h = { ...b, groupIds: ['g1'] };
    const copies = remapCopies([f, g, h], [{ ...f, id: 'f2' }, { ...g, id: 'a2' }, { ...h, id: 'b2' }]);
    expect(copies[1].groupIds![0]).not.toBe('g1');
    expect(copies[1].groupIds).toEqual(copies[2].groupIds);
    expect(copies[1].frameId).toBe('f2');
  });
});

describe('frames', () => {
  it('wraps content with padding, adopts elements dropped inside and releases ones dragged out', () => {
    const a = box(100, 100);
    const fb = frameBoxFor([a])!;
    expect(fb).toMatchObject({ x: 76, y: 76, width: 88, height: 68 });
    const f = createFrame(fb, 0, 'Login');
    expect(containingFrame(a, [f])?.id).toBe(f.id);
    const outside = box(500, 500);
    const p = framePatches([f, a, outside], [a, outside]);
    expect(p.get(a.id)).toEqual({ frameId: f.id });
    expect(p.has(outside.id)).toBe(false);
    const moved = { ...a, frameId: f.id, x: 900 };
    expect(framePatches([f, moved], [moved]).get(a.id)).toEqual({ frameId: undefined });
    expect(withFrameChildren([f, { ...a, frameId: f.id }, outside], [f]).map((e) => e.id)).toEqual([f.id, a.id]);
  });

  it('is hit on its outline and name tag, not its empty middle', () => {
    const f = createFrame({ x: 0, y: 0, width: 200, height: 100 }, 0, 'Screen');
    expect(hitTestElement(f, { x: 100, y: 50 }, 2)).toBe(false);
    expect(hitTestElement(f, { x: 0, y: 50 }, 2)).toBe(true);
    expect(hitTestElement(f, { x: 10, y: -8 }, 2)).toBe(true);
  });
});

describe('flip', () => {
  it('mirrors positions, points, tails and image/shape drawing', () => {
    const left = box(0, 0);
    const right = box(160, 0);
    const line: LinearElement = { ...createLinear('line', DEFAULT_STYLE, { x: 0, y: 50 }, 3), points: [{ x: 0, y: 0 }, { x: 50, y: 20 }], width: 50, height: 20 };
    const img: ImageElement = { ...createImage('f1', { x: 0, y: 100, width: 50, height: 30 }, 4) };
    const callout: FigureElement = { ...createFigure('callout-rect', DEFAULT_STYLE, { x: 100, y: 100 }, 5), width: 60, height: 40, tail: { x: 0.2, y: 1.5 } };
    const text = { ...createText(DEFAULT_STYLE, { x: 0, y: 160 }, 6, 'Hi'), angle: 0.3 };
    const p = flipPatches([left, right, line, img, callout], 'horizontal');
    expect(p.get(left.id)).toMatchObject({ x: 160 });
    expect(p.get(right.id)).toMatchObject({ x: 0 });
    const l = { ...line, ...p.get(line.id) } as LinearElement;
    expect(l.points.map((q) => ({ x: Math.round(q.x + l.x), y: Math.round(q.y + l.y) }))).toEqual([{ x: 200, y: 50 }, { x: 150, y: 70 }]);
    expect(p.get(img.id)).toMatchObject({ flipX: true });
    expect((p.get(callout.id) as Partial<FigureElement>).tail).toEqual({ x: 0.8, y: 1.5 });
    expect(flipPatches([text], 'vertical').get(text.id)?.angle).toBeCloseTo(Math.PI * 2 - 0.3, 6);
    // flipping twice clears the flag
    const back = flipPatches([{ ...img, flipX: true }], 'horizontal');
    expect(back.get(img.id)?.flipX).toBeUndefined();
  });

  it('hit-tests mirrored shapes in their mirrored place', () => {
    const tri = { ...createFigure('right-triangle', DEFAULT_STYLE, { x: 0, y: 0 }, 1), width: 100, height: 100, backgroundColor: '#ffc9c9' } as FigureElement;
    const flipped = { ...tri, flipX: true };
    // the filled half of this right triangle is on the left; mirrored it's on the right
    expect(hitTestElement(tri, { x: 10, y: 60 }, 1)).toBe(true);
    expect(hitTestElement(tri, { x: 90, y: 30 }, 1)).toBe(false);
    expect(hitTestElement(flipped, { x: 90, y: 60 }, 1)).toBe(true);
    expect(hitTestElement(flipped, { x: 10, y: 30 }, 1)).toBe(false);
  });
});

describe('links', () => {
  it('normalises typed addresses and refuses script links', () => {
    expect(normalizeLink('example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(normalizeLink('https://x.dev')).toBe('https://x.dev');
    expect(normalizeLink('me@example.com')).toBe('mailto:me@example.com');
    expect(normalizeLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLink('not a link')).toBeNull();
  });

  it('writes links as SVG anchors', () => {
    const a = { ...box(0, 0), link: 'https://example.com' };
    const b = { ...box(50, 0), link: 'javascript:alert(1)' };
    const svg = exportToSvg([a, b], { region: { x: 0, y: 0, width: 100, height: 40 }, colorMode: 'color', background: false, embedFonts: false });
    expect(svg).toContain('<a href="https://example.com"');
    expect(svg).not.toContain('javascript:');
  });
});

describe('Excalidraw interop', () => {
  it('round-trips groups, frames, links and flipped images', () => {
    const f: FrameElement = createFrame({ x: 0, y: 0, width: 300, height: 200 }, 0, 'Checkout');
    const a = { ...box(20, 20), groupIds: ['g1'], frameId: f.id, link: 'https://example.com' };
    const b = { ...box(80, 20), groupIds: ['g1'], frameId: f.id };
    const img = { ...createImage('img', { x: 400, y: 0, width: 40, height: 40 }, 9), flipX: true };
    const out = toExcalidraw([f, a, b, img]);
    const ex = out.elements;
    expect(ex[0]).toMatchObject({ type: 'frame', name: 'Checkout' });
    expect(ex[1]).toMatchObject({ groupIds: ['g1'], frameId: f.id, link: 'https://example.com' });
    expect(ex[3].scale).toEqual([-1, 1]);
    const back = fromExcalidraw(JSON.parse(JSON.stringify(out))).scene.elements;
    expect(back[0]).toMatchObject({ type: 'frame', name: 'Checkout' });
    expect(back[1]).toMatchObject({ groupIds: ['g1'], frameId: f.id, link: 'https://example.com' });
    expect(back[3]).toMatchObject({ type: 'image', flipX: true });
  });

  it('keeps a grouped table as one table in the outer group', async () => {
    const { createTable } = await import('../elements/factory');
    const t = { ...createTable(DEFAULT_STYLE, { rows: 2, cols: 2, cellPadding: 8, headerRow: false, headerColor: '#fff', banded: false, textColor: '#000' }, { x: 0, y: 0, width: 200, height: 80 }, 1), groupIds: ['outer'] };
    const out = toExcalidraw([t, { ...box(300, 0), groupIds: ['outer'] }]);
    expect(out.elements.every((e) => (e.groupIds as string[]).includes('outer'))).toBe(true);
    const back = fromExcalidraw(JSON.parse(JSON.stringify(out))).scene.elements;
    expect(back.map((e) => e.type)).toEqual(['table', 'rectangle']);
    expect(back.every((e) => e.groupIds?.length === 1 && e.groupIds[0] === 'outer')).toBe(true);
  });

  it('drops frame links that point at a frame that is not in the file', () => {
    const out = toExcalidraw([{ ...box(0, 0), frameId: 'missing' }]);
    expect(fromExcalidraw(JSON.parse(JSON.stringify(out))).scene.elements[0].frameId).toBeUndefined();
  });
});

describe('shape labels', () => {
  const shape = (type: 'rectangle' | 'ellipse' | 'diamond') => ({ ...createShape(type, DEFAULT_STYLE, { x: 100, y: 100 }, 1), width: 200, height: 100 });
  const labelIn = (box: SketchElement, text: string) => {
    const t = { ...createText(DEFAULT_STYLE, { x: 0, y: 0 }, 2, text), textAlign: 'center' as const, containerId: box.id };
    return { ...t, ...layoutLabel(t, box) };
  };

  it('centres the label in its shape and wraps it to the usable width', () => {
    const box = shape('rectangle');
    const short = labelIn(box, 'Hi');
    expect(short.x + short.width / 2).toBeCloseTo(200, 6);
    expect(short.y + short.height / 2).toBeCloseTo(150, 6);
    expect(short.width).toBe(200 - LABEL_PADDING * 2);
    const long = labelIn(box, 'a fairly long label that will certainly need to wrap onto several lines');
    expect(long.height).toBeGreaterThan(short.height * 2);
    expect(labelWidth(shape('ellipse'))).toBeLessThan(labelWidth(box)); // inscribed area is narrower
    expect(labelWidth(shape('diamond'))).toBeLessThan(labelWidth(shape('ellipse')));
  });

  it('follows the shape: re-layout after moving / turning, and rides along with selections', () => {
    const box = shape('rectangle');
    const t = labelIn(box, 'Login');
    const moved = { ...box, x: 400, angle: 0.5 };
    expect(labelNeedsLayout(t, moved)).toBe(true);
    const after = { ...t, ...layoutLabel(t, moved) };
    expect(after.x + after.width / 2).toBeCloseTo(500, 6);
    expect(after.angle).toBe(0.5);
    expect(withLabels([box, t], [box]).map((e) => e.id)).toEqual([box.id, t.id]);
    expect(withFrameChildren([box, t], [box]).map((e) => e.id)).toEqual([box.id, t.id]);
    // copies of shape + label stay paired; a label copied alone becomes plain text
    const [cb, ct] = remapCopies([box, t], [{ ...box, id: 'b2' }, { ...t, id: 't2' }]);
    expect(cb.id).toBe('b2');
    expect((ct as typeof t).containerId).toBe('b2');
    expect((remapCopies([t], [{ ...t, id: 't3' }])[0] as typeof t).containerId).toBeUndefined();
    expect(canHoldLabel(box)).toBe(true);
    expect(canHoldLabel(t)).toBe(false);
  });

  it('round-trips through Excalidraw as bound text', () => {
    const box = shape('rectangle');
    const t = labelIn(box, 'Pay now');
    const out = toExcalidraw([box, t]);
    expect(out.elements[0].boundElements).toEqual([{ type: 'text', id: t.id }]);
    expect(out.elements[1]).toMatchObject({ containerId: box.id, verticalAlign: 'middle', originalText: 'Pay now' });
    const back = fromExcalidraw(JSON.parse(JSON.stringify(out))).scene.elements;
    expect(back[1]).toMatchObject({ type: 'text', text: 'Pay now', containerId: box.id });
  });
});

describe('curved lines', () => {
  const line = (pts: Array<[number, number]>, extra: Partial<LinearElement> = {}): LinearElement => ({
    ...createLinear('arrow', DEFAULT_STYLE, { x: 0, y: 0 }, 1),
    points: pts.map(([x, y]) => ({ x, y })),
    width: 200,
    height: 100,
    ...extra,
  });

  it('puts the bend anchor halfway along each segment, on the curve', () => {
    const straight = line([[0, 0], [200, 0]]);
    expect(segmentMidpoint(straight, 0)).toEqual({ x: 100, y: 0 });
    const bent = line([[0, 100], [100, 0], [200, 100]]);
    expect(isCurved(bent)).toBe(true);
    const m = segmentMidpoint(bent, 0);
    // a smooth curve bulges outward past the straight chord between the two points
    expect(m.y).toBeLessThan(50);
    expect(isCurved({ ...bent, sharp: true })).toBe(false);
  });

  it('passes through every point and hit-tests along the curve, not the corners', () => {
    const pts: Array<[number, number]> = [[0, 100], [100, 0], [200, 100]];
    const s = curveSamples(pts.map(([x, y]) => ({ x, y })));
    for (const [x, y] of pts) expect(s.some((q) => Math.hypot(q.x - x, q.y - y) < 1e-9)).toBe(true);
    const bent = line(pts);
    const mid = segmentMidpoint(bent, 0);
    expect(hitTestElement(bent, mid, 2)).toBe(true);
    expect(hitTestElement({ ...bent, sharp: true }, { x: 50, y: 50 }, 2)).toBe(true);
  });
});
