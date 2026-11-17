import { LINE_HEIGHT } from '../core/constants';
import { generateId, randomInteger } from '../core/utils';
import type {
  ArrowBinding,
  Arrowhead,
  BinaryFile,
  CodeElement,
  FigureElement,
  FrameElement,
  FillStyle,
  FreeDrawElement,
  ImageElement,
  LinearElement,
  Point,
  SceneData,
  ShapeElement,
  SketchElement,
  StrokeStyle,
  TableElement,
  TextAlign,
  TextElement,
} from '../core/types';
import { pointsToElementGeometry } from '../elements/handlers/pointShapes';
import { highlighterSize, penSize } from '../elements/strokeOutline';
import { cellLines, cellWeight, colOffsets, relayout, rowOffsets } from '../elements/table/tableLayout';
import { measureText, textBoxSize, wrapText } from '../elements/textMetrics';
import { canHoldLabel } from '../elements/boundText';
import { canBindTo } from '../elements/binding';
import { figureGeometry, isFigure } from '../elements/figures/figures';
import { CODE_THEMES, codeLayout } from '../elements/code/codeLayout';

/**
 * Adapter between SketchBoard's element model and the Excalidraw file format
 * (https://docs.excalidraw.com/docs/codebase/json-schema).
 *
 * Import maps every Excalidraw element onto the closest SketchBoard element; things SketchBoard
 * has no equivalent for (rotation of boxes, frames, embeds) are converted rather than dropped.
 * Export does the reverse. SketchBoard-only details (tables, bold/italic, highlighter ink, exact fonts)
 * ride along in Excalidraw's `customData`, which Excalidraw preserves, so a SketchBoard → Excalidraw →
 * SketchBoard round trip is lossless as long as those elements weren't restructured in Excalidraw.
 */

export const EXCALIDRAW_EXTENSION = '.excalidraw';
export const EXCALIDRAW_MIME = 'application/vnd.excalidraw+json';

/* eslint-disable @typescript-eslint/no-explicit-any */
type ExEl = Record<string, any>;

export interface ExcalidrawImport {
  scene: SceneData;
  /** Human-readable notes about anything that couldn't be carried over exactly. */
  notes: string[];
}

export const isExcalidrawData = (d: unknown): d is { type: string; elements: unknown[] } =>
  !!d &&
  typeof d === 'object' &&
  ((d as { type?: unknown }).type === 'excalidraw' || (d as { type?: unknown }).type === 'excalidraw/clipboard') &&
  Array.isArray((d as { elements?: unknown }).elements);

// ───────────────────────────── shared mappings ─────────────────────────────

/** Excalidraw font ids → SketchBoard font families. */
const FONT_FROM_EX: Record<number, string> = {
  1: 'hand', // Virgil
  2: 'Arial', // Helvetica
  3: 'code', // Cascadia
  5: 'hand', // Excalifont
  6: 'Nunito',
  7: 'Lilita One',
  8: 'Comic Sans MS', // Comic Shanns
  9: 'Arial', // Liberation Sans
};

function fontToEx(family: string): number {
  if (['hand', 'Caveat', 'Patrick Hand', 'Indie Flower', 'Kalam'].includes(family)) return 5;
  if (family === 'Comic Sans MS') return 8;
  if (family === 'Lilita One') return 7;
  if (['code', 'Fira Code', 'Courier New', 'JetBrains Mono'].includes(family)) return 3;
  if (['Arial', 'Verdana', 'Helvetica'].includes(family)) return 2;
  return 6; // Nunito: Excalidraw's "normal" font
}

function arrowheadFromEx(v: unknown): Arrowhead {
  switch (v) {
    case 'arrow':
      return 'arrow';
    case 'triangle':
      return 'triangle';
    case 'triangle_outline':
      return 'triangle_outline';
    case 'diamond':
      return 'diamond';
    case 'diamond_outline':
      return 'diamond_outline';
    case 'bar':
      return 'bar';
    case 'dot':
    case 'circle':
    case 'circle_outline':
      return 'dot';
    default:
      return 'none';
  }
}

const ARROWHEAD_TO_EX: Record<Arrowhead, string | null> = {
  arrow: 'arrow',
  triangle: 'triangle',
  triangle_outline: 'triangle_outline',
  diamond: 'diamond',
  diamond_outline: 'diamond_outline',
  bar: 'bar',
  dot: 'circle',
  none: null,
};

const FILLS = new Set<FillStyle>(['hachure', 'cross-hatch', 'solid', 'zigzag', 'dots']);
const STROKES = new Set<StrokeStyle>(['solid', 'dashed', 'dotted']);
const ALIGNS = new Set<TextAlign>(['left', 'center', 'right']);

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const str = (v: unknown, fallback: string, max = 100_000) => (typeof v === 'string' ? v.slice(0, max) : fallback);
const color = (v: unknown, fallback: string) => (typeof v === 'string' && v.length < 64 ? v : fallback);
/** Excalidraw binding → ours: a fixed point pins the spot, otherwise the end aims at the centre. */
function bindingFromEx(b: unknown): ArrowBinding | undefined {
  if (!b || typeof b !== 'object' || typeof (b as ExEl).elementId !== 'string') return undefined;
  const fp = (b as ExEl).fixedPoint;
  const ok = Array.isArray(fp) && Number.isFinite(fp[0]) && Number.isFinite(fp[1]);
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return { elementId: (b as ExEl).elementId, anchor: ok ? { x: c(fp[0]), y: c(fp[1]) } : { x: 0.5, y: 0.5 } };
}

