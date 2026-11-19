/**
 * Tables in and out of the board, in the formats people copy and paste:
 *  - spreadsheets (Excel, Google Sheets, Numbers, LibreOffice) copy cells as tab-separated text
 *    plus an HTML <table>; pasting either back gives the same cells;
 *  - Markdown pipe tables (GitHub, Notion, Obsidian, ChatGPT/Claude answers);
 *  - CSV files.
 * Pure string handling, except reading HTML, which needs the browser's DOMParser.
 */

export interface ParsedTable {
  cells: string[][];
  /** The first row is a header (a Markdown header, or <th> cells). */
  header: boolean;
  source: 'markdown' | 'spreadsheet' | 'csv' | 'html';
}

/** Largest table that is imported (more is cut off, with a note). */
export const MAX_IMPORT_ROWS = 300;
export const MAX_IMPORT_COLS = 50;

// ───────────────────────── writing ─────────────────────────

/** Tab-separated, as spreadsheets copy cells: cells with tabs, line breaks or quotes are quoted. */
export function toTSV(cells: readonly (readonly string[])[]): string {
  const cell = (v: string) => (/[\t\n\r"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return cells.map((row) => row.map(cell).join('\t')).join('\n');
}

/** Comma-separated (RFC 4180). */
export function toCSV(cells: readonly (readonly string[])[]): string {
  const cell = (v: string) => (/[,\n\r"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return cells.map((row) => row.map(cell).join(',')).join('\r\n');
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** An HTML table: spreadsheets and documents (Word, Docs) paste it as real cells. */
export function toHTMLTable(cells: readonly (readonly string[])[], header: boolean): string {
  const rows = cells.map((row, r) => {
    const tag = header && r === 0 ? 'th' : 'td';
    return `<tr>${row.map((v) => `<${tag}>${escHtml(v).replace(/\n/g, '<br>')}</${tag}>`).join('')}</tr>`;
  });
  return `<table><tbody>${rows.join('')}</tbody></table>`;
}

/** Display width of text in a monospace font (wide CJK / emoji characters count as two). */
const width = (s: string) => [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u.test(ch) ? 2 : 1), 0);

/**
 * A Markdown pipe table, columns padded to line up. Markdown tables always have a header row:
 * the first row is used (when the table has no header row, it still becomes the header).
 */
export function toMarkdown(cells: readonly (readonly string[])[], align: 'left' | 'center' | 'right' = 'left'): string {
  if (!cells.length) return '';
  const cols = Math.max(1, ...cells.map((r) => r.length));
  const text = cells.map((row) => Array.from({ length: cols }, (_, c) => (row[c] ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')));
  const widths = Array.from({ length: cols }, (_, c) => Math.max(3, ...text.map((r) => width(r[c]))));
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - width(s)));
  const line = (r: string[]) => `| ${r.map((v, c) => pad(v, widths[c])).join(' | ')} |`;
  const rule = widths.map((w) => {
    const dashes = '-'.repeat(w);
    return align === 'center' ? `:${dashes.slice(2)}:` : align === 'right' ? `${dashes.slice(1)}:` : dashes;
  });
  return [line(text[0]), `| ${rule.join(' | ')} |`, ...text.slice(1).map(line)].join('\n');
}

// ───────────────────────── reading ─────────────────────────

/** Rows of a delimited text (CSV / TSV), honouring quoted cells with delimiters, quotes and line breaks. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // a trailing line break (spreadsheets add one) isn't an extra row
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

const SEPARATOR_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Cells of one Markdown table row: split on unescaped "|", outer pipes optional. */
function markdownCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (s[i] === '|') {
      out.push(cur);
      cur = '';
    } else cur += s[i];
  }
  out.push(cur);
  return out.map((c) =>
    c
      .trim()
      .replace(/<br\s*\/?>/gi, '\n')
      // Markdown emphasis / code marks don't carry over: keep the words
      .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
      .replace(/`([^`]*)`/g, '$1'),
  );
}

/** A Markdown pipe table anywhere in the text (the first one), or null. */
export function parseMarkdownTable(text: string): ParsedTable | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes('|') || !SEPARATOR_RE.test(lines[i + 1]) || !lines[i + 1].includes('-')) continue;
    const head = markdownCells(lines[i]);
    const sepCols = markdownCells(lines[i + 1]).length;
    if (head.length < 1 || (head.length !== sepCols && sepCols > 1)) continue;
    const rows = [head];
    for (let j = i + 2; j < lines.length && lines[j].includes('|') && lines[j].trim(); j++) rows.push(markdownCells(lines[j]));
    return { cells: square(rows), header: true, source: 'markdown' };
  }
  return null;
}

/**
 * Tab-separated cells (what spreadsheets put on the clipboard): at least two columns, and most
 * lines have the same number of tabs (so a paragraph with one stray tab isn't a table).
 */
export function parseSpreadsheetText(text: string): ParsedTable | null {
  if (!text.includes('\t')) return null;
  const rows = parseDelimited(text, '\t');
  if (!rows.length) return null;
  const cols = Math.max(...rows.map((r) => r.length));
  if (cols < 2) return null;
  const regular = rows.filter((r) => r.length === cols).length;
  if (rows.length > 2 && regular < rows.length * 0.6) return null;
  return { cells: square(rows), header: false, source: 'spreadsheet' };
}

/** A CSV file's cells (comma, or semicolon as Excel writes in many countries). */
export function parseCSV(text: string): ParsedTable | null {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows = parseDelimited(text.replace(/^﻿/, ''), delimiter);
  if (!rows.length) return null;
  return { cells: square(rows), header: false, source: 'csv' };
}

/** The first <table> in HTML (what spreadsheets, Word, Docs and web pages put on the clipboard). */
export function parseHTMLTable(html: string): ParsedTable | null {
  if (!/<table[\s>]/i.test(html) || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const rows: string[][] = [];
  const spans: Array<{ col: number; left: number; text: string }> = [];
  let header = false;
  for (const tr of table.querySelectorAll('tr')) {
    // rows of a nested table belong to that table
    if (tr.closest('table') !== table) continue;
    const row: string[] = [];
    const cells = [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
    if (!rows.length) header = cells.length > 0 && cells.every((c) => c.tagName === 'TH');
    let col = 0;
    const takeSpans = () => {
      for (let s = spans.find((x) => x.col === col && x.left > 0); s; s = spans.find((x) => x.col === col && x.left > 0)) {
        row.push('');
        s.left--;
        col++;
      }
    };
    for (const td of cells) {
      takeSpans();
      const text = cellText(td);
      const colspan = Math.min(MAX_IMPORT_COLS, Math.max(1, Number(td.getAttribute('colspan')) || 1));
      const rowspan = Math.min(MAX_IMPORT_ROWS, Math.max(1, Number(td.getAttribute('rowspan')) || 1));
      for (let k = 0; k < colspan; k++) {
        row.push(k === 0 ? text : '');
        if (rowspan > 1) spans.push({ col, left: rowspan - 1, text });
        col++;
      }
    }
    takeSpans();
    rows.push(row);
  }
  if (!rows.length || rows.every((r) => !r.length)) return null;
  return { cells: square(rows), header, source: 'html' };
}

/** A cell's text with its line breaks (<br>, paragraphs) kept and spacing tidied. */
function cellText(td: Element): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) parts.push((c.textContent ?? '').replace(/\s+/g, ' '));
      else if (c.nodeName === 'BR') parts.push('\n');
      else if (c.nodeType === 1) {
        const block = /^(P|DIV|LI|H[1-6])$/.test(c.nodeName);
        if (block && parts.length && !parts[parts.length - 1].endsWith('\n')) parts.push('\n');
        walk(c);
        if (block) parts.push('\n');
      }
    }
  };
  walk(td);
  return parts
    .join('')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Every row the same length (padded with empty cells), within the import limits. */
function square(rows: string[][]): string[][] {
  const cut = rows.slice(0, MAX_IMPORT_ROWS);
  const cols = Math.min(MAX_IMPORT_COLS, Math.max(1, ...cut.map((r) => r.length)));
  return cut.map((r) => Array.from({ length: cols }, (_, c) => r[c] ?? ''));
}

/** Whether the parsed table was cut down to the import limits. */
export const wasTruncated = (rows: number, cols: number): boolean => rows >= MAX_IMPORT_ROWS || cols >= MAX_IMPORT_COLS;

/**
 * A table on the clipboard, if there is one: a Markdown table, or cells copied from a spreadsheet,
 * document or web page — those come as tab-separated text, usually with an HTML <table> too, which
 * is preferred (it knows header cells and merged cells). HTML alone isn't enough: pages laid out
 * with tables would otherwise paste as tables. Plain text without any of these isn't a table.
 */
export function tableFromClipboard(text: string, html: string): ParsedTable | null {
  const md = parseMarkdownTable(text);
  if (md) return md;
  const tsv = parseSpreadsheetText(text);
  if (!tsv) return null;
  const fromHtml = html ? parseHTMLTable(html) : null;
  // use the HTML version when it describes the same grid
  return fromHtml && fromHtml.cells.length === tsv.cells.length ? fromHtml : tsv;
}

/** A table from a file's contents, by its name: .csv / .tsv / .md / .markdown / .txt. */
export function tableFromFile(name: string, text: string): ParsedTable | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') return parseCSV(text);
  if (ext === 'tsv' || ext === 'tab') return parseSpreadsheetText(text) ?? parseCSV(text);
  return parseMarkdownTable(text) ?? parseSpreadsheetText(text);
}

/** File types the "Import table" picker and drag & drop accept. */
export const TABLE_FILE_ACCEPT = '.csv,.tsv,.tab,.md,.markdown,.txt,text/csv,text/tab-separated-values,text/markdown';
export const isTableFileName = (name: string): boolean => /\.(csv|tsv|tab|md|markdown)$/i.test(name);
