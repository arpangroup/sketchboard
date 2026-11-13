import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { LinearElement, TableElement } from '../core/types';
import { createLinear, createShape, createTable } from '../elements/factory';
import { pointsToElementGeometry } from '../elements/handlers/pointShapes';
import { getElementBounds, hitTestElement } from '../elements/registry';
import { keepTopLeft, normalizeAngle, rotateAround, rotatePoint } from '../elements/rotation';
import { parseScene } from '../persistence/serialization';
import { exportToSvg } from '../export/svgExport';
import { getHandles } from '../tools/selectionGeometry';

const rect = (angle = 0) => ({ ...createShape('rectangle', DEFAULT_STYLE, { x: 0, y: 0 }, 1), width: 200, height: 20, backgroundColor: '#a5d8ff', angle });

describe('rotation', () => {
  it('bounds and hit testing follow the rotated shape', () => {
    const r = rect(Math.PI / 2); // a 200×20 bar stood upright around its centre (100, 10)
    const b = getElementBounds(r);
    expect(b.x).toBeCloseTo(90, 5);
    expect(b.width).toBeCloseTo(20, 5);
    expect(b.height).toBeCloseTo(200, 5);
    expect(hitTestElement(r, { x: 100, y: -80 }, 1)).toBe(true); // inside the upright bar
    expect(hitTestElement(r, { x: 180, y: 10 }, 1)).toBe(false); // where the unrotated bar's right end was
  });

  it('rotating a group orbits elements around the pivot; lines turn their points', () => {
    const r = rect();
    const patch = rotateAround(r, Math.PI, { x: 0, y: 0 });
    expect(patch.x).toBeCloseTo(-200, 5);
    expect(patch.y).toBeCloseTo(-20, 5);
    expect(patch.angle).toBeCloseTo(Math.PI, 6);
    const line: LinearElement = { ...createLinear('line', DEFAULT_STYLE, { x: 0, y: 0 }, 1), ...pointsToElementGeometry([{ x: 0, y: 0 }, { x: 100, y: 0 }]) };
    const turned = rotateAround(line, Math.PI / 2, { x: 50, y: 0 }) as Partial<LinearElement>;
    expect(turned.angle).toBe(undefined);
    expect(turned.width).toBeCloseTo(0, 5);
    expect(turned.height).toBeCloseTo(100, 5);
  });

  it('keeps the top-left corner of a rotated element when it grows', () => {
    const t = { ...createTable(DEFAULT_STYLE, { rows: 2, cols: 2, cellPadding: 6, headerRow: false, headerColor: '#fff', banded: false, textColor: '#000' }, { x: 0, y: 0, width: 200, height: 80 }, 1), angle: 0.5 } as TableElement;
    const corner = (e: { x: number; y: number; width: number; height: number }) => rotatePoint({ x: e.x, y: e.y }, { x: e.x + e.width / 2, y: e.y + e.height / 2 }, 0.5);
    const grown = { ...t, width: 300, height: 120 };
    const fixed = { ...grown, ...keepTopLeft(t, grown) };
    expect(corner(fixed).x).toBeCloseTo(corner(t).x, 6);
    expect(corner(fixed).y).toBeCloseTo(corner(t).y, 6);
  });

  it('selection handles (incl. the rotate handle) turn with a single rotated element', () => {
    const r = rect(Math.PI / 2);
    const hs = getHandles([r], 1);
    const rot = hs.find((h) => h.id === 'rotate')!;
    // the rotate handle sits "above" the bar in its own frame → to the right on screen after a 90° turn
    expect(rot.x).toBeGreaterThan(120);
    expect(rot.y).toBeCloseTo(10, 5);
  });

  it('is saved, cleaned and exported', () => {
    const line = { ...createLinear('line', DEFAULT_STYLE, { x: 0, y: 0 }, 1), ...pointsToElementGeometry([{ x: 0, y: 0 }, { x: 10, y: 0 }]), angle: 1 };
    const [r, l, z] = parseScene({ type: 'sketchboard', elements: [rect(Math.PI * 2 + 0.25), line, rect(Number.NaN)] }).elements;
    expect(r.angle).toBeCloseTo(0.25, 6);
    expect('angle' in l).toBe(false);
    expect('angle' in z).toBe(false);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5, 6);
    const svg = exportToSvg([rect(Math.PI / 4)], { region: { x: -50, y: -100, width: 300, height: 220 }, colorMode: 'color', background: false, embedFonts: false });
    expect(svg).toMatch(/rotate\(45 100 10\)/);
  });
});