const sb = (e: ExEl): Record<string, any> | undefined =>
  e.customData && typeof e.customData === 'object' && e.customData.sketchboard && typeof e.customData.sketchboard === 'object'
    ? e.customData.sketchboard
    : undefined;

/** Excalidraw's perfect-freehand nib is strokeWidth × 4.25. */
const EX_NIB = 4.25;

// ───────────────────────────── import ─────────────────────────────

export function fromExcalidraw(raw: unknown): ExcalidrawImport {
  if (!isExcalidrawData(raw)) throw new Error('Not an Excalidraw file');
  const data = raw as { elements: unknown[]; files?: Record<string, any>; appState?: Record<string, any> };
  const live = data.elements.filter((e): e is ExEl => !!e && typeof e === 'object' && !(e as ExEl).isDeleted && typeof (e as ExEl).id === 'string');

  const out: SketchElement[] = [];
  const consumed = new Set<string>();
  const usedIds = new Set<string>();
  const skipped = new Map<string, number>();
  let z = 0;

  const uniqueId = (id: unknown) => {
    let s = typeof id === 'string' && id ? id.slice(0, 64) : generateId();
    while (usedIds.has(s)) s = generateId();
    usedIds.add(s);
    return s;
  };

  // groups SketchBoard made to hold the parts of one table / code block / figure: not real groups
  const partGroups = new Set<string>();
  for (const e of live) {
    const t = sb(e);
    for (const id of [t?.table, t?.code?.id, t?.figure ? t?.id : undefined, t?.figurePart]) if (typeof id === 'string') partGroups.add(`${id}-group`);
  }
  const groupsOf = (e: ExEl): string[] | undefined => {
    const g = Array.isArray(e.groupIds) ? e.groupIds.filter((x: unknown): x is string => typeof x === 'string' && !partGroups.has(x)).slice(0, 32) : [];
    return g.length ? g : undefined;
  };
  const linkOf = (e: ExEl): string | undefined => {
    const l = typeof e.link === 'string' ? e.link.trim().slice(0, 2000) : '';
    return /^(https?:|mailto:|tel:)/i.test(l) ? l : undefined;
  };

  const base = (e: ExEl) => ({
    groupIds: groupsOf(e),
    frameId: typeof e.frameId === 'string' ? e.frameId : undefined,
    link: linkOf(e),
    id: uniqueId(e.id),
    x: num(e.x),
    y: num(e.y),
    width: Math.abs(num(e.width)),
    height: Math.abs(num(e.height)),
    strokeColor: color(e.strokeColor, '#1e1e1e'),
    backgroundColor: color(e.backgroundColor, 'transparent'),
    fillStyle: FILLS.has(e.fillStyle) ? (e.fillStyle as FillStyle) : 'hachure',
    strokeWidth: clamp(num(e.strokeWidth, 1), 0.5, 40),
    strokeStyle: STROKES.has(e.strokeStyle) ? (e.strokeStyle as StrokeStyle) : 'solid',
    roughness: clamp(Math.round(num(e.roughness, 1)), 0, 2),
    opacity: clamp(num(e.opacity, 100), 0, 100),
    seed: Math.floor(num(e.seed, randomInteger())),
    version: Math.max(1, Math.floor(num(e.version, 1))),
    versionNonce: Math.floor(num(e.versionNonce, randomInteger())),
    zIndex: z++,
    isDeleted: false,
    locked: !!e.locked,
    updatedAt: num(e.updated, Date.now()),
  });

  const angleOf = (e: ExEl) => {
    const a = num(e.angle) % (Math.PI * 2);
    return Math.abs(a) < 1e-4 || Math.abs(Math.abs(a) - Math.PI * 2) < 1e-4 ? 0 : a;
  };
  const rotator = (e: ExEl) => {
    const a = angleOf(e);
    const cx = num(e.x) + Math.abs(num(e.width)) / 2;
    const cy = num(e.y) + Math.abs(num(e.height)) / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return (p: Point): Point => (a ? { x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos } : p);
  };
  const absPoints = (e: ExEl): Point[] => {
    const rot = rotator(e);
    const pts = Array.isArray(e.points) ? e.points : [];
    return pts
      .filter((p: unknown) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .slice(0, 50_000)
      .map((p: number[]) => rot({ x: num(e.x) + p[0], y: num(e.y) + p[1] }));
  };

  const label = (text: string, x: number, y: number, fontSize: number, colorValue: string): TextElement => {
    const m = measureText(text, fontSize, 'normal');
    return {
      ...base({ x, y, strokeColor: colorValue, roughness: 0, strokeWidth: 1 }),
      type: 'text',
      width: m.width,
      height: m.height,
      text,
      fontSize,
      fontFamily: 'normal',
      textAlign: 'left',
      fontWeight: 'normal',
      fontStyle: 'normal',
      underline: false,
    };
  };

  // 1) Tables exported by SketchBoard: cell rectangles tagged in customData, rebuilt into one table.
  const tables = new Map<string, ExEl[]>();
  for (const e of live) {
    const tag = sb(e);
    if (e.type === 'rectangle' && tag && typeof tag.table === 'string') {
      const list = tables.get(tag.table) ?? [];
      list.push(e);
      tables.set(tag.table, list);
    }
  }
  const boundText = new Map<string, ExEl>();
  for (const e of live) if (e.type === 'text' && typeof e.containerId === 'string') boundText.set(e.containerId, e);
  const rebuiltTables = new Map<string, TableElement>(); // first cell id → table
  for (const [, rects] of tables) {
    const props = rects.map(sb).find((t) => t?.props)?.props as Partial<TableElement> | undefined;
    const rows = Math.floor(num(props?.rows));
    const cols = Math.floor(num(props?.cols));
    if (!props || rows < 1 || cols < 1 || rows > 500 || cols > 100) continue;
    const grid = new Map(rects.map((r) => [`${sb(r)!.row}:${sb(r)!.col}`, r]));
    if (grid.size !== rows * cols) continue; // a cell was deleted in Excalidraw → keep as plain shapes
    const cell = (r: number, c: number) => grid.get(`${r}:${c}`);
    if (Array.from({ length: rows * cols }).some((_, i) => !cell(Math.floor(i / cols), i % cols))) continue;
    const first = cell(0, 0)!;
    const cells = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const t = boundText.get(cell(r, c)!.id);
        return t ? str(t.originalText ?? t.text, '', 10_000) : '';
      }),
    );
    const table = {
      ...props,
      ...base(first),
      type: 'table',
      strokeColor: color(first.strokeColor, '#1e1e1e'),
      backgroundColor: color(props.backgroundColor, 'transparent'),
      id: uniqueId(props.id),
      rows,
      cols,
      cells,
      colWidths: Array.from({ length: cols }, (_, c) => Math.abs(num(cell(0, c)!.width, 120))),
      rowHeights: Array.from({ length: rows }, (_, r) => Math.abs(num(cell(r, 0)!.height, 40))),
      // rotated tables: the cells were turned around the table centre, so use the stored position
      ...(num(props.angle) ? { x: num(props.x), y: num(props.y), angle: num(props.angle) } : {}),
    } as TableElement;
    rebuiltTables.set(first.id, { ...table, ...relayout(table) });
    for (const r of rects) {
      consumed.add(r.id);
      const t = boundText.get(r.id);
      if (t) consumed.add(t.id);
    }
    consumed.delete(first.id); // emitted in its stacking position below
  }

  const rebuiltFigures = new Set<string>();
  // 2) Everything else, in Excalidraw's stacking order.
  for (const e of live) {
    if (rebuiltTables.has(e.id)) {
      out.push({ ...rebuiltTables.get(e.id)!, zIndex: z++ });
      continue;
    }
    if (consumed.has(e.id)) continue;
    const angle = angleOf(e);
    switch (e.type) {
      case 'rectangle':
      case 'diamond':
      case 'ellipse': {
        const codeProps = e.type === 'rectangle' ? sb(e)?.code : undefined;
        if (codeProps && typeof codeProps === 'object' && typeof codeProps.code === 'string') {
          // a SketchBoard code block: restore it where the rectangle is now
          const b = base(e);
          out.push({ ...codeProps, ...b, type: 'code', id: b.id, strokeColor: codeProps.strokeColor ?? b.strokeColor } as CodeElement);
          if (typeof codeProps.id === 'string') rebuiltFigures.add(codeProps.id);
          break;
        }
        out.push({ ...base(e), type: e.type, rounded: !!e.roundness, ...(angle ? { angle } : {}) } as ShapeElement);
        break;
      }
      case 'line':
      case 'arrow': {
        let pts = absPoints(e);
        // gallery figures exported by SketchBoard come back as figures
        const ftag = sb(e);
        if (typeof ftag?.figurePart === 'string' && rebuiltFigures.has(ftag.figurePart)) break;
        if (e.type === 'line' && isFigure(ftag?.figure) && pts.length > 1 && ftag) {
          const xs = pts.map((p) => p.x);
          const ys = pts.map((p) => p.y);
          const cur = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
          const ob = ftag.outline ?? cur;
          const sx = ob.w > 0 ? cur.w / ob.w : 1;
          const sy = ob.h > 0 ? cur.h / ob.h : 1;
          const tail = ftag.tail && Number.isFinite(ftag.tail.x) && Number.isFinite(ftag.tail.y) ? { x: ftag.tail.x, y: ftag.tail.y } : undefined;
          const fa = num(ftag.angle);
          out.push({
            ...base(e),
            type: 'figure',
            figure: ftag.figure,
            // rotated figures were exported with turned points: restore the stored box + angle
            x: fa ? num(ftag.x) : cur.x + (num(ftag.x) - ob.x) * sx,
            y: fa ? num(ftag.y) : cur.y + (num(ftag.y) - ob.y) * sy,
            width: Math.max(1, fa ? num(ftag.width, cur.w) : num(ftag.width, cur.w) * sx),
            height: Math.max(1, fa ? num(ftag.height, cur.h) : num(ftag.height, cur.h) * sy),
            ...(fa ? { angle: fa } : {}),
            ...(tail ? { tail } : {}),
            ...(ftag.flipX ? { flipX: true } : {}),
            ...(ftag.flipY ? { flipY: true } : {}),
          } as FigureElement);
          if (typeof ftag.id === 'string') rebuiltFigures.add(ftag.id);
          break;
        }
        const polygon = e.type === 'line' && !!e.polygon;
        if (polygon && pts.length > 3) {
          const [a, b] = [pts[0], pts[pts.length - 1]];
          if (Math.hypot(a.x - b.x, a.y - b.y) < 0.5) pts = pts.slice(0, -1); // Excalidraw closes polygons explicitly
        }
        if (pts.length < 2) break;
        out.push({
          ...base(e),
          ...pointsToElementGeometry(pts),
          type: e.type,
          startArrowhead: arrowheadFromEx(e.startArrowhead),
          endArrowhead: arrowheadFromEx(e.endArrowhead),
          polygon,
          sharp: pts.length > 2 && (!!e.elbowed || !e.roundness),
          ...(polygon ? {} : { startBinding: bindingFromEx(e.startBinding), endBinding: bindingFromEx(e.endBinding) }),
        });
        break;
      }
      case 'freedraw': {
        const pts = absPoints(e);
        if (!pts.length) break;
        const tag = sb(e);
        const pressures: number[] = Array.isArray(e.pressures) ? e.pressures.map((p: unknown) => clamp(num(p, 0.5), 0, 1)) : [];
        const b = base(e);
        const highlighter = tag?.kind === 'highlighter';
        out.push({
          ...b,
          ...pointsToElementGeometry(pts),
          type: 'freedraw',
          kind: highlighter ? 'highlighter' : 'pen',
          pressures: !highlighter && !e.simulatePressure && pressures.length === pts.length ? pressures : [],
          strokeWidth: highlighter
            ? clamp(num(tag.strokeWidth, 2), 0.5, 40)
            : clamp(Math.round(((b.strokeWidth * EX_NIB - 0.6) / 2.2) * 10) / 10, 0.5, 40),
          opacity: highlighter ? clamp(num(tag.opacity, 100), 0, 100) : b.opacity,
        } as FreeDrawElement);
        break;
      }
      case 'text': {
        const tag = sb(e);
        if (typeof tag?.figurePart === 'string' && rebuiltFigures.has(tag.figurePart)) break; // part of a restored code block
        const bound = typeof e.containerId === 'string' && e.containerId ? e.containerId : undefined;
        // a fixed-width box (Excalidraw autoResize: false) wraps at its width
        const fixed = !bound && e.autoResize === false && num(e.width) > 0;
        // a shape's label or a fixed-width box: take the unwrapped text, SketchBoard wraps it itself
        const text = str((bound || fixed) && typeof e.originalText === 'string' ? e.originalText : e.text, '').replace(/\r\n/g, '\n');
        if (!text.trim()) break;
        const fmt = {
          fontWeight: tag?.fontWeight === 'bold' ? ('bold' as const) : ('normal' as const),
          fontStyle: tag?.fontStyle === 'italic' ? ('italic' as const) : ('normal' as const),
          underline: !!tag?.underline,
        };
        const fontFamily = typeof tag?.fontFamily === 'string' ? tag.fontFamily.slice(0, 60) : (FONT_FROM_EX[num(e.fontFamily, 5)] ?? 'hand');
        const fontSize = clamp(num(e.fontSize, 20), 4, 400);
        const textAlign: TextAlign = ALIGNS.has(e.textAlign) ? e.textAlign : 'left';
        const m = fixed
          ? textBoxSize({ text, fontSize, fontFamily, ...fmt, width: Math.abs(num(e.width)), fixedWidth: true })
          : measureText(text, fontSize, fontFamily, fmt);
        // keep the text where Excalidraw showed it: anchored by alignment horizontally, centred vertically
        const ex = num(e.x);
        const ew = Math.abs(num(e.width));
        const x = textAlign === 'center' ? ex + (ew - m.width) / 2 : textAlign === 'right' ? ex + ew - m.width : ex;
        const y = num(e.y) + (Math.abs(num(e.height)) - m.height) / 2;
        out.push({
          ...base(e),
          type: 'text',
          x,
          y,
          width: m.width,
          height: m.height,
          text,
          fontSize,
          fontFamily,
          textAlign,
          ...fmt,
          ...(angle ? { angle } : {}),
          ...(bound ? { containerId: bound } : {}),
          ...(fixed ? { fixedWidth: true } : {}),
        });
        break;
      }
      case 'image': {
        if (typeof e.fileId !== 'string') break;
        const sc = Array.isArray(e.scale) ? e.scale : [1, 1];
        out.push({
          ...base(e),
          type: 'image',
          fileId: e.fileId,
          ...(angle ? { angle } : {}),
          ...(num(sc[0], 1) < 0 ? { flipX: true } : {}),
          ...(num(sc[1], 1) < 0 ? { flipY: true } : {}),
        } as ImageElement);
        break;
      }
      case 'frame':
      case 'magicframe': {
        const b = base(e);
        out.push({
          ...b,
          type: 'frame',
          name: str(e.name, 'Frame', 200) || 'Frame',
          frameId: undefined,
          strokeColor: '#868e96',
          backgroundColor: 'transparent',
          roughness: 0,
          strokeWidth: 1,
          strokeStyle: 'solid',
        } as FrameElement);
        break;
      }
      case 'embeddable':
      case 'iframe': {
        const b = base(e);
        out.push({ ...b, type: 'rectangle', rounded: true, backgroundColor: 'transparent' } as ShapeElement);
        const link = str(e.link, '', 300);
        out.push(label(link ? `Embed: ${link}` : 'Embedded content', b.x + 10, b.y + 10, 14, '#6b7280'));
        break;
      }
      default:
        skipped.set(String(e.type), (skipped.get(String(e.type)) ?? 0) + 1);
    }
  }

  // frame references must point at a frame that made it in; labels at a shape that can hold one;
  // arrow ends at a shape they can attach to
  const frameIds = new Set(out.filter((e) => e.type === 'frame').map((e) => e.id));
  const holders = new Set(out.filter(canHoldLabel).map((e) => e.id));
  const targets = new Set(out.filter(canBindTo).map((e) => e.id));
  for (let i = 0; i < out.length; i++) {
    let e = out[i];
    if ((e.type === 'arrow' || e.type === 'line') && (e.startBinding || e.endBinding)) {
      const keep = (b?: ArrowBinding) => (b && targets.has(b.elementId) ? b : undefined);
      e = { ...e, startBinding: keep(e.startBinding), endBinding: keep(e.endBinding) };
    }
    if (e.frameId && (e.type === 'frame' || !frameIds.has(e.frameId))) e = { ...e, frameId: undefined };
    if (e.type === 'text' && e.containerId && !holders.has(e.containerId)) e = { ...e, containerId: undefined };
    out[i] = e;
  }

  const files: Record<string, BinaryFile> = {};
  for (const [id, f] of Object.entries(data.files ?? {})) {
    if (f && typeof f.dataURL === 'string' && f.dataURL.startsWith('data:image/')) {
      files[id] = { id, mimeType: str(f.mimeType, 'image/png', 100), dataURL: f.dataURL, created: num(f.created, Date.now()) };
    }
  }

  const notes: string[] = [];
  for (const [type, n] of skipped) notes.push(`${n} unsupported “${type}” item${n === 1 ? '' : 's'} skipped`);
  const missing = out.filter((e) => e.type === 'image' && !files[e.fileId]).length;
  if (missing) notes.push(`${missing} image${missing === 1 ? ' has' : 's have'} no picture data in the file`);

  const a = data.appState ?? {};
  const gridEnabled = typeof a.gridModeEnabled === 'boolean' ? a.gridModeEnabled : undefined;
  return {
    scene: { type: 'sketchboard', version: 1, elements: out, files, appState: gridEnabled === undefined ? {} : { gridEnabled } },
    notes,
  };
}

