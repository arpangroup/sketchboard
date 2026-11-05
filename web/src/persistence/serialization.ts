import type { AppState, BinaryFile, SceneData, SketchElement } from '../core/types';

const ELEMENT_TYPES = new Set(['rectangle', 'diamond', 'ellipse', 'line', 'arrow', 'freedraw', 'text', 'image', 'table']);

export function serializeScene(elements: readonly SketchElement[], appState: AppState, includeDeleted = false): SceneData {
  return {
    type: 'sketchboard',
    version: 1,
    elements: includeDeleted ? [...elements] : elements.filter((e) => !e.isDeleted),
    appState: {
      pageSetup: appState.pageSetup,
      gridEnabled: appState.gridEnabled,
      viewColorMode: appState.viewColorMode,
      viewport: appState.viewport,
    },
  };
}

/** Validates untrusted input (files, storage, clipboard) before it enters the scene. */
export function parseScene(raw: unknown): SceneData {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object' || (data as SceneData).type !== 'sketchboard') {
    throw new Error('Not a SketchBoard file');
  }
  const d = data as SceneData;
  if (!Array.isArray(d.elements)) throw new Error('Invalid file: missing elements');
  const elements = d.elements.filter(isValidElement).map(migrate);
  const files: Record<string, BinaryFile> = {};
  for (const [id, f] of Object.entries(d.files ?? {})) {
    if (f && typeof f.dataURL === 'string' && f.dataURL.startsWith('data:image/')) files[id] = { ...f, id };
  }
  return { type: 'sketchboard', version: 1, elements, files, appState: d.appState ?? {} };
}

/** Upgrades elements saved by older versions. */
function migrate(el: SketchElement): SketchElement {
  if (el.type === 'freedraw') {
    return { ...el, kind: el.kind ?? 'pen', pressures: Array.isArray(el.pressures) ? el.pressures : [] };
  }
  if (el.type === 'table') {
    // repair grids from older/foreign files so rows × cols always match
    const rows = Math.max(1, Math.min(500, Math.floor(el.rows) || 1));
    const cols = Math.max(1, Math.min(100, Math.floor(el.cols) || 1));
    const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => String(el.cells?.[r]?.[c] ?? '')));
    const colWidths = Array.from({ length: cols }, (_, c) => Number(el.colWidths?.[c]) || 120);
    const rowHeights = Array.from({ length: rows }, (_, r) => Number(el.rowHeights?.[r]) || 40);
    return { ...el, rows, cols, cells, colWidths, rowHeights };
  }
  if (el.type === 'text') {
    return { ...el, fontWeight: el.fontWeight ?? 'normal', fontStyle: el.fontStyle ?? 'normal', underline: !!el.underline };
  }
  return el;
}

function isValidElement(e: unknown): e is SketchElement {
  if (!e || typeof e !== 'object') return false;
  const el = e as SketchElement;
  return (
    typeof el.id === 'string' &&
    ELEMENT_TYPES.has(el.type) &&
    Number.isFinite(el.x) &&
    Number.isFinite(el.y) &&
    Number.isFinite(el.version) &&
    (el.type !== 'image' || typeof el.fileId === 'string')
  );
}
