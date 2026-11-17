import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import { createShape } from '../elements/factory';
import { buildPrintSvg } from '../export/printService';
import { getPageDimensions } from '../page/pageSizes';
import { parseScene } from '../persistence/serialization';
import { getColorTransformer, luminance } from '../renderer/colorModes';

describe('page sizes', () => {
  it('A4 landscape is 297 x 210 mm', () => {
    const d = getPageDimensions({ size: 'A4', orientation: 'landscape', marginMm: 10 })!;
    expect(d.widthMm).toBe(297);
    expect(d.heightMm).toBe(210);
    expect(d.widthPx).toBeCloseTo(1122.5, 0);
  });
  it('infinite canvas has no page', () => {
    expect(getPageDimensions({ size: 'infinite', orientation: 'portrait', marginMm: 0 })).toBeNull();
  });
});

describe('colour modes', () => {
  const el = { ...createShape('rectangle', DEFAULT_STYLE, { x: 0, y: 0 }, 1), strokeColor: '#e03131', backgroundColor: '#a5d8ff', fillStyle: 'solid' as const };

  it('black & white makes strokes black and prints solid fills as plain white (no hatching)', () => {
    const bw = getColorTransformer('blackwhite').transformElement(el);
    expect(bw.strokeColor).toBe('#000000');
    expect(bw).toMatchObject({ backgroundColor: '#ffffff', fillStyle: 'solid' });
    // every solid colour, pale or strong, prints white — nothing hatched behind text
    for (const c of ['#fff9db', '#a5d8ff', '#ffc9c9', '#b2f2bb', '#1971c2', '#000000']) {
      const out = getColorTransformer('blackwhite').transformElement({ ...el, backgroundColor: c, fillStyle: 'solid' });
      expect(out).toMatchObject({ backgroundColor: '#ffffff', fillStyle: 'solid' });
      expect(out.fillDensity).toBeUndefined();
    }
  });

  it('black & white keeps a pattern fill the user chose, lighter for pale colours', () => {
    const bw = (backgroundColor: string) => getColorTransformer('blackwhite').transformElement({ ...el, backgroundColor, fillStyle: 'hachure' });
    expect(bw('#a5d8ff')).toMatchObject({ backgroundColor: '#000000', fillStyle: 'hachure', fillDensity: 'light' });
    const strong = bw('#1971c2');
    expect(strong).toMatchObject({ backgroundColor: '#000000', fillStyle: 'hachure' });
    expect(strong.fillDensity).toBe(undefined);
    expect(bw('#fff9db')).toMatchObject({ backgroundColor: 'transparent' }); // near-white pattern → blank
  });

  it('grayscale keeps perceived brightness', () => {
    const g = getColorTransformer('grayscale').transformElement(el);
    const v = parseInt(g.backgroundColor.slice(1, 3), 16);
    expect(Math.abs(v - luminance('#a5d8ff'))).toBeLessThan(1);
  });

  it('transparent stays transparent', () => {
    expect(getColorTransformer('blackwhite').transformColor('transparent')).toBe('transparent');
  });
});

describe('print', () => {
  it('builds an SVG sized in millimetres for the paper', () => {
    const el = createShape('ellipse', DEFAULT_STYLE, { x: 50, y: 50 }, 1);
    const out = buildPrintSvg({
      elements: [{ ...el, width: 100, height: 80 }],
      pageSetup: { size: 'A3', orientation: 'portrait', marginMm: 10 },
      colorMode: 'blackwhite',
      scope: 'page',
    });
    expect(out.widthMm).toBe(297);
    expect(out.heightMm).toBe(420);
    expect(out.svg).toContain('width="297mm"');
    expect(out.svg).not.toMatch(/#1e1e1e/i);
  });
});

describe('serialization', () => {
  it('rejects foreign files and drops invalid elements', () => {
    expect(() => parseScene({ type: 'other' })).toThrow();
    const data = parseScene({ type: 'sketchboard', elements: [{ id: 'x', type: 'virus' }, createShape('rectangle', DEFAULT_STYLE, { x: 0, y: 0 }, 1)] });
    expect(data.elements).toHaveLength(1);
  });
});