// ───────────────────────────── export ─────────────────────────────

const INDEX_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Valid, increasing fractional-index keys ("a0", "a1", … "b00", …) as Excalidraw expects. */
export function fractionalIndex(i: number): string {
  const n = INDEX_DIGITS.length;
  let width = 1;
  let span = n;
  let offset = i;
  while (offset >= span && width < 6) {
    offset -= span;
    width++;
    span = n ** width;
  }
  let digits = '';
  for (let k = 0; k < width; k++) {
    digits = INDEX_DIGITS[offset % n] + digits;
    offset = Math.floor(offset / n);
  }
  return String.fromCharCode('a'.charCodeAt(0) + width - 1) + digits;
}

export interface ExcalidrawExportOptions {
  gridEnabled?: boolean;
  source?: string;
}

export function toExcalidraw(
  elements: readonly SketchElement[],
  files: Record<string, BinaryFile> = {},
  opts: ExcalidrawExportOptions = {},
): { type: 'excalidraw'; version: 2; source: string; elements: ExEl[]; appState: ExEl; files: Record<string, ExEl> } {
  const out: ExEl[] = [];
  const sorted = elements.filter((e) => !e.isDeleted).sort((a, b) => a.zIndex - b.zIndex);

  const common = (el: SketchElement, extra: ExEl): ExEl => ({
    id: el.id,
    type: el.type,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    angle: el.angle ?? 0,
    strokeColor: el.strokeColor,
    backgroundColor: el.backgroundColor,
    fillStyle: el.fillStyle === 'dots' ? 'cross-hatch' : el.fillStyle,
    strokeWidth: el.strokeWidth,
    strokeStyle: el.strokeStyle,
    roughness: clamp(Math.round(el.roughness), 0, 2),
    opacity: el.opacity,
    groupIds: el.groupIds ?? [],
    frameId: el.frameId ?? null,
    index: null,
    roundness: null,
    seed: el.seed,
    version: el.version,
    versionNonce: el.versionNonce,
    isDeleted: false,
    boundElements: null,
    updated: el.updatedAt,
    link: el.link ?? null,
    locked: el.locked,
    ...extra,
  });

  /** Points re-based on the first point, which Excalidraw expects at [0, 0]. */
  const rebase = (el: LinearElement | FreeDrawElement, close = false) => {
    const abs = el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y }));
    if (close && abs.length > 2) abs.push(abs[0]);
    const o = abs[0] ?? { x: el.x, y: el.y };
    return { x: o.x, y: o.y, points: abs.map((p) => [p.x - o.x, p.y - o.y]), lastCommittedPoint: null };
  };

  // shape labels: Excalidraw binds text to rectangles, diamonds and ellipses
  const BINDABLE = new Set(['rectangle', 'diamond', 'ellipse']);
  const byId = new Map(sorted.map((e) => [e.id, e]));
  const labelFor = new Map<string, string>();
  for (const e of sorted) if (e.type === 'text' && e.containerId && BINDABLE.has(byId.get(e.containerId)?.type ?? '')) labelFor.set(e.containerId, e.id);
  // arrow binding: Excalidraw attaches arrows to the shapes it has natively (same id on both sides)
  const ARROW_TARGETS = new Set(['rectangle', 'diamond', 'ellipse', 'text', 'image']);
  const arrowsAt = new Map<string, string[]>();
  const exBinding = (b?: ArrowBinding) => {
    if (!b || !ARROW_TARGETS.has(byId.get(b.elementId)?.type ?? '')) return null;
    const centre = b.anchor.x === 0.5 && b.anchor.y === 0.5;
    return { elementId: b.elementId, focus: 0, gap: 4, ...(centre ? {} : { fixedPoint: [b.anchor.x, b.anchor.y] }) };
  };
  for (const e of sorted) {
    if (e.type !== 'arrow' && e.type !== 'line') continue;
    for (const b of [e.startBinding, e.endBinding]) {
      if (b && exBinding(b)) arrowsAt.set(b.elementId, [...(arrowsAt.get(b.elementId) ?? []), e.id]);
    }
  }
  const boundTo = (id: string, label?: string) => {
    const list = [...(label ? [{ type: 'text', id: label }] : []), ...[...new Set(arrowsAt.get(id) ?? [])].map((a) => ({ type: 'arrow', id: a }))];
    return list.length ? list : null;
  };

  for (const el of sorted) {
    const start = out.length;
    switch (el.type) {
      case 'rectangle':
      case 'diamond':
      case 'ellipse':
        out.push(
          common(el, {
            roundness: el.rounded ? { type: el.type === 'rectangle' ? 3 : 2 } : null,
            boundElements: boundTo(el.id, labelFor.get(el.id)),
          }),
        );
        break;
      case 'line':
      case 'arrow':
        out.push(
          common(el, {
            ...rebase(el, el.type === 'line' && !!el.polygon),
            roundness: el.sharp || el.polygon ? null : { type: 2 },
            startBinding: exBinding(el.startBinding),
            endBinding: exBinding(el.endBinding),
            startArrowhead: ARROWHEAD_TO_EX[el.startArrowhead] ?? null,
            endArrowhead: ARROWHEAD_TO_EX[el.endArrowhead] ?? null,
            ...(el.type === 'arrow' ? { elbowed: false } : { polygon: !!el.polygon }),
          }),
        );
        break;
      case 'freedraw': {
        const highlighter = el.kind === 'highlighter';
        const nib = highlighter ? highlighterSize(el.strokeWidth) : penSize(el.strokeWidth);
        const usePressure = !highlighter && el.pressures.length === el.points.length && el.pressures.length > 0;
        out.push(
          common(el, {
            ...rebase(el),
            strokeWidth: Math.round((nib / EX_NIB) * 100) / 100,
            opacity: highlighter ? Math.round(el.opacity * 0.45) : el.opacity,
            pressures: highlighter ? el.points.map(() => 0.5) : usePressure ? el.pressures : [],
            simulatePressure: !highlighter && !usePressure,
            ...(highlighter ? { customData: { sketchboard: { kind: 'highlighter', strokeWidth: el.strokeWidth, opacity: el.opacity } } } : {}),
          }),
        );
        break;
      }
      case 'text': {
        const bound = el.containerId && labelFor.get(el.containerId) === el.id ? el.containerId : null;
        out.push(
          common(el, {
            text: el.containerId || el.fixedWidth ? wrapText(el.text, el.width, el.fontSize, el.fontFamily, el).join('\n') : el.text,
            originalText: el.text,
            fontSize: el.fontSize,
            fontFamily: fontToEx(el.fontFamily),
            textAlign: el.textAlign,
            verticalAlign: bound ? 'middle' : 'top',
            boundElements: bound ? null : boundTo(el.id),
            containerId: bound,
            lineHeight: LINE_HEIGHT,
            autoResize: !el.fixedWidth,
            customData: { sketchboard: { fontFamily: el.fontFamily, fontWeight: el.fontWeight, fontStyle: el.fontStyle, underline: el.underline } },
          }),
        );
        break;
      }
      case 'image':
        out.push(common(el, { fileId: el.fileId, status: 'saved', scale: [el.flipX ? -1 : 1, el.flipY ? -1 : 1], crop: null, boundElements: boundTo(el.id) }));
        break;
      case 'table':
        out.push(...rotateParts(el, tableToExcalidraw(el, common)));
        break;
      case 'figure':
        out.push(...rotateParts(el, figureToExcalidraw(el, common)));
        break;
      case 'code':
        out.push(...rotateParts(el, codeToExcalidraw(el, common)));
        break;
      case 'frame':
        out.push(common(el, { name: el.name, frameId: null }));
        break;
    }
    // parts of a table / figure / code block keep their own group and also join the element's groups
    if (el.type === 'table' || el.type === 'figure' || el.type === 'code') {
      for (let i = start; i < out.length; i++) {
        const own = (out[i].groupIds as string[]).filter((g) => g.startsWith(el.id));
        out[i].groupIds = [...own, ...(el.groupIds ?? [])];
      }
    }
  }
  out.forEach((e, i) => (e.index = fractionalIndex(i)));

  const exFiles: Record<string, ExEl> = {};
  const used = new Set(sorted.flatMap((e) => (e.type === 'image' ? [e.fileId] : [])));
  for (const id of used) {
    const f = files[id];
    if (f) exFiles[id] = { mimeType: f.mimeType, id, dataURL: f.dataURL, created: f.created, lastRetrieved: f.created };
  }

  return {
    type: 'excalidraw',
    version: 2,
    source: opts.source ?? (typeof location !== 'undefined' ? location.origin : 'sketchboard'),
    elements: out,
    appState: { gridSize: 20, gridStep: 5, gridModeEnabled: !!opts.gridEnabled, viewBackgroundColor: '#ffffff' },
    files: exFiles,
  };
}

