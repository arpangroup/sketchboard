import type { ArrowBinding, LinearElement, Point, SketchElement } from '../core/types';
import { absolutePoints, pointsToElementGeometry } from './handlers/pointShapes';
import { toLocal, toWorld } from './rotation';

/**
 * Arrow binding ("connectors"): an arrow or line end can be attached to a shape. The binding stores
 * which shape and an *anchor* — a spot in the shape's own box as fractions of its width and height.
 * Whenever the shape moves, resizes or turns, the end is recomputed: it aims at the anchor and stops
 * on the shape's outline (with a small gap), so arrows follow their shapes without re-drawing.
 *
 * Anchor {0.5, 0.5} (the centre) means "aim at the middle": the end then slides around the outline
 * as the shapes move, always taking the short way. Dropping an end near an edge pins it to that spot.
 */

/** Element types an arrow end can attach to. */
const BINDABLE = new Set<SketchElement['type']>(['rectangle', 'diamond', 'ellipse', 'figure', 'image', 'text', 'table', 'code', 'math']);

export const canBindTo = (el: SketchElement): boolean =>
  BINDABLE.has(el.type) && !el.isDeleted && !(el.type === 'text' && el.containerId);

/** Space left between an arrow's end and the shape outline (world px). */
export const BIND_GAP = 4;
/** How close (screen px) an end must come to a shape to attach. */
export const BIND_DISTANCE = 12;
/** Ends dropped this far inside a shape (fraction of its box, from each edge) aim at its centre. */
const CENTRE_ZONE = 0.22;

/** Is a world point inside the shape's outline (box, ellipse or diamond), turned with the shape? */
export function insideShape(el: SketchElement, world: Point, pad = 0): boolean {
  const p = toLocal(el, world);
  const hw = el.width / 2 + pad;
  const hh = el.height / 2 + pad;
  if (hw <= 0 || hh <= 0) return false;
  const nx = (p.x - (el.x + el.width / 2)) / hw;
  const ny = (p.y - (el.y + el.height / 2)) / hh;
  if (el.type === 'ellipse') return nx * nx + ny * ny <= 1;
  if (el.type === 'diamond') return Math.abs(nx) + Math.abs(ny) <= 1;
  return Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
}

/** Topmost shape an end at `world` would attach to (within `tolerance` world units of it). */
export function bindableAt(all: readonly SketchElement[], world: Point, tolerance: number, exclude: ReadonlySet<string>): SketchElement | null {
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i];
    if (!exclude.has(el.id) && canBindTo(el) && insideShape(el, world, tolerance)) return el;
  }
  return null;
}

/** Anchor for an end dropped at `world` on `el`: the centre if well inside, else that exact spot. */
export function anchorFor(el: SketchElement, world: Point): Point {
  const p = toLocal(el, world);
  const ax = el.width ? (p.x - el.x) / el.width : 0.5;
  const ay = el.height ? (p.y - el.y) / el.height : 0.5;
  const inner = (v: number) => v > CENTRE_ZONE && v < 1 - CENTRE_ZONE;
  if (inner(ax) && inner(ay)) return { x: 0.5, y: 0.5 };
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return { x: clamp(ax), y: clamp(ay) };
}

/** World position of an anchor on its shape. */
export const anchorPoint = (el: SketchElement, anchor: Point): Point =>
  toWorld(el, { x: el.x + anchor.x * el.width, y: el.y + anchor.y * el.height });

/**
 * Where an end coming from `from` and aiming at `target` meets the shape's outline, pulled back by `gap`.
 * Coming from inside the shape (overlapping shapes) there is no outline to stop at: the target is used.
 */
export function edgePoint(el: SketchElement, from: Point, target: Point, gap = BIND_GAP): Point {
  if (insideShape(el, from) || !insideShape(el, target)) return target;
  let lo = 0; // outside
  let hi = 1; // inside
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const p = { x: from.x + (target.x - from.x) * mid, y: from.y + (target.y - from.y) * mid };
    if (insideShape(el, p)) hi = mid;
    else lo = mid;
  }
  const len = Math.hypot(target.x - from.x, target.y - from.y) || 1;
  const t = Math.max(0, lo - gap / len);
  return { x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t };
}

type Lookup = (id: string) => SketchElement | undefined;

const liveTarget = (b: ArrowBinding | undefined, get: Lookup): SketchElement | null => {
  const el = b ? get(b.elementId) : undefined;
  return el && !el.isDeleted ? el : null;
};

/**
 * New geometry for an arrow whose bound shapes may have moved, or null if nothing changes.
 * Only the bound ends move; any bends in between stay where they are.
 */
export function boundArrowGeometry(arrow: LinearElement, get: Lookup): Partial<LinearElement> | null {
  const start = liveTarget(arrow.startBinding, get);
  const end = liveTarget(arrow.endBinding, get);
  if ((!start && !end) || arrow.points.length < 2) return null;
  const pts = absolutePoints(arrow);
  const n = pts.length;
  const startAim = start ? anchorPoint(start, arrow.startBinding!.anchor) : null;
  const endAim = end ? anchorPoint(end, arrow.endBinding!.anchor) : null;
  // a straight arrow aims each end from the other end's anchor; a bent one from its nearest bend
  const fromForStart = n === 2 ? (endAim ?? pts[1]) : pts[1];
  const fromForEnd = n === 2 ? (startAim ?? pts[0]) : pts[n - 2];
  if (start && startAim) pts[0] = edgePoint(start, fromForStart, startAim);
  if (end && endAim) pts[n - 1] = edgePoint(end, fromForEnd, endAim);
  const before = absolutePoints(arrow);
  const moved = pts.some((p, i) => Math.abs(p.x - before[i].x) > 0.01 || Math.abs(p.y - before[i].y) > 0.01);
  return moved ? (pointsToElementGeometry(pts) as Partial<LinearElement>) : null;
}

/** Arrows / lines among `all` with an end bound to any of `ids`. */
export const arrowsBoundTo = (all: readonly SketchElement[], ids: ReadonlySet<string>): LinearElement[] =>
  all.filter(
    (e): e is LinearElement =>
      (e.type === 'arrow' || e.type === 'line') &&
      ((!!e.startBinding && ids.has(e.startBinding.elementId)) || (!!e.endBinding && ids.has(e.endBinding.elementId))),
  );
