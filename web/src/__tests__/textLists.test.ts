import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { TextElement } from '../core/types';
import { createText } from '../elements/factory';
import { elementRegistry } from '../elements/registry';
import { continueList, listKindAt, renumber, toggleList } from '../elements/textLists';
import { layoutRuns, textBoxLines, textBoxSize } from '../elements/textMetrics';

const all = (text: string) => ({ text, from: 0, to: text.length });

describe('lists in a text box', () => {
  it('turns lines into a bulleted or numbered list, and back', () => {
    const b = toggleList(all('Milk\nEggs\nBread'), 'bullet');
    expect(b.text).toBe('• Milk\n• Eggs\n• Bread');
    expect(toggleList(all(b.text), 'bullet').text).toBe('Milk\nEggs\nBread');
    // switching kind replaces the marker
    expect(toggleList(all(b.text), 'number').text).toBe('1. Milk\n2. Eggs\n3. Bread');
  });

  it('acts only on the lines touched by the caret or selection', () => {
    const text = 'Title\nalpha\nbeta\nend';
    const caret = text.indexOf('lph');
    expect(toggleList({ text, from: caret, to: caret }, 'bullet').text).toBe('Title\n• alpha\nbeta\nend');
    const sel = { text, from: text.indexOf('pha'), to: text.indexOf('eta') };
    const out = toggleList(sel, 'number');
    expect(out.text).toBe('Title\n1. alpha\n2. beta\nend');
    // the selection moves with the text
    expect(out.text.slice(out.from, out.to)).toBe('pha\n2. b');
  });

  it('keeps formatted words formatted, and gives the marker the box’s own look', () => {
    const out = toggleList({ text: 'a big deal', runs: [{ text: 'a ' }, { text: 'big', b: true }, { text: ' deal' }], from: 0, to: 0 }, 'bullet');
    expect(out.text).toBe('• a big deal');
    expect(out.runs).toEqual([{ text: '• a ' }, { text: 'big', b: true }, { text: ' deal' }]);
    const bold = toggleList({ text: 'x', runs: [{ text: 'x', c: '#e03131' }], from: 0, to: 0 }, 'number');
    expect(bold.runs).toEqual([{ text: '1. ' }, { text: 'x', c: '#e03131' }]);
  });

  it('Enter continues the list; Enter on an empty item ends it', () => {
    const t = '1. one';
    const next = continueList({ text: t, from: t.length, to: t.length })!;
    expect(next.text).toBe('1. one\n2. ');
    expect(next.from).toBe(next.text.length);
    const done = continueList(next)!;
    expect(done.text).toBe('1. one\n');
    // splitting an item in the middle; later numbers move up
    const mid = '• ab\n• cd';
    expect(continueList({ text: mid, from: 3, to: 3 })!.text).toBe('• a\n• b\n• cd');
    const nums = '1. ab\n2. cd';
    expect(continueList({ text: nums, from: 4, to: 4 })!.text).toBe('1. a\n2. b\n3. cd');
    // not a list line → the editor does a normal line break
    expect(continueList({ text: 'plain', from: 5, to: 5 })).toBeNull();
  });

  it('renumbers each list from its first number, and tells which list is selected', () => {
    expect(renumber(all('1. a\n5. b\n2. c\n\n3. x\n9. y')).text).toBe('1. a\n2. b\n3. c\n\n3. x\n4. y');
    expect(listKindAt('• a\n• b', 0, 7)).toBe('bullet');
    expect(listKindAt('• a\nb', 0, 5)).toBeNull();
  });

  it('wrapped list items hang under their text, not their marker', () => {
    const piece = { text: '• one two three four five six', bold: false, italic: false, underline: false };
    const l = layoutRuns([piece], 90, 20, 'normal');
    expect(l.lines.length).toBeGreaterThan(1);
    // a small gap before the bullet; wrapped lines also hang under the item's text
    expect(l.indents[0]).toBe(2);
    expect(l.indents[1]).toBeGreaterThan(l.indents[0]);
    // the gap is there without wrapping too, and grows with the text
    expect(layoutRuns([piece], null, 20, 'normal').indents).toEqual([2]);
    expect(layoutRuns([piece], null, 40, 'normal').indents).toEqual([4]);
    // a plain paragraph doesn't
    expect(layoutRuns([{ ...piece, text: 'one two three four five six' }], 90, 20, 'normal').indents.every((x) => x === 0)).toBe(true);

    const box: TextElement = { ...createText(DEFAULT_STYLE, { x: 0, y: 0 }, 1, piece.text), width: 90, fixedWidth: true };
    expect(textBoxLines(box).length).toBe(l.lines.length);
    // an auto-width box is wide enough for the gap
    const auto: TextElement = { ...box, fixedWidth: false, text: '• Milk' };
    const plain: TextElement = { ...auto, text: '  Milk' };
    expect(textBoxSize(auto).width).toBeGreaterThan(textBoxSize(plain).width - 1);
    const shape = elementRegistry.get(box).generateShape(box, {} as never);
    expect(shape.text?.indents?.[1]).toBeGreaterThan(0);
  });
});
