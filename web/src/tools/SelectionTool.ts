import { boundsContains, normalizeBounds, pointInBounds } from '../core/geometry';
import type { Bounds, FigureElement, LinearElement, Point, SketchElement, TableElement } from '../core/types';
import { cellAt, contentRowHeight, gridLineAt, MIN_COL_WIDTH, MIN_ROW_HEIGHT, relayout } from '../elements/table/tableLayout';
import { cloneElement, createText, updateElement } from '../elements/factory';
import { codeLayout, lineAt } from '../elements/code/codeLayout';
import { angleOf, bakesRotation, centerOf, keepTopLeft, rotateAround, rotatePoint, toLocal } from '../elements/rotation';
import { pointsToElementGeometry } from '../elements/handlers/pointShapes';
import { elementRegistry, getElementBounds } from '../elements/registry';
import { measureText } from '../elements/textMetrics';
import { EMPTY_SET, type PointerInfo, type Tool, type ToolContext } from './Tool';
import {
  type BoxHandle,
  getSelectionBounds,
  getSelectionFrame,
  handleCursor,
  type HandleId,
  hitHandle,
  resizeBounds,
} from './selectionGeometry';

type Mode =
  | { kind: 'idle' }
  | {
      kind: 'move';
      start: Point;
      originals: SketchElement[];
      moved: boolean;
      duplicated: boolean;
      cellClick?: { id: string; row: number; col: number };
      codeLineClick?: { id: string; line: number };
    }
  | { kind: 'resize'; handle: BoxHandle; startBounds: Bounds; originals: SketchElement[]; frame?: { pivot: Point; angle: number } }
  | { kind: 'rotate'; pivot: Point; start: number; originals: SketchElement[] }
  | { kind: 'point'; index: number; original: LinearElement }
  | { kind: 'tail'; original: FigureElement }
  | { kind: 'marquee'; start: Point; current: Point; additiveBase: string[] }
  | { kind: 'tableLine'; axis: 'col' | 'row'; index: number; start: Point; original: TableElement };

export class SelectionTool implements Tool {
  readonly type = 'selection' as const;
  readonly cursor = 'default';
  private mode: Mode = { kind: 'idle' };

  constructor(private ctx: ToolContext) {}

  activeIds(): ReadonlySet<string> {
    const m = this.mode;
    if (m.kind === 'move' || m.kind === 'resize' || m.kind === 'rotate') return new Set(m.originals.map((e) => e.id));
    if (m.kind === 'point' || m.kind === 'tableLine' || m.kind === 'tail') return new Set([m.original.id]);
    return EMPTY_SET;
  }

  onPointerDown(p: PointerInfo): void {
    const { ctx } = this;
    const zoom = ctx.getViewport().zoom;
    const selected = ctx.getSelectedElements();

    // 1. resize / endpoint handles
    const handle = hitHandle(selected, p.world, zoom);
    if (handle) return this.beginHandleDrag(handle, selected, p.world);

    // grid lines of a selected table: drag to resize that column / row
    const table = this.singleTable(selected);
    if (table) {
      const tl = toLocal(table, p.world);
      const line = gridLineAt(table, { x: tl.x - table.x, y: tl.y - table.y }, 5 / zoom);
      if (line && line.index < (line.axis === 'col' ? table.cols : table.rows)) {
        this.mode = { kind: 'tableLine', axis: line.axis, index: line.index, start: p.world, original: table };
        return;
      }
    }

    // 2. element under cursor
    const hit = ctx.hitTest(p.world);
    const selBounds = getSelectionBounds(selected);
    const insideMulti = selected.length > 1 && selBounds && pointInBounds(p.world, selBounds);

    if (hit && !insideMulti) {
      const isSelected = !!ctx.getState().selectedIds[hit.id];
      if (p.shiftKey) {
        const ids = Object.keys(ctx.getState().selectedIds);
        ctx.setSelection(isSelected ? ids.filter((id) => id !== hit.id) : [...ids, hit.id]);
        if (isSelected) return;
      } else if (!isSelected) {
        ctx.setSelection([hit.id]);
      }
    } else if (!insideMulti) {
      // 3. empty space: start marquee
      const base = p.shiftKey ? Object.keys(ctx.getState().selectedIds) : [];
      if (!p.shiftKey) ctx.setSelection([]);
      this.mode = { kind: 'marquee', start: p.world, current: p.world, additiveBase: base };
      return;
    }

    const originals = ctx.getSelectedElements().filter((e) => !e.locked);
    if (originals.length === 0) return;
    // clicking a cell of an already-selected table edits it (on release, if it wasn't a drag)
    let cellClick: Extract<Mode, { kind: 'move' }>['cellClick'];
    if (hit?.type === 'table' && table?.id === hit.id && !p.shiftKey) {
      const hl = toLocal(hit, p.world);
      const cell = cellAt(hit, { x: hl.x - hit.x, y: hl.y - hit.y });
      if (cell) cellClick = { id: hit.id, ...cell };
    }
    if (hit?.type === 'table') {
      const hl = toLocal(hit, p.world);
      const cell = cellAt(hit, { x: hl.x - hit.x, y: hl.y - hit.y });
      if (cell) ctx.noteTableCell(hit.id, cell.row, cell.col);
    }
    // clicking a line number of an already-selected code block marks / unmarks that line
    let codeLineClick: Extract<Mode, { kind: 'move' }>['codeLineClick'];
    if (hit?.type === 'code' && selected.length === 1 && selected[0].id === hit.id && !p.shiftKey) {
      const l = codeLayout(hit);
      const cl = toLocal(hit, p.world);
      const lx = cl.x - hit.x;
      const line = lineAt(hit, cl.y - hit.y);
      if (line && lx < l.codeX) codeLineClick = { id: hit.id, line };
    }
    this.mode = { kind: 'move', start: p.world, originals, moved: false, duplicated: false, cellClick, codeLineClick };
  }