/**
 * A rotated table / code block / figure exported as several Excalidraw elements: each box part
 * orbits the element's centre and takes its angle; line parts get their points turned instead.
 */
function rotateParts(el: SketchElement, parts: ExEl[]): ExEl[] {
  const a = el.angle ?? 0;
  if (!a) return parts;
  const c = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
  const rot = (p: Point) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
  };
  return parts.map((part) => {
    if (Array.isArray(part.points)) {
      const abs = (part.points as number[][]).map(([px, py]) => rot({ x: part.x + px, y: part.y + py }));
      const o = abs[0];
      const xs = abs.map((q) => q.x);
      const ys = abs.map((q) => q.y);
      return { ...part, angle: 0, x: o.x, y: o.y, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), points: abs.map((q) => [q.x - o.x, q.y - o.y]) };
    }
    const pc = rot({ x: part.x + part.width / 2, y: part.y + part.height / 2 });
    return { ...part, x: pc.x - part.width / 2, y: pc.y - part.height / 2, angle: a };
  });
}

/** Code block → dark/light rectangle + monospace text (grouped); customData restores the block on import. */
function codeToExcalidraw(el: CodeElement, common: (el: SketchElement, extra: ExEl) => ExEl): ExEl[] {
  const l = codeLayout(el);
  const theme = CODE_THEMES[el.theme] ?? CODE_THEMES.dark;
  const groupIds = [`${el.id}-group`];
  const { printMode: _pm, ...props } = el;
  const text = l.lines.join('\n');
  return [
    common(el, {
      type: 'rectangle',
      backgroundColor: theme.bg,
      strokeColor: theme.border,
      fillStyle: 'solid',
      strokeWidth: 1,
      roundness: { type: 3 },
      groupIds,
      customData: { sketchboard: { code: props } },
    }),
    common(el, {
      id: `${el.id}-text`,
      type: 'text',
      x: el.x + l.codeX,
      y: el.y + l.codeY,
      width: el.width - l.codeX - l.padX,
      height: l.lines.length * l.lineH,
      strokeColor: theme.tokens.plain,
      backgroundColor: 'transparent',
      groupIds,
      text,
      originalText: text,
      fontSize: el.fontSize,
      fontFamily: 3,
      textAlign: 'left',
      verticalAlign: 'top',
      containerId: null,
      lineHeight: l.lineH / el.fontSize,
      autoResize: true,
      customData: { sketchboard: { figurePart: el.id } },
    }),
  ];
}

