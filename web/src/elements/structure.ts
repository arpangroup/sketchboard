import { unionBounds } from '../core/geometry';
import type { ArrowBinding, Bounds, FigureElement, FrameElement, Point, SketchElement } from '../core/types';
import { generateId } from '../core/utils';
import { absolutePoints, pointsToElementGeometry } from './handlers/pointShapes';
import { getElementBounds } from './registry';
import { withLabels } from './boundText';
import { angleOf, bakesRotation, centerOf, normalizeAngle } from './rotation';

/**
 * Structural edits — groups, frames, flips — as pure functions returning patches by element id.
 * The editor applies them (versioning, history); tests call them directly.
 */
export type Patches = Map<string, Partial<SketchElement>>;

// ───────────────────────────── groups ─────────────────────────────

export const outermostGroup = (el: SketchElement): string | undefined => el.groupIds?.[el.groupIds.length - 1];

/** Selection ids widened so that picking one member of a group selects the whole (outermost) group. */
export function expandToGroups(all: readonly SketchElement[], ids: Iterable<string>): string[] {
  const set = new Set(ids);
  const groups = new Set<string>();
  for (const el of all) if (set.has(el.id)) {
    const g = outermostGroup(el);
    if (g) groups.add(g);
  }
  if (!groups.size) return [...set];
  for (const el of all) {
    const g = outermostGroup(el);
    if (g && groups.has(g)) set.add(el.id);
  }
  return [...set];
}

/** All members of `el`'s outermost group (just `el` when it isn't grouped). */
export function groupMembers(all: readonly SketchElement[], el: SketchElement): SketchElement[] {
  const g = outermostGroup(el);
  return g ? all.filter((e) => outermostGroup(e) === g) : [el];
}

/** Wraps the elements in a new outer group. Returns null when they already form exactly one group. */
export function groupPatches(els: readonly SketchElement[]): { patches: Patches; groupId: string } | null {
  if (els.length < 2) return null;
  const first = outermostGroup(els[0]);
  if (first && els.every((e) => outermostGroup(e) === first)) return null;
  const groupId = generateId();
  const patches: Patches = new Map();
  for (const el of els) patches.set(el.id, { groupIds: [...(el.groupIds ?? []), groupId] });
  return { patches, groupId };
}

/** Removes the outermost group of each element (nested groups inside it survive). */
export function ungroupPatches(els: readonly SketchElement[]): Patches {
  const patches: Patches = new Map();
  for (const el of els) {
    if (!el.groupIds?.length) continue;
    const rest = el.groupIds.slice(0, -1);
    patches.set(el.id, { groupIds: rest.length ? rest : undefined });
  }
  return patches;
}

/**
 * Fresh group / frame ids for copies, so duplicates form their own groups and frames.
 * A copied child whose frame wasn't copied keeps pointing at the original frame.
 */
export function remapCopies(originals: readonly SketchElement[], copies: SketchElement[]): SketchElement[] {
  const groupMap = new Map<string, string>();
  const frameMap = new Map<string, string>();
  const idMap = new Map<string, string>();
  originals.forEach((o, i) => {
    idMap.set(o.id, copies[i].id);
    if (o.type === 'frame') frameMap.set(o.id, copies[i].id);
  });
  return copies.map((c) => {
    const groupIds = c.groupIds?.map((g) => {
      if (!groupMap.has(g)) groupMap.set(g, generateId());
      return groupMap.get(g)!;
    });
    const frameId = c.frameId ? (frameMap.get(c.frameId) ?? c.frameId) : undefined;
    // a copied label follows its copied shape; copied on its own it becomes ordinary text
    if (c.type === 'text' && c.containerId) return { ...c, groupIds, frameId, containerId: idMap.get(c.containerId) } as SketchElement;
    // a copied arrow stays attached only to shapes copied with it
    if ((c.type === 'arrow' || c.type === 'line') && (c.startBinding || c.endBinding)) {
      const remap = (b?: ArrowBinding) => (b && idMap.has(b.elementId) ? { ...b, elementId: idMap.get(b.elementId)! } : undefined);
      return { ...c, groupIds, frameId, startBinding: remap(c.startBinding), endBinding: remap(c.endBinding) } as SketchElement;
    }
    return { ...c, groupIds, frameId } as SketchElement;
  });
}

// ───────────────────────────── frames ─────────────────────────────

