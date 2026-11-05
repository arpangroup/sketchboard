/**
 * Core domain model. Elements are IMMUTABLE value objects: every change produces a
 * new object with an incremented `version`. This gives us cheap undo/redo snapshots,
 * WeakMap-based render caching, and deterministic conflict resolution for collaboration.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ElementType =
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'freedraw'
  | 'text'
  | 'image'
  | 'table';

export type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'zigzag' | 'dots';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
/** Built-in id ('hand' | 'normal' | 'code') or any font name (Google Font or installed). */
export type FontFamily = string;
export type FontWeight = 'normal' | 'bold';
export type FontStyle = 'normal' | 'italic';
export type TextAlign = 'left' | 'center' | 'right';
export type Arrowhead = 'arrow' | 'triangle' | 'bar' | 'dot' | 'none';

/** Visual properties shared by every element. */
export interface ElementStyle {
  strokeColor: string;
  backgroundColor: string; // 'transparent' for no fill
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  /** 0 = architect (clean), 1 = artist, 2 = cartoonist */
  roughness: number;
  /** 0..100 */
  opacity: number;
}

export interface BaseElement extends ElementStyle {
  readonly id: string;
  readonly type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Seed for rough.js so the hand-drawn wobble is stable across renders/peers. */
  seed: number;
  /** Monotonic per-element version, used for reconciliation & cache invalidation. */
  version: number;
  /** Random tie-breaker when two peers produce the same version. */
  versionNonce: number;
  /** Fractional z-index: allows reordering without rewriting other elements. */
  zIndex: number;
  /** Tombstone flag - deleted elements are kept so deletions sync to peers. */
  isDeleted: boolean;
  locked: boolean;
  updatedAt: number;
}

export interface ShapeElement extends BaseElement {
  type: 'rectangle' | 'diamond' | 'ellipse';
  rounded: boolean;
}

export interface LinearElement extends BaseElement {
  type: 'line' | 'arrow';
  /** Points relative to (x, y). */
  points: Point[];
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
  /** Closed straight-edged polygon (e.g. a recognised triangle) instead of an open path. */
  polygon?: boolean;
}

export type FreeDrawKind = 'pen' | 'highlighter';

export interface FreeDrawElement extends BaseElement {
  type: 'freedraw';
  /** Points relative to (x, y). */
  points: Point[];
  /** Per-point pen pressure 0..1 (stylus). Empty = simulate from drawing speed (mouse/finger). */
  pressures: number[];
  kind: FreeDrawKind;
}

/**
 * Table: a grid of cells. Column widths / row heights are explicit (resizable by dragging grid lines);
 * rows auto-grow to fit wrapped text. Border = strokeColor/strokeWidth/strokeStyle/roughness,
 * body fill = backgroundColor.
 */
export interface TableElement extends BaseElement {
  type: 'table';
  rows: number;
  cols: number;
  colWidths: number[];
  rowHeights: number[];
  /** cells[row][col] */
  cells: string[][];
  cellPadding: number;
  headerRow: boolean;
  headerColor: string;
  /** Alternate body rows filled with backgroundColor */
  banded: boolean;
  textColor: string;
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
}

/** Defaults for new tables (the table tool's "current style"). */
export interface TableDefaults {
  rows: number;
  cols: number;
  cellPadding: number;
  headerRow: boolean;
  headerColor: string;
  banded: boolean;
  textColor: string;
}

/** Raster image. Pixel data lives in the FileStore, referenced by `fileId` (content stays out of the scene JSON). */
export interface ImageElement extends BaseElement {
  type: 'image';
  fileId: string;
}

export interface BinaryFile {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  underline: boolean;
}

export type SketchElement = ShapeElement | LinearElement | FreeDrawElement | TextElement | ImageElement | TableElement;

export type ElementOfType<T extends ElementType> = Extract<SketchElement, { type: T }>;