/**
 * Excalidraw has no gallery shapes: each outline / detail path becomes a (grouped) line, closed
 * outlines as filled polygons. customData remembers the figure so SketchBoard restores it on import.
 */
function figureToExcalidraw(el: FigureElement, common: (el: SketchElement, extra: ExEl) => ExEl): ExEl[] {
  const g = figureGeometry(el.figure, el.width, el.height, el.tail);
  const paths = [...g.polylines.map((p) => ({ p, closed: true })), ...g.detailLines.map((p) => ({ p, closed: false }))].filter((x) => x.p.length > 1);
  const groupIds = paths.length > 1 ? [`${el.id}-group`] : [];
  const fx = (x: number) => (el.flipX ? el.width - x : x);
  const fy = (y: number) => (el.flipY ? el.height - y : y);
  return paths.map(({ p, closed }, i) => {
    const abs = p.map((pt) => ({ x: el.x + fx(pt.x), y: el.y + fy(pt.y) }));
    const xs = abs.map((q) => q.x);
    const ys = abs.map((q) => q.y);
    const b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const o = abs[0];
    return common(el, {
      id: i === 0 ? el.id : `${el.id}-part${i}`,
      type: 'line',
      x: o.x,
      y: o.y,
      width: b.w,
      height: b.h,
      points: abs.map((q) => [q.x - o.x, q.y - o.y]),
      lastCommittedPoint: null,
      backgroundColor: closed ? el.backgroundColor : 'transparent',
      roundness: null,
      polygon: closed,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
      groupIds,
      seed: el.seed + i,
      customData: {
        sketchboard:
          i === 0
            ? { id: el.id, figure: el.figure, tail: el.tail, x: el.x, y: el.y, width: el.width, height: el.height, angle: el.angle ?? 0, outline: b, flipX: !!el.flipX, flipY: !!el.flipY }
            : { figurePart: el.id },
      },
    });
  });
}

