import { unionBounds } from '../core/geometry';
import type { Bounds, SketchElement } from '../core/types';
import { getElementBounds } from '../elements/registry';

/** On-screen size of the link badge (CSS px); it stays the same size at any zoom. */
export const LINK_BADGE_PX = 22;

export interface LinkBadge {
  /** World-space rectangle of the badge. */
  rect: Bounds;
  /** An element carrying the link (what gets opened). */
  el: SketchElement;
}

/**
 * One badge per linked element — or per group, when a whole group shares the link — placed just
 * outside the top-right corner, in world units.
 */
export function linkBadges(elements: readonly SketchElement[], zoom: number, hiddenIds?: ReadonlySet<string>): LinkBadge[] {
  const byKey = new Map<string, { el: SketchElement; bounds: Bounds[] }>();
  for (const el of elements) {
    if (!el.link || hiddenIds?.has(el.id)) continue;
    const group = el.groupIds?.[el.groupIds.length - 1];
    const key = group ? `${group}\n${el.link}` : el.id;
    const entry = byKey.get(key) ?? { el, bounds: [] };
    entry.bounds.push(getElementBounds(el));
    byKey.set(key, entry);
  }
  const s = LINK_BADGE_PX / zoom;
  const gap = 4 / zoom;
  return [...byKey.values()].map(({ el, bounds }) => {
    const b = unionBounds(bounds)!;
    return { el, rect: { x: b.x + b.width + gap, y: b.y - s - gap, width: s, height: s } };
  });
}

// Chain-link glyph (24 × 24 view box)
const LINK_ICON = [
  'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
  'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
];
let icon: Path2D[] | null = null;

/** "Has a link" badges (board only, never exported or printed). */
export function drawLinkBadges(ctx: CanvasRenderingContext2D, badges: readonly LinkBadge[], zoom: number): void {
  if (!badges.length) return;
  icon ??= typeof Path2D === 'undefined' ? [] : LINK_ICON.map((d) => new Path2D(d));
  for (const { rect: r } of badges) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(1 / zoom, 1 / zoom);
    const s = LINK_BADGE_PX;
    ctx.beginPath();
    ctx.roundRect(0, 0, s, s, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#5b5bd6';
    ctx.stroke();
    ctx.translate(4, 4);
    ctx.scale(14 / 24, 14 / 24);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of icon) ctx.stroke(p);
    ctx.restore();
  }
}
