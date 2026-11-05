import { randomInteger } from '../core/utils';
import type { SketchElement } from '../core/types';
import type { Scene } from './Scene';

/** One undoable step: the before/after state of every element it touched. */
interface HistoryEntry {
  before: Map<string, SketchElement | undefined>;
  after: Map<string, SketchElement | undefined>;
}

const MAX_ENTRIES = 200;

/**
 * Delta-based undo/redo (Memento pattern, stored as diffs).
 *
 * A gesture (drag, resize, draw...) may produce dozens of intermediate scene updates.
 * Only `commit()` at the END of the gesture records a step, by diffing the scene against
 * the last committed snapshot. Remote changes are folded into the snapshot directly, so
 * undo never reverts a collaborator's work.
 */
export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private committed = new Map<string, SketchElement>();
  private listeners = new Set<() => void>();

  constructor(private scene: Scene) {
    this.resetBaseline();
    scene.onChange(({ changed, source }) => {
      if (source === 'remote' || source === 'load') {
        for (const el of changed) this.committed.set(el.id, el);
      }
    });
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Call after a scene load to start a fresh history. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.resetBaseline();
    this.notify();
  }

  /** Records the difference since the last commit as a single undoable step. */
  commit(): boolean {
    const before = new Map<string, SketchElement | undefined>();
    const after = new Map<string, SketchElement | undefined>();
    for (const el of this.scene.getAllElements()) {
      const prev = this.committed.get(el.id);
      // Ignore elements created and discarded within the same gesture (e.g. empty text).
      if (!prev && el.isDeleted) continue;
      if (prev !== el) {
        before.set(el.id, prev);
        after.set(el.id, el);
      }
    }
    if (after.size === 0) return false;
    this.undoStack.push({ before, after });
    if (this.undoStack.length > MAX_ENTRIES) this.undoStack.shift();
    this.redoStack = [];
    this.resetBaseline();
    this.notify();
    return true;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.apply(entry.before);
    this.redoStack.push(entry);
    this.notify();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.apply(entry.after);
    this.undoStack.push(entry);
    this.notify();
  }

  private apply(target: Map<string, SketchElement | undefined>): void {
    const updates: SketchElement[] = [];
    for (const [id, state] of target) {
      const current = this.scene.getElement(id);
      const version = (current?.version ?? 0) + 1;
      if (state) {
        updates.push({ ...state, version, versionNonce: randomInteger(), updatedAt: Date.now() });
      } else if (current && !current.isDeleted) {
        updates.push({ ...current, isDeleted: true, version, versionNonce: randomInteger(), updatedAt: Date.now() });
      }
    }
    this.scene.upsert(updates, 'history');
    this.resetBaseline();
  }

  private resetBaseline(): void {
    this.committed = new Map(this.scene.getAllElements().map((e) => [e.id, e]));
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}
