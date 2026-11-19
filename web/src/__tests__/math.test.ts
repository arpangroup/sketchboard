import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { MathElement } from '../core/types';
import { createMath } from '../elements/factory';
import { elementRegistry } from '../elements/registry';
import { looksLikeLatex, mathBlocks } from '../elements/math/mathSource';
import { transformPath } from '../elements/math/svgPath';
import { parseScene, serializeScene } from '../persistence/serialization';
import { fromExcalidraw, toExcalidraw } from '../persistence/excalidraw';
import { createInitialAppState } from '../core/constants';

const PASTED = String.raw`$$
p = \left(1 - e^{-\frac{7 \times 50}{95.85}}\right)^7
$$

$$
m = -\frac{n \ln(p)}{(\ln 2)^2}
$$

$$
k = \frac{m}{n} \ln 2
$$`;

describe('LaTeX source', () => {
  it('splits $$ … $$ blocks into equations', () => {
    expect(mathBlocks(PASTED)).toEqual([
      String.raw`p = \left(1 - e^{-\frac{7 \times 50}{95.85}}\right)^7`,
      String.raw`m = -\frac{n \ln(p)}{(\ln 2)^2}`,
      String.raw`k = \frac{m}{n} \ln 2`,
    ]);
    // inside a Markdown code fence, with prose around it
    expect(mathBlocks('```latex\nThe rate:\n$$a+b$$\nand\n$$c$$\n```')).toEqual(['a+b', 'c']);
  });

  it('reads \\[ … \\], equation environments, $ … $ and bare formulae', () => {
    expect(mathBlocks(String.raw`\[ E = mc^2 \]`)).toEqual(['E = mc^2']);
    expect(mathBlocks(String.raw`\begin{equation} a = b \end{equation}`)).toEqual(['a = b']);
    expect(mathBlocks(String.raw`\begin{align} a &= b \\ c &= d \end{align}`)).toEqual([String.raw`\begin{align} a &= b \\ c &= d \end{align}`]);
    expect(mathBlocks(String.raw`$\frac{1}{2}$`)).toEqual([String.raw`\frac{1}{2}`]);
    expect(mathBlocks(String.raw`  \sqrt{2}  `)).toEqual([String.raw`\sqrt{2}`]);
    expect(mathBlocks('   ')).toEqual([]);
  });

  it('knows pasted maths from pasted words', () => {
    expect(looksLikeLatex(PASTED)).toBe(true);
    expect(looksLikeLatex(String.raw`\[ x^2 \]`)).toBe(true);
    expect(looksLikeLatex(String.raw`\frac{a}{b} + \sqrt{c}`)).toBe(true);
    expect(looksLikeLatex(String.raw`$\alpha + \beta$`)).toBe(true);
    expect(looksLikeLatex('Meeting notes: costs $5 and $10 today.')).toBe(false);
    expect(looksLikeLatex('hello world')).toBe(false);
    expect(looksLikeLatex(String.raw`Use \frac when you write fractions. Then continue the explanation here.`)).toBe(false);
  });
});

describe('SVG path transform', () => {
  it('scales and moves absolute commands, scales relative ones', () => {
    expect(transformPath('M10 20L30 40Z', 2, 2, 1, 1)).toBe('M21 41L61 81Z');
    expect(transformPath('M0 0l5 5h10v-2', 2, 3, 100, 0)).toBe('M100 0l10 15h20v-6');
    expect(transformPath('M0,0 c1,2 3,4 5,6', 1, 1, 10, 10)).toBe('M10 10c1 2 3 4 5 6');
    // numbers after a moveto are line-tos; repeated arguments repeat the command
    expect(transformPath('M0 0 10 10 20 0', 1, 1, 0, 0)).toBe('M0 0L10 10L20 0');
    expect(transformPath('M1e2 0H5e1', 0.5, 1, 0, 0)).toBe('M50 0H25');
  });
});

describe('maths elements', () => {
  const el = (): MathElement => ({ ...createMath(DEFAULT_STYLE, { x: 10, y: 20 }, 1, PASTED), id: 'm1' });

  it('show their source until the renderer has loaded', () => {
    const m = el();
    expect(m.width).toBeGreaterThan(0);
    const shape = elementRegistry.get(m).generateShape(m, {} as never);
    expect(shape.text?.lines[0]).toBe('$$');
    expect(shape.math).toBeUndefined();
  });

  it('resizing scales the formula', () => {
    const m = el();
    const out = elementRegistry.get(m).transform(m, (p) => ({ x: m.x + (p.x - m.x) * 2, y: m.y + (p.y - m.y) * 2 }), { x: 2, y: 2 });
    expect(out.fontSize).toBe(m.fontSize * 2);
  });

  it('survive saving and Excalidraw (as their LaTeX source)', () => {
    const m = el();
    const back = parseScene(JSON.parse(JSON.stringify(serializeScene([m], createInitialAppState())))).elements[0] as MathElement;
    expect(back.type).toBe('math');
    expect(back.latex).toBe(PASTED);
    const ex = toExcalidraw([m]);
    expect(ex.elements[0].type).toBe('text');
    expect(ex.elements[0].text).toBe(PASTED);
    const again = fromExcalidraw(JSON.parse(JSON.stringify(ex))).scene.elements[0] as MathElement;
    expect(again.type).toBe('math');
    expect(again.latex).toBe(PASTED);
    expect(again.fontSize).toBe(m.fontSize);
  });
});

