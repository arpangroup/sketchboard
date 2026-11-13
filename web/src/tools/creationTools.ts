import { distance, normalizeBounds, simplifyPath, snapAngle } from '../core/geometry';
import type { FigureElement, FreeDrawElement, LinearElement, Point, ShapeElement, SketchElement, TableElement } from '../core/types';
import { createFigure, createFreeDraw, createLinear, createShape, createTable, createText, updateElement } from '../elements/factory';
import { getFigure } from '../elements/figures/figures';
import { relayout } from '../elements/table/tableLayout';
import { recognizeShape } from '../elements/shapeRecognition';
import { pointsToElementGeometry } from '../elements/handlers/pointShapes';
import { measureText } from '../elements/textMetrics';
import { EMPTY_SET, type PointerInfo, type Tool, type ToolContext } from './Tool';

/** Draw-to-shape ignores strokes smaller than this on screen (keeps handwriting as ink). */
const MIN_SHAPE_SCREEN_PX = 70;

/** Minimum drag distance (screen px) before a shape is created - avoids accidental dots. */
const CREATE_THRESHOLD = 3;

/**
 * Template for drag-to-create tools. Subclasses implement `create` and `update`;
 * this base handles thresholds, gesture lifecycle and protection from remote edits.
 */
abstract class DragCreateTool<T extends SketchElement> implements Tool {
  abstract readonly type: Tool['type'];
  readonly cursor = 'crosshair';
  protected origin: Point | null = null;
  protected elementId: string | null = null;

  constructor(protected ctx: ToolContext) {}

  activeIds(): ReadonlySet<string> {
    return this.elementId ? new Set([this.elementId]) : EMPTY_SET;
  }

  onPointerDown(p: PointerInfo): void {
    this.origin = p.world;
    this.elementId = null;
    this.ctx.setSelection([]);
  }

  onPointerMove(p: PointerInfo, isDown: boolean): void {
    if (!isDown || !this.origin) return;
    if (!this.elementId) {
      if (distance(p.screen, this.toScreen(this.origin)) < CREATE_THRESHOLD) return;
      const el = this.create(this.origin);
      this.elementId = el.id;
      this.ctx.scene.upsert([el]);
    }
    const current = this.ctx.scene.getElement(this.elementId) as T | undefined;
    if (!current) return;
    this.ctx.scene.upsert([updateElement(current, this.update(current, this.origin, p))]);
  }

  onPointerUp(_p?: PointerInfo): void {
    const id = this.elementId;
    this.origin = null;
    this.elementId = null;
    const el = id && this.ctx.scene.getElement(id);
    if (el) this.ctx.finishCreation(el);
  }

  private toScreen(w: Point): Point {
    const v = this.ctx.getViewport();
    return { x: (w.x + v.scrollX) * v.zoom, y: (w.y + v.scrollY) * v.zoom };
  }

  protected abstract create(at: Point): T;
  protected abstract update(el: T, origin: Point, p: PointerInfo): Partial<T>;
}

export class ShapeTool extends DragCreateTool<ShapeElement> {
  constructor(
    ctx: ToolContext,
    readonly type: ShapeElement['type'],
  ) {
    super(ctx);
  }

  protected create(at: Point): ShapeElement {
    return createShape(this.type, this.ctx.getState().currentStyle, at, this.ctx.nextZIndex());
  }

  protected update(_el: ShapeElement, o: Point, p: PointerInfo): Partial<ShapeElement> {
    let w = p.world.x - o.x;
    let h = p.world.y - o.y;
    if (p.shiftKey) {
      const s = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * s;
      h = Math.sign(h || 1) * s;
    }
    if (p.altKey) return normalizeBounds({ x: o.x - w, y: o.y - h, width: w * 2, height: h * 2 });
    return normalizeBounds({ x: o.x, y: o.y, width: w, height: h });
  }
}

/** Gallery shapes: drag to size (Shift keeps proportions, Alt draws from the centre) or click to drop one. */
export class FigureTool extends DragCreateTool<FigureElement> {
  readonly type = 'figure' as const;

  protected create(at: Point): FigureElement {
    const s = this.ctx.getState();
    return createFigure(s.currentFigure, s.currentStyle, at, this.ctx.nextZIndex());
  }

