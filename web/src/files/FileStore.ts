import { Emitter } from '../core/Store';
import { generateId } from '../core/utils';
import type { BinaryFile } from '../core/types';

/**
 * Holds image data for image elements. Kept outside the scene so elements stay small
 * (cheap to diff, sync and autosave); the pixels are persisted separately in IndexedDB,
 * which - unlike localStorage - has room for many megabytes of images.
 */
const DB_NAME = 'sketchboard';
const STORE = 'files';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export class FileStore {
  private files = new Map<string, BinaryFile>();
  private images = new Map<string, HTMLImageElement>();
  private emitter = new Emitter<{ loaded: string; added: BinaryFile[] }>();
  private db: Promise<IDBDatabase | null> | null = null;

  get(id: string): BinaryFile | undefined {
    return this.files.get(id);
  }

  has(id: string): boolean {
    return this.files.has(id);
  }

  /** Returns a decoded image if ready; kicks off decoding otherwise (fires 'loaded' when done). */
  getImage(id: string): HTMLImageElement | null {
    const cached = this.images.get(id);
    if (cached) return cached.complete && cached.naturalWidth ? cached : null;
    const file = this.files.get(id);
    if (!file || typeof Image === 'undefined') return null;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => this.emitter.emit('loaded', id);
    img.src = file.dataURL;
    this.images.set(id, img);
    return null;
  }

  /** Adds files (from paste, file open, peers…) and persists them. */
  add(files: readonly BinaryFile[], persist = true): void {
    const fresh = files.filter((f) => f && typeof f.dataURL === 'string' && f.dataURL.startsWith('data:image/') && !this.files.has(f.id));
    if (!fresh.length) return;
    for (const f of fresh) this.files.set(f.id, f);
    this.emitter.emit('added', fresh);
    if (persist) void this.persist(fresh);
  }

  /** Loads the given ids from IndexedDB (after restoring a scene from local storage). */
  async loadFromDb(ids: readonly string[]): Promise<void> {
    const db = await this.database();
    const missing = ids.filter((id) => !this.files.has(id));
    if (!db || !missing.length) return;
    const found = await Promise.all(
      missing.map(
        (id) =>
          new Promise<BinaryFile | undefined>((resolve) => {
            const req = db.transaction(STORE).objectStore(STORE).get(id);
            req.onsuccess = () => resolve(req.result as BinaryFile | undefined);
            req.onerror = () => resolve(undefined);
          }),
      ),
    );
    this.add(found.filter((f): f is BinaryFile => !!f), false);
  }

  pick(ids: Iterable<string>): Record<string, BinaryFile> {
    const out: Record<string, BinaryFile> = {};
    for (const id of ids) {
      const f = this.files.get(id);
      if (f) out[id] = f;
    }
    return out;
  }

  on<K extends 'loaded' | 'added'>(event: K, fn: (p: K extends 'loaded' ? string : BinaryFile[]) => void): () => void {
    return this.emitter.on(event, fn as never);
  }

  private database() {
    return (this.db ??= openDb());
  }

  private async persist(files: BinaryFile[]): Promise<void> {
    const db = await this.database();
    if (!db) return;
    const tx = db.transaction(STORE, 'readwrite');
    files.forEach((f) => tx.objectStore(STORE).put(f));
  }
}

export const fileStore = new FileStore();

const MAX_DIMENSION = 2000;

/**
 * Reads an image file, downsizing very large photos so boards stay fast and sync quickly.
 * SVGs are kept as vectors.
 */
export async function imageFileToBinary(file: Blob): Promise<{ file: BinaryFile; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('Not an image');
  const original = await blobToDataURL(file);
  const img = await loadImage(original);
  let { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) {
    w = 300;
    h = 200;
  }
  let dataURL = original;
  let mimeType = file.type;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  if (file.type !== 'image/svg+xml' && (scale < 1 || file.size > 1_500_000)) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    mimeType = 'image/webp';
    dataURL = canvas.toDataURL(mimeType, 0.9);
    if (!dataURL.startsWith('data:image/webp')) {
      mimeType = 'image/png';
      dataURL = canvas.toDataURL(mimeType);
    }
    w = canvas.width;
    h = canvas.height;
  }
  return { file: { id: generateId(), mimeType, dataURL, created: Date.now() }, width: w, height: h };
}

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