  private beginHandleDrag(handle: HandleId, selected: SketchElement[], at: Point): void {
    const frame = getSelectionFrame(selected)!;
    if (handle === 'rotate') {
      this.mode = { kind: 'rotate', pivot: frame.pivot, start: Math.atan2(at.y - frame.pivot.y, at.x - frame.pivot.x), originals: selected };
    } else if (handle === 'tail') {
      this.mode = { kind: 'tail', original: selected[0] as FigureElement };
    } else if (handle.startsWith('p')) {
      this.mode = { kind: 'point', index: Number(handle.slice(1)), original: selected[0] as LinearElement };
    } else {
      this.mode = {
        kind: 'resize',
        handle: handle as BoxHandle,
        // a single rotated element resizes in its own (turned) frame
        startBounds: frame.angle ? frame.box : getSelectionBounds(selected)!,
        originals: selected,
        frame: frame.angle ? { pivot: frame.pivot, angle: frame.angle } : undefined,
      };
    }
  }

  onPointerMove(p: PointerInfo, isDown: boolean): void {
    if (!isDown) return this.updateHoverCursor(p);
    const m = this.mode;
    switch (m.kind) {
      case 'move':
        return this.move(m, p);
      case 'resize':
        return this.resize(m, p);
      case 'point':
        return this.movePoint(m, p);
      case 'marquee':
        return this.updateMarquee(m, p);
      case 'tableLine':
        return this.dragTableLine(m, p);
      case 'tail':
        return this.moveTail(m, p);
      case 'rotate':
        return this.rotate(m, p);
    }
  }

