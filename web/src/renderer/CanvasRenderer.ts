import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import { boundsIntersect, expandBounds } from '../core/geometry';
import type { Bounds, ColorMode, Collaborator, PageSetup, SketchElement, Viewport } from '../core/types';
import { getElementBounds } from '../elements/registry';
import { getPageDimensions } from '../page/pageSizes';
import { type PageDecoration, pageRects } from '../page/pageLayout';
import { getColorTransformer } from './colorModes';
import { drawElement } from './drawElement';

export interface RenderState {
  elements: readonly SketchElement[];
  viewport: Viewport;
  /** Canvas size in CSS pixels */
  width: number;
  height: number;
  dpr: number;
  pageSetup: PageSetup;
  colorMode: ColorMode;
  gridEnabled: boolean;
  hiddenIds?: ReadonlySet<string>;
  fadedIds?: ReadonlySet<string>;
  collaborators?: readonly Collaborator[];
  /** Number of pages in the document (page layouts only). */
  pageCount?: number;
  /** Header / footer / page-number text, world coordinates. */
  decorations?: readonly PageDecoration[];
  /** Tool/selection overlay drawn in world space. */
  overlay?: (ctx: CanvasRenderingContext2D, zoom: number) => void;
}

const DESK_COLOR = '#e9ecef';
const PAPER_COLOR = '#ffffff';
const GRID_SIZE = 20;

/** Draws header/footer text (shared by the board view and PNG export). */
export function drawDecorations(ctx: CanvasRenderingContext2D, items: readonly PageDecoration[], color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  for (const d of items) {
    ctx.font = `${d.fontSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = d.align;
    ctx.fillText(d.text, d.x, d.y);
  }
  ctx.restore();
}

/** Converts screen (CSS px) coordinates to world coordinates. */
export const screenToWorld = (sx: number, sy: number, v: Viewport) => ({
  x: sx / v.zoom - v.scrollX,
  y: sy / v.zoom - v.scrollY,
});

export const worldToScreen = (wx: number, wy: number, v: Viewport) => ({
  x: (wx + v.scrollX) * v.zoom,
  y: (wy + v.scrollY) * v.zoom,
});

export const visibleWorldBounds = (v: Viewport, width: number, height: number): Bounds => ({
  x: -v.scrollX,
  y: -v.scrollY,
  width: width / v.zoom,
  height: height / v.zoom,
});

/**
 * Renders the interactive scene. Pure function of RenderState (no editor knowledge), so it
 * can be driven from anywhere and is trivially swappable (e.g. for a WebGL renderer).
 */
export class CanvasRenderer {
  private rc: RoughCanvas;
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.rc = rough.canvas(canvas);
  }

  render(s: RenderState): void {
    const { ctx, canvas } = this;
    const pw = Math.floor(s.width * s.dpr);
    const ph = Math.floor(s.height * s.dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const transformer = getColorTransformer(s.colorMode);
    const v = s.viewport;
    const page = getPageDimensions(s.pageSetup);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = page ? DESK_COLOR : transformer.background(PAPER_COLOR);
    ctx.fillRect(0, 0, pw, ph);

    // world transform
    ctx.setTransform(s.dpr * v.zoom, 0, 0, s.dpr * v.zoom, s.dpr * v.zoom * v.scrollX, s.dpr * v.zoom * v.scrollY);
    const visible = visibleWorldBounds(v, s.width, s.height);

    if (page) {
      const paper = transformer.background(PAPER_COLOR);
      for (const rect of pageRects(s.pageSetup, s.pageCount ?? 1)) {
        if (boundsIntersect(rect, visible)) this.drawPage(page, rect, v.zoom, paper);
      }
      if (s.decorations?.length) drawDecorations(this.ctx, s.decorations, s.colorMode === 'color' ? '#868e96' : '#495057');
    }
    if (s.gridEnabled) this.drawGrid(visible, v.zoom);

    for (const el of s.elements) {
      if (s.hiddenIds?.has(el.id)) continue;
      const b = expandBounds(getElementBounds(el), el.strokeWidth + 30);
      if (!boundsIntersect(b, visible)) continue; // viewport culling
      drawElement(ctx, this.rc, el, s.colorMode, s.fadedIds?.has(el.id) ? 0.25 : 1);
    }

    s.overlay?.(ctx, v.zoom);

    if (s.collaborators?.length) {
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      for (const c of s.collaborators) if (c.pointer) this.drawPointer(c, v);
    }
  }

  private drawPage(
    page: NonNullable<ReturnType<typeof getPageDimensions>>,
    rect: Bounds,
    zoom: number,
    paper: string,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(rect.x, rect.y);
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 16 * zoom;
    ctx.shadowOffsetY = 4 * zoom;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, page.widthPx, page.heightPx);
    ctx.restore();

    // printable-area guide
    ctx.save();
    ctx.strokeStyle = 'rgba(25, 113, 194, 0.35)';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([6 / zoom, 6 / zoom]);
    const m = page.margins;
    ctx.translate(rect.x, rect.y);
    ctx.strokeRect(m.left, m.top, page.widthPx - m.left - m.right, page.heightPx - m.top - m.bottom);
    ctx.restore();
  }

  private drawGrid(visible: Bounds, zoom: number): void {
    if (zoom < 0.3) return;
    const { ctx } = this;
    ctx.save();
    ctx.lineWidth = 1 / zoom;
    const startX = Math.floor(visible.x / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(visible.y / GRID_SIZE) * GRID_SIZE;
    ctx.beginPath();
    for (let x = startX; x < visible.x + visible.width; x += GRID_SIZE) {
      ctx.moveTo(x, visible.y);
      ctx.lineTo(x, visible.y + visible.height);
    }
    for (let y = startY; y < visible.y + visible.height; y += GRID_SIZE) {
      ctx.moveTo(visible.x, y);
      ctx.lineTo(visible.x + visible.width, y);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.stroke();
    ctx.restore();
  }

  private drawPointer(c: Collaborator, v: Viewport): void {
    const { ctx } = this;
    const p = { x: (c.pointer!.x + v.scrollX) * v.zoom, y: (c.pointer!.y + v.scrollY) * v.zoom };
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = c.color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(4.5, 12);
    ctx.lineTo(11, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const label = c.username || 'Guest';
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(10, 16, w, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 16, 30);
    ctx.restore();
  }
}
