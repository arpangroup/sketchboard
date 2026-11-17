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
  | 'table'
  | 'figure'
  | 'code'
  | 'frame';

export type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'zigzag' | 'dots';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
/** Built-in id ('hand' | 'normal' | 'code') or any font name (Google Font or installed). */
export type FontFamily = string;
export type FontWeight = 'normal' | 'bold';
export type FontStyle = 'normal' | 'italic';
export type TextAlign = 'left' | 'center' | 'right';
/** `*_outline` heads are hollow (UML inheritance / aggregation). */
export type Arrowhead = 'arrow' | 'triangle' | 'triangle_outline' | 'diamond' | 'diamond_outline' | 'bar' | 'dot' | 'none';

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
  /** Render-only (set by print colour modes, never saved): 'light' = sparse, thin hatching. */
  fillDensity?: 'light';
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
  /**
   * Clockwise rotation in radians around the centre of the x/y/width/height box (0 / absent = upright).
   * Lines, arrows and ink never store one: rotating them rotates their points.
   */
  angle?: number;
  /** Tombstone flag - deleted elements are kept so deletions sync to peers. */
  isDeleted: boolean;
  locked: boolean;
  updatedAt: number;
  /**
   * Groups this element belongs to, innermost first (same convention as Excalidraw).
   * Clicking any member selects the whole outermost group.
   */
  groupIds?: string[];
  /** The frame this element sits in (moves and is deleted with it). */
  frameId?: string;
  /** Hyperlink (http(s), mailto:…) opened from the link badge or with Ctrl/Cmd+click. */
  link?: string;
  /** Mirrored drawing (images and gallery shapes; other types flip by moving their geometry). */
  flipX?: boolean;
  flipY?: boolean;
}

export interface ShapeElement extends BaseElement {
  type: 'rectangle' | 'diamond' | 'ellipse';
  rounded: boolean;
}

/** An arrow / line end attached to a shape (see elements/binding.ts). */
export interface ArrowBinding {
  elementId: string;
  /** Spot the end aims at, as fractions of the shape's own box: {0.5, 0.5} = its centre. */
  anchor: Point;
}

