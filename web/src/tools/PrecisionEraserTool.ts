import type { Point, SketchElement } from '../core/types';
import { updateElement } from '../elements/factory';
import { eraseFromStroke, isPartiallyErasable } from '../elements/partialErase';
import type { PointerInfo, Tool, ToolContext } from './Tool';

/**
 * Precision eraser: rubs out only the part of pen / highlighter strokes and lines that the
 * eraser disc touches, splitting strokes in two where you cut through the middle.
 * The whole gesture is a single undo step.
 */
export class PrecisionEraserTool implements Tool {
  readonly type = 'precisionEraser' as const;
  readonly cursor = 'none';
  private last: Point | null = null;
  private hover: Point | null = null;
  private changed = false;
  private touchedOther = false;

  constructor(private ctx: ToolContext) {}

  /** Eraser radius in world units (the size setting is in screen pixels). */
  private radius(): number {
    return this.ctx.getState().eraser.size / this.ctx.getViewport().zoom;
  }

  onPointerDown(p: PointerInfo): void {
    this.last = p.world;
    this.hover = p.world;
    this.changed = false;
    this.touchedOther = false;
    this.erase(p.world, p.world);
  }

  onPointerMove(p: PointerInfo, isDown: boolean): void {
    this.hover = p.world;
    if (isDown && this.last) {
      this.erase(this.last, p.world);
      this.last = p.world;
    }
    this.ctx.requestRender();
  }

  onPointerUp(): void {
    this.last = null;
    if (this.changed) this.ctx.commitHistory();
    else if (this.touchedOther) this.ctx.toast('The precision eraser works on pen, highlighter and lines — use the stroke eraser for shapes and text');
    this.changed = false;
  }

  onCancel(): void {
    this.onPointerUp();
  }

  onDeactivate(): void {
    this.hover = null;
    this.ctx.requestRender();
  }

  private erase(a: Point, b: Point): void {
    const r = this.radius();
    const updates: SketchElement[] = [];
    for (const el of this.ctx.scene.getElements()) {
      if (!isPartiallyErasable(el)) continue;
      const pieces = eraseFromStroke(el, a, b, r);
      if (!pieces) continue;
      updates.push(updateElement(el, { isDeleted: true }), ...pieces);
    }
    if (updates.length) {
      this.ctx.scene.upsert(updates);
      this.changed = true;
    } else if (!this.touchedOther) {
      const hit = this.ctx.hitTest(b);
      if (hit && !isPartiallyErasable(hit)) this.touchedOther = true;
    }
  }

  renderOverlay(ctx: CanvasRenderingContext2D, zoom: number): void {
    if (!this.hover) return;
    const r = this.radius();
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.hover.x, this.hover.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeStyle = 'rgba(73, 80, 87, 0.85)';
    ctx.stroke();
    ctx.restore();
  }
}
