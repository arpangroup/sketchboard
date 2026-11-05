import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, createInitialAppState } from '../core/constants';
import { createTable } from '../elements/factory';
import {
  cellAt,
  gridLineAt,
  insertCol,
  insertRow,
  removeCol,
  removeRow,
  resizeGrid,
  setCellText,
  wrapText,
} from '../elements/table/tableLayout';
import { parseScene } from '../persistence/serialization';

const make = () =>
  createTable(DEFAULT_STYLE, createInitialAppState().tableDefaults, { x: 0, y: 0, width: 300, height: 120 }, 1);

describe('table', () => {
  it('creates an n×m grid that fills the dragged size', () => {
    const t = make();
    expect(t.rows).toBe(3);
    expect(t.cols).toBe(3);
    expect(t.cells).toHaveLength(3);
    expect(t.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(300);
  });

  it('wraps long cell text and grows the row', () => {
    const t = make();
    const p = setCellText(t, 1, 0, 'a very long sentence that certainly needs to wrap inside a narrow column');
    expect(p.rowHeights![1]).toBeGreaterThan(t.rowHeights[1]);
    expect(p.height).toBeGreaterThan(t.height);
    expect(wrapText('one two three', 1, '10px sans-serif', 10).length).toBeGreaterThan(1);
  });

  it('inserts and removes rows/columns keeping content aligned', () => {
    let t = { ...make(), ...setCellText(make(), 0, 0, 'A') };
    t = { ...t, ...insertRow(t, 0) };
    expect(t.rows).toBe(4);
    expect(t.cells[1][0]).toBe('A');
    t = { ...t, ...insertCol(t, 0) };
    expect(t.cols).toBe(4);
    expect(t.cells[1][1]).toBe('A');
    t = { ...t, ...removeRow(t, 0), ...{} };
    t = { ...t, ...removeCol(t, 0) };
    expect(t.cells[0][0]).toBe('A');
    expect(removeRow({ ...t, rows: 1 }, 0)).toEqual({});
  });

  it('resizes the grid and finds cells / grid lines', () => {
    const t = { ...make(), ...resizeGrid(make(), 5, 2) };
    expect(t.rows).toBe(5);
    expect(t.cols).toBe(2);
    expect(t.cells.every((r) => r.length === 2)).toBe(true);
    expect(cellAt(t, { x: t.colWidths[0] + 5, y: 1 })).toEqual({ row: 0, col: 1 });
    expect(gridLineAt(t, { x: t.colWidths[0] + 1, y: 10 }, 4)).toEqual({ axis: 'col', index: 0 });
  });

  it('repairs malformed tables from files', () => {
    const data = parseScene({ type: 'sketchboard', elements: [{ ...make(), rows: 2, cols: 2, cells: [['x']] }] });
    const t = data.elements[0] as ReturnType<typeof make>;
    expect(t.cells).toEqual([['x', ''], ['', '']]);
  });
});
