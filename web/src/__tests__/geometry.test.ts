import { describe, expect, it } from 'vitest';
import { boundsFromPoints, distanceToSegment, normalizeBounds, pointInPolygon, simplifyPath, snapAngle } from '../core/geometry';

describe('geometry', () => {
  it('measures distance to a segment, clamping to endpoints', () => {
    expect(distanceToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it('normalizes negative rectangles', () => {
    expect(normalizeBounds({ x: 10, y: 10, width: -4, height: -6 })).toEqual({ x: 6, y: 4, width: 4, height: 6 });
  });

  it('detects points inside a polygon', () => {
    const diamond = [{ x: 5, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 5 }];
    expect(pointInPolygon({ x: 5, y: 5 }, diamond)).toBe(true);
    expect(pointInPolygon({ x: 1, y: 1 }, diamond)).toBe(false);
  });

  it('computes bounds from points', () => {
    expect(boundsFromPoints([{ x: 3, y: 9 }, { x: -1, y: 2 }])).toEqual({ x: -1, y: 2, width: 4, height: 7 });
  });

  it('snaps to 15 degree increments', () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 10, y: 0.5 });
    expect(p.y).toBeCloseTo(0);
    expect(p.x).toBeCloseTo(Math.hypot(10, 0.5));
  });

  it('simplifies collinear points away', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplifyPath(pts, 0.5)).toHaveLength(2);
  });
});
