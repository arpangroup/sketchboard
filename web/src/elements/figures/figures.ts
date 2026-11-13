import type { Point } from '../../core/types';
import { PathBuilder } from './PathBuilder';

/**
 * Catalogue of figure shapes (callouts, stars, block arrows, flowchart symbols…).
 * Every figure is a function of its box size (w × h) — and, for callouts, the tail point —
 * producing a fillable outline plus optional stroke-only detail lines. Adding a shape = one entry.
 */
export type FigureCategory = 'Basic shapes' | 'Stars' | 'Block arrows' | 'Callouts' | 'Flowchart';

export interface FigureDef {
  id: string;
  label: string;
  category: FigureCategory;
  /** Default width / height when placed with a click. */
  ratio?: number;
  /** Callouts: default tail position, relative to the box (0..1 inside, beyond = outside). */
  tail?: Point;
  build(w: number, h: number, tail: Point | undefined): { outline: PathBuilder; details?: PathBuilder };
}

export interface FigureGeometry {
  /** Closed, fillable outline (one or more closed subpaths). */
  outline: string;
  /** Stroke-only decoration ('' when none). */
  details: string;
  /** Main closed outline, sampled, for hit testing. */
  hull: Point[];
  /** All sampled subpaths (outline first) - used by exporters without curve support. */
  polylines: Point[][];
  detailLines: Point[][];
}

type XY = [number, number];

/** Closed straight-edged outline from points given in 0..1 box coordinates. */
const poly = (w: number, h: number, pts: XY[]) => {
  const b = new PathBuilder().M(pts[0][0] * w, pts[0][1] * h);
  b.poly(pts.slice(1).map(([x, y]) => [x * w, y * h]));
  return b.Z();
};

/** Points of a polygon centred in its own frame, stretched to fill the w × h box exactly. */
function fitToBox(raw: XY[], w: number, h: number): XY[] {
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return raw.map(([x, y]) => [((x - x0) / (x1 - x0 || 1)) * w, ((y - y0) / (y1 - y0 || 1)) * h]);
}

const closed = (pts: XY[]) => {
  const b = new PathBuilder().M(pts[0][0], pts[0][1]);
  return b.poly(pts.slice(1)).Z();
};

function regular(n: number, w: number, h: number, rotation = -Math.PI / 2): PathBuilder {
  const raw = Array.from({ length: n }, (_, i): XY => [Math.cos(rotation + (i * 2 * Math.PI) / n), Math.sin(rotation + (i * 2 * Math.PI) / n)]);
  return closed(fitToBox(raw, w, h));
}

