import { generateId } from '../core/utils';
import type { BinaryFile, LibraryItem, SketchElement } from '../core/types';
import { unionBounds } from '../core/geometry';
import { getElementBounds } from '../elements/registry';
import { fromExcalidraw, toExcalidraw } from '../persistence/excalidraw';
import { parseScene } from '../persistence/serialization';

/**
 * Library file formats.
 *  - .sketchboardlib  { type: 'sketchboardlib', version: 1, items: LibraryItem[], files }
 *  - .excalidrawlib   v2 { type: 'excalidrawlib', libraryItems: [{ id, name, created, elements }] }
 *                     v1 { type: 'excalidrawlib', library: Element[][] }  (import only)
 */
export const LIBRARY_EXTENSION = '.sketchboardlib';
export const EXCALIDRAW_LIBRARY_EXTENSION = '.excalidrawlib';
export const LIBRARY_FILE_ACCEPT = '.sketchboardlib,.excalidrawlib,application/json';

export const isLibraryFileName = (name: string) => /\.(sketchboardlib|excalidrawlib)$/i.test(name);

export interface ParsedLibrary {
  items: LibraryItem[];
  files: Record<string, BinaryFile>;
}

/** Moves elements so their bounding box starts at (0, 0) — items are position-independent. */
export function normalizeItemElements(elements: readonly SketchElement[]): SketchElement[] {
  const live = elements.filter((e) => !e.isDeleted);
  const b = unionBounds(live.map(getElementBounds));
  if (!b) return [];
  return live
    .slice()
    .sort((a, c) => a.zIndex - c.zIndex)
    .map((e, i) => ({ ...e, x: e.x - b.x, y: e.y - b.y, zIndex: i, locked: false }));
}

/** A readable default name: the first bit of text in the item, else the kind of shape. */
export function suggestItemName(elements: readonly SketchElement[]): string {
  const text = elements.find((e) => e.type === 'text' && e.text.trim());
  if (text && text.type === 'text') return text.text.trim().split('\n')[0].slice(0, 40);
  const table = elements.find((e) => e.type === 'table');
  if (table && table.type === 'table') return `Table ${table.rows}×${table.cols}`;
  if (elements.length === 1) return elements[0].type[0].toUpperCase() + elements[0].type.slice(1);
  return `${elements.length} shapes`;
}

const cleanName = (n: unknown, elements: SketchElement[]) =>
  (typeof n === 'string' && n.trim() ? n.trim().slice(0, 80) : suggestItemName(elements));

export function parseLibrary(raw: unknown): ParsedLibrary {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object') throw new Error('Not a library file');
  const d = data as Record<string, unknown>;

  if (d.type === 'sketchboardlib') {
    const files = parseScene({ type: 'sketchboard', elements: [], files: d.files ?? {} }).files ?? {};
    const items = (Array.isArray(d.items) ? d.items : []).flatMap((it: Record<string, unknown>) => {
      const elements = normalizeItemElements(parseScene({ type: 'sketchboard', elements: it?.elements ?? [] }).elements);
      if (!elements.length) return [];
      return [{ id: typeof it.id === 'string' ? it.id : generateId(), name: cleanName(it.name, elements), created: Number(it.created) || Date.now(), elements }];
    });
    return { items, files };
  }

  if (d.type === 'excalidrawlib') {
    const groups: Array<{ id?: unknown; name?: unknown; created?: unknown; elements: unknown[] }> = Array.isArray(d.libraryItems)
      ? (d.libraryItems as Array<Record<string, unknown>>).map((i) => ({ ...i, elements: Array.isArray(i.elements) ? i.elements : [] }))
      : Array.isArray(d.library)
        ? (d.library as unknown[]).map((elements) => ({ elements: Array.isArray(elements) ? elements : [] }))
        : [];
    const items = groups.flatMap((g) => {
      const { scene } = fromExcalidraw({ type: 'excalidraw', elements: g.elements, files: {} });
      const elements = normalizeItemElements(parseScene(scene).elements);
      if (!elements.length) return [];
      return [{ id: typeof g.id === 'string' ? g.id : generateId(), name: cleanName(g.name, elements), created: Number(g.created) || Date.now(), elements }];
    });
    return { items, files: {} };
  }
  throw new Error('Not a SketchBoard or Excalidraw library');
}

export function serializeLibrary(items: readonly LibraryItem[], files: Record<string, BinaryFile>): string {
  return JSON.stringify({ type: 'sketchboardlib', version: 1, source: typeof location !== 'undefined' ? location.origin : 'sketchboard', items, files }, null, 2);
}

export function serializeExcalidrawLibrary(items: readonly LibraryItem[]): string {
  return JSON.stringify(
    {
      type: 'excalidrawlib',
      version: 2,
      source: typeof location !== 'undefined' ? location.origin : 'sketchboard',
      libraryItems: items.map((i) => ({
        id: i.id,
        status: 'unpublished',
        created: i.created,
        name: i.name,
        elements: toExcalidraw(i.elements).elements,
      })),
    },
    null,
    2,
  );
}