  protected update(_el: FigureElement, o: Point, p: PointerInfo): Partial<FigureElement> {
    let w = p.world.x - o.x;
    let h = p.world.y - o.y;
    if (p.shiftKey) {
      const ratio = getFigure(this.ctx.getState().currentFigure)?.ratio ?? 1;
      const s = Math.max(Math.abs(w), Math.abs(h) * ratio);
      w = Math.sign(w || 1) * s;
      h = Math.sign(h || 1) * (s / ratio);
    }
    const b = p.altKey ? normalizeBounds({ x: o.x - w, y: o.y - h, width: w * 2, height: h * 2 }) : normalizeBounds({ x: o.x, y: o.y, width: w, height: h });
    return b;
  }

  onPointerUp(p?: PointerInfo): void {
    if (!this.elementId && this.origin && p) {
      // a click: drop the shape at its natural proportions, centred on the pointer
      const ratio = getFigure(this.ctx.getState().currentFigure)?.ratio ?? 1;
      const h = 110 / Math.sqrt(ratio);
      const w = h * ratio;
      const el = { ...this.create(this.origin), x: p.world.x - w / 2, y: p.world.y - h / 2, width: w, height: h };
      this.ctx.scene.upsert([el]);
      this.origin = null;
      this.ctx.finishCreation(el);
      return;
    }
    super.onPointerUp();
  }
}

export class LinearTool extends DragCreateTool<LinearElement> {
  constructor(
    ctx: ToolContext,
    readonly type: LinearElement['type'],
  ) {
    super(ctx);
  }

  protected create(at: Point): LinearElement {
    return createLinear(this.type, this.ctx.getState().currentStyle, at, this.ctx.nextZIndex());
  }

  protected update(_el: LinearElement, o: Point, p: PointerInfo): Partial<LinearElement> {
    const end = p.shiftKey ? snapAngle(o, p.world) : p.world;
    return pointsToElementGeometry([o, end]);
  }
}

/**
 * Ink tool for the pen (pressure-sensitive) and the highlighter.
 * Works with mouse, finger and stylus (Apple Pencil, S Pen, Surface Pen, Wacom); real pen
 * pressure is recorded per point, other devices get simulated pressure.
 * The tool stays active after each stroke, like a real pen.
 */
export class InkTool implements Tool {
  readonly cursor = 'crosshair';
  private elementId: string | null = null;
  private points: Point[] = [];
  private pressures: number[] = [];
  private hasRealPressure = false;

  constructor(
    private ctx: ToolContext,
    readonly type: 'freedraw' | 'highlighter',
  ) {}

  activeIds(): ReadonlySet<string> {
    return this.elementId ? new Set([this.elementId]) : EMPTY_SET;
  }

  onPointerDown(p: PointerInfo): void {
    if (this.elementId) this.onPointerUp(); // never orphan an unfinished stroke
    this.ctx.setSelection([]);
    const kind = this.type === 'highlighter' ? 'highlighter' : 'pen';
    const el = createFreeDraw(this.ctx.getState().currentStyle, p.world, this.ctx.nextZIndex(), kind);
    this.elementId = el.id;
    // Only pens report meaningful pressure; mouse reports a constant 0.5, touch often 0 or 1.
    this.hasRealPressure = p.pointerType === 'pen' && p.pressure > 0;
    this.points = [p.world];
    this.pressures = [this.normPressure(p)];
    this.ctx.scene.upsert([el]);
  }

  onPointerMove(p: PointerInfo, isDown: boolean): void {
    if (!isDown || !this.elementId) return;
    const last = this.points[this.points.length - 1];
    // high-rate stylus input: keep points ~0.75 screen px apart
    if (distance(last, p.world) * this.ctx.getViewport().zoom < 0.75) return;
    this.points.push(p.world);
    this.pressures.push(this.normPressure(p));
    this.write(this.points, this.pressures);
  }

  onPointerUp(): void {
    if (!this.elementId) return;
    const raw = this.points;
    let pts = this.points;
    let pressures = this.pressures;
    if (!this.hasRealPressure) {
      // no pressure data to keep aligned → simplify freely
      pts = simplifyPath(this.points, 0.4 / this.ctx.getViewport().zoom);
      pressures = [];
    }
    this.write(pts, pressures);
    const el = this.ctx.scene.getElement(this.elementId) as FreeDrawElement | undefined;
    this.elementId = null;
    this.points = [];
    this.pressures = [];
    if (!el) return;
    this.ctx.commitHistory();
    if (el.kind === 'pen' && this.ctx.getState().shapeRecognition) this.tryConvertToShape(el, raw);
  }

  onDeactivate(): void {
    if (this.elementId) this.onPointerUp();
  }