export interface LinearElement extends BaseElement {
  type: 'line' | 'arrow';
  /** Points relative to (x, y). */
  points: Point[];
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
  /** Closed straight-edged polygon (e.g. a recognised triangle) instead of an open path. */
  polygon?: boolean;
  /** Straight segments between points (e.g. elbow connectors) instead of a smooth curve. */
  sharp?: boolean;
  /** Ends attached to shapes: they follow those shapes when they move, resize or turn. */
  startBinding?: ArrowBinding;
  endBinding?: ArrowBinding;
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

/** A piece of a text box with its own formatting (see TextElement.runs). */
export interface TextRun {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
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
  /**
   * Formatting of parts of the text: pieces in order whose texts join up to `text`. A piece's
   * b / i / u override the box's own bold / italic / underline (unset = same as the box).
   * Ignored if the pieces no longer spell out `text`.
   */
  runs?: TextRun[];
  /**
   * Fixed-width text box: the text wraps onto new lines at `width` (set by dragging a side handle).
   * Unset = the box grows to fit its longest line.
   */
  fixedWidth?: boolean;
  /**
   * Label of a shape: the text sits centred inside that shape, wraps to its width and moves,
   * turns, flips and is deleted with it (no grouping needed).
   */
  containerId?: string;
}

/**
 * Gallery shape (callout, star, block arrow, flowchart symbol…) drawn from the figure catalogue
 * (elements/figures). `x, y, width, height` is the body box; callouts also have a tail.
 */
export interface FigureElement extends BaseElement {
  type: 'figure';
  /** Catalogue id, e.g. "star-5", "callout-rounded", "fc-document". */
  figure: string;
  /** Callout tail tip relative to the body box (0..1 = inside; beyond = outside). */
  tail?: Point;
}

export type CodeMark = 'yellow' | 'green' | 'red' | 'blue';
export type CodeTheme = 'light' | 'dark';

/** Code block: syntax-highlighted, monospaced, with optional line numbers and marked (highlighted) lines. */
export interface CodeElement extends BaseElement {
  type: 'code';
  code: string;
  /** Highlighter language id (see elements/code/highlight.ts). */
  language: string;
  theme: CodeTheme;
  fontSize: number;
  lineNumbers: boolean;
  /** Language name in the header (absent = shown). */
  showLanguage?: boolean;
  /** Optional caption in the header (e.g. a file name). */
  title: string;
  /** Marked lines: 1-based line number → colour. */
  marks: Record<string, CodeMark>;
  /** Render-only (print colour modes), never saved. */
  printMode?: 'grayscale' | 'blackwhite';
}

/** Settings new code blocks start with (the code tool's "current style"). */
export interface CodeDefaults {
  language: string;
  theme: CodeTheme;
  fontSize: number;
  lineNumbers: boolean;
  showLanguage: boolean;
  markColor: CodeMark;
}

/** Named container: elements inside move, duplicate and delete with it; exported as a titled box. */
export interface FrameElement extends BaseElement {
  type: 'frame';
  name: string;
}

export type SketchElement =
  | ShapeElement
  | LinearElement
  | FreeDrawElement
  | TextElement
  | ImageElement
  | TableElement
  | FigureElement
  | CodeElement
  | FrameElement;

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
  /** Colour of the words inside shapes (labels), set apart from the shape's outline colour. */
  textColor?: string;
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
  | 'table'
  | 'figure'
  | 'precisionEraser';

export interface Viewport {
  /** World offset: screen = (world + scroll) * zoom */
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type PageSizeId = 'infinite' | 'A5' | 'A4' | 'A3' | 'A2' | 'Letter' | 'Legal' | 'Tabloid';
export type Orientation = 'portrait' | 'landscape';

export type HeaderFooterSlot = 'left' | 'center' | 'right';
export type PageNumberPosition = `${'header' | 'footer'}-${HeaderFooterSlot}`;
export type PageNumberFormat = 'n' | 'page-n' | 'page-n-of-m' | 'n-of-m';

/** Text for the three slots of a header or footer. Supports {page} {pages} {date} {title}. */
export type HeaderFooterText = Record<HeaderFooterSlot, string>;

/**
 * A run of pages with its own header/footer (like a section break in a word processor).
 * It starts at `startPage` and runs until the next section starts; pages before the first
 * section use the document's default header and footer.
 */
export interface PageSection {
  id: string;
  /** 1-based page this section starts on. */
  startPage: number;
  /** Section title, available as {section} and used for {title} (falls back to the document title). */
  title?: string;
  /** Own header / footer for this section; undefined = same as the document default. */
  header?: HeaderFooterText;
  footer?: HeaderFooterText;
  /** Start page numbers again at 1: {page} and {pages} count within this section. */
  restartNumbering?: boolean;
}

export interface PageSetup {
  size: PageSizeId;
  orientation: Orientation;
  /** Uniform margin in millimetres - used when `margins` isn't set (older files, presets). */
  marginMm: number;
  /** Per-side margins in millimetres (headers/footers sit inside the top/bottom ones). Overrides `marginMm`. */
  margins?: PageMargins;
  /** Minimum number of pages; more are added automatically when drawing below the last page. */
  pageCount?: number;
  /** Document title, available to headers/footers as {title}. */
  title?: string;
  header?: HeaderFooterText;
  footer?: HeaderFooterText;
  pageNumbers?: { enabled: boolean; position: PageNumberPosition; format: PageNumberFormat };
  /** Sections with their own header/footer; the header/footer above is the default for every other page. */
  sections?: PageSection[];
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
  /** Code block being edited in place. */
  editingCodeId: string | null;
  codeDefaults: CodeDefaults;
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
  /** Laser pointer: trail behaviour and size (1-4). */
  laser: { mode: 'fade' | 'hold'; size: number };
  /** Shape the figure tool draws (catalogue id). */
  currentFigure: string;
  /** Which eraser the toolbar's eraser button picks; precision radius in screen px. */
  eraser: { mode: 'stroke' | 'precision'; size: number };
  /** The workspace drawing this board was opened from / last saved to (null = not saved yet). */
  workspaceFile: WorkspaceFileRef | null;
}

export interface WorkspaceFileRef {
  id: string;
  name: string;
  /** Server revision we last saw - sent back on save to detect concurrent edits. */
  revision: number;
}

/** A reusable group of elements in a library (personal or built-in). Elements start at (0, 0). */
export interface LibraryItem {
  id: string;
  name: string;
  created: number;
  elements: SketchElement[];
  /** Built-in section, e.g. "Database"; personal items have none. */
  category?: string;
}

export type DialogId = 'export' | 'print' | 'page' | 'collab' | 'help' | 'install' | 'workspace' | 'link' | 'hyperlink' | 'clearCanvas';

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
