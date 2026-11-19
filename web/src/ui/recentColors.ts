import { useSyncExternalStore } from 'react';

/**
 * The last custom colours picked (with the colour picker, not the palette), newest first, kept in
 * local storage so they're offered again next time. Stroke and text colours share one list;
 * background and cell fill colours share another.
 */
export type RecentColorKind = 'stroke' | 'background';

export const MAX_RECENT_COLORS = 5;
const keyFor = (kind: RecentColorKind) => `sketchboard:recent-colors:${kind}`;
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

const cache = new Map<RecentColorKind, string[]>();
const listeners = new Set<() => void>();

function read(kind: RecentColorKind): string[] {
  const hit = cache.get(kind);
  if (hit) return hit;
  let list: string[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(kind)) ?? '[]');
    if (Array.isArray(raw)) list = raw.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, MAX_RECENT_COLORS);
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  cache.set(kind, list);
  return list;
}

/** Puts a custom colour first in its list (once), dropping the oldest beyond five. */
export function addRecentColor(kind: RecentColorKind, color: string, palette: readonly string[] = []): void {
  const c = color.toLowerCase();
  if (!HEX.test(c) || palette.some((p) => p.toLowerCase() === c)) return;
  const next = [c, ...read(kind).filter((x) => x !== c)].slice(0, MAX_RECENT_COLORS);
  cache.set(kind, next);
  try {
    localStorage.setItem(keyFor(kind), JSON.stringify(next));
  } catch {
    /* private mode / full: keep it for this session */
  }
  for (const fn of listeners) fn();
}

export const recentColors = (kind: RecentColorKind): string[] => read(kind);

/** The recent custom colours of a kind; re-renders when any list changes. */
export function useRecentColors(kind: RecentColorKind | undefined): string[] {
  return useSyncExternalStore(
    (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => (kind ? read(kind) : EMPTY),
  );
}
const EMPTY: string[] = [];

