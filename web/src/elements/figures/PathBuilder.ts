import type { Point } from '../../core/types';

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds an SVG path string (for rough.js / SVG export) and, at the same time, a sampled
 * point list of the same outline (for hit testing and exports to formats without curves).
 */
export class PathBuilder {
  private d: string[] = [];
  private cur: Point = { x: 0, y: 0 };
  private start: Point = { x: 0, y: 0 };
  /** Sampled points per subpath. */
  readonly polylines: Point[][] = [];

  M(x: number, y: number): this {
    this.d.push(`M ${f(x)} ${f(y)}`);
    this.cur = this.start = { x, y };
    this.polylines.push([{ x, y }]);
    return this;
  }

  private add(p: Point) {
    this.polylines[this.polylines.length - 1].push(p);
  }

  L(x: number, y: number): this {
    this.d.push(`L ${f(x)} ${f(y)}`);
    this.cur = { x, y };
    this.add({ x, y });
    return this;
  }

  /** Straight lines through a list of points (after the current point). */
  poly(points: Array<[number, number]>): this {
    points.forEach(([x, y]) => this.L(x, y));
    return this;
  }

  Q(cx: number, cy: number, x: number, y: number): this {
    this.d.push(`Q ${f(cx)} ${f(cy)} ${f(x)} ${f(y)}`);
    const p0 = this.cur;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const u = 1 - t;
      this.add({ x: u * u * p0.x + 2 * u * t * cx + t * t * x, y: u * u * p0.y + 2 * u * t * cy + t * t * y });
    }
    this.cur = { x, y };
    return this;
  }

  C(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    this.d.push(`C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x)} ${f(y)}`);
    const p0 = this.cur;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const u = 1 - t;
      this.add({
        x: u * u * u * p0.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        y: u * u * u * p0.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
      });
    }
    this.cur = { x, y };
    return this;
  }

  /**
   * Elliptical arc from angle a0 to a1 (radians, either direction) around (cx, cy), drawn as
   * cubic Béziers (≤ 90° each). Starts with a line to the arc's first point if needed.
   */
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): this {
    const at = (a: number) => ({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    const s = at(a0);
    if (Math.hypot(s.x - this.cur.x, s.y - this.cur.y) > 0.01) this.L(s.x, s.y);
    const segs = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
    const step = (a1 - a0) / segs;
    const k = (4 / 3) * Math.tan(step / 4);
    for (let i = 0; i < segs; i++) {
      const t0 = a0 + i * step;
      const t1 = t0 + step;
      const p0 = at(t0);
      const p1 = at(t1);
      this.C(
        p0.x - k * rx * Math.sin(t0),
        p0.y + k * ry * Math.cos(t0),
        p1.x + k * rx * Math.sin(t1),
        p1.y - k * ry * Math.cos(t1),
        p1.x,
        p1.y,
      );
    }
    return this;
  }

  Z(): this {
    this.d.push('Z');
    this.add({ ...this.start });
    this.cur = this.start;
    return this;
  }

  toString(): string {
    return this.d.join(' ');
  }
}
