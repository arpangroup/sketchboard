import { generateId, randomInteger } from '../core/utils';
import type {
  BaseElement,
  CodeDefaults,
  CodeElement,
  FigureElement,
  CurrentStyle,
  FreeDrawElement,
  FreeDrawKind,
  ImageElement,
  LinearElement,
  Point,
  ShapeElement,
  SketchElement,
  TableDefaults,
  TableElement,
  TextElement,
} from '../core/types';
import { measureText } from './textMetrics';
import { DEFAULT_STYLE } from '../core/constants';
import { relayout } from './table/tableLayout';
import { getFigure } from './figures/figures';
import { codeLayout } from './code/codeLayout';

/** Factory functions: the ONLY place elements are constructed. */

function base(type: SketchElement['type'], style: CurrentStyle, at: Point, zIndex: number): BaseElement {
  return {
    id: generateId(),
    type,
    x: at.x,
    y: at.y,
    width: 0,
    height: 0,
    strokeColor: style.strokeColor,
    backgroundColor: style.backgroundColor,
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: style.roughness,
    opacity: style.opacity,
    seed: randomInteger(),
    version: 1,
    versionNonce: randomInteger(),
    zIndex,
    isDeleted: false,
    locked: false,
    updatedAt: Date.now(),
  };
}

export const createShape = (
  type: ShapeElement['type'],
  style: CurrentStyle,
  at: Point,
  zIndex: number,
): ShapeElement => ({ ...base(type, style, at, zIndex), type, rounded: style.rounded });

export const createLinear = (
  type: LinearElement['type'],
  style: CurrentStyle,
  at: Point,
  zIndex: number,
): LinearElement => ({
  ...base(type, style, at, zIndex),
  type,
  points: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
  startArrowhead: type === 'arrow' ? style.startArrowhead : 'none',
  endArrowhead: type === 'arrow' ? style.endArrowhead : 'none',
});

export const createFreeDraw = (
  style: CurrentStyle,
  at: Point,
  zIndex: number,
  kind: FreeDrawKind = 'pen',
): FreeDrawElement => ({
  ...base('freedraw', style, at, zIndex),
  type: 'freedraw',
  points: [{ x: 0, y: 0 }],
  pressures: [],
  kind,
  ...(kind === 'highlighter' ? { strokeColor: style.highlightColor, opacity: 100, strokeStyle: 'solid' as const } : {}),
});

export const createImage = (
  fileId: string,
  bounds: { x: number; y: number; width: number; height: number },
  zIndex: number,
): ImageElement => ({
  ...base('image', { ...DEFAULT_STYLE, strokeColor: 'transparent' }, { x: bounds.x, y: bounds.y }, zIndex),
  type: 'image',
  fileId,
  width: bounds.width,
  height: bounds.height,
});

/** New table filling `bounds` (rows/cols from the table defaults). */
export function createTable(
  style: CurrentStyle,
  defaults: TableDefaults,
  bounds: { x: number; y: number; width: number; height: number },
  zIndex: number,
): TableElement {
  const { rows, cols } = defaults;
  const el: TableElement = {
    ...base('table', style, { x: bounds.x, y: bounds.y }, zIndex),
    type: 'table',
    rows,
    cols,
    colWidths: Array(cols).fill(bounds.width / cols),
    rowHeights: Array(rows).fill(bounds.height / rows),
    cells: Array.from({ length: rows }, () => Array(cols).fill('')),
    cellPadding: defaults.cellPadding,
    headerRow: defaults.headerRow,
    headerColor: defaults.headerColor,
    banded: defaults.banded,
    textColor: defaults.textColor,
    fontSize: Math.min(style.fontSize, 20),
    fontFamily: style.fontFamily,
    textAlign: 'left',
    width: bounds.width,
    height: bounds.height,
  };
  return { ...el, ...relayout(el) };
}

/** Code block sized to its content. */
export function createCode(style: CurrentStyle, defaults: CodeDefaults, at: Point, zIndex: number, code = ''): CodeElement {
  const el: CodeElement = {
    ...base('code', { ...style, roughness: Math.min(style.roughness, 1) }, at, zIndex),
    type: 'code',
    code,
    language: defaults.language,
    theme: defaults.theme,
    fontSize: defaults.fontSize,
    lineNumbers: defaults.lineNumbers,
    showLanguage: defaults.showLanguage,
    title: '',
    marks: {},
  };
  const l = codeLayout(el);
  return { ...el, width: l.width, height: l.height };
}

/** Gallery figure (callouts get their default tail). */
export function createFigure(figure: string, style: CurrentStyle, at: Point, zIndex: number): FigureElement {
  const tail = getFigure(figure)?.tail;
  return { ...base('figure', style, at, zIndex), type: 'figure', figure, ...(tail ? { tail: { ...tail } } : {}) };
}

export function createText(style: CurrentStyle, at: Point, zIndex: number, text = ''): TextElement {
  const m = measureText(text || ' ', style.fontSize, style.fontFamily, style);
  return {
    ...base('text', style, at, zIndex),
    type: 'text',
    text,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    textAlign: style.textAlign,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    underline: style.underline,
    width: m.width,
    height: m.height,
  };
}

/**
 * Returns a NEW element with the patch applied and version bumped.
 * Elements are never mutated in place.
 */
export function updateElement<T extends SketchElement>(el: T, patch: Partial<T>): T {
  return {
    ...el,
    ...patch,
    version: el.version + 1,
    versionNonce: randomInteger(),
    updatedAt: Date.now(),
  };
}

/** Deep-ish clone with a fresh identity (duplicate / paste). */
export function cloneElement<T extends SketchElement>(el: T, offset: Point, zIndex: number): T {
  return {
    ...el,
    ...('points' in el ? { points: el.points.map((p) => ({ ...p })) } : {}),
    ...('pressures' in el ? { pressures: [...el.pressures] } : {}),
    ...('tail' in el && el.tail ? { tail: { ...el.tail } } : {}),
    ...('marks' in el ? { marks: { ...el.marks } } : {}),
    ...('cells' in el ? { cells: el.cells.map((r) => [...r]), colWidths: [...el.colWidths], rowHeights: [...el.rowHeights] } : {}),
    id: generateId(),
    x: el.x + offset.x,
    y: el.y + offset.y,
    seed: randomInteger(),
    version: 1,
    versionNonce: randomInteger(),
    zIndex,
    isDeleted: false,
    updatedAt: Date.now(),
  };
}
