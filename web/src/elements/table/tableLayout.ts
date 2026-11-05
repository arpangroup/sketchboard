import { LINE_HEIGHT } from '../../core/constants';
import type { FontWeight, Point, TableElement } from '../../core/types';
import { fontString } from '../textMetrics';

/**
 * Pure table geometry: wrapping, row auto-height, cell lookup and structural edits.
 * Kept free of rendering/editor concerns so it's unit-testable and reused by every view.
 */
export const MIN_COL_WIDTH = 24;
export const MIN_ROW_HEIGHT = 20;

let ctx: CanvasRenderingContext2D | null = null;
const measure = (s: string, font: string, fontSize: number) => {
  if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return s.length * fontSize * 0.55;
  ctx.font = font;
  return ctx.measureText(s).width;
};

export const isHeaderRow = (el: Pick<TableElement, 'headerRow'>, row: number) => el.headerRow && row === 0;
export const cellWeight = (el: Pick<TableElement, 'headerRow'>, row: number): FontWeight => (isHeaderRow(el, row) ? 'bold' : 'normal');

/** Greedy word wrap honouring explicit newlines; very long words are split by character. */
export function wrapText(text: string, maxWidth: number, font: string, fontSize: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const candidate = line + word;
      if (measure(candidate, font, fontSize) <= maxWidth || !line.trim()) {
        if (measure(candidate, font, fontSize) > maxWidth && !line.trim()) {
          // single word wider than the column: break it
          let chunk = '';
          for (const ch of word) {
            if (measure(chunk + ch, font, fontSize) > maxWidth && chunk) {
              out.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        } else line = candidate;
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export function cellLines(el: TableElement, row: number, col: number): string[] {
  const font = fontString(el.fontSize, el.fontFamily, { fontWeight: cellWeight(el, row) });
  const inner = Math.max(4, el.colWidths[col] - el.cellPadding * 2);
  return wrapText(el.cells[row]?.[col] ?? '', inner, font, el.fontSize);
}

/** Height a row needs for its tallest cell. */
export function contentRowHeight(el: TableElement, row: number): number {
  let lines = 1;
  for (let c = 0; c < el.cols; c++) lines = Math.max(lines, cellLines(el, row, c).length);
  return Math.ceil(lines * el.fontSize * LINE_HEIGHT + el.cellPadding * 2);
}

const sum = (a: readonly number[]) => a.reduce((s, v) => s + v, 0);

/** Grows rows to fit their content and recomputes the element size. */
export function relayout(el: TableElement): Pick<TableElement, 'rowHeights' | 'width' | 'height'> {
  const rowHeights = el.rowHeights.map((h, r) => Math.max(h, MIN_ROW_HEIGHT, contentRowHeight(el, r)));
  return { rowHeights, width: sum(el.colWidths), height: sum(rowHeights) };
}

export const colOffsets = (el: Pick<TableElement, 'colWidths'>) => el.colWidths.reduce<number[]>((a, w) => [...a, a[a.length - 1] + w], [0]);
export const rowOffsets = (el: Pick<TableElement, 'rowHeights'>) => el.rowHeights.reduce<number[]>((a, h) => [...a, a[a.length - 1] + h], [0]);

/** Cell under an element-local point, or null. */
export function cellAt(el: TableElement, local: Point): { row: number; col: number } | null {
  if (local.x < 0 || local.y < 0 || local.x > el.width || local.y > el.height) return null;
  const xs = colOffsets(el);
  const ys = rowOffsets(el);
  const col = Math.max(0, Math.min(el.cols - 1, xs.findIndex((x) => x > local.x) - 1));
  const row = Math.max(0, Math.min(el.rows - 1, ys.findIndex((y) => y > local.y) - 1));
  return { row, col };
}

/** Inner grid line near a local point (for drag-to-resize). Index i = boundary after column/row i. */
export function gridLineAt(el: TableElement, local: Point, tol: number): { axis: 'col' | 'row'; index: number } | null {
  if (local.x < -tol || local.y < -tol || local.x > el.width + tol || local.y > el.height + tol) return null;
  const xs = colOffsets(el);
  for (let i = 1; i < xs.length; i++) if (Math.abs(local.x - xs[i]) <= tol) return { axis: 'col', index: i - 1 };
  const ys = rowOffsets(el);
  for (let i = 1; i < ys.length; i++) if (Math.abs(local.y - ys[i]) <= tol) return { axis: 'row', index: i - 1 };
  return null;
}

// ─── structural edits (return a patch; the editor applies it as one undo step) ───

export type TablePatch = Partial<Pick<TableElement, 'rows' | 'cols' | 'colWidths' | 'rowHeights' | 'cells' | 'width' | 'height'>>;

const finish = (el: TableElement, p: TablePatch): TablePatch => ({ ...p, ...relayout({ ...el, ...p } as TableElement) });

export function insertRow(el: TableElement, at: number): TablePatch {
  const cells = el.cells.map((r) => [...r]);
  cells.splice(at, 0, Array(el.cols).fill(''));
  const rowHeights = [...el.rowHeights];
  // new rows start at the table's normal (smallest) row height, not a tall wrapped neighbour's
  rowHeights.splice(at, 0, Math.min(...el.rowHeights, 1e9) || 40);
  return finish(el, { rows: el.rows + 1, cells, rowHeights });
}

export function removeRow(el: TableElement, at: number): TablePatch {
  if (el.rows <= 1) return {};
  return finish(el, {
    rows: el.rows - 1,
    cells: el.cells.filter((_, i) => i !== at),
    rowHeights: el.rowHeights.filter((_, i) => i !== at),
  });
}

export function insertCol(el: TableElement, at: number): TablePatch {
  const w = el.colWidths[Math.min(at, el.cols - 1)] ?? 120;
  const colWidths = [...el.colWidths];
  colWidths.splice(at, 0, w);
  return finish(el, { cols: el.cols + 1, colWidths, cells: el.cells.map((r) => [...r.slice(0, at), '', ...r.slice(at)]) });
}

export function removeCol(el: TableElement, at: number): TablePatch {
  if (el.cols <= 1) return {};
  return finish(el, {
    cols: el.cols - 1,
    colWidths: el.colWidths.filter((_, i) => i !== at),
    cells: el.cells.map((r) => r.filter((_, i) => i !== at)),
  });
}

/** Resize to n×m, keeping existing content (appends/truncates at the end). */
export function resizeGrid(el: TableElement, rows: number, cols: number): TablePatch {
  let cur: TableElement = el;
  let patch: TablePatch = {};
  const apply = (p: TablePatch) => {
    cur = { ...cur, ...p } as TableElement;
    patch = { ...patch, ...p };
  };
  while (cur.rows < rows) apply(insertRow(cur, cur.rows));
  while (cur.rows > rows && cur.rows > 1) apply(removeRow(cur, cur.rows - 1));
  while (cur.cols < cols) apply(insertCol(cur, cur.cols));
  while (cur.cols > cols && cur.cols > 1) apply(removeCol(cur, cur.cols - 1));
  return patch;
}

export function distributeColumns(el: TableElement): TablePatch {
  const w = el.width / el.cols;
  return finish(el, { colWidths: Array(el.cols).fill(w) });
}

export function setCellText(el: TableElement, row: number, col: number, text: string): TablePatch {
  const cells = el.cells.map((r) => [...r]);
  cells[row][col] = text;
  return finish(el, { cells });
}

