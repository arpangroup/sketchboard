import type { Point } from '../core/types';

/**
 * Laser pointer trails (local + collaborators'). Purely visual and ephemeral:
 * never stored in the scene, never undoable.
 *  - "fade" trails fade out point by point over LIFETIME ms while you draw.
 *  - "hold" trails stay fully visible until the pen / mouse is released, then fade out together.
 */
const LIFETIME = 900;
/** Fade-out after release for "hold" trails. */
const RELEASE_FADE = 700;
/** Safety cap for very long held strokes. */
const MAX_POINTS = 6000;

export type LaserMode = 'fade' | 'hold';

/** Core line width (px on screen) for each size step; the glow and dot scale with it. */
export const LASER_SIZES = [
  { value: 1, label: 'Thin', core: 2.5 },
  { value: 2, label: 'Medium', core: 4.5 },
  { value: 3, label: 'Thick', core: 8 },
  { value: 4, label: 'Extra thick', core: 14 },
] as const;
const coreWidth = (size: number) => LASER_SIZES.find((s) => s.value === size)?.core ?? 4.5;

interface TrailPoint extends Point {
  t: number;
  /** first point of a new stroke (don't connect to the previous point) */
  start?: boolean;
}

interface Trail {
  color: string;
  points: TrailPoint[];
  size: number;
  mode: LaserMode;
  /** hold mode: pointer still down */
  holding: boolean;
  /** hold mode: when the trail was released (fade starts) */
  releasedAt: number | null;
}

export class LaserLayer {
  private trails = new Map<string, Trail>();

  add(source: string, color: string, p: Point, start = false, opts: { size?: number; mode?: LaserMode } = {}): void {
    let trail = this.trails.get(source);
    const mode = opts.mode ?? 'fade';
    if (!trail || (start && trail.mode !== mode)) {
      trail = { color, points: [], size: 2, mode, holding: false, releasedAt: null };
      this.trails.set(source, trail);
    }
    if (start && mode === 'hold') {
      // a new held stroke: drop whatever is still fading from the last one
      trail.points = [];
      trail.releasedAt = null;
    }
    trail.color = color;
    trail.size = opts.size ?? trail.size;
    trail.mode = mode;
    trail.holding = mode === 'hold';
    trail.points.push({ ...p, t: performance.now(), start });
    if (trail.points.length > MAX_POINTS) trail.points.splice(0, trail.points.length - MAX_POINTS);
  }

  /** Pen / mouse released: "hold" trails start fading now. */
  release(source: string): void {
    const trail = this.trails.get(source);
    if (trail && trail.mode === 'hold' && trail.holding) {
      trail.holding = false;
      trail.releasedAt = performance.now();
    }
  }

  /** True while anything is still visible (the editor keeps animating until it fades). */
  get active(): boolean {
    return this.trails.size > 0;
  }

  render(ctx: CanvasRenderingContext2D, zoom: number): void {
    const now = performance.now();
    for (const [id, trail] of this.trails) {
      // a collaborator's "released" message can get lost: don't keep their trail forever
      if (id !== 'local' && trail.holding && now - (trail.points[trail.points.length - 1]?.t ?? 0) > 15_000) this.release(id);
      let lifeOf: (p: TrailPoint) => number;
      if (trail.mode === 'hold') {
        if (trail.holding) lifeOf = () => 1;
        else {
          const k = 1 - (now - (trail.releasedAt ?? now)) / RELEASE_FADE;
          if (k <= 0) trail.points = [];
          lifeOf = () => Math.max(0, k);
        }
      } else {
        trail.points = trail.points.filter((p) => now - p.t < LIFETIME);
        lifeOf = (p) => 1 - (now - p.t) / LIFETIME;
      }
      if (!trail.points.length) {
        if (!trail.holding) this.trails.delete(id);
        continue;
      }
      const core = coreWidth(trail.size);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pts = trail.points;
      if (trail.mode === 'hold') {
        // every point has the same opacity: draw one continuous path (no beading where segments overlap)
        const life = lifeOf(pts[0]);
        const path = new Path2D();
        pts.forEach((p, i) => (i === 0 || p.start ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
        ctx.strokeStyle = trail.color;
        ctx.globalAlpha = life * 0.25;
        ctx.lineWidth = (core * 2.4 + 4) / zoom;
        ctx.stroke(path);
        ctx.globalAlpha = life;
        ctx.lineWidth = (core + 1) / zoom;
        ctx.stroke(path);
      }
      for (let i = 1; i < pts.length && trail.mode !== 'hold'; i++) {
        if (pts[i].start) continue;
        const life = lifeOf(pts[i]);
        if (life <= 0) continue;
        // glow
        ctx.strokeStyle = trail.color;
        ctx.globalAlpha = life * 0.25;
        ctx.lineWidth = ((core * 2.4 + 2) * life + 2) / zoom;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        // core
        ctx.globalAlpha = life;
        ctx.lineWidth = (core * life + 1) / zoom;
        ctx.stroke();
      }
      const head = pts[pts.length - 1];
      if (trail.holding || now - head.t < 120) {
        ctx.globalAlpha = trail.mode === 'hold' ? lifeOf(head) : 1;
        ctx.fillStyle = trail.color;
        ctx.beginPath();
        ctx.arc(head.x, head.y, Math.max(4, core * 0.9) / zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
