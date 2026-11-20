import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import { createShape, createText } from '../elements/factory';
import { getBuiltinLibrary, getBuiltinSections } from '../library/builtin';
import { normalizeItemElements, parseLibrary, serializeExcalidrawLibrary, serializeLibrary, suggestItemName } from '../library/libraryFormat';
import { LibraryStore } from '../library/LibraryStore';
import { exportToLink, loadFromLink, parseLinkFromHash } from '../cloud/shareLink';
import type { WorkspaceApi } from '../cloud/WorkspaceApi';
import { getElementBounds } from '../elements/registry';

/** In-memory Storage double (optionally "full" to simulate quota errors). */
class MemoryStorage {
  data = new Map<string, string>();
  full = false;
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => {
    if (this.full) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  };
  removeItem = (k: string) => void this.data.delete(k);
}

const shapes = () => [
  { ...createShape('rectangle', DEFAULT_STYLE, { x: 500, y: 300 }, 4), width: 100, height: 50 },
  createText(DEFAULT_STYLE, { x: 520, y: 310 }, 5, 'Login button'),
];

describe('library items', () => {
  it('normalises elements to start at (0, 0) and drops deleted ones', () => {
    const els = [...shapes(), { ...createShape('ellipse', DEFAULT_STYLE, { x: 0, y: 0 }, 6), isDeleted: true }];
    const n = normalizeItemElements(els);
    expect(n).toHaveLength(2);
    const minX = Math.min(...n.map((e) => getElementBounds(e).x));
    const minY = Math.min(...n.map((e) => getElementBounds(e).y));
    expect(minX).toBeCloseTo(0, 5);
    expect(minY).toBeCloseTo(0, 5);
    expect(suggestItemName(n)).toBe('Login button');
  });

  it('round-trips .sketchboardlib and reads .excalidrawlib (v2 and v1)', () => {
    const item = { id: 'it1', name: 'Button', created: 1, elements: normalizeItemElements(shapes()) };
    const back = parseLibrary(serializeLibrary([item], {}));
    expect(back.items).toHaveLength(1);
    expect(back.items[0]).toMatchObject({ id: 'it1', name: 'Button' });
    expect(back.items[0].elements.map((e) => e.type)).toEqual(['rectangle', 'text']);

    const ex = JSON.parse(serializeExcalidrawLibrary([item]));
    expect(ex.type).toBe('excalidrawlib');
    expect(ex.libraryItems[0].elements[0].type).toBe('rectangle');
    const fromEx = parseLibrary(ex);
    expect(fromEx.items[0]).toMatchObject({ id: 'it1', name: 'Button' });

    const v1 = { type: 'excalidrawlib', version: 1, library: [ex.libraryItems[0].elements] };
    expect(parseLibrary(v1).items[0].elements).toHaveLength(2);
    expect(() => parseLibrary({ type: 'nope' })).toThrow();
  });

  it('builds every built-in item with unique ids in named sections', () => {
    const all = getBuiltinLibrary();
    expect(all.length).toBeGreaterThan(40);
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    expect(all.every((i) => i.elements.length > 0 && i.category)).toBe(true);
    const names = getBuiltinSections().map((s) => s.name);
    expect(names).toEqual([
      'Database', 'UML & class diagrams', 'Callouts', 'Flowchart', 'Forms & UI', 'Architecture',
      'Sales & CRM', 'Sales dashboards & charts', 'Products, inventory & CPQ',
    ]);
    const sales = all.filter((i) => (i.category ?? '').startsWith('Sales') || (i.category ?? '').startsWith('Products')).map((i) => i.name);
    for (const n of ['Sales Cloud (CRM)', 'Campaign', 'Lead', 'Lead status badges', 'Account', 'Contact', 'Opportunity / deal', 'Sales dashboard', 'Product card', 'CPQ flow']) {
      expect(sales.includes(n)).toBe(true);
    }
    expect(all.filter((i) => i.category === 'Callouts').every((i) => i.elements.some((e) => e.type === 'figure'))).toBe(true);
    const forms = all.filter((i) => i.category === 'Forms & UI').map((i) => i.name);
    for (const n of ['Text input', 'Password input', 'Checkbox', 'Radio group', 'List']) expect(forms.includes(n)).toBe(true);
  });
});

describe('personal library store', () => {
  it('adds, renames, removes and persists items', () => {
    const storage = new MemoryStorage();
    const lib = new LibraryStore(storage as unknown as Storage);
    let changes = 0;
    lib.subscribe(() => changes++);
    const item = lib.add(shapes())!;
    expect(lib.getItems()).toHaveLength(1);
    lib.rename(item.id, 'Primary button');
    expect(new LibraryStore(storage as unknown as Storage).getItems()[0].name).toBe('Primary button'); // reloaded from storage
    lib.remove(item.id);
    expect(lib.getItems()).toHaveLength(0);
    expect(changes).toBe(3);
  });

  it('skips duplicates on import and keeps the library intact when storage is full', () => {
    const storage = new MemoryStorage();
    const lib = new LibraryStore(storage as unknown as Storage);
    const file = serializeLibrary([{ id: 'x', name: 'X', created: 1, elements: normalizeItemElements(shapes()) }], {});
    expect(lib.importLibrary(file)).toBe(1);
    expect(lib.importLibrary(file)).toBe(0);
    storage.full = true;
    expect(() => lib.add(shapes())).toThrow(/storage is full/);
    expect(lib.getItems()).toHaveLength(1);
  });
});

describe('export to link', () => {
  it('encrypts the scene; the server only ever sees ciphertext', async () => {
    const stored = new Map<string, string>();
    const api = {
      createLink: async (c: string) => (stored.set('abc12345', c), 'abc12345'),
      getLink: async (id: string) => stored.get(id)!,
    } as unknown as WorkspaceApi;
    const scene = { type: 'sketchboard' as const, version: 1 as const, elements: shapes() };
    const url = await exportToLink(api, scene, 'https://app.test/');
    const link = parseLinkFromHash(new URL(url).hash)!;
    expect(link.id).toBe('abc12345');
    expect(stored.get('abc12345')).not.toMatch(/Login button/);
    const back = await loadFromLink(api, link.id, link.key);
    expect(back.elements.map((e) => e.type)).toEqual(['rectangle', 'text']);
    await expect(loadFromLink(api, link.id, 'AAAAAAAAAAAAAAAAAAAAAA')).rejects.toThrow(/damaged/);
  });
});