function star(points: number, inner: number, w: number, h: number): PathBuilder {
  const raw = Array.from({ length: points * 2 }, (_, i): XY => {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : 1;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return closed(fitToBox(raw, w, h));
}

function ellipse(b: PathBuilder, cx: number, cy: number, rx: number, ry: number): PathBuilder {
  return b.M(cx + rx, cy).arc(cx, cy, rx, ry, 0, Math.PI * 2).Z();
}

function cloud(w: number, h: number, b = new PathBuilder()): PathBuilder {
  const n = 11;
  const cx = w / 2;
  const cy = h / 2;
  const at = (a: number, k: number) => [cx + Math.cos(a) * (w / 2) * k, cy + Math.sin(a) * (h / 2) * k] as XY;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const [sx, sy] = at(angle(0), 0.86);
  b.M(sx, sy);
  for (let i = 0; i < n; i++) {
    const [qx, qy] = at((angle(i) + angle(i + 1)) / 2, 1.16);
    const [ex, ey] = at(angle(i + 1), 0.86);
    b.Q(qx, qy, ex, ey);
  }
  return b.Z();
}

/** Rectangle (optionally rounded) speech bubble whose wedge points at the tail. */
function rectCallout(w: number, h: number, tail: Point | undefined, rounded: boolean): PathBuilder {
  const r = rounded ? Math.min(w, h) * 0.18 : 0;
  const T = tail ? { x: tail.x * w, y: tail.y * h } : null;
  const outside = T && (T.x < 0 || T.x > w || T.y < 0 || T.y > h);
  let edge: 'top' | 'right' | 'bottom' | 'left' | null = null;
  if (T && outside) {
    const dx = (T.x - w / 2) / (w / 2);
    const dy = (T.y - h / 2) / (h / 2);
    edge = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'bottom' : 'top') : dx > 0 ? 'right' : 'left';
  }
  // wedge base: centred near the tail, kept on the straight part of the edge
  const along = edge === 'top' || edge === 'bottom' ? w : h;
  let half = Math.min(w, h) * 0.12;
  half = Math.max(1, Math.min(half, (along - 2 * r) / 2 - 1));
  const target = edge === 'top' || edge === 'bottom' ? T?.x ?? 0 : T?.y ?? 0;
  const c = Math.min(Math.max(along / 2 + (target - along / 2) * 0.6, r + half), along - r - half);

  const b = new PathBuilder().M(r, 0);
  if (edge === 'top') b.L(c - half, 0).L(T!.x, T!.y).L(c + half, 0);
  b.L(w - r, 0);
  if (r) b.Q(w, 0, w, r);
  if (edge === 'right') b.L(w, c - half).L(T!.x, T!.y).L(w, c + half);
  b.L(w, h - r);
  if (r) b.Q(w, h, w - r, h);
  if (edge === 'bottom') b.L(c + half, h).L(T!.x, T!.y).L(c - half, h);
  b.L(r, h);
  if (r) b.Q(0, h, 0, h - r);
  if (edge === 'left') b.L(0, c + half).L(T!.x, T!.y).L(0, c - half);
  b.L(0, r);
  if (r) b.Q(0, 0, r, 0);
  return b.Z();
}

function ovalCallout(w: number, h: number, tail: Point | undefined): PathBuilder {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const b = new PathBuilder();
  const T = tail ? { x: tail.x * w, y: tail.y * h } : null;
  if (!T || ((T.x - cx) / rx) ** 2 + ((T.y - cy) / ry) ** 2 <= 1) return ellipse(b, cx, cy, rx, ry);
  const theta = Math.atan2((T.y - cy) / ry, (T.x - cx) / rx);
  const d = 0.22;
  b.M(cx + rx * Math.cos(theta + d), cy + ry * Math.sin(theta + d));
  b.arc(cx, cy, rx, ry, theta + d, theta + Math.PI * 2 - d);
  return b.L(T.x, T.y).Z();
}

function cloudCallout(w: number, h: number, tail: Point | undefined): PathBuilder {
  const b = cloud(w, h);
  const T = tail ? { x: tail.x * w, y: tail.y * h } : null;
  if (!T || ((T.x - w / 2) / (w / 2)) ** 2 + ((T.y - h / 2) / (h / 2)) ** 2 <= 1) return b;
  // thought bubbles from the cloud's edge to the tail
  const a = Math.atan2((T.y - h / 2) / (h / 2), (T.x - w / 2) / (w / 2));
  const E = { x: w / 2 + Math.cos(a) * (w / 2), y: h / 2 + Math.sin(a) * (h / 2) };
  const s = Math.min(w, h);
  [
    [0.3, 0.13],
    [0.62, 0.09],
    [0.92, 0.055],
  ].forEach(([t, k]) => ellipse(b, E.x + (T.x - E.x) * t, E.y + (T.y - E.y) * t, s * k, s * k * 0.8));
  return b;
}

/** Block arrow pointing right, filling w × h. */
function rightArrow(w: number, h: number): XY[] {
  const head = Math.min(w * 0.45, h);
  return [[0, h * 0.25], [w - head, h * 0.25], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h * 0.75], [0, h * 0.75]];
}

const transpose = (pts: XY[]): XY[] => pts.map(([x, y]) => [y, x]);
const flipX = (pts: XY[], w: number): XY[] => pts.map(([x, y]) => [w - x, y]);

function cylinder(w: number, h: number): { outline: PathBuilder; details: PathBuilder } {
  const ry = Math.min(h * 0.12, w * 0.3);
  const outline = new PathBuilder()
    .M(0, ry)
    .L(0, h - ry)
    .arc(w / 2, h - ry, w / 2, ry, Math.PI, 0)
    .L(w, ry)
    .arc(w / 2, ry, w / 2, ry, 0, -Math.PI)
    .Z();
  const details = new PathBuilder().M(0, ry).arc(w / 2, ry, w / 2, ry, Math.PI, 0);
  return { outline, details };
}

const d = (category: FigureCategory, id: string, label: string, build: FigureDef['build'], extra: Partial<FigureDef> = {}): FigureDef => ({
  id,
  label,
  category,
  build,
  ...extra,
});

