import { STORAGE_KEYS } from '../core/constants';
import type { SceneData } from '../core/types';
import { parseScene } from './serialization';

/**
 * Abstraction over where the working document is kept (Dependency Inversion).
 * Swap LocalStorageAdapter for IndexedDB, a REST backend (e.g. a paid cloud tier), etc.
 * without touching the editor.
 */
export interface StorageAdapter {
  load(): Promise<SceneData | null>;
  save(data: SceneData): Promise<void>;
  clear(): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private key: string = STORAGE_KEYS.scene) {}

  async load(): Promise<SceneData | null> {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? parseScene(raw) : null;
    } catch {
      return null;
    }
  }

  async save(data: SceneData): Promise<void> {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (err) {
      console.warn('[SketchBoard] Could not save to local storage', err);
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }
}

/** No-op adapter used while in a collaboration room (the room is the source of truth). */
export class MemoryStorageAdapter implements StorageAdapter {
  private data: SceneData | null = null;
  async load() {
    return this.data;
  }
  async save(data: SceneData) {
    this.data = data;
  }
  async clear() {
    this.data = null;
  }
}
