import type { AppState, BinaryFile, SceneData, SketchElement } from '../core/types';
import { isFigure } from '../elements/figures/figures';
import { bakesRotation, normalizeAngle } from '../elements/rotation';
import { isCodeLanguage } from '../elements/code/highlight';
import { codeLayout } from '../elements/code/codeLayout';

const ELEMENT_TYPES = new Set(['rectangle', 'diamond', 'ellipse', 'line', 'arrow', 'freedraw', 'text', 'image', 'table', 'figure', 'code']);

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
  const elements = d.elements.filter(isValidElement).map(cleanAngle).map(migrate);
  const files: Record<string, BinaryFile> = {};
  for (const [id, f] of Object.entries(d.files ?? {})) {
    if (f && typeof f.dataURL === 'string' && f.dataURL.startsWith('data:image/')) files[id] = { ...f, id };
  }
  return { type: 'sketchboard', version: 1, elements, files, appState: d.appState ?? {} };
}

/** Rotation: finite and normalised; lines / arrows / ink never keep one (their points carry it). */
function cleanAngle(el: SketchElement): SketchElement {
  if (!('angle' in el)) return el;
  const { angle, ...rest } = el;
  if (bakesRotation(el) || typeof angle !== 'number' || !Number.isFinite(angle) || !normalizeAngle(angle)) return rest as SketchElement;
  return { ...el, angle: normalizeAngle(angle) };
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
  if (el.type === 'code') {
    const marks: Record<string, 'yellow' | 'green' | 'red' | 'blue'> = {};
    for (const [k, v] of Object.entries(el.marks ?? {})) {
      if (/^\d{1,5}$/.test(k) && ['yellow', 'green', 'red', 'blue'].includes(v)) marks[k] = v;
    }
    const fixed = {
      ...el,
      code: typeof el.code === 'string' ? el.code.slice(0, 200_000) : '',
      language: isCodeLanguage(el.language) ? el.language : 'plain',
      theme: el.theme === 'light' ? ('light' as const) : ('dark' as const),
      fontSize: Math.min(96, Math.max(6, Number(el.fontSize) || 16)),
      lineNumbers: el.lineNumbers !== false,
      showLanguage: el.showLanguage !== false,
      title: typeof el.title === 'string' ? el.title.slice(0, 120) : '',
      marks,
      printMode: undefined,
    };
    const l = codeLayout(fixed);
    return { ...fixed, width: l.width, height: l.height };
  }
  if (el.type === 'figure') {
    const tail = el.tail && Number.isFinite(el.tail.x) && Number.isFinite(el.tail.y)
      ? { x: Math.max(-20, Math.min(20, el.tail.x)), y: Math.max(-20, Math.min(20, el.tail.y)) }
      : undefined;
    return { ...el, figure: isFigure(el.figure) ? el.figure : 'fc-process', tail };
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
