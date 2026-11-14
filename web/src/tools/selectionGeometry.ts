import { HANDLE_SIZE } from '../core/constants';
import { expandBounds, unionBounds } from '../core/geometry';
import type { Bounds, Point, SketchElement } from '../core/types';
import { getElementBounds, getRawBounds } from '../elements/registry';
import { angleOf, bakesRotation, centerOf, rotatePoint } from '../elements/rotation';
import { tailPoint } from '../elements/handlers/figure';
import { segmentMidpoint } from '../elements/handlers/pointShapes';

export type BoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
/** `p{i}` = a line's point i; `m{i}` = the bend anchor halfway along segment i (drag to curve the line). */
export type HandleId = BoxHandle | `p${number}` | `m${number}` | 'tail' | 'rotate';

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
/** Distance (screen px) of the rotation handle above the selection box. */
const ROTATE_OFFSET = 24;

export function getSelectionBounds(els: readonly SketchElement[]): Bounds | null {
  return unionBounds(els.map(getElementBounds));
}

/**
 * The box selection handles follow: for one rotated element, its own (unrotated) box turned by
 * its angle around its centre; otherwise the axis-aligned bounds of everything selected.
 */
export interface SelectionFrame {
  box: Bounds;
  angle: number;
  pivot: Point;
}

export function getSelectionFrame(els: readonly SketchElement[]): SelectionFrame | null {
  if (els.length === 1 && !bakesRotation(els[0])) {
    const el = els[0];
    return { box: getRawBounds(el), angle: angleOf(el), pivot: centerOf(el) };
  }
  const box = getSelectionBounds(els);
  return box ? { box, angle: 0, pivot: { x: box.x + box.width / 2, y: box.y + box.height / 2 } } : null;
}

/** Single 2-point line/arrow: endpoints are edited directly instead of a bounding box. */
const isPointEditable = (els: readonly SketchElement[]) =>
  els.length === 1 && (els[0].type === 'line' || els[0].type === 'arrow') && els[0].points.length === 2;

/** A single open line / arrow: its points and bend anchors can be dragged. */
const editableLine = (els: readonly SketchElement[]) =>
  els.length === 1 && (els[0].type === 'line' || els[0].type === 'arrow') && !els[0].polygon ? els[0] : null;

/** Point handles plus one bend anchor in the middle of every segment (hidden on segments too short to grab). */
function lineHandles(el: Extract<SketchElement, { type: 'line' | 'arrow' }>, zoom: number): Handle[] {
  const out: Handle[] = el.points.map((p, i) => ({ id: `p${i}` as HandleId, x: el.x + p.x, y: el.y + p.y }));
  for (let i = 0; i + 1 < el.points.length; i++) {
    const a = el.points[i];
    const b = el.points[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) * zoom < HANDLE_SIZE * 3) continue;
    const m = segmentMidpoint(el, i);
    out.push({ id: `m${i}` as HandleId, x: el.x + m.x, y: el.y + m.y });
  }
  return out;
}

export function getHandles(els: readonly SketchElement[], zoom: number): Handle[] {
  if (els.length === 0 || els.some((e) => e.locked)) return [];
  const line = editableLine(els);
  if (isPointEditable(els)) return lineHandles(line!, zoom);
  const points = line ? lineHandles(line, zoom) : [];
  const frame = getSelectionFrame(els)!;
  const b = expandBounds(frame.box, 6 / zoom);
  const { x, y, width: w, height: h } = b;
  const local: Handle[] = [
    { id: 'rotate', x: x + w / 2, y: y - ROTATE_OFFSET / zoom },
    { id: 'nw', x, y },
    { id: 'ne', x: x + w, y },
    { id: 'se', x: x + w, y: y + h },
    { id: 'sw', x, y: y + h },
  ];
  // a single callout also gets a handle on its tail tip
  const tail = els.length === 1 && els[0].type === 'figure' ? tailPoint(els[0]) : null;
  if (tail) local.unshift({ id: 'tail', x: tail.x, y: tail.y });
  const onlyText = els.every((e) => e.type === 'text');
  const bigEnough = w * zoom > 40 && h * zoom > 40;
  if (!onlyText && bigEnough) {
    local.push(
      { id: 'n', x: x + w / 2, y },
      { id: 'e', x: x + w, y: y + h / 2 },
      { id: 's', x: x + w / 2, y: y + h },
      { id: 'w', x, y: y + h / 2 },
    );
  }
  // a multi-point line keeps its box (resize / rotate) and also shows its points and bend anchors (checked first)
  return [...points, ...local.map((hd) => ({ ...hd, ...rotatePoint(hd, frame.pivot, frame.angle) }))];
}

export function hitHandle(els: readonly SketchElement[], p: Point, zoom: number): HandleId | null {
  const r = (HANDLE_SIZE / zoom) * 0.9;
  for (const h of getHandles(els, zoom)) {
    if (Math.abs(p.x - h.x) <= r && Math.abs(p.y - h.y) <= r) return h.id;
  }
  return null;
}

/** Resize cursor for a handle, turned with the selection (so a 90°-rotated box shows ↔ on its top edge). */
export function handleCursor(id: BoxHandle, angle: number): string {
  if (!angle) return HANDLE_CURSORS[id];
  const order: BoxHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const steps = Math.round(angle / (Math.PI / 4));
  return HANDLE_CURSORS[order[(((order.indexOf(id) + steps) % 8) + 8) % 8]];
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

  const frame = getSelectionFrame(els);
  if (!isPointEditable(els) && frame) {
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
    const b = expandBounds(frame.box, pad);
    ctx.save();
    ctx.translate(frame.pivot.x, frame.pivot.y);
    ctx.rotate(frame.angle);
    ctx.translate(-frame.pivot.x, -frame.pivot.y);
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    if (!els.some((e) => e.locked)) {
      // stem of the rotation handle
      ctx.beginPath();
      ctx.moveTo(b.x + b.width / 2, b.y);
      ctx.lineTo(b.x + b.width / 2, b.y - (ROTATE_OFFSET - HANDLE_SIZE / 2) / zoom);
      ctx.stroke();
    }
    ctx.restore();
  }

  const size = HANDLE_SIZE / zoom;
  ctx.fillStyle = '#fff';
  for (const h of getHandles(els, zoom)) {
    ctx.beginPath();
    if (h.id === 'tail') {
      // yellow diamond, like the adjustment handle in office apps
      const r = size * 0.7;
      ctx.moveTo(h.x, h.y - r);
      ctx.lineTo(h.x + r, h.y);
      ctx.lineTo(h.x, h.y + r);
      ctx.lineTo(h.x - r, h.y);
      ctx.closePath();
      ctx.fillStyle = '#ffd43b';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      continue;
    }
    if (h.id.startsWith('m')) {
      // bend anchor: small, filled, softer than a point handle
      ctx.arc(h.x, h.y, size * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      continue;
    }
    if (h.id === 'rotate' || h.id.startsWith('p')) ctx.arc(h.x, h.y, (h.id === 'rotate' ? size * 0.62 : size / 2), 0, Math.PI * 2);
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