export const FRAME_PADDING = 24;

export const frameChildren = (all: readonly SketchElement[], frameId: string): SketchElement[] =>
  all.filter((e) => e.frameId === frameId && !e.isDeleted);

/** The selection plus everything inside any selected frame, plus the labels of any shapes among them. */
export function withFrameChildren(all: readonly SketchElement[], sel: readonly SketchElement[]): SketchElement[] {
  const frames = new Set(sel.filter((e) => e.type === 'frame').map((e) => e.id));
  if (!frames.size) return withLabels(all, sel);
  const ids = new Set(sel.map((e) => e.id));
  return withLabels(all, [...sel, ...all.filter((e) => e.frameId && frames.has(e.frameId) && !ids.has(e.id) && !e.isDeleted)]);
}

/** Box for a new frame around the elements (with breathing room). */
export function frameBoxFor(els: readonly SketchElement[], padding = FRAME_PADDING): Bounds | null {
  const b = unionBounds(els.map(getElementBounds));
  return b ? { x: b.x - padding, y: b.y - padding, width: b.width + padding * 2, height: b.height + padding * 2 } : null;
}

/**
 * Which frame an element belongs to: the topmost frame whose box contains the element's centre.
 * Frames never nest.
 */
export function containingFrame(el: SketchElement, frames: readonly FrameElement[]): FrameElement | null {
  if (el.type === 'frame') return null;
  const b = getElementBounds(el);
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (f.id !== el.id && !f.isDeleted && c.x >= f.x && c.x <= f.x + f.width && c.y >= f.y && c.y <= f.y + f.height) return f;
  }
  return null;
}

/** frameId updates for elements that moved into, out of, or between frames. */
export function framePatches(all: readonly SketchElement[], els: readonly SketchElement[]): Patches {
  const frames = all.filter((e): e is FrameElement => e.type === 'frame' && !e.isDeleted);
  const patches: Patches = new Map();
  for (const el of els) {
    if (el.type === 'frame' || el.isDeleted) continue;
    const f = containingFrame(el, frames)?.id;
    if (f !== el.frameId) patches.set(el.id, { frameId: f });
  }
  return patches;
}

// ───────────────────────────── flip ─────────────────────────────

export type FlipAxis = 'horizontal' | 'vertical';

/**
 * Mirrors the elements across the centre line of their combined bounds.
 * Lines, arrows and ink mirror their points; images and gallery shapes are drawn mirrored
 * (callouts move their tail instead); text, code and tables move but never read backwards.
 */
export function flipPatches(els: readonly SketchElement[], axis: FlipAxis): Patches {
  const patches: Patches = new Map();
  const live = els.filter((e) => !e.locked);
  const b = unionBounds(live.map(getElementBounds));
  if (!b) return patches;
  const h = axis === 'horizontal';
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const mirror = (p: Point): Point => (h ? { x: 2 * cx - p.x, y: p.y } : { x: p.x, y: 2 * cy - p.y });

  for (const el of live) {
    if (bakesRotation(el)) {
      const pts = absolutePoints(el as Extract<SketchElement, { points: Point[] }>).map(mirror);
      patches.set(el.id, pointsToElementGeometry(pts) as Partial<SketchElement>);
      continue;
    }
    const c = mirror(centerOf(el));
    const patch: Partial<SketchElement> = { x: c.x - el.width / 2, y: c.y - el.height / 2 };
    const a = angleOf(el);
    if (a) patch.angle = normalizeAngle(-a);
    if (el.type === 'figure' && (el as FigureElement).tail) {
      const t = (el as FigureElement).tail!;
      (patch as Partial<FigureElement>).tail = h ? { x: 1 - t.x, y: t.y } : { x: t.x, y: 1 - t.y };
    } else if (el.type === 'image' || el.type === 'figure') {
      if (h) patch.flipX = !el.flipX || undefined;
      else patch.flipY = !el.flipY || undefined;
    }
    patches.set(el.id, patch);
  }
  return patches;
}

// ───────────────────────────── links ─────────────────────────────

/** Normalises what people type ("example.com" → "https://example.com"); rejects script URLs. */
export function normalizeLink(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^(javascript|data|vbscript|file):/i.test(s)) return null;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(s)) return `mailto:${s}`;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(s) || /^localhost(:\d+)?/.test(s)) return `https://${s}`;
  return null;
}