export const FIGURES: FigureDef[] = [
  // ───────── Basic shapes
  d('Basic shapes', 'triangle', 'Triangle', (w, h) => ({ outline: poly(w, h, [[0.5, 0], [1, 1], [0, 1]]) }), { ratio: 1.15 }),
  d('Basic shapes', 'right-triangle', 'Right triangle', (w, h) => ({ outline: poly(w, h, [[0, 0], [1, 1], [0, 1]]) })),
  d('Basic shapes', 'pentagon', 'Pentagon', (w, h) => ({ outline: regular(5, w, h) })),
  d('Basic shapes', 'hexagon', 'Hexagon', (w, h) => ({ outline: poly(w, h, [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]) }), { ratio: 1.15 }),
  d('Basic shapes', 'octagon', 'Octagon', (w, h) => {
    const c = Math.min(w, h) * 0.29;
    return { outline: closed([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]) };
  }),
  d('Basic shapes', 'parallelogram', 'Parallelogram', (w, h) => {
    const k = Math.min(w * 0.25, h * 0.6);
    return { outline: closed([[k, 0], [w, 0], [w - k, h], [0, h]]) };
  }, { ratio: 1.6 }),
  d('Basic shapes', 'trapezoid', 'Trapezoid', (w, h) => ({ outline: poly(w, h, [[0.2, 0], [0.8, 0], [1, 1], [0, 1]]) }), { ratio: 1.5 }),
  d('Basic shapes', 'cross', 'Cross', (w, h) => {
    const t = Math.min(w, h) / 3;
    const [x0, x1, y0, y1] = [(w - t) / 2, (w + t) / 2, (h - t) / 2, (h + t) / 2];
    return { outline: closed([[x0, 0], [x1, 0], [x1, y0], [w, y0], [w, y1], [x1, y1], [x1, h], [x0, h], [x0, y1], [0, y1], [0, y0], [x0, y0]]) };
  }),
  d('Basic shapes', 'heart', 'Heart', (w, h) => ({
    outline: new PathBuilder()
      .M(w * 0.5, h * 0.25)
      .C(w * 0.5, 0, 0, 0, 0, h * 0.3)
      .C(0, h * 0.6, w * 0.4, h * 0.75, w * 0.5, h)
      .C(w * 0.6, h * 0.75, w, h * 0.6, w, h * 0.3)
      .C(w, 0, w * 0.5, 0, w * 0.5, h * 0.25)
      .Z(),
  }), { ratio: 1.1 }),
  d('Basic shapes', 'cloud', 'Cloud', (w, h) => ({ outline: cloud(w, h) }), { ratio: 1.5 }),
  d('Basic shapes', 'cylinder', 'Cylinder', (w, h) => cylinder(w, h), { ratio: 0.8 }),
  d('Basic shapes', 'cube', 'Cube', (w, h) => {
    const k = Math.min(w, h) * 0.22;
    return {
      outline: closed([[0, k], [k, 0], [w, 0], [w, h - k], [w - k, h], [0, h]]),
      details: new PathBuilder().M(0, k).L(w - k, k).L(w, 0).M(w - k, k).L(w - k, h),
    };
  }),
  d('Basic shapes', 'donut', 'Donut', (w, h) => {
    const b = ellipse(new PathBuilder(), w / 2, h / 2, w / 2, h / 2);
    return { outline: ellipse(b, w / 2, h / 2, w * 0.27, h * 0.27) };
  }),
  d('Basic shapes', 'lightning', 'Lightning bolt', (w, h) => ({
    outline: poly(w, h, [[0.56, 0], [0.18, 0.56], [0.46, 0.56], [0.34, 1], [0.84, 0.4], [0.56, 0.4], [0.74, 0]]),
  }), { ratio: 0.7 }),

  // ───────── Stars
  d('Stars', 'star-4', '4-point star', (w, h) => ({ outline: star(4, 0.38, w, h) })),
  d('Stars', 'star-5', '5-point star', (w, h) => ({ outline: star(5, 0.45, w, h) }), { ratio: 1.05 }),
  d('Stars', 'star-6', '6-point star', (w, h) => ({ outline: star(6, 0.55, w, h) }), { ratio: 1.15 }),
  d('Stars', 'star-8', '8-point star', (w, h) => ({ outline: star(8, 0.6, w, h) })),
  d('Stars', 'seal', 'Seal (16 points)', (w, h) => ({ outline: star(16, 0.82, w, h) })),
  d('Stars', 'explosion', 'Explosion', (w, h) => {
    const radii = [1, 0.55, 0.92, 0.5, 0.82, 0.6, 1, 0.48, 0.88, 0.58, 0.95, 0.5, 0.78, 0.6];
    const raw = radii.map((r, i): XY => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / radii.length + (i % 3 === 0 ? 0.08 : -0.05);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    return { outline: closed(fitToBox(raw, w, h)) };
  }, { ratio: 1.2 }),

  // ───────── Block arrows
  d('Block arrows', 'arrow-right', 'Right arrow', (w, h) => ({ outline: closed(rightArrow(w, h)) }), { ratio: 2 }),
  d('Block arrows', 'arrow-left', 'Left arrow', (w, h) => ({ outline: closed(flipX(rightArrow(w, h), w)) }), { ratio: 2 }),
  d('Block arrows', 'arrow-up', 'Up arrow', (w, h) => ({ outline: closed(transpose(flipX(rightArrow(h, w), h))) }), { ratio: 0.5 }),
  d('Block arrows', 'arrow-down', 'Down arrow', (w, h) => ({ outline: closed(transpose(rightArrow(h, w))) }), { ratio: 0.5 }),
  d('Block arrows', 'arrow-left-right', 'Left-right arrow', (w, h) => {
    const head = Math.min(w * 0.3, h);
    return {
      outline: closed([[0, h / 2], [head, 0], [head, h * 0.25], [w - head, h * 0.25], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h * 0.75], [head, h * 0.75], [head, h]]),
    };
  }, { ratio: 2.4 }),
  d('Block arrows', 'chevron', 'Chevron', (w, h) => {
    const k = Math.min(w * 0.4, h * 0.5);
    return { outline: closed([[0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h], [k, h / 2]]) };
  }, { ratio: 1.4 }),
  d('Block arrows', 'pentagon-arrow', 'Pentagon arrow', (w, h) => {
    const k = Math.min(w * 0.35, h * 0.5);
    return { outline: closed([[0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h]]) };
  }, { ratio: 2 }),
  d('Block arrows', 'arrow-u-turn', 'U-turn arrow', (w, h) => {
    const t = Math.min(w, h) * 0.2; // shaft thickness
    const hw = t * 2.4; // arrowhead width
    const hl = Math.min(h * 0.3, t * 1.7); // arrowhead length
    const cR = w - hw / 2; // centre line of the right (down) shaft
    const cx = (cR + t / 2) / 2; // arch centre
    const ro = Math.min(cx, h - hl - 1); // outer radius
    const ri = Math.max(1, ro - t);
    const cy = ro;
    return {
      outline: new PathBuilder()
        .M(0, h)
        .L(0, cy)
        .arc(cx, cy, cx, ro, Math.PI, Math.PI * 2)
        .L(cR + t / 2, h - hl)
        .L(w, h - hl)
        .L(cR, h)
        .L(w - hw, h - hl)
        .L(cR - t / 2, h - hl)
        .L(cR - t / 2, cy)
        .arc(cx, cy, cx - t, ri, Math.PI * 2, Math.PI)
        .L(t, h)
        .Z(),
    };
  }, { ratio: 1.1 }),

  // ───────── Callouts
  d('Callouts', 'callout-rect', 'Rectangle callout', (w, h, t) => ({ outline: rectCallout(w, h, t, false) }), { ratio: 1.6, tail: { x: 0.22, y: 1.45 } }),
  d('Callouts', 'callout-rounded', 'Rounded callout', (w, h, t) => ({ outline: rectCallout(w, h, t, true) }), { ratio: 1.6, tail: { x: 0.22, y: 1.45 } }),
  d('Callouts', 'callout-oval', 'Oval callout', (w, h, t) => ({ outline: ovalCallout(w, h, t) }), { ratio: 1.6, tail: { x: 0.15, y: 1.4 } }),
  d('Callouts', 'callout-cloud', 'Thought bubble', (w, h, t) => ({ outline: cloudCallout(w, h, t) }), { ratio: 1.6, tail: { x: 0.1, y: 1.55 } }),

  // ───────── Flowchart
  d('Flowchart', 'fc-process', 'Process', (w, h) => ({ outline: poly(w, h, [[0, 0], [1, 0], [1, 1], [0, 1]]) }), { ratio: 1.8 }),
  d('Flowchart', 'fc-alternate', 'Alternate process', (w, h) => {
    const r = Math.min(w, h) * 0.2;
    return {
      outline: new PathBuilder().M(r, 0).L(w - r, 0).Q(w, 0, w, r).L(w, h - r).Q(w, h, w - r, h).L(r, h).Q(0, h, 0, h - r).L(0, r).Q(0, 0, r, 0).Z(),
    };
  }, { ratio: 1.8 }),
  d('Flowchart', 'fc-decision', 'Decision', (w, h) => ({ outline: poly(w, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]) }), { ratio: 1.5 }),
  d('Flowchart', 'fc-data', 'Data (input / output)', (w, h) => {
    const k = Math.min(w * 0.2, h * 0.6);
    return { outline: closed([[k, 0], [w, 0], [w - k, h], [0, h]]) };
  }, { ratio: 1.8 }),
  d('Flowchart', 'fc-predefined', 'Predefined process', (w, h) => ({
    outline: poly(w, h, [[0, 0], [1, 0], [1, 1], [0, 1]]),
    details: new PathBuilder().M(w * 0.1, 0).L(w * 0.1, h).M(w * 0.9, 0).L(w * 0.9, h),
  }), { ratio: 1.8 }),
  d('Flowchart', 'fc-internal-storage', 'Internal storage', (w, h) => ({
    outline: poly(w, h, [[0, 0], [1, 0], [1, 1], [0, 1]]),
    details: new PathBuilder().M(Math.min(w, h) * 0.18, 0).L(Math.min(w, h) * 0.18, h).M(0, Math.min(w, h) * 0.18).L(w, Math.min(w, h) * 0.18),
  })),
  d('Flowchart', 'fc-document', 'Document', (w, h) => ({
    outline: new PathBuilder().M(0, 0).L(w, 0).L(w, h * 0.85).C(w * 0.7, h * 0.62, w * 0.32, h * 1.08, 0, h * 0.85).Z(),
  }), { ratio: 1.6 }),
  d('Flowchart', 'fc-multidocument', 'Multiple documents', (w, h) => {
    const o = Math.min(w, h) * 0.08;
    const fw = w - 2 * o;
    return {
      outline: new PathBuilder().M(0, 2 * o).L(fw, 2 * o).L(fw, h * 0.86).C(fw * 0.7, h * 0.66, fw * 0.32, h * 1.06, 0, h * 0.86).Z(),
      details: new PathBuilder()
        .M(o, 2 * o).L(o, o).L(fw + o, o).L(fw + o, h * 0.8).L(fw, h * 0.8)
        .M(2 * o, o).L(2 * o, 0).L(w, 0).L(w, h * 0.74).L(fw + o, h * 0.74),
    };
  }, { ratio: 1.6 }),
  d('Flowchart', 'fc-terminator', 'Terminator (start / end)', (w, h) => {
    const r = Math.min(h / 2, w / 2);
    return {
      outline: new PathBuilder().M(r, 0).L(w - r, 0).arc(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2).L(r, h).arc(r, h / 2, r, h / 2, Math.PI / 2, Math.PI * 1.5).Z(),
    };
  }, { ratio: 2.4 }),
  d('Flowchart', 'fc-preparation', 'Preparation', (w, h) => {
    const k = Math.min(w * 0.2, h * 0.5);
    return { outline: closed([[k, 0], [w - k, 0], [w, h / 2], [w - k, h], [k, h], [0, h / 2]]) };
  }, { ratio: 1.8 }),
  d('Flowchart', 'fc-manual-input', 'Manual input', (w, h) => ({ outline: poly(w, h, [[0, 0.3], [1, 0], [1, 1], [0, 1]]) }), { ratio: 1.6 }),
  d('Flowchart', 'fc-manual-operation', 'Manual operation', (w, h) => ({ outline: poly(w, h, [[0, 0], [1, 0], [0.8, 1], [0.2, 1]]) }), { ratio: 1.6 }),
  d('Flowchart', 'fc-connector', 'Connector', (w, h) => ({ outline: ellipse(new PathBuilder(), w / 2, h / 2, w / 2, h / 2) }), { ratio: 1 }),
  d('Flowchart', 'fc-offpage', 'Off-page connector', (w, h) => ({ outline: poly(w, h, [[0, 0], [1, 0], [1, 0.7], [0.5, 1], [0, 0.7]]) }), { ratio: 0.9 }),
  d('Flowchart', 'fc-card', 'Card', (w, h) => ({ outline: poly(w, h, [[0.2, 0], [1, 0], [1, 1], [0, 1], [0, 0.3]]) }), { ratio: 1.6 }),
  d('Flowchart', 'fc-punched-tape', 'Punched tape', (w, h) => ({
    outline: new PathBuilder().M(0, h * 0.12).C(w * 0.3, h * 0.32, w * 0.7, h * -0.08, w, h * 0.12).L(w, h * 0.88).C(w * 0.7, h * 0.68, w * 0.3, h * 1.08, 0, h * 0.88).Z(),
  }), { ratio: 1.6 }),
  d('Flowchart', 'fc-delay', 'Delay', (w, h) => {
    const r = Math.min(h / 2, w);
    return { outline: new PathBuilder().M(0, 0).L(w - r, 0).arc(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2).L(0, h).Z() };
  }, { ratio: 1.5 }),
  d('Flowchart', 'fc-stored-data', 'Stored data', (w, h) => {
    const k = Math.min(w * 0.15, h * 0.5);
    return { outline: new PathBuilder().M(k, 0).L(w, 0).Q(w - 2 * k, h / 2, w, h).L(k, h).Q(-k, h / 2, k, 0).Z() };
  }, { ratio: 1.6 }),
  d('Flowchart', 'fc-database', 'Database', (w, h) => cylinder(w, h), { ratio: 0.8 }),
  d('Flowchart', 'fc-display', 'Display', (w, h) => {
    const k = Math.min(w * 0.15, h * 0.5);
    return { outline: new PathBuilder().M(k, 0).L(w - k, 0).Q(w + k, h / 2, w - k, h).L(k, h).L(0, h / 2).Z() };
  }, { ratio: 1.8 }),
  d('Flowchart', 'fc-loop-limit', 'Loop limit', (w, h) => {
    const k = Math.min(w, h) * 0.25;
    return { outline: closed([[k, 0], [w - k, 0], [w, k], [w, h], [0, h], [0, k]]) };
  }, { ratio: 1.6 }),
  d('Flowchart', 'fc-extract', 'Extract', (w, h) => ({ outline: poly(w, h, [[0.5, 0], [1, 1], [0, 1]]) })),
  d('Flowchart', 'fc-merge', 'Merge', (w, h) => ({ outline: poly(w, h, [[0, 0], [1, 0], [0.5, 1]]) })),
  d('Flowchart', 'fc-sort', 'Sort', (w, h) => ({
    outline: poly(w, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]),
    details: new PathBuilder().M(0, h / 2).L(w, h / 2),
  }), { ratio: 0.8 }),
  d('Flowchart', 'fc-collate', 'Collate', (w, h) => ({ outline: poly(w, h, [[0, 0], [1, 0], [0, 1], [1, 1]]) }), { ratio: 0.8 }),
  d('Flowchart', 'fc-summing-junction', 'Summing junction', (w, h) => {
    const c = Math.SQRT1_2;
    return {
      outline: ellipse(new PathBuilder(), w / 2, h / 2, w / 2, h / 2),
      details: new PathBuilder()
        .M(w / 2 - (w / 2) * c, h / 2 - (h / 2) * c).L(w / 2 + (w / 2) * c, h / 2 + (h / 2) * c)
        .M(w / 2 + (w / 2) * c, h / 2 - (h / 2) * c).L(w / 2 - (w / 2) * c, h / 2 + (h / 2) * c),
    };
  }, { ratio: 1 }),
  d('Flowchart', 'fc-or', 'Or', (w, h) => ({
    outline: ellipse(new PathBuilder(), w / 2, h / 2, w / 2, h / 2),
    details: new PathBuilder().M(w / 2, 0).L(w / 2, h).M(0, h / 2).L(w, h / 2),
  }), { ratio: 1 }),
];

const BY_ID = new Map(FIGURES.map((f) => [f.id, f]));

export const FIGURE_CATEGORIES: FigureCategory[] = ['Basic shapes', 'Stars', 'Block arrows', 'Callouts', 'Flowchart'];

export const getFigure = (id: string): FigureDef | undefined => BY_ID.get(id);
export const isFigure = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);
export const DEFAULT_FIGURE = 'star-5';

/** Geometry of a figure in its local box (0,0)-(w,h). Unknown ids fall back to a rectangle. */
export function figureGeometry(id: string, w: number, h: number, tail?: Point): FigureGeometry {
  const def = BY_ID.get(id) ?? BY_ID.get('fc-process')!;
  const ww = Math.max(1, w);
  const hh = Math.max(1, h);
  const { outline, details } = def.build(ww, hh, def.tail ? tail ?? def.tail : undefined);
  return {
    outline: outline.toString(),
    details: details?.toString() ?? '',
    hull: outline.polylines[0] ?? [],
    polylines: outline.polylines,
    detailLines: details?.polylines ?? [],
  };
}
