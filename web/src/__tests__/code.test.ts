import rough from 'roughjs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { CodeElement } from '../core/types';
import { codeLayout, formatLineList, parseLineList } from '../elements/code/codeLayout';
import { highlight } from '../elements/code/highlight';
import { createCode } from '../elements/factory';
import { elementRegistry } from '../elements/registry';
import { fromExcalidraw, toExcalidraw } from '../persistence/excalidraw';
import { parseScene } from '../persistence/serialization';
import { getColorTransformer } from '../renderer/colorModes';

const types = (code: string, lang: string) => highlight(code, lang).map((line) => line.filter((t) => t.text.trim()).map((t) => `${t.type}:${t.text.trim()}`));

describe('syntax highlighter', () => {
  it('highlights JavaScript keywords, strings, numbers, functions and comments', () => {
    const [line] = types("const total = sum(items, 42); // add 'em", 'javascript');
    expect(line).toEqual(['keyword:const', 'plain:total', 'punct:=', 'function:sum', 'punct:(', 'plain:items', 'punct:,', 'number:42', 'punct:);', "comment:// add 'em"]);
  });

  it('keeps multi-line comments and strings across lines', () => {
    const lines = types('/* first\n   second */\nlet s = `a\nb`;', 'typescript');
    expect(lines[0]).toEqual(['comment:/* first']);
    expect(lines[1]).toEqual(['comment:second */']);
    expect(lines[2]).toEqual(['keyword:let', 'plain:s', 'punct:=', 'string:`a']);
    expect(lines[3]).toEqual(['string:b`', 'punct:;']);
  });

  it('handles Python, SQL (case-insensitive), JSON keys and HTML tags', () => {
    expect(types('def area(r):\n    return 3.14 * r ** 2  # pi r²', 'python')[0]).toEqual(['keyword:def', 'function:area', 'punct:(', 'plain:r', 'punct:):']);
    expect(types('SELECT id FROM users WHERE active = true', 'sql')[0].filter((t) => t.startsWith('keyword'))).toEqual(['keyword:SELECT', 'keyword:FROM', 'keyword:WHERE']);
    expect(types('{"name": "Ada", "age": 36}', 'json')[0]).toEqual(['punct:{', 'property:"name"', 'punct::', 'string:"Ada"', 'punct:,', 'property:"age"', 'punct::', 'number:36', 'punct:}']);
    expect(types('<a href="/x">Hi</a>', 'html')[0]).toEqual(['punct:<', 'tag:a', 'attr:href', 'punct:=', 'string:"/x"', 'punct:>', 'plain:Hi', 'punct:</', 'tag:a', 'punct:>']);
  });

  it('never loses characters', () => {
    const src = 'fn main() {\n\tlet x: u32 = 0xff; // "q"\n\tprintln!("{}", x);\n}';
    for (const lang of ['rust', 'plain', 'cpp', 'bash', 'css', 'yaml']) {
      expect(highlight(src, lang).map((l) => l.map((t) => t.text).join('')).join('\n')).toBe(src);
    }
  });
});

describe('code blocks', () => {
  const block = (code: string): CodeElement => createCode(DEFAULT_STYLE, { language: 'javascript', theme: 'dark', fontSize: 16, lineNumbers: true, showLanguage: true, markColor: 'yellow' }, { x: 10, y: 20 }, 1, code);

  it('parses and formats line ranges', () => {
    expect(parseLineList('3, 5-7, 7, 99, x', 10)).toEqual([3, 5, 6, 7]);
    expect(parseLineList('8-6', 10)).toEqual([6, 7, 8]);
    expect(formatLineList([7, 2, 3, 4])).toBe('2-4, 7');
  });

  it('sizes to its content and grows with more lines', () => {
    const a = block('x');
    const b = block('x\ny\nz');
    expect(b.height).toBeGreaterThan(a.height);
    expect(codeLayout(b).lines).toHaveLength(3);
    // resizing scales the font, the block re-fits
    const t = elementRegistry.get(a).transform(a, (p) => ({ x: a.x + (p.x - a.x) * 2, y: a.y + (p.y - a.y) * 2 }), { x: 2, y: 2 });
    expect(t.fontSize).toBe(32);
  });

  it('draws marks, line numbers and coloured tokens; prints in black & white', () => {
    const el = { ...block('const a = 1;\nconst b = 2;'), marks: { 2: 'green' as const } };
    const out = elementRegistry.get(el).generateShape(el, rough.generator());
    const texts = out.texts!.map((t) => t.text);
    expect(texts.some((t) => t.lines.join() === '1,2')).toBe(true); // line numbers
    expect(new Set(texts.map((t) => t.color)).size).toBeGreaterThan(2); // highlighted
    const bw = getColorTransformer('blackwhite').transformElement(el) as CodeElement;
    expect(bw.printMode).toBe('blackwhite');
    const bwOut = elementRegistry.get(bw).generateShape(bw, rough.generator());
    expect(bwOut.texts!.filter((t) => t.text.lines[0] !== 'JavaScript').every((t) => t.text.color === '#000000')).toBe(true);
  });

  it('survives save/load and an Excalidraw round trip', () => {
    const el = { ...block('print("hi")'), language: 'python', title: 'hello.py', marks: { 1: 'red' as const, '9x': 'pink' } } as unknown as CodeElement;
    const loaded = parseScene({ type: 'sketchboard', elements: [el] }).elements[0] as CodeElement;
    expect(loaded).toMatchObject({ language: 'python', title: 'hello.py', marks: { 1: 'red' } });
    expect(Object.keys(loaded.marks)).toEqual(['1']);
    const ex = toExcalidraw([loaded]);
    expect(ex.elements.map((e) => e.type)).toEqual(['rectangle', 'text']);
    const back = fromExcalidraw(JSON.parse(JSON.stringify(ex))).scene.elements;
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ type: 'code', code: 'print("hi")', language: 'python', title: 'hello.py', marks: { 1: 'red' } });
  });
});
