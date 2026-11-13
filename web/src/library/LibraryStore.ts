import { STORAGE_KEYS } from '../core/constants';
import { generateId } from '../core/utils';
import type { LibraryItem, SketchElement } from '../core/types';
import { fileStore } from '../files/FileStore';
import { downloadBlob } from '../persistence/fileService';
import { getBuiltinLibrary } from './builtin';
import {
  EXCALIDRAW_LIBRARY_EXTENSION,
  LIBRARY_EXTENSION,
  normalizeItemElements,
  parseLibrary,
  serializeExcalidrawLibrary,
  serializeLibrary,
  suggestItemName,
} from './libraryFormat';

export type LibrarySource = 'personal' | 'builtin';

/**
 * The personal library (persisted in this browser) plus read-only access to the built-in
 * SketchBoard library. Observable so the sidebar re-renders on change.
 * Image pixels stay in the FileStore (IndexedDB); items only reference them by fileId.
 */
export class LibraryStore {
  private items: LibraryItem[] = [];
  private listeners = new Set<() => void>();

  constructor(private readonly storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
      const raw = this.storage?.getItem(STORAGE_KEYS.library);
      if (raw) this.items = parseLibrary(raw).items;
    } catch {
      this.items = [];
    }
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Stable snapshot (new array only after a change) - safe for useSyncExternalStore. */
  getItems = (): readonly LibraryItem[] => this.items;

  find(source: LibrarySource, id: string): LibraryItem | undefined {
    return source === 'personal' ? this.items.find((i) => i.id === id) : getBuiltinLibrary().find((i) => i.id === id);
  }

  private commit(next: LibraryItem[]): void {
    // write first: if the browser's storage is full the library stays as it was
    try {
      this.storage?.setItem(STORAGE_KEYS.library, serializeLibrary(next, {}));
    } catch {
      throw new Error('Your browser storage is full — export the library and remove some items');
    }
    this.items = next;
    this.listeners.forEach((fn) => fn());
  }

  /** Adds a group of elements as one item (newest first). */
  add(elements: readonly SketchElement[], name?: string): LibraryItem | null {
    const normalized = normalizeItemElements(elements);
    if (!normalized.length) return null;
    const item: LibraryItem = { id: generateId(), name: name?.trim() || suggestItemName(normalized), created: Date.now(), elements: normalized };
    this.commit([item, ...this.items]);
    return item;
  }

  remove(id: string): void {
    this.commit(this.items.filter((i) => i.id !== id));
  }

  rename(id: string, name: string): void {
    const n = name.trim().slice(0, 80);
    if (n) this.commit(this.items.map((i) => (i.id === id ? { ...i, name: n } : i)));
  }

  /** Imports a library file; items already present (same id) are skipped. Returns how many were added. */
  importLibrary(raw: string): number {
    const { items, files } = parseLibrary(raw);
    if (Object.keys(files).length) fileStore.add(Object.values(files));
    const known = new Set(this.items.map((i) => i.id));
    const fresh = items.filter((i) => !known.has(i.id));
    if (fresh.length) this.commit([...fresh, ...this.items]);
    return fresh.length;
  }

  /**
   * Imports a library from a URL, e.g. "Add to Excalidraw" on libraries.excalidraw.com, which
   * redirects back with #addLibrary=<url>. Only https (or same-origin) URLs are fetched.
   */
  async importFromUrl(url: string): Promise<number> {
    const u = new URL(url, location.href);
    if (u.protocol !== 'https:' && u.origin !== location.origin) throw new Error('Libraries can only be loaded over https');
    const res = await fetch(u.href);
    if (!res.ok) throw new Error(`Couldn’t download the library (${res.status})`);
    const text = await res.text();
    if (text.length > 20 * 1024 * 1024) throw new Error('Library is too large');
    return this.importLibrary(text);
  }

  async export(format: 'sketchboard' | 'excalidraw', items: readonly LibraryItem[] = this.items, name = 'my-library'): Promise<void> {
    if (format === 'excalidraw') {
      downloadBlob(new Blob([serializeExcalidrawLibrary(items)], { type: 'application/json' }), `${name}${EXCALIDRAW_LIBRARY_EXTENSION}`);
      return;
    }
    const ids = items.flatMap((i) => i.elements.flatMap((e) => (e.type === 'image' ? [e.fileId] : [])));
    await fileStore.loadFromDb(ids.filter((id) => !fileStore.has(id)));
    downloadBlob(new Blob([serializeLibrary(items, fileStore.pick(ids))], { type: 'application/json' }), `${name}${LIBRARY_EXTENSION}`);
  }
}
