import { describe, expect, it } from 'vitest';
import doc from '../../../docs/LATEX.md?raw';
import { MATH_CHEATSHEET, MATH_EXAMPLES } from '../elements/math/mathExamples';
import { looksLikeLatex } from '../elements/math/mathSource';

describe('maths guide', () => {
  it('shows exactly the examples in docs/LATEX.md, each one pasting as maths', () => {
    const items = MATH_EXAMPLES.flatMap((g) => g.items);
    expect(items.length).toBeGreaterThan(40);
    for (const it of items) {
      expect(doc.includes('```latex\n' + it.source + '\n```')).toBe(true);
      expect(looksLikeLatex(it.source)).toBe(true);
    }
    for (const c of MATH_CHEATSHEET) for (const code of c.codes) expect(doc.includes('`' + code + '`')).toBe(true);
  });
});
