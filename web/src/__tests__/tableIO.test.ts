import { describe, expect, it } from 'vitest';
import {
  parseCSV,
  parseDelimited,
  parseMarkdownTable,
  parseSpreadsheetText,
  tableFromClipboard,
  tableFromFile,
  toCSV,
  toHTMLTable,
  toMarkdown,
  toTSV,
} from '../elements/table/tableIO';

const CELLS = [
  ['Service', 'QPS', 'Notes'],
  ['Feed', '12,000', 'fan-out | on write'],
  ['Search', '3,500', 'two\nlines'],
];

describe('copying a table', () => {
  it('for spreadsheets: tab-separated, quoting cells with line breaks', () => {
    expect(toTSV(CELLS)).toBe('Service\tQPS\tNotes\nFeed\t12,000\tfan-out | on write\nSearch\t3,500\t"two\nlines"');
    expect(toHTMLTable([['A', 'B'], ['1 < 2', 'x\ny']], true)).toBe('<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1 &lt; 2</td><td>x<br>y</td></tr></tbody></table>');
  });

  it('as Markdown: aligned columns, pipes escaped, line breaks as <br>', () => {
    expect(toMarkdown(CELLS)).toBe(
      [
        '| Service | QPS    | Notes               |',
        '| ------- | ------ | ------------------- |',
        '| Feed    | 12,000 | fan-out \\| on write |',
        '| Search  | 3,500  | two<br>lines        |',
      ].join('\n'),
    );
    expect(toMarkdown([['a', 'b']], 'center').split('\n')[1]).toBe('| :-: | :-: |');
  });

  it('as CSV: commas and quotes quoted', () => {
    expect(toCSV([['a', 'b,c'], ['say "hi"', '']])).toBe('a,"b,c"\r\n"say ""hi""",');
  });

  it('round-trips: what is copied pastes back as the same cells', () => {
    expect(parseSpreadsheetText(toTSV(CELLS))?.cells).toEqual(CELLS);
    expect(parseMarkdownTable(toMarkdown(CELLS))?.cells).toEqual(CELLS);
    expect(parseCSV(toCSV(CELLS))?.cells).toEqual(CELLS);
  });
});

describe('pasting / importing a table', () => {
  it('reads Markdown tables, with or without outer pipes, anywhere in the text', () => {
    const md = 'Here are the numbers:\n\n| Name | Age |\n|:-----|----:|\n| **Ann** | 31 |\n| Bob | `42` |\n\nThanks!';
    expect(parseMarkdownTable(md)).toEqual({ cells: [['Name', 'Age'], ['Ann', '31'], ['Bob', '42']], header: true, source: 'markdown' });
    expect(parseMarkdownTable('a | b\n--- | ---\n1 | 2')?.cells).toEqual([['a', 'b'], ['1', '2']]);
    // short rows are padded
    expect(parseMarkdownTable('| a | b | c |\n|---|---|---|\n| 1 |')?.cells).toEqual([['a', 'b', 'c'], ['1', '', '']]);
    expect(parseMarkdownTable('just | some text\nno table here')).toBeNull();
  });

  it('reads cells copied from Excel / Google Sheets (tab-separated, trailing line break)', () => {
    expect(parseSpreadsheetText('A\tB\r\n1\t2\r\n')?.cells).toEqual([['A', 'B'], ['1', '2']]);
    expect(parseSpreadsheetText('x\t"multi\nline"\ty')?.cells).toEqual([['x', 'multi\nline', 'y']]);
    // plain text with a stray tab is not a table
    expect(parseSpreadsheetText('hello\tworld\nthis is\na paragraph\nof text')).toBeNull();
    expect(parseSpreadsheetText('no tabs')).toBeNull();
  });

  it('reads CSV files, including ";" separated ones and a BOM', () => {
    expect(parseCSV('﻿name;price\nTea;"2,50"\n')?.cells).toEqual([['name', 'price'], ['Tea', '2,50']]);
    expect(tableFromFile('data.csv', 'a,b\n1,2')?.cells).toEqual([['a', 'b'], ['1', '2']]);
    expect(tableFromFile('notes.md', '# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |')?.cells).toEqual([['a', 'b'], ['1', '2']]);
    expect(tableFromFile('data.tsv', 'a\tb\n1\t2')?.cells).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('prefers a Markdown table, then spreadsheet cells; ordinary text is not a table', () => {
    expect(tableFromClipboard('| a | b |\n|---|---|\n| 1 | 2 |', '')?.source).toBe('markdown');
    expect(tableFromClipboard('a\tb\n1\t2', '')?.source).toBe('spreadsheet');
    expect(tableFromClipboard('Meeting at 5pm | bring snacks', '')).toBeNull();
    expect(parseDelimited('', ',')).toEqual([]);
  });
});
