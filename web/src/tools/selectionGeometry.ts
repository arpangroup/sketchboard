import { HANDLE_SIZE } from '../core/constants';
import { expandBounds, unionBounds } from '../core/geometry';
import type { Bounds, Point, SketchElement } from '../core/types';
import { getElementBounds } from '../elements/registry';

export type BoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type HandleId = BoxHandle | `p${number}`;

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

export const HANDLE_CURSORS: Record<BoxHandle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

const SELECTION_COLOR = '#4c6ef5';

export function getSelectionBounds(els: readonly SketchElement[]): Bounds | null {
  return unionBounds(els.map(getElementBounds));
}

/** Single 2-point line/arrow: endpoints are edited directly instead of a bounding box. */
const isPointEditable = (els: readonly SketchElement[]) =>
  els.length === 1 && (els[0].type === 'line' || els[0].type === 'arrow') && els[0].points.length === 2;

export function getHandles(els: readonly SketchElement[], zoom: number): Handle[] {
  if (els.length === 0 || els.some((e) => e.locked)) return [];
  if (isPointEditable(els)) {
    const el = els[0] as Extract<SketchElement, { points: Point[] }>;
    return el.points.map((p, i) => ({ id: `p${i}` as HandleId, x: el.x + p.x, y: el.y + p.y }));
  }
  const raw = getSelectionBounds(els)!;
  const b = expandBounds(raw, 6 / zoom);
  const { x, y, width: w, height: h } = b;
  const corners: Handle[] = [
    { id: 'nw', x, y },
    { id: 'ne', x: x + w, y },
    { id: 'se', x: x + w, y: y + h },
    { id: 'sw', x, y: y + h },
  ];
  const onlyText = els.every((e) => e.type === 'text');
  const bigEnough = w * zoom > 40 && h * zoom > 40;
  if (onlyText || !bigEnough) return corners;
  return [
    ...corners,
    { id: 'n', x: x + w / 2, y },
    { id: 'e', x: x + w, y: y + h / 2 },
    { id: 's', x: x + w / 2, y: y + h },
    { id: 'w', x, y: y + h / 2 },
  ];
}

export function hitHandle(els: readonly SketchElement[], p: Point, zoom: number): HandleId | null {
  const r = (HANDLE_SIZE / zoom) * 0.9;
  for (const h of getHandles(els, zoom)) {
    if (Math.abs(p.x - h.x) <= r && Math.abs(p.y - h.y) <= r) return h.id;
  }
  return null;
}

export function drawSelection(
  ctx: CanvasRenderingContext2D,
  els: readonly SketchElement[],
  zoom: number,
  color = SELECTION_COLOR,
): void {
  if (els.length === 0) return;
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = color;

  if (!isPointEditable(els)) {
    const pad = 6 / zoom;
    if (els.length > 1) {
      // individual outlines for multi-selection
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      for (const el of els) {
        const b = expandBounds(getElementBounds(el), 3 / zoom);
        ctx.strokeRect(b.x, b.y, b.width, b.height);
      }
      ctx.setLineDash([]);
    }
    const b = expandBounds(getSelectionBounds(els)!, pad);
    ctx.strokeRect(b.x, b.y, b.width, b.height);
  }

  const size = HANDLE_SIZE / zoom;
  ctx.fillStyle = '#fff';
  for (const h of getHandles(els, zoom)) {
    ctx.beginPath();
    if (h.id.startsWith('p')) ctx.arc(h.x, h.y, size / 2, 0, Math.PI * 2);
    else ctx.roundRect(h.x - size / 2, h.y - size / 2, size, size, 2 / zoom);
    ctx.fill();
    ctx.stroke();
  }
  if (els.some((e) => e.locked)) {
    const b = getSelectionBounds(els)!;
    ctx.fillStyle = color;
    ctx.font = `${12 / zoom}px Inter, sans-serif`;
    ctx.fillText('🔒 locked', b.x, b.y - 8 / zoom);
  }
  ctx.restore();
}

/**
 * Given the handle being dragged, compute the new selection bounds.
 * `keepAspect` (Shift) preserves proportions; `fromCenter` (Alt) resizes symmetrically.
 */
export function resizeBounds(
  start: Bounds,
  handle: BoxHandle,
  p: Point,
  keepAspect: boolean,
  fromCenter: boolean,
): Bounds {
  let { x: x1, y: y1 } = start;
  let x2 = start.x + start.width;
  let y2 = start.y + start.height;
  if (handle.includes('w')) x1 = p.x;
  if (handle.includes('e')) x2 = p.x;
  if (handle.includes('n')) y1 = p.y;
  if (handle.includes('s')) y2 = p.y;

  if (fromCenter) {
    const cx = start.x + start.width / 2;
    const cy = start.y + start.height / 2;
    if (handle.includes('w')) x2 = 2 * cx - x1;
    if (handle.includes('e')) x1 = 2 * cx - x2;
    if (handle.includes('n')) y2 = 2 * cy - y1;
    if (handle.includes('s')) y1 = 2 * cy - y2;
  }

  let w = x2 - x1;
  let h = y2 - y1;
  if (keepAspect && start.width > 0 && start.height > 0) {
    const ratio = start.width / start.height;
    const isCorner = handle.length === 2;
    if (isCorner) {
      if (Math.abs(w) / ratio > Math.abs(h)) h = Math.sign(h || 1) * Math.abs(w) / ratio;
      else w = Math.sign(w || 1) * Math.abs(h) * ratio;
      if (handle.includes('w')) x1 = x2 - w;
      if (handle.includes('n')) y1 = y2 - h;
    } else if (handle === 'n' || handle === 's') {
      w = Math.abs(h) * ratio;
      x1 = start.x + (start.width - w) / 2;
    } else {
      h = Math.abs(w) / ratio;
      y1 = start.y + (start.height - h) / 2;
    }
  }
  return { x: x1, y: y1, width: w, height: h };
}
