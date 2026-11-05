import { Emitter } from '../core/Store';
import type { SketchElement } from '../core/types';

export type ChangeSource = 'local' | 'remote' | 'history' | 'load';

export interface SceneChange {
  changed: readonly SketchElement[];
  source: ChangeSource;
}

/**
 * Single source of truth for elements (Repository pattern).
 * Holds tombstones (isDeleted) so deletions can propagate to collaborators.
 * Exposes change events tagged with their source, so collaboration can avoid echoing
 * remote changes and history can ignore remote edits.
 */
export class Scene {
  private elements = new Map<string, SketchElement>();
  private sortedCache: SketchElement[] | null = null;
  private emitter = new Emitter<{ change: SceneChange }>();
  /** Increments on every change: cheap "has anything changed" check for renderers. */
  revision = 0;

  getElement(id: string): SketchElement | undefined {
    return this.elements.get(id);
  }

  /** Visible (non-deleted) elements ordered by z-index (back to front). */
  getElements(): readonly SketchElement[] {
    if (!this.sortedCache) {
      this.sortedCache = [...this.elements.values()]
        .filter((e) => !e.isDeleted)
        .sort((a, b) => a.zIndex - b.zIndex || (a.id < b.id ? -1 : 1));
    }
    return this.sortedCache;
  }

  /** All elements, including tombstones (used for sync & persistence). */
  getAllElements(): SketchElement[] {
    return [...this.elements.values()];
  }

  upsert(changed: readonly SketchElement[], source: ChangeSource = 'local'): void {
    if (changed.length === 0) return;
    for (const el of changed) this.elements.set(el.id, el);
    this.invalidate({ changed, source });
  }

  replaceAll(elements: readonly SketchElement[], source: ChangeSource = 'load'): void {
    this.elements = new Map(elements.map((e) => [e.id, e]));
    this.invalidate({ changed: elements, source });
  }

  maxZIndex(): number {
    const els = this.getElements();
    return els.length ? els[els.length - 1].zIndex : 0;
  }

  minZIndex(): number {
    const els = this.getElements();
    return els.length ? els[0].zIndex : 0;
  }

  onChange(handler: (c: SceneChange) => void): () => void {
    return this.emitter.on('change', handler);
  }

  private invalidate(change: SceneChange): void {
    this.sortedCache = null;
    this.revision++;
    this.emitter.emit('change', change);
  }
}