  onCancel(): void {
    const el = this.elementId ? this.ctx.scene.getElement(this.elementId) : undefined;
    if (el) this.ctx.scene.upsert([updateElement(el, { isDeleted: true })]); // never committed → no undo entry
    this.elementId = null;
    this.points = [];
    this.pressures = [];
  }

  private normPressure(p: PointerInfo): number {
    if (!this.hasRealPressure) return 0.5;
    return Math.max(0.05, Math.min(1, p.pressure));
  }

  private write(abs: Point[], pressures: number[]): void {
    const current = this.ctx.scene.getElement(this.elementId!) as FreeDrawElement | undefined;
    if (!current) return;
    this.ctx.scene.upsert([updateElement(current, { ...pointsToElementGeometry(abs), pressures })]);
  }

  /** "Draw to shape": swap a shape-like stroke for a clean shape (undo restores the ink). */
  private tryConvertToShape(stroke: FreeDrawElement, abs: Point[]): void {
    // Only sizeable strokes: handwriting ("o", "l", "-") must stay ink.
    const zoom = this.ctx.getViewport().zoom;
    const shape = recognizeShape(abs, MIN_SHAPE_SCREEN_PX / zoom);
    if (!shape) return;
    const style = {
      ...this.ctx.getState().currentStyle,
      strokeColor: stroke.strokeColor,
      strokeWidth: stroke.strokeWidth,
      opacity: stroke.opacity,
      backgroundColor: 'transparent',
    };
    const z = stroke.zIndex;
    let created: SketchElement;
    if (shape.type === 'line') {
      created = { ...createLinear('line', style, shape.from, z), ...pointsToElementGeometry([shape.from, shape.to]) };
    } else if (shape.type === 'triangle') {
      const pts = [...shape.points, shape.points[0]];
      created = { ...createLinear('line', style, pts[0], z), ...pointsToElementGeometry(pts), polygon: true };
    } else {
      created = { ...createShape(shape.type, style, shape.bounds, z), ...shape.bounds };
    }
    this.ctx.scene.upsert([updateElement(stroke, { isDeleted: true }), created]);
    this.ctx.commitHistory();
    this.ctx.toast(`Converted to ${shape.type} — undo to keep your ink`);
  }
}

/**
 * Laser pointer: a fading red trail for presenting / pointing things out to collaborators.
 * Nothing is added to the drawing.
 */
export class LaserTool implements Tool {
  readonly type = 'laser' as const;
  readonly cursor = 'crosshair';

  constructor(private ctx: ToolContext) {}

  onPointerDown(p: PointerInfo): void {
    this.ctx.emitLaser(p.world, true);
  }

  onPointerMove(p: PointerInfo, isDown: boolean): void {
    if (isDown) this.ctx.emitLaser(p.world, false);
  }

  onPointerUp(): void {
    this.ctx.releaseLaser();
  }

  onCancel(): void {
    this.ctx.releaseLaser();
  }

  onDeactivate(): void {
    this.ctx.releaseLaser();
  }
}

export class TextTool implements Tool {
  readonly type = 'text' as const;
  readonly cursor = 'text';

  constructor(private ctx: ToolContext) {}

  onPointerDown(p: PointerInfo): void {
    const hit = this.ctx.hitTest(p.world);
    if (hit?.type === 'text' && !hit.locked) {
      this.ctx.startTextEditing(hit.id);
      return;
    }
    const style = this.ctx.getState().currentStyle;
    const lineHeight = measureText(' ', style.fontSize, style.fontFamily).height;
    const el = createText(style, { x: p.world.x, y: p.world.y - lineHeight / 2 }, this.ctx.nextZIndex());
    this.ctx.scene.upsert([el]);
    this.ctx.startTextEditing(el.id);
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}

export class EraserTool implements Tool {
  readonly type = 'eraser' as const;
  readonly cursor = 'cell';
  private erasing = new Set<string>();
  private trail: Point[] = [];

  constructor(private ctx: ToolContext) {}

  fadedIds(): ReadonlySet<string> {
    return this.erasing;
  }

  onPointerDown(p: PointerInfo): void {
    this.erasing = new Set();
    this.trail = [p.world];
    this.collect(p.world);
  }

  onPointerMove(p: PointerInfo, isDown: boolean): void {
    if (!isDown) return;
    const last = this.trail[this.trail.length - 1];
    // sample along the segment so fast strokes don't skip thin elements
    const steps = Math.max(1, Math.ceil(distance(last, p.world) / (4 / this.ctx.getViewport().zoom)));
    for (let i = 1; i <= steps; i++) {
      this.collect({ x: last.x + ((p.world.x - last.x) * i) / steps, y: last.y + ((p.world.y - last.y) * i) / steps });
    }
    this.trail.push(p.world);
    if (this.trail.length > 12) this.trail.shift();
    this.ctx.requestRender();
  }

