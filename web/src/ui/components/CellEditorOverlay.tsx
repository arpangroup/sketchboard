import { useEffect, useRef } from 'react';
import { LINE_HEIGHT } from '../../core/constants';
import { fontCss } from '../../core/fonts';
import type { TableElement } from '../../core/types';
import { cellWeight, colOffsets, rowOffsets } from '../../elements/table/tableLayout';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';

/**
 * In-place editor for one table cell: a textarea laid exactly over the cell, wrapping at the
 * column width. Tab / Shift+Tab move between cells (Tab on the last cell adds a row),
 * Ctrl/Cmd+Enter or Esc finishes, Alt+↑/↓ moves up/down.
 */
export function CellEditorOverlay() {
  const { editor } = useEditor();
  const cell = useAppState((s) => s.editingCell);
  const viewport = useAppState((s) => s.viewport);
  useSceneRevision();
  const ref = useRef<HTMLTextAreaElement>(null);

  const el = cell ? (editor.scene.getElement(cell.id) as TableElement | undefined) : undefined;
  const key = cell ? `${cell.id}:${cell.row}:${cell.col}` : '';

  useEffect(() => {
    if (!cell || !ref.current) return;
    const ta = ref.current;
    const t = editor.scene.getElement(cell.id) as TableElement | undefined;
    ta.value = t?.cells[cell.row]?.[cell.col] ?? '';
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, editor]);

  if (!cell || !el || el.type !== 'table' || cell.row >= el.rows || cell.col >= el.cols) return null;

  const z = viewport.zoom;
  const xs = colOffsets(el);
  const ys = rowOffsets(el);
  const left = (el.x + xs[cell.col] + viewport.scrollX) * z;
  const top = (el.y + ys[cell.row] + viewport.scrollY) * z;
  const width = el.colWidths[cell.col] * z;
  const height = el.rowHeights[cell.row] * z;
  const pad = el.cellPadding * z;

  return (
    <textarea
      ref={ref}
      className="sb-cell-editor"
      spellCheck
      aria-label={`Row ${cell.row + 1}, column ${cell.col + 1}`}
      style={{
        left,
        top,
        width,
        minHeight: height,
        transform: el.angle ? `rotate(${el.angle}rad)` : undefined,
        transformOrigin: el.angle ? `${(el.width / 2 - xs[cell.col]) * z}px ${(el.height / 2 - ys[cell.row]) * z}px` : undefined,
        padding: pad,
        font: `${cellWeight(el, cell.row)} ${el.fontSize * z}px ${fontCss(el.fontFamily)}`,
        lineHeight: LINE_HEIGHT,
        color: el.textColor,
        textAlign: el.textAlign,
      }}
      onChange={(e) => editor.updateEditingCell(e.target.value)}
      onBlur={() => editor.finishCellEditing()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Tab') {
          e.preventDefault();
          editor.moveEditingCell(e.shiftKey ? 'prev' : 'next');
        } else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault();
          editor.moveEditingCell(e.key === 'ArrowDown' ? 'down' : 'up');
        } else if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
