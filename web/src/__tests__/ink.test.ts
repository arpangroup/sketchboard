import { describe, expect, it } from 'vitest';
import { recognizeShape } from '../elements/shapeRecognition';
import { simulatePressures, strokeOutlinePath } from '../elements/strokeOutline';
import { fontCss, presetFor, sanitizeFontName } from '../core/fonts';

const jitter = (i: number) => Math.sin(i * 12.9898) * 2;

describe('pressure ink', () => {
  it('builds a closed outline for a stroke', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: Math.sin(i / 3) * 10 }));
    const d = strokeOutlinePath(pts, pts.map(() => 0.6), { size: 6 });
    expect(d.startsWith('M')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
  });
  it('draws a dot for a single tap', () => {
    expect(strokeOutlinePath([{ x: 1, y: 1 }], [], { size: 4 })).toContain('a ');
  });
  it('simulated pressure thins fast strokes', () => {
    const slow = simulatePressures(Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 })));
    const fast = simulatePressures(Array.from({ length: 10 }, (_, i) => ({ x: i * 30, y: 0 })));
    expect(fast[9]).toBeLessThan(slow[9]);
  });
});

describe('draw to shape', () => {
  it('recognises a rough rectangle', () => {
    const pts = [];
    for (let i = 0; i <= 20; i++) pts.push({ x: i * 10, y: jitter(i) });
    for (let i = 0; i <= 15; i++) pts.push({ x: 200 + jitter(i), y: i * 10 });
    for (let i = 20; i >= 0; i--) pts.push({ x: i * 10, y: 150 + jitter(i) });
    for (let i = 15; i >= 0; i--) pts.push({ x: jitter(i), y: i * 10 });
    expect(recognizeShape(pts)?.type).toBe('rectangle');
  });
  it('recognises an ellipse', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: 100 + Math.cos((i / 39) * Math.PI * 2) * 80, y: 100 + Math.sin((i / 39) * Math.PI * 2) * 50 }));
    expect(recognizeShape(pts)?.type).toBe('ellipse');
  });
  it('recognises a straight line', () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ x: i * 20, y: jitter(i) * 0.5 }));
    expect(recognizeShape(pts)?.type).toBe('line');
  });
  it('leaves scribbles alone', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: i * 6, y: Math.sin(i) * 40 }));
    expect(recognizeShape(pts)).toBeNull();
  });
});

describe('fonts', () => {
  it('maps presets', () => {
    expect(presetFor(48, 'bold')).toBe('h1');
    expect(presetFor(20, 'normal')).toBe('p');
    expect(presetFor(19, 'normal')).toBeNull();
  });
  it('sanitises custom font names before they reach CSS', () => {
    expect(sanitizeFontName('Pacifico"; color:red')).toBe('Pacifico colorred');
    expect(fontCss('My Font')).toContain('"My Font"');
  });
});