  onPointerUp(): void {
    const updates = [...this.erasing]
      .map((id) => this.ctx.scene.getElement(id))
      .filter((e): e is SketchElement => !!e && !e.locked)
      .map((e) => updateElement(e, { isDeleted: true }));
    this.erasing = new Set();
    this.trail = [];
    if (updates.length) {
      this.ctx.scene.upsert(updates);
      this.ctx.commitHistory();
    }
    this.ctx.requestRender();
  }

  private collect(p: Point): void {
    const hit = this.ctx.hitTest(p);
    if (hit && !this.erasing.has(hit.id)) {
      this.erasing = new Set(this.erasing).add(hit.id);
    }
  }

  renderOverlay(ctx: CanvasRenderingContext2D, zoom: number): void {
    if (this.trail.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(134, 142, 150, 0.5)';
    ctx.lineWidth = 6 / zoom;
    ctx.lineCap = 'round';
    ctx.beginPath();
    this.trail.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.stroke();
    ctx.restore();
  }
}

export class HandTool implements Tool {
  readonly type = 'hand' as const;
  readonly cursor = 'grab';
  private last: Point | null = null;

  constructor(private ctx: ToolContext) {}

  onPointerDown(p: PointerInfo): void {
    this.last = p.screen;
    this.ctx.setCursor('grabbing');
  }

  onPointerMove(p: PointerInfo, isDown: boolean): void {
    if (!isDown || !this.last) return;
    this.ctx.panBy(p.screen.x - this.last.x, p.screen.y - this.last.y);
    this.last = p.screen;
  }

  onPointerUp(): void {
    this.last = null;
    this.ctx.setCursor(this.cursor);
  }
}

/**
 * Table tool: drag to size a table, or click for a default-sized one. Rows × columns come from the
 * table defaults in the properties panel. Editing starts in the first cell straight away.
 */
export class TableTool implements Tool {
  readonly type = 'table' as const;
  readonly cursor = 'crosshair';
  private origin: Point | null = null;
  private elementId: string | null = null;

  constructor(private ctx: ToolContext) {}

  activeIds(): ReadonlySet<string> {
    return this.elementId ? new Set([this.elementId]) : EMPTY_SET;
  }

  onPointerDown(p: PointerInfo): void {
    this.origin = p.world;
    this.elementId = null;
    this.ctx.setSelection([]);
  }

  onPointerMove(p: PointerInfo, isDown: boolean): void {
    if (!isDown || !this.origin) return;
    const zoom = this.ctx.getViewport().zoom;
    const b = normalizeBounds({ x: this.origin.x, y: this.origin.y, width: p.world.x - this.origin.x, height: p.world.y - this.origin.y });
    if (!this.elementId) {
      if (Math.hypot(b.width, b.height) * zoom < 6) return;
      const el = this.create(b);
      this.elementId = el.id;
      this.ctx.scene.upsert([el]);
      return;
    }
    const current = this.ctx.scene.getElement(this.elementId) as TableElement | undefined;
    if (!current) return;
    const w = Math.max(current.cols * 24, b.width);
    const h = Math.max(current.rows * 20, b.height);
    const next: TableElement = {
      ...current,
      x: b.x,
      y: b.y,
      colWidths: Array(current.cols).fill(w / current.cols),
      rowHeights: Array(current.rows).fill(h / current.rows),
    };
    this.ctx.scene.upsert([updateElement(current, { ...next, ...relayout(next) })]);
  }

  onPointerUp(): void {
    if (!this.origin) return;
    let el = this.elementId ? this.ctx.scene.getElement(this.elementId) : undefined;
    if (!el) {
      const d = this.ctx.getState().tableDefaults;
      el = this.create({ x: this.origin.x, y: this.origin.y, width: d.cols * 150, height: d.rows * 44 });
      this.ctx.scene.upsert([el]);
    }
    this.origin = null;
    this.elementId = null;
    this.ctx.finishCreation(el);
    this.ctx.startCellEditing(el.id, 0, 0);
  }

  private create(b: { x: number; y: number; width: number; height: number }): TableElement {
    const s = this.ctx.getState();
    return createTable(s.currentStyle, s.tableDefaults, { ...b, width: Math.max(b.width, 48), height: Math.max(b.height, 40) }, this.ctx.nextZIndex());
  }
}