/** Properties a user can edit from the properties panel ("current item" style). */
export interface CurrentStyle extends ElementStyle {
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  underline: boolean;
  rounded: boolean;
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
  highlightColor: string;
}

export type ToolType =
  | 'selection'
  | 'hand'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'eraser'
  | 'highlighter'
  | 'laser'
  | 'table';

export interface Viewport {
  /** World offset: screen = (world + scroll) * zoom */
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export type PageSizeId = 'infinite' | 'A5' | 'A4' | 'A3' | 'A2' | 'Letter' | 'Legal' | 'Tabloid';
export type Orientation = 'portrait' | 'landscape';

export type HeaderFooterSlot = 'left' | 'center' | 'right';
export type PageNumberPosition = `${'header' | 'footer'}-${HeaderFooterSlot}`;
export type PageNumberFormat = 'n' | 'page-n' | 'page-n-of-m' | 'n-of-m';

/** Text for the three slots of a header or footer. Supports {page} {pages} {date} {title}. */
export type HeaderFooterText = Record<HeaderFooterSlot, string>;

export interface PageSetup {
  size: PageSizeId;
  orientation: Orientation;
  /** Printable margin in millimetres (headers/footers sit inside it). */
  marginMm: number;
  /** Minimum number of pages; more are added automatically when drawing below the last page. */
  pageCount?: number;
  /** Document title, available to headers/footers as {title}. */
  title?: string;
  header?: HeaderFooterText;
  footer?: HeaderFooterText;
  pageNumbers?: { enabled: boolean; position: PageNumberPosition; format: PageNumberFormat };
}

export type ColorMode = 'color' | 'grayscale' | 'blackwhite';

export interface Collaborator {
  id: string;
  username: string;
  color: string;
  pointer?: Point;
  lastSeen: number;
}

export type Theme = 'light' | 'dark';

export type SidebarTab = 'pages' | 'search' | 'library' | 'chat' | 'presentation';

export interface ChatMessage {
  id: string;
  authorId: string;
  username: string;
  text: string;
  at: number;
  own: boolean;
}

export interface AppState {
  activeTool: ToolType;
  toolLocked: boolean;
  currentStyle: CurrentStyle;
  selectedIds: Record<string, true>;
  viewport: Viewport;
  pageSetup: PageSetup;
  /** Colour mode applied on screen (preview) - print/export choose their own. */
  viewColorMode: ColorMode;
  editingTextId: string | null;
  /** Table cell being edited in place. */
  editingCell: { id: string; row: number; col: number } | null;
  tableDefaults: TableDefaults;
  gridEnabled: boolean;
  theme: Theme;
  openDialog: DialogId | null;
  collab: {
    status: 'idle' | 'connecting' | 'connected' | 'error';
    roomLink: string | null;
    username: string;
    collaborators: Record<string, Collaborator>;
  };
  toast: { id: number; message: string } | null;
  sidebar: { open: boolean; pinned: boolean; tab: SidebarTab };
  /** Presentation mode: UI chrome hidden, canvas fullscreen. */
  presenting: boolean;
  /** Stylus mode: the pen draws, fingers only pan/zoom (palm rejection). Auto-enabled when a pen is detected. */
  penMode: boolean;
  /** Convert pen strokes that look like shapes into clean rectangles/ellipses/diamonds/lines. */
  shapeRecognition: boolean;
  chat: { messages: ChatMessage[]; unread: number };
}

export type DialogId = 'export' | 'print' | 'page' | 'collab' | 'help' | 'install';

/** Serialisable document format (.sketchboard files & local storage). */
export interface SceneData {
  type: 'sketchboard';
  version: 1;
  elements: SketchElement[];
  /** Image data keyed by fileId (only included in files/exports, not in autosave). */
  files?: Record<string, BinaryFile>;
  appState?: Partial<Pick<AppState, 'pageSetup' | 'gridEnabled' | 'viewColorMode'>> & {
    viewport?: Viewport;
  };
}