  private move(m: Extract<Mode, { kind: 'move' }>, p: PointerInfo): void {
    let dx = p.world.x - m.start.x;
    let dy = p.world.y - m.start.y;
    if (!m.moved && Math.hypot(dx, dy) * this.ctx.getViewport().zoom < 2) return;
    if (p.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    // Alt-drag duplicates the selection and drags the copies.
    if (p.altKey && !m.duplicated) {
      let z = this.ctx.nextZIndex();
      const clones = m.originals.map((el) => cloneElement(el, { x: 0, y: 0 }, z++));
      this.ctx.scene.upsert(clones);
      m.originals = clones;
      m.duplicated = true;
      this.ctx.setSelection(clones.map((c) => c.id));
    }
    m.moved = true;
    const updates = m.originals.map((orig) => {
      const current = this.ctx.scene.getElement(orig.id) ?? orig;
      return updateElement(current, { x: orig.x + dx, y: orig.y + dy });
    });
    this.ctx.scene.upsert(updates);
  }

  private resize(m: Extract<Mode, { kind: 'resize' }>, p: PointerInfo): void {
    // Text always scales proportionally (it's driven by font size).
    // Text always scales proportionally; images keep their ratio unless Shift is held; shapes the reverse.
    const hasImage = m.originals.some((e) => e.type === 'image');
    const keepAspect = m.originals.some((e) => e.type === 'text') || p.shiftKey !== hasImage;
    const pointer = m.frame ? rotatePoint(p.world, m.frame.pivot, -m.frame.angle) : p.world;
    const nb = resizeBounds(m.startBounds, m.handle, pointer, keepAspect, p.altKey);
    const sb = m.startBounds;
    const sx = sb.width === 0 ? 1 : nb.width / sb.width;
    const sy = sb.height === 0 ? 1 : nb.height / sb.height;
    // Guard against collapsing to zero which would lose the geometry permanently.
    if (Math.abs(nb.width) < 1 && sb.width > 0) return;
    if (Math.abs(nb.height) < 1 && sb.height > 0) return;
    const map = (pt: Point): Point => ({
      x: nb.x + (pt.x - sb.x) * sx,
      y: nb.y + (pt.y - sb.y) * sy,
    });
    const updates = m.originals.map((orig) => {
      const patch = elementRegistry.get(orig).transform(orig, map, { x: sx, y: sy }) as Partial<SketchElement>;
      if (m.frame) {
        // the resize happened in the element's turned frame: move its new centre back into place
        const next = { ...orig, ...patch };
        const c = centerOf(next);
        const w = rotatePoint(c, m.frame.pivot, m.frame.angle);
        patch.x = next.x + (w.x - c.x);
        patch.y = next.y + (w.y - c.y);
      }
      const current = this.ctx.scene.getElement(orig.id) ?? orig;
      return updateElement(current, patch);
    });
    this.ctx.scene.upsert(updates);
  }

  /** Rotation handle: turns the selection around its centre (Shift snaps to 15°). */
  private rotate(m: Extract<Mode, { kind: 'rotate' }>, p: PointerInfo): void {
    let delta = Math.atan2(p.world.y - m.pivot.y, p.world.x - m.pivot.x) - m.start;
    const step = Math.PI / 12;
    const single = m.originals.length === 1 && !bakesRotation(m.originals[0]) ? m.originals[0] : null;
    if (p.shiftKey) {
      // snap the element's final angle (single) or the turn (group) to 15° steps
      const base = single ? angleOf(single) : 0;
      delta = Math.round((base + delta) / step) * step - base;
    }
    const updates = m.originals
      .filter((o) => !o.locked)
      .map((orig) => updateElement(this.ctx.scene.getElement(orig.id) ?? orig, rotateAround(orig, delta, m.pivot)));
    this.ctx.scene.upsert(updates);
  }

  private movePoint(m: Extract<Mode, { kind: 'point' }>, p: PointerInfo): void {
    const orig = m.original;
    const abs = orig.points.map((pt) => ({ x: pt.x + orig.x, y: pt.y + orig.y }));
    let target = p.world;
    if (p.shiftKey) {
      const anchor = abs[m.index === 0 ? 1 : 0];
      const dx = target.x - anchor.x;
      const dy = target.y - anchor.y;
      const step = Math.PI / 12;
      const a = Math.round(Math.atan2(dy, dx) / step) * step;
      const len = Math.hypot(dx, dy);
      target = { x: anchor.x + Math.cos(a) * len, y: anchor.y + Math.sin(a) * len };
    }
    abs[m.index] = target;
    const current = this.ctx.scene.getElement(orig.id) ?? orig;
    this.ctx.scene.upsert([updateElement(current, pointsToElementGeometry(abs) as Partial<LinearElement>)]);
  }

  /** Drags a callout's tail tip (stored relative to the body so it survives resizing). */
  private moveTail(m: Extract<Mode, { kind: 'tail' }>, p: PointerInfo): void {
    const el = (this.ctx.scene.getElement(m.original.id) ?? m.original) as FigureElement;
    const w = Math.max(1, el.width);
    const h = Math.max(1, el.height);
    const clamp = (v: number) => Math.max(-20, Math.min(20, v));
    const local = toLocal(el, p.world);
    this.ctx.scene.upsert([updateElement(el, { tail: { x: clamp((local.x - el.x) / w), y: clamp((local.y - el.y) / h) } })]);
  }

  private dragTableLine(m: Extract<Mode, { kind: 'tableLine' }>, p: PointerInfo): void {
    const o = m.original;
    const current = (this.ctx.scene.getElement(o.id) as TableElement | undefined) ?? o;
    // measure the drag along the table's own (possibly rotated) axes
    const d = rotatePoint({ x: p.world.x - m.start.x, y: p.world.y - m.start.y }, { x: 0, y: 0 }, -angleOf(o));
    let next: TableElement;
    if (m.axis === 'col') {
      const colWidths = [...o.colWidths];
      colWidths[m.index] = Math.max(MIN_COL_WIDTH, o.colWidths[m.index] + d.x);
      next = { ...current, colWidths };
    } else {
      const rowHeights = [...o.rowHeights];
      const min = Math.max(MIN_ROW_HEIGHT, contentRowHeight(o, m.index));
      rowHeights[m.index] = Math.max(min, o.rowHeights[m.index] + d.y);
      next = { ...current, rowHeights };
    }
    // narrowing a column can re-wrap text, so rows re-fit (without collapsing taller rows)
    const sized = { ...next, ...relayout(next) };
    this.ctx.scene.upsert([updateElement(current, { ...sized, ...keepTopLeft(o, sized) })]);
  }

  private singleTable(selected: SketchElement[]): TableElement | null {
    return selected.length === 1 && selected[0].type === 'table' && !selected[0].locked ? selected[0] : null;
  }

  private updateMarquee(m: Extract<Mode, { kind: 'marquee' }>, p: PointerInfo): void {
    m.current = p.world;
    const rect = normalizeBounds({
      x: m.start.x,
      y: m.start.y,
      width: m.current.x - m.start.x,
      height: m.current.y - m.start.y,
    });
    const inside = this.ctx.scene
      .getElements()
      .filter((e) => boundsContains(rect, getElementBounds(e)))
      .map((e) => e.id);
    this.ctx.setSelection([...new Set([...m.additiveBase, ...inside])]);
    this.ctx.requestRender();
  }

  onPointerUp(): void {
    const m = this.mode;
    this.mode = { kind: 'idle' };
    if (m.kind === 'marquee') this.ctx.requestRender();
    if (m.kind === 'move' && !m.moved) {
      if (m.cellClick) this.ctx.startCellEditing(m.cellClick.id, m.cellClick.row, m.cellClick.col);
      if (m.codeLineClick) this.ctx.toggleCodeLine(m.codeLineClick.id, m.codeLineClick.line);
      return;
    }
    if (m.kind !== 'idle' && m.kind !== 'marquee') this.ctx.commitHistory();
  }

  /** Double-click edits a text element, or drops a new text label on empty canvas. */
  onDoubleClick(p: PointerInfo): void {
    const hit = this.ctx.hitTest(p.world);
    if (hit) {
      if (hit.type === 'text' && !hit.locked) this.ctx.startTextEditing(hit.id);
      if (hit.type === 'code' && !hit.locked) this.ctx.startCodeEditing(hit.id);
      if (hit.type === 'table') {
        const hl = toLocal(hit, p.world);
        const cell = cellAt(hit, { x: hl.x - hit.x, y: hl.y - hit.y });
        if (cell) this.ctx.startCellEditing(hit.id, cell.row, cell.col);
      }
      return;
    }
    const style = this.ctx.getState().currentStyle;
    const lineHeight = measureText(' ', style.fontSize, style.fontFamily).height;
    const el = createText(style, { x: p.world.x, y: p.world.y - lineHeight / 2 }, this.ctx.nextZIndex());
    this.ctx.scene.upsert([el]);
    this.ctx.startTextEditing(el.id);
  }

  onDeactivate(): void {
    this.mode = { kind: 'idle' };
  }

  private updateHoverCursor(p: PointerInfo): void {
    const selected = this.ctx.getSelectedElements();
    const handle = hitHandle(selected, p.world, this.ctx.getViewport().zoom);
    if (handle) {
      const angle = getSelectionFrame(selected)?.angle ?? 0;
      this.ctx.setCursor(handle === 'tail' ? 'crosshair' : handle === 'rotate' ? 'grab' : handle.startsWith('p') ? 'pointer' : handleCursor(handle as BoxHandle, angle));
      return;
    }
    const table = this.singleTable(selected);
    if (table) {
      const zoom = this.ctx.getViewport().zoom;
      const tl = toLocal(table, p.world);
      const line = gridLineAt(table, { x: tl.x - table.x, y: tl.y - table.y }, 5 / zoom);
      if (line && line.index < (line.axis === 'col' ? table.cols : table.rows)) {
        this.ctx.setCursor(line.axis === 'col' ? 'col-resize' : 'row-resize');
        return;
      }
      if (this.ctx.hitTest(p.world)?.id === table.id) {
        this.ctx.setCursor('text');
        return;
      }
    }
    const code = selected.length === 1 && selected[0].type === 'code' ? selected[0] : null;
    const cl = code ? toLocal(code, p.world) : null;
    if (code && cl && cl.x - code.x < codeLayout(code).codeX && lineAt(code, cl.y - code.y) && this.ctx.hitTest(p.world)?.id === code.id) {
      this.ctx.setCursor('pointer'); // line numbers toggle marks
      return;
    }
    this.ctx.setCursor(this.ctx.hitTest(p.world) ? 'move' : 'default');
  }

  renderOverlay(ctx: CanvasRenderingContext2D, zoom: number): void {
    const m = this.mode;
    if (m.kind !== 'marquee') return;
    const r = normalizeBounds({
      x: m.start.x,
      y: m.start.y,
      width: m.current.x - m.start.x,
      height: m.current.y - m.start.y,
    });
    ctx.save();
    ctx.fillStyle = 'rgba(76, 110, 245, 0.08)';
    ctx.strokeStyle = 'rgba(76, 110, 245, 0.8)';
    ctx.lineWidth = 1 / zoom;
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.restore();
  }
}
