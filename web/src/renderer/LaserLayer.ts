import type { Point } from '../core/types';

/**
 * Laser pointer trails (local + collaborators'). Purely visual and ephemeral:
 * never stored in the scene, never undoable. Each trail fades out over LIFETIME ms.
 */
const LIFETIME = 900;

interface TrailPoint extends Point {
  t: number;
  /** first point of a new stroke (don't connect to the previous point) */
  start?: boolean;
}

export class LaserLayer {
  private trails = new Map<string, { color: string; points: TrailPoint[] }>();

  add(source: string, color: string, p: Point, start = false): void {
    let trail = this.trails.get(source);
    if (!trail) {
      trail = { color, points: [] };
      this.trails.set(source, trail);
    }
    trail.color = color;
    trail.points.push({ ...p, t: performance.now(), start });
  }

  /** True while anything is still visible (the editor keeps animating until it fades). */
  get active(): boolean {
    return this.trails.size > 0;
  }

  render(ctx: CanvasRenderingContext2D, zoom: number): void {
    const now = performance.now();
    for (const [id, trail] of this.trails) {
      trail.points = trail.points.filter((p) => now - p.t < LIFETIME);
      if (!trail.points.length) {
        this.trails.delete(id);
        continue;
      }
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pts = trail.points;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].start) continue;
        const life = 1 - (now - pts[i].t) / LIFETIME;
        // glow
        ctx.strokeStyle = trail.color;
        ctx.globalAlpha = life * 0.25;
        ctx.lineWidth = (10 * life + 2) / zoom;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        // core
        ctx.globalAlpha = life;
        ctx.lineWidth = (3.5 * life + 1) / zoom;
        ctx.stroke();
      }
      const head = pts[pts.length - 1];
      if (now - head.t < 120) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = trail.color;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