/**
 * Excalidraw has no tables: each cell becomes a grouped rectangle with its text bound inside
 * (so it stays editable and wraps in Excalidraw). customData lets SketchBoard rebuild the table on import.
 */
function tableToExcalidraw(el: TableElement, common: (el: SketchElement, extra: ExEl) => ExEl): ExEl[] {
  const xs = colOffsets(el);
  const ys = rowOffsets(el);
  const groupId = `${el.id}-group`;
  const { cells: _cells, ...props } = el;
  const out: ExEl[] = [];
  for (let r = 0; r < el.rows; r++) {
    for (let c = 0; c < el.cols; c++) {
      const header = el.headerRow && r === 0;
      const bodyIndex = r - (el.headerRow ? 1 : 0);
      const fill = header ? el.headerColor : el.banded && bodyIndex % 2 === 0 ? 'transparent' : el.backgroundColor;
      const rectId = `${el.id}-r${r}c${c}`;
      const textId = `${el.id}-t${r}c${c}`;
      const raw = el.cells[r]?.[c] ?? '';
      const rx = el.x + xs[c];
      const ry = el.y + ys[r];
      out.push(
        common(el, {
          id: rectId,
          type: 'rectangle',
          x: rx,
          y: ry,
          width: el.colWidths[c],
          height: el.rowHeights[r],
          backgroundColor: fill,
          fillStyle: 'solid',
          seed: el.seed + r * 131 + c,
          groupIds: [groupId],
          boundElements: raw.trim() ? [{ type: 'text', id: textId }] : null,
          customData: { sketchboard: { table: el.id, row: r, col: c, ...(r === 0 && c === 0 ? { props } : {}) } },
        }),
      );
      if (!raw.trim()) continue;
      const lines = cellLines(el, r, c);
      const text = lines.join('\n');
      const m = measureText(text, el.fontSize, el.fontFamily, { fontWeight: cellWeight(el, r) });
      const cw = el.colWidths[c];
      const tx = el.textAlign === 'center' ? rx + (cw - m.width) / 2 : el.textAlign === 'right' ? rx + cw - el.cellPadding - m.width : rx + el.cellPadding;
      out.push(
        common(el, {
          id: textId,
          type: 'text',
          x: tx,
          y: ry + (el.rowHeights[r] - m.height) / 2,
          width: m.width,
          height: m.height,
          strokeColor: el.textColor,
          backgroundColor: 'transparent',
          roughness: 0,
          seed: el.seed + 7919 + r * 131 + c,
          groupIds: [groupId],
          text,
          originalText: raw,
          fontSize: el.fontSize,
          fontFamily: fontToEx(el.fontFamily),
          textAlign: el.textAlign,
          verticalAlign: 'middle',
          containerId: rectId,
          lineHeight: LINE_HEIGHT,
          autoResize: true,
        }),
      );
    }
  }
  return out;
}
