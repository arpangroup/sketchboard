import { createInitialAppState, HIT_TOLERANCE, MAX_ZOOM, MIN_ZOOM } from '../core/constants';
import { clamp, unionBounds } from '../core/geometry';
import { Emitter, Store } from '../core/Store';
import { debounce, randomInteger } from '../core/utils';
import type {
  AppState,
  BinaryFile,
  Bounds,
  CurrentStyle,
  Point,
  SceneData,
  SketchElement,
  TableDefaults,
  TableElement,
  TextElement,
  TextRun,
  LinearElement,
  ToolType,
  Viewport,
  WorkspaceFileRef,
  FigureElement,
  CodeElement,
  CodeMark,
} from '../core/types';
import { codeLayout, resetCodeMetrics } from '../elements/code/codeLayout';
import { angleOf, bakesRotation, centerOf, keepTopLeft, normalizeAngle, rotateAround, toLocal } from '../elements/rotation';
import { getFigure } from '../elements/figures/figures';
import { cloneElement, createCode, createFrame, createImage, createMath, createTable, createText, updateElement } from '../elements/factory';
import { loadMath, mathBox, onMathChange } from '../elements/math/mathLayout';
import { looksLikeLatex } from '../elements/math/mathSource';
import {
  MAX_IMPORT_COLS,
  MAX_IMPORT_ROWS,
  type ParsedTable,
  tableFromClipboard,
  TABLE_FILE_ACCEPT,
  tableFromFile,
  toCSV,
  toHTMLTable,
  toMarkdown,
  toTSV,
  wasTruncated,
} from '../elements/table/tableIO';
import {
  expandToGroups,
  type FlipAxis,
  flipPatches,
  frameBoxFor,
  framePatches,
  groupPatches,
  normalizeLink,
  type Patches,
  remapCopies,
  ungroupPatches,
  withFrameChildren,
} from '../elements/structure';
import { exportToPngBlob } from '../export/pngExport';
import { exportToSvg } from '../export/svgExport';
import { drawLinkBadges, linkBadges } from '../renderer/linkBadge';
import { deletePage, insertPage, type PageEdit } from '../page/pageEdit';
import { pointsToElementGeometry } from '../elements/handlers/pointShapes';
import { canHoldLabel, labelNeedsLayout, labelOf, layoutLabel, withLabels } from '../elements/boundText';
import { anchorFor, arrowsBoundTo, BIND_DISTANCE, bindableAt, boundArrowGeometry } from '../elements/binding';
import {
  distributeColumns,
  fitColumnWidths,
  insertCol,
  MIN_ROW_HEIGHT,
  insertRow,
  relayout,
  removeCol,
  removeRow,
  resizeGrid,
  setCellText,
} from '../elements/table/tableLayout';
import { fileStore, imageFileToBinary } from '../files/FileStore';
import { LaserLayer } from '../renderer/LaserLayer';
import { STORAGE_KEYS } from '../core/constants';
import { ensureFontLoaded } from '../core/fonts';
import { getElementBounds, hitTestElement } from '../elements/registry';
import { normalizeRuns, textBoxSize } from '../elements/textMetrics';
import { type ListKind, listKindAt, toggleList } from '../elements/textLists';
import { contentBounds } from '../export/region';
import { getPageBounds } from '../page/pageSizes';
import { MAX_PAGES, type PageDecoration, pageDecorations, pageRects, requiredPageCount } from '../page/pageLayout';
import { LocalStorageAdapter, type StorageAdapter } from '../persistence/StorageAdapter';
import { parseScene, serializeScene } from '../persistence/serialization';
import { fromExcalidraw } from '../persistence/excalidraw';
import { CanvasRenderer, screenToWorld } from '../renderer/CanvasRenderer';
import { shapeCache } from '../renderer/ShapeCache';
import { History } from '../scene/History';
import { Scene } from '../scene/Scene';
import { createTools, type PointerInfo, type Tool, type ToolContext } from '../tools';
import { drawSelection } from '../tools/selectionGeometry';

const CLIPBOARD_MARKER = 'sketchboard/clipboard';
/** Touches within this time of pen activity are treated as a resting palm. */
const PALM_COOLDOWN_MS = 1200;
/** Contact patches wider than this (CSS px) are a palm / side of hand, not a fingertip. */
const PALM_CONTACT_PX = 40;

/** Style keys that can be applied directly to any element. */
/** Size changes of rotated elements keep the top-left corner where it is on screen. */
function anchored<T extends SketchElement>(el: T, patch: Partial<T>): Partial<T> {
  if (!angleOf(el) || (patch.width === undefined && patch.height === undefined)) return patch;
  const next = { ...el, ...patch };
  return { ...patch, ...keepTopLeft(el, next) };
}

const COMMON_STYLE_KEYS = [
  'strokeColor', 'backgroundColor', 'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness', 'opacity',
] as const;

/**
 * Editor = Facade + Mediator. Owns the scene, history, tools, renderer and app state and
 * coordinates them. React components only talk to this class (and never to each other),
 * keeping UI and engine decoupled. It implements ToolContext so tools get a narrow API.
 */
/** Formatting the text editor can apply to the words selected in it. */
export type SelectionFormat =
  | { kind: 'bold' | 'italic' | 'underline' }
  | { kind: 'color'; value: string }
  | { kind: 'list'; list: ListKind };

export class Editor implements ToolContext {
  readonly store = new Store<AppState>(createInitialAppState());
  readonly scene = new Scene();
  readonly history = new History(this.scene);
  readonly events = new Emitter<{
    pointerMove: Point;
    laser: { point: Point; start: boolean; size: number; mode: 'fade' | 'hold' };
    laserEnd: { size: number; mode: 'fade' | 'hold' };
  }>();
  /** Laser pointer trails (local + collaborators) - visual only. */
  readonly laser = new LaserLayer();
  /** The one pointer currently driving a tool gesture (palm rejection / multi-touch safety). */
  private activePointerId: number | null = null;

  private tools: Map<ToolType, Tool>;
  private renderer: CanvasRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private size = { width: 0, height: 0, dpr: 1 };
  private rafId: number | null = null;

  private pointerDown = false;
  private panLast: Point | null = null;
  private spaceHeld = false;
  private touches = new Map<number, Point>();
  private activePointerType = '';
  /** Touches identified as palm/hand: ignored until they lift. */
  private rejected = new Set<number>();
  private lastPenActivity = -Infinity;
  private panPointerId: number | null = null;
  private pinch: { dist: number; center: Point; zoom: number } | null = null;
  private clipboard: SketchElement[] = [];
  /** Touch double-tap detection (mobile browsers don't reliably emit dblclick on canvas). */
  private lastTap: { at: number; x: number; y: number } | null = null;
  private lastSyntheticDoubleTap = 0;
  /** Last known pointer position (world) - used as paste target. */
  private lastPointer: Point | null = null;
  private storage: StorageAdapter = new LocalStorageAdapter();
  private autosave = debounce(() => void this.storage.save(this.getSceneData()), 400);

  constructor() {
    this.tools = createTools(this);
    fileStore.on('loaded', () => this.requestRender());
    // Web fonts arrive asynchronously: load what text elements use, then re-measure once they're ready.
    this.scene.onChange(({ changed }) => {
      for (const el of changed) {
        if (el.isDeleted) continue;
        if (el.type === 'text') void ensureFontLoaded(el.fontFamily, el.fontWeight, el.fontStyle);
        if (el.type === 'code') void ensureFontLoaded('code');
        if (el.type === 'math') void loadMath(); // KaTeX loads on first use
        if (el.type === 'table') void ensureFontLoaded(el.fontFamily, 'bold');
      }
    });
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.addEventListener('loadingdone', () => this.refreshTextMetrics());
    }
    // KaTeX (or one of its fonts) arrived: formulae get their real size and drawing
    onMathChange(() => {
      this.refreshMathSizes();
      this.requestRender();
    });
    fileStore.on('added', () => this.requestRender());
    this.scene.onChange((c) => {
      // shapes that moved / resized / turned drag the arrows attached to them along (same undo step)
      if (c.source === 'local' && !this.syncingArrows) this.syncArrows(c.changed.map((e) => e.id));
      this.requestRender();
      this.autosave();
    });
    this.store.subscribe((s, prev) => {
      if (s.pageSetup !== prev.pageSetup || s.gridEnabled !== prev.gridEnabled) this.autosave();
      this.requestRender();
    });
  }

  // ───────────────────────────── ToolContext ─────────────────────────────

  getState = (): AppState => this.store.getState();
  setState = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void =>
    this.store.setState(patch);
  getViewport = (): Viewport => this.getState().viewport;

  commitHistory = (): void => {
    this.history.commit();
  };

  setCursor = (cursor: string): void => {
    if (this.canvas) this.canvas.style.cursor = cursor;
  };

  hitTest = (world: Point): SketchElement | null => {
    const tolerance = HIT_TOLERANCE / this.getViewport().zoom;
    const editing = this.getState().editingTextId;
    const els = this.scene.getElements();
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (el.id === editing) continue;
      if (hitTestElement(el, world, tolerance)) {
        // a shape's label stands for its shape (click selects the shape, double-click edits the label)
        if (el.type === 'text' && el.containerId) {
          const box = this.scene.getElement(el.containerId);
          if (box && !box.isDeleted) return box;
        }
        return el;
      }
    }
    return null;
  };

  getSelectedElements = (): SketchElement[] => {
    const ids = this.getState().selectedIds;
    return this.scene.getElements().filter((e) => ids[e.id]);
  };

  setSelection = (ids: readonly string[]): void => {
    const selectedIds: Record<string, true> = {};
    for (const id of ids) selectedIds[id] = true;
    this.setState({ selectedIds });
  };

  finishCreation = (el: SketchElement): void => {
    this.assignFrames([el.id], false);
    this.commitHistory();
    if (!this.getState().toolLocked) this.setTool('selection');
    this.setSelection([el.id]);
  };

  nextZIndex = (): number => this.scene.maxZIndex() + 1;

  panBy = (dx: number, dy: number): void => {
    this.setState((s) => ({
      viewport: { ...s.viewport, scrollX: s.viewport.scrollX + dx / s.viewport.zoom, scrollY: s.viewport.scrollY + dy / s.viewport.zoom },
    }));
  };

  requestRender = (): void => {
    if (this.rafId !== null || !this.renderer) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.renderNow();
    });
  };

  // ───────────────────────────── Canvas lifecycle ─────────────────────────────

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.renderer = new CanvasRenderer(canvas);
    this.setCursor(this.activeTool().cursor);
    this.requestRender();
  }

  detachCanvas(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.renderer = null;
    this.canvas = null;
  }

  resize(width: number, height: number, dpr: number): void {
    this.size = { width, height, dpr };
    this.requestRender();
  }

  /** Elements a remote update must not clobber (being dragged / typed right now). */
  getProtectedIds(): ReadonlySet<string> {
    const ids = new Set(this.activeTool().activeIds?.() ?? []);
    const editing = this.getState().editingTextId;
    if (editing) ids.add(editing);
    const cell = this.getState().editingCell;
    if (cell) ids.add(cell.id);
    const code = this.getState().editingCodeId;
    if (code) ids.add(code);
    const math = this.getState().editingMathId;
    if (math) ids.add(math);
    return ids;
  }

  private activeTool(): Tool {
    return this.tools.get(this.getState().activeTool)!;
  }

  private renderNow(): void {
    if (!this.renderer) return;
    const s = this.getState();
    const tool = this.activeTool();
    const selected = this.getSelectedElements();
    const editing = s.editingTextId;
    this.renderer.render({
      elements: this.scene.getElements(),
      viewport: s.viewport,
      width: this.size.width,
      height: this.size.height,
      dpr: this.size.dpr,
      pageSetup: s.pageSetup,
      colorMode: s.viewColorMode,
      gridEnabled: s.gridEnabled,
      hiddenIds: editing ? new Set([editing]) : undefined,
      fadedIds: tool.fadedIds?.(),
      collaborators: Object.values(s.collab.collaborators),
      pageCount: this.getPageCount(),
      decorations: this.getPageDecorations(),
      overlay: (ctx, zoom) => {
        if (s.activeTool === 'selection') drawSelection(ctx, selected, zoom);
        this.drawBindingHint(ctx, zoom);
        drawLinkBadges(ctx, linkBadges(this.scene.getElements(), zoom, editing ? new Set([editing]) : undefined), zoom);
        tool.renderOverlay?.(ctx, zoom);
        this.laser.render(ctx, zoom);
        this.drawPageHighlight(ctx, zoom);
      },
    });
    // keep animating while laser trails / page highlight fade out
    if (this.laser.active || this.pageHighlight) this.requestRender();
  }

  private pageCache: { rev: number; setup: unknown; count: number; deco: PageDecoration[]; day: string } | null = null;

  /** Pages in the document: grows automatically with content below the last page. */
  /** Inserts a blank page at position `at` (0 = top, page count = bottom) and shows it. */
  insertPageAt(at: number): void {
    const count = this.getPageCount();
    const edit = insertPage(this.getState().pageSetup, count, this.scene.getElements(), at);
    if (!edit) return this.toast(count >= MAX_PAGES ? `A document can have up to ${MAX_PAGES} pages` : 'Pick a paper size to use pages');
    this.applyPageEdit(edit);
    const index = Math.max(0, Math.min(count, Math.round(at)));
    requestAnimationFrame(() => this.goToPage(index));
    this.toast(`Blank page inserted as page ${index + 1}`);
  }

  /** Deletes page `index` (0-based) with everything on it; later pages move up. Undo brings the content back. */
  deletePageAt(index: number): void {
    const edit = deletePage(this.getState().pageSetup, this.getPageCount(), this.scene.getElements(), index);
    if (!edit) return this.toast('A document needs at least one page');
    this.applyPageEdit(edit);
    requestAnimationFrame(() => this.goToPage(Math.min(index, this.getPageCount() - 1)));
    this.toast(edit.deletes.length ? `Page ${index + 1} deleted — Ctrl+Z brings its content back` : `Page ${index + 1} deleted`);
  }

  /** Page the last right-click / pointer was on, else the page in view (for menu commands). */
  pageForCommand(): number {
    const rects = pageRects(this.getState().pageSetup, this.getPageCount());
    const p = this.lastPointer;
    const hit = p ? rects.findIndex((r) => p.x >= r.x - 40 && p.x <= r.x + r.width + 40 && p.y >= r.y && p.y <= r.y + r.height) : -1;
    return hit >= 0 ? hit : this.currentPageIndex();
  }

  private applyPageEdit(edit: PageEdit): void {
    const updates: SketchElement[] = [];
    const deleted = new Set(edit.deletes);
    for (const el of this.scene.getElements()) {
      if (deleted.has(el.id)) updates.push(updateElement(el, { isDeleted: true }));
      else if (edit.moves.has(el.id)) updates.push(updateElement(el, edit.moves.get(el.id)!));
    }
    // page count first, so the new page exists before content moves onto the pages below it
    this.setState({ pageSetup: edit.setup });
    if (updates.length) this.scene.upsert(updates);
    if (deleted.size) this.setSelection(Object.keys(this.getState().selectedIds).filter((id) => !deleted.has(id)));
    this.commitHistory();
  }

  getPageCount(): number {
    return this.pageLayout().count;
  }

  getPageDecorations(): PageDecoration[] {
    return this.pageLayout().deco;
  }

  private pageLayout() {
    const setup = this.getState().pageSetup;
    const day = new Date().toDateString();
    const c = this.pageCache;
    if (c && c.rev === this.scene.revision && c.setup === setup && c.day === day) return c;
    const count = requiredPageCount(setup, this.scene.getElements());
    this.pageCache = { rev: this.scene.revision, setup, count, deco: pageDecorations(setup, count), day };
    return this.pageCache;
  }

  emitLaser = (world: Point, start: boolean): void => {
    const { mode, size } = this.getState().laser;
    this.laser.add('local', '#ff3b30', world, start, { mode, size });
    this.events.emit('laser', { point: world, start, mode, size });
    this.requestRender();
  };

  /** Pen / mouse lifted: a "keep until release" trail starts fading (for collaborators too). */
  releaseLaser = (): void => {
    const { mode, size } = this.getState().laser;
    this.laser.release('local');
    this.events.emit('laserEnd', { mode, size });
    this.requestRender();
  };

  /** Laser settings (remembered on this device). */
  setLaser(patch: Partial<AppState['laser']>): void {
    this.setState((s) => ({ laser: { ...s.laser, ...patch } }));
    try {
      localStorage.setItem(STORAGE_KEYS.laser, JSON.stringify(this.getState().laser));
    } catch {
      /* storage unavailable */
    }
  }

  // ───────────────────────────── Input handling ─────────────────────────────

  private toPointerInfo(e: PointerEvent | MouseEvent): PointerInfo {
    const rect = this.canvas!.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return {
      screen,
      world: screenToWorld(screen.x, screen.y, this.getViewport()),
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      modKey: e.ctrlKey || e.metaKey,
      button: e.button,
      pointerType: 'pointerType' in e ? e.pointerType : 'mouse',
      pressure: 'pressure' in e ? (e.pointerType === 'mouse' ? 0.5 : e.pressure) : 0.5,
    };
  }

  /**
   * Input routing with palm rejection. Rules, in priority order:
   *  1. Pen activity wins. While the pen is down - and for PALM_COOLDOWN ms after any pen
   *     activity (down, move, hover, up) - every touch is rejected for its whole lifetime.
   *     Writers rest their palm between strokes; those touches must never pan, zoom or draw.
   *  2. Large contact areas (palm, side of hand) are rejected outright.
   *  3. A pen touching down cancels anything a touch started (palm stroke, pan, pinch).
   *  4. Pen & mouse are single-contact devices: a new down while one is "active" means the
   *     previous up was lost by the browser, so that gesture is finished instead of blocking input.
   *  5. Otherwise (no recent pen): two fingers pinch-zoom; one finger pans in pen mode or draws.
   */
  handlePointerDown = (e: PointerEvent): void => {
    if (!this.canvas) return;
    if (this.getState().editingTextId || this.getState().editingCell || this.getState().editingCodeId) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
    if (this.getState().editingMathId) this.finishMathEditing();
    const info = this.toPointerInfo(e);
    const now = performance.now();

    if (e.pointerType === 'pen') {
      this.lastPenActivity = now;
      if (!this.getState().penMode) this.setPenMode(true, true);
      this.cancelTouchInteractions(); // rule 3
    }

    if (e.pointerType === 'touch') {
      if (this.isPalm(e, now)) {
        this.rejected.add(e.pointerId); // rules 1 & 2
        return;
      }
      this.touches.set(e.pointerId, info.screen);
      if (this.touches.size === 2) return this.beginPinch();
      if (this.touches.size > 2) return;
      if (this.getState().penMode) {
        this.capture(e.pointerId);
        this.panLast = info.screen;
        this.panPointerId = e.pointerId;
        return;
      }
    }

    if (this.activePointerId !== null) {
      if (e.pointerType === this.activePointerType && e.pointerType !== 'touch') {
        this.endActiveGesture(info); // rule 4: stale gesture from a lost pointerup
      } else {
        return; // another pointer legitimately owns the gesture
      }
    }

    this.capture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
      this.panLast = info.screen;
      this.panPointerId = e.pointerId;
      this.setCursor('grabbing');
      return;
    }
    if (e.button !== 0) return;
    this.pointerDown = true;
    this.activePointerId = e.pointerId;
    this.activePointerType = e.pointerType;
    this.activeTool().onPointerDown(info);
  };

  handlePointerMove = (e: PointerEvent): void => {
    if (!this.canvas) return;
    if (e.pointerType === 'pen') this.lastPenActivity = performance.now(); // includes Apple Pencil hover
    if (this.rejected.has(e.pointerId)) return;
    const info = this.toPointerInfo(e);
    if (this.activePointerId === null || e.pointerId === this.activePointerId) {
      this.lastPointer = info.world;
      this.events.emit('pointerMove', info.world);
    }
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, info.screen);
      if (this.pinch) return this.updatePinch();
    }
    if (this.panLast && e.pointerId === this.panPointerId) {
      this.panBy(info.screen.x - this.panLast.x, info.screen.y - this.panLast.y);
      this.panLast = info.screen;
      return;
    }
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return; // extra finger
    if (this.activePointerId === null && e.pointerType === 'touch') return; // finger hover doesn't exist

    // Coalesced events: every sample the stylus/mouse produced between frames → smooth ink.
    const tool = this.getState().activeTool;
    const inking = this.pointerDown && (tool === 'freedraw' || tool === 'highlighter' || tool === 'laser');
    const events = inking && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (events.length > 1) {
      for (const ce of events) this.activeTool().onPointerMove(this.toPointerInfo(ce), true);
    } else {
      this.activeTool().onPointerMove(info, this.pointerDown);
    }
  };

  handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'pen') this.lastPenActivity = performance.now();
    this.touches.delete(e.pointerId);
    if (this.rejected.delete(e.pointerId)) return;

    // The active gesture ALWAYS gets its up, whatever else is going on (pinch, pan...).
    if (this.pointerDown && e.pointerId === this.activePointerId) {
      const info = this.toPointerInfo(e);
      this.endActiveGesture(info);
      if (e.pointerType === 'touch') this.detectDoubleTap(info);
      return;
    }
    if (this.pinch && this.touches.size < 2) this.pinch = null;
    if (this.panLast && e.pointerId === this.panPointerId) {
      this.panLast = null;
      this.panPointerId = null;
      this.setCursor(this.spaceHeld ? 'grab' : this.activeTool().cursor);
    }
  };

  /** Browser revoked capture without a pointerup (e.g. system gesture) - end cleanly. */
  handleLostCapture = (e: PointerEvent): void => {
    if (e.pointerId === this.activePointerId) this.handlePointerUp(e);
  };

  private endActiveGesture(info: PointerInfo): void {
    this.pointerDown = false;
    this.activePointerId = null;
    this.activeTool().onPointerUp(info);
  }

  /** Palm heuristics: recent pen use, or a contact patch far bigger than a fingertip. */
  private isPalm(e: PointerEvent, now: number): boolean {
    const penBusy = this.activePointerType === 'pen' && this.activePointerId !== null;
    const recentPen = now - this.lastPenActivity < PALM_COOLDOWN_MS;
    const largeContact = Math.max(e.width || 0, e.height || 0) > PALM_CONTACT_PX;
    return penBusy || (this.getState().penMode && recentPen) || largeContact;
  }

  /** A pen landing cancels whatever touches were doing (palm stroke, pan, pinch). */
  private cancelTouchInteractions(): void {
    for (const id of this.touches.keys()) this.rejected.add(id);
    this.touches.clear();
    this.pinch = null;
    if (this.panLast && this.panPointerId !== null) {
      this.rejected.add(this.panPointerId);
      this.panLast = null;
      this.panPointerId = null;
    }
    if (this.pointerDown && this.activePointerType === 'touch') {
      // the palm got there first and started drawing: throw that away
      this.rejected.add(this.activePointerId!);
      this.pointerDown = false;
      this.activePointerId = null;
      const tool = this.activeTool();
      if (tool.onCancel) tool.onCancel();
      else tool.onDeactivate?.();
    }
  }

  private capture(pointerId: number): void {
    try {
      this.canvas?.setPointerCapture(pointerId);
    } catch {
      /* pointer already released (fast taps) - capture is best-effort */
    }
  }

  setPenMode(on: boolean, auto = false): void {
    this.setState({ penMode: on });
    try {
      localStorage.setItem(STORAGE_KEYS.penMode, String(on));
    } catch {
      /* ignore */
    }
    if (auto) this.toast('Pen detected — the pen draws, fingers pan & zoom (change in ⋯ More tools)');
  }

  private detectDoubleTap(info: PointerInfo): void {
    const now = performance.now();
    const t = this.lastTap;
    if (t && now - t.at < 320 && Math.hypot(info.screen.x - t.x, info.screen.y - t.y) < 24) {
      this.lastTap = null;
      this.lastSyntheticDoubleTap = now;
      this.activeTool().onDoubleClick?.(info);
    } else {
      this.lastTap = { at: now, x: info.screen.x, y: info.screen.y };
    }
  }

  handleDoubleClick = (e: MouseEvent): void => {
    if (performance.now() - this.lastSyntheticDoubleTap < 600) return; // already handled as a double-tap
    const info = this.toPointerInfo(e);
    const tool = this.activeTool();
    if (tool.onDoubleClick) return tool.onDoubleClick(info);
  };

  handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.canvas!.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      this.zoomAt(this.getViewport().zoom * factor, anchor);
      return;
    }
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    this.panBy(-dx, -dy);
  };

  setSpaceHeld(held: boolean): void {
    if (this.spaceHeld === held) return;
    this.spaceHeld = held;
    if (!this.panLast) this.setCursor(held ? 'grab' : this.activeTool().cursor);
  }

  private beginPinch(): void {
    // A second finger cancels whatever the first finger started.
    if (this.pointerDown) {
      this.pointerDown = false;
      this.activePointerId = null;
      this.activeTool().onDeactivate?.();
    }
    const [a, b] = [...this.touches.values()];
    this.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom: this.getViewport().zoom,
    };
  }

  private updatePinch(): void {
    const [a, b] = [...this.touches.values()];
    const p = this.pinch!;
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.panBy(center.x - p.center.x, center.y - p.center.y);
    p.center = center;
    this.zoomAt(p.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist), center);
  }

  // ───────────────────────────── Tools & style ─────────────────────────────

  setTool(type: ToolType): void {
    const prev = this.activeTool();
    if (prev.type === type) return;
    prev.onDeactivate?.();
    this.setState((s) => ({
      activeTool: type,
      ...(type !== 'selection' ? { selectedIds: {} } : {}),
      // the eraser button remembers which eraser was used last
      ...(type === 'eraser' || type === 'precisionEraser' ? { eraser: { ...s.eraser, mode: type === 'eraser' ? 'stroke' : 'precision' } } : {}),
    }));
    const next = this.activeTool();
    next.onActivate?.();
    this.setCursor(next.cursor);
  }

  /** Picks a gallery shape and switches to the figure tool. */
  setFigure(figure: string): void {
    this.setState({ currentFigure: figure });
    this.setTool('figure');
  }

  /** Swaps the selected gallery figures to another shape, keeping size, style and tail. */
  changeFigure(figure: string): void {
    const def = getFigure(figure);
    if (!def) return;
    this.setState({ currentFigure: figure });
    const updates = this.getSelectedElements()
      .filter((e): e is FigureElement => e.type === 'figure' && !e.locked)
      .map((e) => updateElement(e, { figure, tail: def.tail ? e.tail ?? { ...def.tail } : undefined }));
    if (!updates.length) return;
    this.scene.upsert(updates);
    this.commitHistory();
  }

  /** Eraser button / E: the eraser used last (stroke or precision). */
  setEraser(mode?: 'stroke' | 'precision'): void {
    this.setTool((mode ?? this.getState().eraser.mode) === 'precision' ? 'precisionEraser' : 'eraser');
  }

  /** Updates the "current item" style AND every selected element. */
  updateStyle(patch: Partial<CurrentStyle>): void {
    // a colour picked while words are selected in the text editor colours just those words
    const wordColor = patch.textColor ?? patch.strokeColor;
    if (wordColor && Object.keys(patch).length === 1 && this.getState().editingTextId && this.formatSelection?.({ kind: 'color', value: wordColor })) return;
    if (patch.fontFamily) void ensureFontLoaded(patch.fontFamily, patch.fontWeight, patch.fontStyle);
    this.setState((s) => ({ currentStyle: { ...s.currentStyle, ...patch } }));
    // targets: the selection — or the text being typed — plus the labels inside selected shapes
    const editing = this.getState().editingTextId;
    const direct = this.getSelectedElements();
    const typing = editing ? this.scene.getElement(editing) : undefined;
    // typing a shape's label acts like having the shape selected (same panel, same result)
    const typingIn = typing?.type === 'text' && typing.containerId ? this.scene.getElement(typing.containerId) : undefined;
    const own = direct.length ? direct : typingIn && !typingIn.isDeleted ? [typingIn] : typing ? [typing] : [];
    const selected = withLabels(this.scene.getElements(), own);
    if (!selected.length) return;
    const ownIds = new Set(own.map((e) => e.id));
    const updates = selected.map((el) => {
      const p: Record<string, unknown> = {};
      // a shape's label takes its shape's text settings and opacity, but keeps its own colour
      // (set that with "Text colour"), so recolouring the outline doesn't recolour the words
      const viaShape = !ownIds.has(el.id);
      for (const k of COMMON_STYLE_KEYS) if (k in patch && (!viaShape || k === 'opacity')) p[k] = patch[k];
      if (viaShape && patch.textColor) p.strokeColor = patch.textColor;
      if (!viaShape && el.type === 'text' && patch.textColor) p.strokeColor = patch.textColor;
      // the whole text recoloured: words with their own colour take the new one too
      if (el.type === 'text' && p.strokeColor !== undefined && el.runs?.some((r) => r.c)) {
        p.runs = normalizeRuns(el.runs.map((r) => ({ ...r, c: undefined })), { ...el, strokeColor: p.strokeColor as string });
      }
      if (el.type === 'freedraw' && el.kind === 'highlighter') {
        delete p.strokeColor; // highlighters use the highlight palette
        if (patch.highlightColor) p.strokeColor = patch.highlightColor;
      }
      if ((el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse') && patch.rounded !== undefined) {
        p.rounded = patch.rounded;
      }
      if (el.type === 'arrow' || el.type === 'line') {
        if (patch.startArrowhead) p.startArrowhead = patch.startArrowhead;
        if (patch.endArrowhead) p.endArrowhead = patch.endArrowhead;
      }
      const textKeys = ['fontSize', 'fontFamily', 'textAlign', 'fontWeight', 'fontStyle', 'underline'] as const;
      if (el.type === 'table' && (patch.fontSize || patch.fontFamily || patch.textAlign)) {
        const next = {
          ...el,
          fontSize: patch.fontSize ?? el.fontSize,
          fontFamily: patch.fontFamily ?? el.fontFamily,
          textAlign: patch.textAlign ?? el.textAlign,
        };
        // shrink rows back to fit the new text size, then grow where needed
        Object.assign(p, { fontSize: next.fontSize, fontFamily: next.fontFamily, textAlign: next.textAlign },
          relayout({ ...next, rowHeights: next.rowHeights.map(() => 0) }));
      }
      if (el.type === 'math' && (patch.fontSize || patch.textAlign)) {
        const next = { ...el, fontSize: patch.fontSize ?? el.fontSize, textAlign: patch.textAlign ?? el.textAlign };
        const box = mathBox(next);
        Object.assign(p, { fontSize: next.fontSize, textAlign: next.textAlign, ...box, x: el.x + (el.width - box.width) / 2 });
      }
      if (el.type === 'text' && textKeys.some((k) => patch[k] !== undefined)) {
        const next = {
          fontSize: patch.fontSize ?? el.fontSize,
          fontFamily: patch.fontFamily ?? el.fontFamily,
          textAlign: patch.textAlign ?? el.textAlign,
          fontWeight: patch.fontWeight ?? el.fontWeight,
          fontStyle: patch.fontStyle ?? el.fontStyle,
          underline: patch.underline ?? el.underline,
        };
        // the whole box set bold / italic / underline: words formatted differently follow it
        const runs = ((p.runs as TextRun[] | undefined) ?? el.runs)?.map((r) => ({
          ...r,
          b: patch.fontWeight !== undefined ? undefined : r.b,
          i: patch.fontStyle !== undefined ? undefined : r.i,
          u: patch.underline !== undefined ? undefined : r.u,
        }));
        const tidy = runs ? normalizeRuns(runs, { ...el, ...next, strokeColor: (p.strokeColor as string | undefined) ?? el.strokeColor }) : undefined;
        const m = textBoxSize({ ...el, ...next, runs: tidy });
        Object.assign(p, next, { width: m.width, height: m.height, runs: tidy });
      }
      return updateElement(el, anchored(el, p as Partial<SketchElement>));
    });
    this.scene.upsert(updates);
    this.syncLabels(selected.map((e) => (e.type === 'text' && e.containerId ? e.containerId : e.id)));
    this.commitHistory();
  }

  // ───────────────────────────── Text editing ─────────────────────────────

  /** Auto width: boxes fit their longest line again. Fixed: they keep their width and wrap. */
  setTextWidthMode(fixed: boolean): void {
    const texts = this.getSelectedElements().filter((e): e is TextElement => e.type === 'text' && !e.containerId && !e.locked);
    if (!texts.length) return;
    this.scene.upsert(
      texts.map((el) => {
        const next = { ...el, fixedWidth: fixed || undefined };
        const size = textBoxSize(next);
        const dx = fixed ? 0 : el.textAlign === 'center' ? (el.width - size.width) / 2 : el.textAlign === 'right' ? el.width - size.width : 0;
        return updateElement(el, anchored(el, { fixedWidth: fixed || undefined, ...size, x: el.x + dx }));
      }),
    );
    this.commitHistory();
  }

  startTextEditing = (id: string): void => {
    this.setState({ editingTextId: id, selectedIds: {} });
  };

  /** Typed text, with the formatting of its parts (bold words…) when the editor has any. */
  updateEditingText(text: string, runs?: TextRun[]): void {
    const id = this.getState().editingTextId;
    const el = id ? (this.scene.getElement(id) as TextElement | undefined) : undefined;
    if (!el) return;
    const tidy = runs ? normalizeRuns(runs, el) : undefined;
    const box = el.containerId ? this.scene.getElement(el.containerId) : undefined;
    if (box && !box.isDeleted) {
      this.scene.upsert([updateElement(el, { text, runs: tidy, ...layoutLabel({ ...el, text, runs: tidy }, box) })]);
      return;
    }
    const m = textBoxSize({ ...el, text, runs: tidy });
    // keep alignment anchor stable while typing (a fixed-width box keeps its width and grows down)
    const dx = el.textAlign === 'center' ? (el.width - m.width) / 2 : el.textAlign === 'right' ? el.width - m.width : 0;
    this.scene.upsert([updateElement(el, anchored(el, { text, runs: tidy, width: m.width, height: m.height, x: el.x + dx }))]);
  }

  /**
   * The text editor registers this to format the words selected in it; it returns false when nothing
   * is selected there (then Bold / Italic / Underline apply to the whole box).
   */
  private formatSelection: ((f: SelectionFormat) => boolean) | null = null;
  setSelectionFormatter = (fn: ((f: SelectionFormat) => boolean) | null): void => {
    this.formatSelection = fn;
  };

  finishTextEditing(): void {
    const id = this.getState().editingTextId;
    if (!id) return;
    const el = this.scene.getElement(id) as TextElement | undefined;
    this.setState({ editingTextId: null });
    if (!el) return;
    if (!el.text.trim()) {
      this.scene.upsert([updateElement(el, { isDeleted: true })]);
      this.commitHistory();
      return;
    }
    this.commitHistory();
    if (!this.getState().toolLocked) this.setTool('selection');
    if (this.getState().activeTool === 'selection') this.setSelection([el.containerId && this.scene.getElement(el.containerId) ? el.containerId : el.id]);
  }

  // ───────────────────────────── Arrow binding ─────────────────────────────

  private syncingArrows = false;
  private bindingHint: string | null = null;

  /** Re-attaches the ends of arrows bound to any of `shapeIds` (called on every local change). */
  syncArrows(shapeIds: Iterable<string>): void {
    const ids = new Set(shapeIds);
    if (!ids.size) return;
    const arrows = arrowsBoundTo(this.scene.getElements(), ids);
    if (!arrows.length) return;
    const get = (id: string) => this.scene.getElement(id);
    const updates: SketchElement[] = [];
    for (const a of arrows) {
      const geo = boundArrowGeometry(a, get);
      if (geo) updates.push(updateElement(a, geo));
    }
    if (!updates.length) return;
    this.syncingArrows = true;
    try {
      this.scene.upsert(updates);
    } finally {
      this.syncingArrows = false;
    }
  }

  bindingTargetAt = (world: Point, exclude: Iterable<string>): SketchElement | null =>
    bindableAt(this.scene.getElements(), world, BIND_DISTANCE / this.getViewport().zoom, new Set(exclude));

  /**
   * Attaches each chosen end of an arrow / line to the shape it now touches — or detaches it from
   * empty space — then snaps the attached ends onto the outlines.
   */
  bindArrow = (id: string, ends: 'start' | 'end' | 'both' = 'both', allowBind = true): void => {
    const a = this.scene.getElement(id);
    if (!a || (a.type !== 'arrow' && a.type !== 'line') || a.polygon || a.points.length < 2) return;
    const pts = a.points.map((q) => ({ x: q.x + a.x, y: q.y + a.y }));
    const exclude = [a.id];
    const bindAt = (p: Point) => {
      if (!allowBind) return undefined; // Ctrl/Cmd held: leave the end free
      const t = this.bindingTargetAt(p, exclude);
      return t ? { elementId: t.id, anchor: anchorFor(t, p) } : undefined;
    };
    const patch: Partial<LinearElement> = {};
    if (ends !== 'end') patch.startBinding = bindAt(pts[0]);
    if (ends !== 'start') patch.endBinding = bindAt(pts[pts.length - 1]);
    // both ends on one shape would collapse the arrow: keep only the end that was just placed
    const sb = 'startBinding' in patch ? patch.startBinding : a.startBinding;
    const eb = 'endBinding' in patch ? patch.endBinding : a.endBinding;
    if (sb && eb && sb.elementId === eb.elementId) {
      if (ends === 'start') patch.startBinding = undefined;
      else patch.endBinding = undefined;
    }
    const next = updateElement(a, patch) as LinearElement;
    const geo = boundArrowGeometry(next, (x) => this.scene.getElement(x));
    this.scene.upsert([geo ? updateElement(next, geo) : next]);
  };

  /**
   * After arrows were moved: ends that travelled without their shape attach to whatever they now
   * touch (or come free); ends whose shape moved with them stay as they are.
   */
  rebindMoved = (movedIds: Iterable<string>): void => {
    const ids = new Set(movedIds);
    for (const id of ids) {
      const a = this.scene.getElement(id);
      if (!a || (a.type !== 'arrow' && a.type !== 'line')) continue;
      const startFree = !a.startBinding || !ids.has(a.startBinding.elementId);
      const endFree = !a.endBinding || !ids.has(a.endBinding.elementId);
      if (startFree || endFree) this.bindArrow(id, startFree && endFree ? 'both' : startFree ? 'start' : 'end');
    }
  };

  setBindingHint = (id: string | null): void => {
    if (this.bindingHint === id) return;
    this.bindingHint = id;
    this.requestRender();
  };

  /** Outline around the shape an arrow end is about to attach to. */
  private drawBindingHint(ctx: CanvasRenderingContext2D, zoom: number): void {
    const el = this.bindingHint ? this.scene.getElement(this.bindingHint) : undefined;
    if (!el || el.isDeleted) return;
    const pad = 5 / zoom;
    ctx.save();
    ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
    ctx.rotate(el.angle ?? 0);
    ctx.strokeStyle = 'rgba(91, 91, 214, 0.75)';
    ctx.lineWidth = 3 / zoom;
    ctx.beginPath();
    const w = el.width / 2 + pad;
    const h = el.height / 2 + pad;
    if (el.type === 'ellipse') ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    else if (el.type === 'diamond') {
      ctx.moveTo(0, -h);
      ctx.lineTo(w, 0);
      ctx.lineTo(0, h);
      ctx.lineTo(-w, 0);
      ctx.closePath();
    } else ctx.roundRect(-w, -h, w * 2, h * 2, 6 / zoom);
    ctx.stroke();
    ctx.restore();
  }

  // ───────────────────────────── Shape labels ─────────────────────────────

  /** Topmost rectangle / ellipse / diamond / gallery shape whose box contains the point — even unfilled ones. */
  labelShapeAt = (world: Point): SketchElement | null => {
    const els = this.scene.getElements();
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (!canHoldLabel(el) || el.locked) continue;
      const p = toLocal(el, world);
      if (p.x >= el.x && p.x <= el.x + el.width && p.y >= el.y && p.y <= el.y + el.height) return el;
    }
    return null;
  };

  /** Double-click on a shape: edit its label, or start one centred in the shape. */
  editLabel = (box: SketchElement): void => {
    if (!canHoldLabel(box) || box.locked) return;
    const existing = labelOf(this.scene.getElements(), box.id);
    if (existing) return this.startTextEditing(existing.id);
    const style = this.getState().currentStyle;
    const stroke = box.strokeColor && box.strokeColor !== 'transparent' ? box.strokeColor : style.strokeColor;
    const base = { ...createText(style, { x: box.x, y: box.y }, this.nextZIndex()), textAlign: 'center' as const, strokeColor: stroke, containerId: box.id };
    const label = { ...base, ...layoutLabel(base, box), frameId: box.frameId, groupIds: box.groupIds };
    this.scene.upsert([label]);
    this.startTextEditing(label.id);
  };

  /** Re-centres / re-wraps labels after their shapes changed (all labels, or those of `containerIds`). */
  syncLabels = (containerIds?: Iterable<string>, silent = false): void => {
    const only = containerIds ? new Set(containerIds) : null;
    const updates: SketchElement[] = [];
    for (const el of this.scene.getElements()) {
      if (el.type !== 'text' || !el.containerId || (only && !only.has(el.containerId))) continue;
      const box = this.scene.getElement(el.containerId);
      if (!box || box.isDeleted || !labelNeedsLayout(el, box)) continue;
      const patch = layoutLabel(el, box);
      updates.push(silent ? { ...el, ...patch } : updateElement(el, patch));
    }
    if (updates.length) this.scene.upsert(updates, silent ? 'load' : undefined);
  };

  // ───────────────────────────── Rotation ─────────────────────────────

  /** Turns the selection by `delta` radians around its centre (one undo step). */
  rotateSelection(delta: number): void {
    const sel = withFrameChildren(this.scene.getElements(), this.getSelectedElements()).filter((e) => !e.locked);
    if (!sel.length || !delta) return;
    const b = unionBounds(sel.map(getElementBounds))!;
    const pivot = sel.length === 1 && !bakesRotation(sel[0]) ? centerOf(sel[0]) : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    this.scene.upsert(sel.map((el) => updateElement(el, rotateAround(el, delta, pivot))));
    this.commitHistory();
  }

  /** Sets the angle (radians) of every selected element that keeps one (shapes, text, images…). */
  setSelectionAngle(angle: number): void {
    const sel = this.getSelectedElements().filter((e) => !e.locked && !bakesRotation(e));
    if (!sel.length) return;
    this.scene.upsert(sel.map((el) => updateElement(el, { angle: normalizeAngle(angle) })));
    this.syncLabels(sel.map((e) => e.id));
    this.commitHistory();
  }

  // ───────────────────────── Groups, frames, flip, links ─────────────────────────

  /**
   * Right-click: an unselected element under the pointer becomes the selection (with its group);
   * empty canvas clears it. Returns which menu to show.
   */
  prepareContextMenu(e: MouseEvent): 'element' | 'canvas' {
    if (!this.canvas) return 'canvas';
    const info = this.toPointerInfo(e);
    this.lastPointer = info.world;
    if (this.getState().activeTool !== 'selection') this.setTool('selection');
    const hit = this.hitTest(info.world);
    if (hit) {
      if (!this.getState().selectedIds[hit.id]) this.setSelection(this.expandToGroups([hit.id]));
      return 'element';
    }
    // inside the current multi-selection's box still targets the selection
    const sel = this.getSelectedElements();
    const b = sel.length > 1 ? unionBounds(sel.map(getElementBounds)) : null;
    if (b && info.world.x >= b.x && info.world.x <= b.x + b.width && info.world.y >= b.y && info.world.y <= b.y + b.height) return 'element';
    this.setSelection([]);
    return 'canvas';
  }

  expandToGroups = (ids: Iterable<string>): string[] => expandToGroups(this.scene.getElements(), ids);

  withFrameChildren = (els: readonly SketchElement[]): SketchElement[] => withFrameChildren(this.scene.getElements(), els);

  /** Re-checks frame membership (elements dragged into / out of frames). */
  assignFrames = (ids: Iterable<string>, commit = true): void => {
    const set = new Set(ids);
    const els = this.scene.getElements().filter((e) => set.has(e.id));
    if (this.applyPatches(framePatches(this.scene.getElements(), els)) && commit) this.commitHistory();
  };

  /** Applies id → patch maps as new element versions. Returns whether anything changed. */
  private applyPatches(patches: Patches): boolean {
    if (!patches.size) return false;
    const updates: SketchElement[] = [];
    for (const [id, patch] of patches) {
      const el = this.scene.getElement(id);
      if (el) updates.push(updateElement(el, patch));
    }
    this.scene.upsert(updates);
    this.syncLabels(patches.keys());
    return updates.length > 0;
  }

  canGroup = (): boolean => groupPatches(this.getSelectedElements()) !== null;
  canUngroup = (): boolean => this.getSelectedElements().some((e) => e.groupIds?.length);

  groupSelected(): void {
    const r = groupPatches(this.getSelectedElements());
    if (!r) return;
    this.applyPatches(r.patches);
    this.commitHistory();
  }

  ungroupSelected(): void {
    if (this.applyPatches(ungroupPatches(this.getSelectedElements()))) this.commitHistory();
  }

  /** Puts a named frame around the selection (one undo step) and selects it. */
  wrapSelectionInFrame(): void {
    const sel = this.getSelectedElements().filter((e) => e.type !== 'frame');
    const box = frameBoxFor(sel);
    if (!box) return;
    const n = this.scene.getElements().filter((e) => e.type === 'frame').length + 1;
    const z = Math.min(...sel.map((e) => e.zIndex)) - 1;
    const frame = createFrame(box, z, `Frame ${n}`);
    this.scene.upsert([frame, ...sel.map((e) => updateElement(e, { frameId: frame.id }))]);
    this.setSelection([frame.id]);
    this.commitHistory();
  }

  /** Deletes the selected frames but keeps what was inside them. */
  removeFrameSelected(): void {
    const frames = this.getSelectedElements().filter((e) => e.type === 'frame');
    if (!frames.length) return;
    const ids = new Set(frames.map((f) => f.id));
    const kids = this.scene.getElements().filter((e) => e.frameId && ids.has(e.frameId));
    this.scene.upsert([...frames.map((f) => updateElement(f, { isDeleted: true })), ...kids.map((k) => updateElement(k, { frameId: undefined }))]);
    this.setSelection(kids.map((k) => k.id));
    this.commitHistory();
  }

  renameFrame(id: string, name: string): void {
    const f = this.scene.getElement(id);
    if (f?.type !== 'frame') return;
    this.scene.upsert([updateElement(f, { name: name.slice(0, 120) })]);
    this.commitHistory();
  }

  /** Selects everything inside the selected frame(s). */
  selectFrameContents(): void {
    const frames = new Set(this.getSelectedElements().filter((e) => e.type === 'frame').map((e) => e.id));
    const kids = this.scene.getElements().filter((e) => e.frameId && frames.has(e.frameId));
    if (kids.length) this.setSelection(kids.map((k) => k.id));
  }

  flipSelected(axis: FlipAxis): void {
    const sel = withFrameChildren(this.scene.getElements(), this.getSelectedElements());
    if (this.applyPatches(flipPatches(sel, axis))) this.commitHistory();
  }

  /** Removes every bend from the selected lines / arrows (keeps their two ends). */
  straightenSelected(): void {
    const lines = this.getSelectedElements().filter(
      (e): e is LinearElement => (e.type === 'line' || e.type === 'arrow') && !e.locked && !e.polygon && e.points.length > 2,
    );
    if (!lines.length) return;
    this.scene.upsert(
      lines.map((l) => {
        const ends = [l.points[0], l.points[l.points.length - 1]].map((q) => ({ x: q.x + l.x, y: q.y + l.y }));
        return updateElement(l, pointsToElementGeometry(ends) as Partial<LinearElement>);
      }),
    );
    this.commitHistory();
  }

  canStraighten = (): boolean =>
    this.getSelectedElements().some((e) => (e.type === 'line' || e.type === 'arrow') && !e.polygon && e.points.length > 2);

  /** Copies the selection (or the whole drawing) to the clipboard as a PNG picture. */
  async copyAsPng(): Promise<void> {
    const els = this.copyTargets();
    if (!els.length) return this.toast('Nothing to copy');
    const region = contentBounds(els, 16)!;
    try {
      const blob = exportToPngBlob(els, { region, colorMode: this.getState().viewColorMode, background: true, scale: 2 });
      // Safari needs the promise passed straight to ClipboardItem (inside the user gesture)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.toast('Copied as PNG');
    } catch {
      this.toast('Couldn’t copy the picture — your browser blocked clipboard access');
    }
  }

  /** Copies the selection (or the whole drawing) to the clipboard as SVG markup. */
  async copyAsSvg(): Promise<void> {
    const els = this.copyTargets();
    if (!els.length) return this.toast('Nothing to copy');
    const svg = exportToSvg(els, { region: contentBounds(els, 16)!, colorMode: this.getState().viewColorMode, background: true });
    try {
      const item: Record<string, Blob> = { 'text/plain': new Blob([svg], { type: 'text/plain' }) };
      if (typeof ClipboardItem !== 'undefined' && ClipboardItem.supports?.('image/svg+xml')) item['image/svg+xml'] = new Blob([svg], { type: 'image/svg+xml' });
      await navigator.clipboard.write([new ClipboardItem(item)]);
      this.toast('Copied as SVG');
    } catch {
      try {
        await navigator.clipboard.writeText(svg);
        this.toast('Copied as SVG');
      } catch {
        this.toast('Couldn’t copy — your browser blocked clipboard access');
      }
    }
  }

  private copyTargets(): SketchElement[] {
    const sel = this.getSelectedElements();
    const els = sel.length ? withFrameChildren(this.scene.getElements(), sel) : this.scene.getElements();
    return [...els].sort((a, b) => a.zIndex - b.zIndex);
  }

  /** Sets (or with null / '' removes) the link on every selected element. Returns false for an invalid URL. */
  setLinkOnSelection(input: string | null): boolean {
    const link = input ? normalizeLink(input) : null;
    if (input && input.trim() && !link) return false;
    const sel = this.getSelectedElements();
    if (!sel.length) return true;
    this.scene.upsert(sel.map((e) => updateElement(e, { link: link ?? undefined })));
    this.commitHistory();
    return true;
  }

  openLink = (el: SketchElement): void => {
    const link = el.link && normalizeLink(el.link);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  };

  /** Element whose link badge (top-right corner) is under this world point. */
  linkBadgeAt = (world: Point): SketchElement | null => {
    const badges = linkBadges(this.scene.getElements(), this.getViewport().zoom);
    for (let i = badges.length - 1; i >= 0; i--) {
      const r = badges[i].rect;
      if (world.x >= r.x && world.x <= r.x + r.width && world.y >= r.y && world.y <= r.y + r.height) return badges[i].el;
    }
    return null;
  };

  private styleClipboard: Partial<SketchElement> | null = null;

  /** Remembers the first selected element's look (colours, stroke, fill, font). */
  copyStyles(): void {
    const el = this.getSelectedElements()[0];
    if (!el) return;
    const keys = [...COMMON_STYLE_KEYS, 'fontSize', 'fontFamily', 'textAlign', 'fontWeight', 'fontStyle'] as const;
    const style: Record<string, unknown> = {};
    for (const k of keys) if (k in el) style[k] = (el as unknown as Record<string, unknown>)[k];
    this.styleClipboard = style as Partial<SketchElement>;
    this.toast('Styles copied');
  }

  hasCopiedStyles = (): boolean => this.styleClipboard !== null;

  /** Applies copied styles to the selection (font settings only where the element has text). */
  pasteStyles(): void {
    const style = this.styleClipboard;
    const sel = this.getSelectedElements().filter((e) => !e.locked);
    if (!style || !sel.length) return;
    this.scene.upsert(
      sel.map((el) => {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(style)) if ((COMMON_STYLE_KEYS as readonly string[]).includes(k) || (el.type === 'text' && k in el)) patch[k] = v;
        return updateElement(el, patch as Partial<SketchElement>);
      }),
    );
    if (sel.some((e) => e.type === 'text')) this.refreshTextMetrics();
    this.commitHistory();
  }

  // ───────────────────────────── Code blocks ─────────────────────────────

  /** Adds an empty code block in the middle of the screen (or at `at`) and starts editing it. */
  insertCode(at?: Point, code = ''): void {
    void ensureFontLoaded('code');
    const s = this.getState();
    const el = createCode(s.currentStyle, s.codeDefaults, { x: 0, y: 0 }, this.nextZIndex(), code);
    const c = at ?? this.viewportCenter();
    const placed = { ...el, x: c.x - el.width / 2, y: c.y - el.height / 2 };
    this.scene.upsert([placed]);
    this.setTool('selection');
    this.startCodeEditing(placed.id);
  }

  startCodeEditing = (id: string): void => {
    void ensureFontLoaded('code');
    this.setState({ editingCodeId: id, selectedIds: {} });
  };

  updateEditingCode(code: string): void {
    const id = this.getState().editingCodeId;
    const el = id ? this.scene.getElement(id) : undefined;
    if (!el || el.type !== 'code') return;
    const l = codeLayout({ ...el, code });
    this.scene.upsert([updateElement(el, anchored(el, { code, width: l.width, height: l.height }))]);
  }

  finishCodeEditing(): void {
    const id = this.getState().editingCodeId;
    if (!id) return;
    const el = this.scene.getElement(id);
    this.setState({ editingCodeId: null });
    if (!el || el.type !== 'code') return;
    if (!el.code.trim()) {
      this.scene.upsert([updateElement(el, { isDeleted: true })]);
      this.commitHistory();
      return;
    }
    this.commitHistory();
    this.setSelection([el.id]);
  }

  private codeTargets(): CodeElement[] {
    const editing = this.getState().editingCodeId;
    const ids = editing ? [editing] : Object.keys(this.getState().selectedIds);
    return ids.map((id) => this.scene.getElement(id)).filter((e): e is CodeElement => !!e && e.type === 'code' && !e.locked);
  }

  /** Language / theme / font size / line numbers / title for the selected code blocks (and new ones). */
  updateCode(patch: Partial<Pick<CodeElement, 'language' | 'theme' | 'fontSize' | 'lineNumbers' | 'showLanguage' | 'title'>>): void {
    const { title, ...defaults } = patch;
    if (Object.keys(defaults).length) this.setState((s) => ({ codeDefaults: { ...s.codeDefaults, ...defaults } }));
    if (patch.fontSize) void ensureFontLoaded('code');
    const targets = this.codeTargets();
    if (!targets.length) return;
    this.scene.upsert(
      targets.map((el) => {
        const next = { ...el, ...patch, ...(title !== undefined ? { title: title.slice(0, 120) } : {}) };
        const l = codeLayout(next);
        return updateElement(el, anchored(el, { ...patch, title: next.title, width: l.width, height: l.height }));
      }),
    );
    if (!this.getState().editingCodeId) this.commitHistory();
  }

  /** Marks (or, with null, unmarks) lines of a code block. */
  setCodeMarks(id: string, lines: number[], color: CodeMark | null): void {
    const el = this.scene.getElement(id);
    if (!el || el.type !== 'code' || el.locked) return;
    const marks = { ...el.marks };
    for (const n of lines) {
      if (color) marks[n] = color;
      else delete marks[n];
    }
    this.scene.upsert([updateElement(el, { marks })]);
    this.commitHistory();
  }

  /** Clicking a line number: mark it in the current colour, or unmark if it already has that colour. */
  toggleCodeLine = (id: string, line: number): void => {
    const el = this.scene.getElement(id);
    if (!el || el.type !== 'code') return;
    const color = this.getState().codeDefaults.markColor;
    this.setCodeMarks(id, [line], el.marks[line] === color ? null : color);
  };

  // ───────────────────────────── Maths (LaTeX) ─────────────────────────────

  /** Adds a formula in the middle of the screen (or at `at`) and opens its LaTeX for editing. */
  async insertMath(at?: Point, latex = ''): Promise<void> {
    await loadMath();
    const s = this.getState();
    const el = createMath(s.currentStyle, { x: 0, y: 0 }, this.nextZIndex(), latex || String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`, s.currentStyle.fontSize > 24 ? s.currentStyle.fontSize : 28);
    const c = at ?? this.viewportCenter();
    const placed = { ...el, x: c.x - el.width / 2, y: c.y - el.height / 2 };
    this.scene.upsert([placed]);
    this.setTool('selection');
    this.setSelection([placed.id]);
    this.startMathEditing(placed.id, !latex);
  }

  /** Opens the LaTeX editor for a formula. `fresh`: a new one (removed again if left empty or unchanged by Esc). */
  startMathEditing = (id: string, fresh = false): void => {
    void loadMath();
    this.mathFresh = fresh;
    this.setSelection([id]);
    this.setState({ editingMathId: id });
  };
  private mathFresh = false;
  isFreshMath = (): boolean => this.mathFresh;

  updateEditingMath(latex: string): void {
    const id = this.getState().editingMathId;
    const el = id ? this.scene.getElement(id) : undefined;
    if (!el || el.type !== 'math') return;
    const box = mathBox({ ...el, latex });
    // grows from its centre, like typing in centred text
    const dx = (el.width - box.width) / 2;
    this.scene.upsert([updateElement(el, anchored(el, { latex, ...box, x: el.x + dx }))]);
  }

  finishMathEditing(cancel = false): void {
    const id = this.getState().editingMathId;
    if (!id) return;
    this.setState({ editingMathId: null });
    const el = this.scene.getElement(id);
    if (!el || el.type !== 'math') return;
    if (!el.latex.trim() || (cancel && this.mathFresh)) {
      this.scene.upsert([updateElement(el, { isDeleted: true })]);
      this.setSelection([]);
    } else this.setSelection([el.id]);
    this.mathFresh = false;
    this.commitHistory();
  }

  /** Formulae measured before KaTeX / its fonts arrived get their real size (derived data: no version bump). */
  refreshMathSizes(): void {
    const fixed: SketchElement[] = [];
    for (const el of this.scene.getElements()) {
      if (el.type !== 'math' || el.isDeleted) continue;
      const box = mathBox(el);
      if (Math.abs(box.width - el.width) > 0.5 || Math.abs(box.height - el.height) > 0.5) {
        fixed.push({ ...el, x: el.x + (el.width - box.width) / 2, ...box });
      }
    }
    if (fixed.length) this.scene.upsert(fixed, 'load');
  }

  // ───────────────────────────── Tables ─────────────────────────────

  /** The one selected table (for copying it), or null. */
  selectedTable(): TableElement | null {
    const sel = this.getSelectedElements();
    const cell = this.getState().editingCell;
    const el = cell ? this.scene.getElement(cell.id) : sel.length === 1 ? sel[0] : undefined;
    return el?.type === 'table' && !el.isDeleted ? el : null;
  }

  /**
   * Copies the selected table's cells: "spreadsheet" puts tab-separated text plus an HTML table on
   * the clipboard (Excel, Google Sheets, Word and Docs paste real cells), "markdown" a pipe table,
   * "csv" comma-separated text.
   */
  async copyTable(format: 'spreadsheet' | 'markdown' | 'csv'): Promise<void> {
    const el = this.selectedTable();
    if (!el) return this.toast('Select a table first');
    const cells = el.cells.map((r) => r.slice(0, el.cols)).slice(0, el.rows);
    const text = format === 'markdown' ? toMarkdown(cells, el.textAlign) : format === 'csv' ? toCSV(cells) : toTSV(cells);
    const what = format === 'markdown' ? 'as Markdown' : format === 'csv' ? 'as CSV' : 'for spreadsheets';
    try {
      if (format === 'spreadsheet' && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([toHTMLTable(cells, el.headerRow)], { type: 'text/html' }),
          }),
        ]);
      } else await navigator.clipboard.writeText(text);
      this.toast(`Table copied ${what} (${el.rows} × ${el.cols})`);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        this.toast(`Table copied ${what}`);
      } catch {
        this.toast('Couldn’t copy — your browser blocked clipboard access');
      }
    }
  }

  /** A new table holding `parsed` (pasted or imported), with columns sized to their contents. */
  insertTableFromCells(parsed: ParsedTable, at?: Point): void {
    const s = this.getState();
    const rows = parsed.cells.length;
    const cols = parsed.cells[0]?.length ?? 0;
    if (!rows || !cols) return;
    const draft = createTable(s.currentStyle, { ...s.tableDefaults, rows, cols, headerRow: parsed.header || s.tableDefaults.headerRow }, { x: 0, y: 0, width: cols * 120, height: rows * 32 }, this.nextZIndex());
    const withCells = { ...draft, cells: parsed.cells.map((r) => [...r]), rowHeights: Array(rows).fill(MIN_ROW_HEIGHT) };
    const colWidths = fitColumnWidths(withCells);
    const sized = { ...withCells, colWidths };
    const el = { ...sized, ...relayout(sized) };
    const c = at ?? this.lastPointer ?? this.viewportCenter();
    const placed = at ? { ...el, x: c.x, y: c.y } : { ...el, x: c.x - el.width / 2, y: c.y - el.height / 2 };
    this.scene.upsert([placed]);
    this.setTool('selection');
    this.setSelection([placed.id]);
    this.commitHistory();
    const cut = wasTruncated(rows, cols) ? ` — cut to ${MAX_IMPORT_ROWS} rows × ${MAX_IMPORT_COLS} columns` : '';
    const from = { markdown: 'Markdown', spreadsheet: 'spreadsheet', csv: 'CSV', html: 'copied' }[parsed.source];
    this.toast(`Table created from ${from} data (${rows} × ${cols})${cut}`);
  }

  /**
   * Pastes cells into an existing table starting at (row, col) — like pasting into a spreadsheet:
   * cells are overwritten and the table grows when the data runs past its edge.
   */
  pasteIntoTable(id: string, row: number, col: number, cells: string[][]): void {
    const el = this.scene.getElement(id);
    if (!el || el.type !== 'table' || el.locked || !cells.length) return;
    const needRows = Math.min(MAX_IMPORT_ROWS, row + cells.length);
    const needCols = Math.min(MAX_IMPORT_COLS, col + Math.max(...cells.map((r) => r.length)));
    let next: TableElement = { ...el, ...resizeGrid(el, Math.max(el.rows, needRows), Math.max(el.cols, needCols)) } as TableElement;
    const grid = next.cells.map((r) => [...r]);
    cells.forEach((r, i) => r.forEach((v, j) => {
      if (row + i < next.rows && col + j < next.cols) grid[row + i][col + j] = v;
    }));
    next = { ...next, cells: grid };
    this.scene.upsert([updateElement(el, anchored(el, { ...next, ...relayout(next) }))]);
    this.tableCursor = { id, row, col };
    this.setSelection([id]);
    this.commitHistory();
    this.toast(`Pasted ${cells.length} × ${Math.max(...cells.map((r) => r.length))} cells`);
  }

  /** Asks for a CSV / TSV / Markdown file and turns its table into a table on the board. */
  pickTableFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = TABLE_FILE_ACCEPT;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void this.importTableFile(f, undefined);
    };
    input.click();
  }

  /** Reads a CSV / TSV / Markdown file into a new table. */
  async importTableFile(file: File, at?: Point): Promise<boolean> {
    const text = await file.text();
    const parsed = tableFromFile(file.name, text);
    if (!parsed || !parsed.cells.length) {
      this.toast(`No table found in ${file.name}`);
      return false;
    }
    this.insertTableFromCells(parsed, at);
    return true;
  }

  /** Last cell the user clicked / edited: row & column commands act on it. */
  private tableCursor: { id: string; row: number; col: number } | null = null;

  noteTableCell = (id: string, row: number, col: number): void => {
    this.tableCursor = { id, row, col };
  };

  getTableCursor(id: string): { row: number; col: number } | null {
    const c = this.tableCursor;
    const el = this.scene.getElement(id);
    if (!c || c.id !== id || !el || el.type !== 'table') return null;
    return { row: Math.min(c.row, el.rows - 1), col: Math.min(c.col, el.cols - 1) };
  }

  startCellEditing = (id: string, row: number, col: number): void => {
    const el = this.scene.getElement(id);
    if (!el || el.type !== 'table' || el.locked) return;
    this.tableCursor = { id, row, col };
    this.setState({ editingCell: { id, row, col }, selectedIds: { [id]: true } });
  };

  updateEditingCell(text: string): void {
    const cell = this.getState().editingCell;
    const el = cell && this.scene.getElement(cell.id);
    if (!cell || !el || el.type !== 'table') return;
    this.scene.upsert([updateElement(el, anchored(el, setCellText(el, cell.row, cell.col, text)))]);
  }

  finishCellEditing(): void {
    if (!this.getState().editingCell) return;
    this.setState({ editingCell: null });
    this.commitHistory();
  }

  /** Tab / Shift+Tab / Enter-style navigation. Tab past the last cell appends a row (like word processors). */
  moveEditingCell(dir: 'next' | 'prev' | 'up' | 'down'): void {
    const cell = this.getState().editingCell;
    let el = cell && this.scene.getElement(cell.id);
    if (!cell || !el || el.type !== 'table') return;
    let { row, col } = cell;
    if (dir === 'next') {
      col++;
      if (col >= el.cols) {
        col = 0;
        row++;
      }
    } else if (dir === 'prev') {
      col--;
      if (col < 0) {
        col = el.cols - 1;
        row--;
      }
    } else row += dir === 'down' ? 1 : -1;
    if (row < 0) return;
    if (row >= el.rows) {
      if (dir !== 'next' && dir !== 'down') return;
      const grown = updateElement(el, anchored(el, insertRow(el, el.rows)));
      this.scene.upsert([grown]);
      el = grown;
    }
    this.commitHistory();
    this.startCellEditing(el.id, row, col);
  }

  /** Row/column structure commands for the selected table (at the table cursor, else at the end). */
  tableCommand(op: 'rowAbove' | 'rowBelow' | 'deleteRow' | 'colLeft' | 'colRight' | 'deleteCol' | 'distribute'): void {
    const el = this.getSelectedElements().find((e): e is TableElement => e.type === 'table');
    if (!el || el.locked) return;
    const cur = this.getTableCursor(el.id) ?? { row: el.rows - 1, col: el.cols - 1 };
    const patch =
      op === 'rowAbove' ? insertRow(el, cur.row)
      : op === 'rowBelow' ? insertRow(el, cur.row + 1)
      : op === 'deleteRow' ? removeRow(el, cur.row)
      : op === 'colLeft' ? insertCol(el, cur.col)
      : op === 'colRight' ? insertCol(el, cur.col + 1)
      : op === 'deleteCol' ? removeCol(el, cur.col)
      : distributeColumns(el);
    if (!Object.keys(patch).length) return;
    if (op === 'rowBelow') this.tableCursor = { id: el.id, row: cur.row + 1, col: cur.col };
    if (op === 'colRight') this.tableCursor = { id: el.id, row: cur.row, col: cur.col + 1 };
    this.scene.upsert([updateElement(el, anchored(el, patch))]);
    this.commitHistory();
  }

  /** Table settings: updates the defaults for new tables AND every selected table. */
  updateTable(patch: Partial<TableDefaults>): void {
    this.setState((s) => ({ tableDefaults: { ...s.tableDefaults, ...patch } }));
    const tables = this.getSelectedElements().filter((e): e is TableElement => e.type === 'table' && !e.locked);
    if (!tables.length) return;
    this.scene.upsert(
      tables.map((el) => {
        let next: TableElement = { ...el };
        if (patch.rows !== undefined || patch.cols !== undefined) {
          next = { ...next, ...resizeGrid(next, patch.rows ?? next.rows, patch.cols ?? next.cols) } as TableElement;
        }
        const { rows: _r, cols: _c, ...rest } = patch;
        next = { ...next, ...rest };
        return updateElement(el, anchored(el, { ...next, ...relayout(next) }));
      }),
    );
    this.commitHistory();
  }

  // ───────────────────────────── Commands ─────────────────────────────

  undo(): void {
    this.history.undo();
    this.pruneSelection();
  }

  redo(): void {
    this.history.redo();
    this.pruneSelection();
  }

  private pruneSelection(): void {
    const ids = Object.keys(this.getState().selectedIds).filter((id) => {
      const el = this.scene.getElement(id);
      return el && !el.isDeleted;
    });
    this.setSelection(ids);
  }

  deleteSelected(): void {
    const sel = withFrameChildren(this.scene.getElements(), this.getSelectedElements()).filter((e) => !e.locked);
    if (!sel.length) return;
    this.scene.upsert(sel.map((e) => updateElement(e, { isDeleted: true })));
    this.setSelection([]);
    this.commitHistory();
  }

  duplicateSelected(offset: Point = { x: 16, y: 16 }): void {
    const sel = withFrameChildren(this.scene.getElements(), this.getSelectedElements()).sort((a, b) => a.zIndex - b.zIndex);
    if (!sel.length) return;
    let z = this.nextZIndex();
    const clones = remapCopies(sel, sel.map((e) => cloneElement(e, offset, z++)));
    this.scene.upsert(clones);
    this.setSelection(clones.map((c) => c.id));
    this.commitHistory();
  }

  selectAll(): void {
    this.setTool('selection');
    this.setSelection(this.scene.getElements().map((e) => e.id));
  }

  nudgeSelected(dx: number, dy: number): void {
    const sel = withFrameChildren(this.scene.getElements(), this.getSelectedElements()).filter((e) => !e.locked);
    if (!sel.length) return;
    this.scene.upsert(sel.map((e) => updateElement(e, { x: e.x + dx, y: e.y + dy })));
    this.assignFrames(sel.map((e) => e.id), false);
    this.rebindMoved(sel.map((e) => e.id));
    this.commitHistory();
  }

  toggleLockSelected(): void {
    const sel = this.getSelectedElements();
    if (!sel.length) return;
    const lock = !sel.every((e) => e.locked);
    this.scene.upsert(sel.map((e) => updateElement(e, { locked: lock })));
    this.commitHistory();
  }

  /** Reorders the selection using fractional z-indices (no need to rewrite other elements). */
  reorderSelected(direction: 'front' | 'back' | 'forward' | 'backward'): void {
    const sel = withLabels(this.scene.getElements(), this.getSelectedElements()).sort((a, b) => a.zIndex - b.zIndex);
    if (!sel.length) return;
    const ids = new Set(sel.map((e) => e.id));
    const all = this.scene.getElements();
    const others = all.filter((e) => !ids.has(e.id));
    let lo: number;
    let hi: number;
    if (direction === 'front') {
      lo = this.scene.maxZIndex();
      hi = lo + 2;
    } else if (direction === 'back') {
      hi = this.scene.minZIndex();
      lo = hi - 2;
    } else {
      const top = Math.max(...sel.map((e) => e.zIndex));
      const bottom = Math.min(...sel.map((e) => e.zIndex));
      if (direction === 'forward') {
        const above = others.filter((e) => e.zIndex > top);
        if (!above.length) return;
        lo = above[0].zIndex;
        hi = above[1]?.zIndex ?? lo + 2;
      } else {
        const below = others.filter((e) => e.zIndex < bottom);
        if (!below.length) return;
        hi = below[below.length - 1].zIndex;
        lo = below[below.length - 2]?.zIndex ?? hi - 2;
      }
    }
    const step = (hi - lo) / (sel.length + 1);
    this.scene.upsert(sel.map((e, i) => updateElement(e, { zIndex: lo + step * (i + 1) })));
    this.commitHistory();
  }

  copySelected(cut = false): void {
    const sel = withFrameChildren(this.scene.getElements(), this.getSelectedElements()).sort((a, b) => a.zIndex - b.zIndex);
    if (!sel.length) return;
    this.clipboard = sel;
    const files = fileStore.pick(this.referencedFileIds(sel));
    const payload = JSON.stringify({ type: CLIPBOARD_MARKER, elements: sel, files });
    navigator.clipboard?.writeText(payload).catch(() => undefined);
    if (cut) this.deleteSelected();
  }

  /** Paste from the menu/button (keyboard paste goes through the native paste event → handlePaste). */
  async paste(at?: Point): Promise<void> {
    try {
      // Async Clipboard API: images copied from other apps / screenshots
      const items = (await navigator.clipboard?.read?.()) ?? [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          return this.insertImages([new File([blob], 'pasted-image', { type })], at);
        }
      }
      const text = await navigator.clipboard?.readText();
      if (text) {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        return this.handlePaste(dt);
      }
    } catch {
      /* permission denied - fall back to the internal clipboard */
    }
    return this.pasteElements(this.clipboard, at);
  }

  /** Inserts a library item (fresh ids), centred on `at` or the middle of the screen, and selects it. */
  insertLibraryItem(elements: readonly SketchElement[], at?: Point): void {
    const live = elements.filter((e) => !e.isDeleted);
    if (!live.length) return;
    const fileIds = this.referencedFileIds(live).filter((id) => !fileStore.has(id));
    if (fileIds.length) void fileStore.loadFromDb(fileIds);
    this.pasteElements(live, at ?? this.viewportCenter());
  }

  private pasteElements(source: readonly SketchElement[], at?: Point): void {
    if (!source.length) return;
    const b = unionBounds(source.map(getElementBounds))!;
    const target = at ?? this.lastPointer ?? this.viewportCenter();
    const offset = { x: target.x - (b.x + b.width / 2), y: target.y - (b.y + b.height / 2) };
    let z = this.nextZIndex();
    const clones = remapCopies(source, source.map((e) => cloneElement(e, offset, z++)));
    // a pasted child whose frame isn't on the board any more becomes free-standing
    const frameIds = new Set([...clones, ...this.scene.getElements()].filter((e) => e.type === 'frame').map((e) => e.id));
    this.scene.upsert(clones.map((c) => (c.frameId && !frameIds.has(c.frameId) ? { ...c, frameId: undefined } : c)));
    this.assignFrames(clones.filter((c) => !c.frameId || !clones.some((o) => o.id === c.frameId)).map((c) => c.id), false);
    this.syncLabels(clones.map((c) => c.id));
    this.setTool('selection');
    this.setSelection(clones.map((c) => c.id));
    this.commitHistory();
  }

  clearCanvas(): void {
    const live = this.scene.getElements();
    if (!live.length) return;
    this.scene.upsert(live.map((e) => updateElement(e, { isDeleted: true })));
    this.setSelection([]);
    this.commitHistory();
  }

  // ───────────────────────────── Viewport ─────────────────────────────

  private viewportCenter(): Point {
    return screenToWorld(this.size.width / 2, this.size.height / 2, this.getViewport());
  }

  zoomAt(zoom: number, anchor: Point = { x: this.size.width / 2, y: this.size.height / 2 }): void {
    const v = this.getViewport();
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const world = screenToWorld(anchor.x, anchor.y, v);
    this.setState({ viewport: { zoom: z, scrollX: anchor.x / z - world.x, scrollY: anchor.y / z - world.y } });
  }

  zoomIn = () => this.zoomAt(this.getViewport().zoom * 1.2);
  zoomOut = () => this.zoomAt(this.getViewport().zoom / 1.2);
  resetZoom = () => this.zoomAt(1);

  /** Fits the drawing (or the page, if empty) into view. */
  zoomToFit(target?: Bounds | null): void {
    const b = target ?? contentBounds(this.scene.getElements(), 40) ?? getPageBounds(this.getState().pageSetup);
    if (!b || !this.size.width) return;
    const zoom = clamp(Math.min(this.size.width / b.width, this.size.height / b.height) * 0.9, MIN_ZOOM, 3);
    this.setState({
      viewport: {
        zoom,
        scrollX: this.size.width / 2 / zoom - (b.x + b.width / 2),
        scrollY: this.size.height / 2 / zoom - (b.y + b.height / 2),
      },
    });
  }

  /** Case-insensitive search over text elements, in reading order (top-to-bottom, left-to-right). */
  /** Case-insensitive search over text elements and table cells, in reading order. */
  findText(query: string): Array<{ el: SketchElement; text: string; cell?: { row: number; col: number }; line?: number }> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: Array<{ el: SketchElement; text: string; cell?: { row: number; col: number }; line?: number }> = [];
    for (const e of this.scene.getElements()) {
      if (e.type === 'text' && e.text.toLowerCase().includes(q)) hits.push({ el: e, text: e.text });
      if (e.type === 'code') {
        e.code.split('\n').forEach((line, i) => {
          if (line.toLowerCase().includes(q)) hits.push({ el: e, text: line.trim(), line: i + 1 });
        });
      }
      if (e.type === 'table') {
        e.cells.forEach((row, r) =>
          row.forEach((t, c) => {
            if (t.toLowerCase().includes(q)) hits.push({ el: e, text: t, cell: { row: r, col: c } });
          }),
        );
      }
    }
    return hits.sort((a, b) => a.el.y - b.el.y || a.el.x - b.el.x);
  }

  /** Selects an element and pans/zooms so it is comfortably in view. */
  focusElement(id: string): void {
    const el = this.scene.getElement(id);
    if (!el || el.isDeleted) return;
    this.setTool('selection');
    this.setSelection([id]);
    const b = getElementBounds(el);
    const pad = Math.max(120, Math.max(b.width, b.height));
    const zoom = this.getViewport().zoom;
    const target = { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
    // keep the current zoom if the element already fits, otherwise zoom out just enough
    const fitZoom = Math.min(this.size.width / target.width, this.size.height / target.height);
    const z = clamp(Math.min(zoom, Math.max(fitZoom, 0.25)), MIN_ZOOM, MAX_ZOOM);
    this.setState({
      viewport: {
        zoom: z,
        scrollX: this.size.width / 2 / z - (b.x + b.width / 2),
        scrollY: this.size.height / 2 / z - (b.y + b.height / 2),
      },
    });
  }

  zoomToPage(): void {
    this.zoomToFit(getPageBounds(this.getState().pageSetup));
  }

  // ───────────────────────────── Page navigation ─────────────────────────────

  private pageHighlight: { index: number; start: number } | null = null;

  /** Scrolls/zooms so page `index` fills the view and briefly highlights it (PDF-viewer style). */
  goToPage(index: number): void {
    const rects = pageRects(this.getState().pageSetup, this.getPageCount());
    const r = rects[Math.max(0, Math.min(rects.length - 1, index))];
    if (!r) return;
    this.zoomToFit({ x: r.x - 24, y: r.y - 24, width: r.width + 48, height: r.height + 48 });
    this.pageHighlight = { index: rects.indexOf(r), start: performance.now() };
    this.requestRender();
  }

  /** Page whose area is closest to the centre of the screen. */
  currentPageIndex(): number {
    const rects = pageRects(this.getState().pageSetup, this.getPageCount());
    if (!rects.length) return 0;
    const c = this.viewportCenter();
    let best = 0;
    let bestDist = Infinity;
    rects.forEach((r, i) => {
      const dy = c.y < r.y ? r.y - c.y : c.y > r.y + r.height ? c.y - (r.y + r.height) : 0;
      if (dy < bestDist) {
        bestDist = dy;
        best = i;
      }
    });
    return best;
  }

  private drawPageHighlight(ctx: CanvasRenderingContext2D, zoom: number): void {
    const h = this.pageHighlight;
    if (!h) return;
    const t = (performance.now() - h.start) / 1400;
    const r = pageRects(this.getState().pageSetup, this.getPageCount())[h.index];
    if (t >= 1 || !r) {
      this.pageHighlight = null;
      return;
    }
    const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#5b5bd6';
    ctx.shadowColor = 'rgba(91, 91, 214, 0.6)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 4 / zoom;
    const pad = 3 / zoom;
    ctx.strokeRect(r.x - pad, r.y - pad, r.width + pad * 2, r.height + pad * 2);
    ctx.restore();
  }

  // ───────────────────────────── Persistence ─────────────────────────────

  /** `withFiles` embeds image data (for .sketchboard files & collaboration); autosave keeps it in IndexedDB. */
  getSceneData(includeDeleted = false, withFiles = false): SceneData {
    const data = serializeScene(this.scene.getAllElements(), this.getState(), includeDeleted);
    if (withFiles) data.files = fileStore.pick(this.referencedFileIds(data.elements));
    return data;
  }

  referencedFileIds(elements: readonly SketchElement[] = this.scene.getElements()): string[] {
    return elements.flatMap((e) => (e.type === 'image' ? [e.fileId] : []));
  }

  /** Replaces the board. `workspaceFile` links it to a saved workspace drawing (anything else unlinks it). */
  loadScene(data: SceneData, opts: { keepViewport?: boolean; workspaceFile?: WorkspaceFileRef | null } = {}): void {
    // Imported elements get fresh versions so they win over any stale peer copies.
    if (data.files) fileStore.add(Object.values(data.files));
    const elements = data.elements.map((e) => ({ ...e, versionNonce: randomInteger() }));
    this.scene.replaceAll(elements, 'load');
    const a = data.appState ?? {};
    this.setState((s) => ({
      selectedIds: {},
      editingTextId: null,
      pageSetup: a.pageSetup ?? s.pageSetup,
      gridEnabled: a.gridEnabled ?? s.gridEnabled,
      viewColorMode: a.viewColorMode ?? s.viewColorMode,
      viewport: !opts.keepViewport && a.viewport ? a.viewport : s.viewport,
      workspaceFile: opts.workspaceFile ?? null,
    }));
    this.syncLabels(undefined, true);
    this.history.clear();
    shapeCache.prune(new Set(elements.map((e) => e.id)));
  }

  async restoreFromStorage(): Promise<boolean> {
    const data = await this.storage.load();
    if (data) {
      this.loadScene(data);
      await fileStore.loadFromDb(this.referencedFileIds());
    }
    return !!data;
  }

  /** Swaps the persistence backend. `persistCurrent` first writes the scene to the old one. */
  setStorage(adapter: StorageAdapter, persistCurrent = true): void {
    this.autosave.flush();
    if (persistCurrent) void this.storage.save(this.getSceneData());
    this.storage = adapter;
  }

  flushSave(): void {
    this.autosave.flush();
    void this.storage.save(this.getSceneData());
  }

  /**
   * Bulleted / numbered list (Ctrl+Shift+8 / 7). While typing: the lines with the caret or selection;
   * otherwise every line of the selected text boxes and shape labels. Applying it again removes it.
   */
  toggleList(kind: ListKind): void {
    const editing = this.getState().editingTextId;
    if (editing && this.formatSelection?.({ kind: 'list', list: kind })) return;
    const targets = this.listTargets();
    if (!targets.length) return;
    // one decision for all: if every box is already this list, they all go back to plain lines
    const allOn = targets.every((t) => listKindAt(t.text, 0, t.text.length) === kind);
    const out = targets.map((t) => {
      const already = listKindAt(t.text, 0, t.text.length) === kind;
      const next = !allOn && already ? { text: t.text, runs: t.runs } : toggleList({ text: t.text, runs: t.runs, from: 0, to: t.text.length }, kind);
      const runs = next.runs ? normalizeRuns(next.runs, t) : undefined;
      const box = t.containerId ? this.scene.getElement(t.containerId) : undefined;
      if (box && !box.isDeleted) return updateElement(t, { text: next.text, runs, ...layoutLabel({ ...t, text: next.text, runs }, box) });
      const m = textBoxSize({ ...t, text: next.text, runs });
      const dx = t.textAlign === 'center' ? (t.width - m.width) / 2 : t.textAlign === 'right' ? t.width - m.width : 0;
      return updateElement(t, { text: next.text, runs, width: m.width, height: m.height, x: t.x + dx });
    });
    this.scene.upsert(out);
    this.commitHistory();
  }

  /** Which list the selected text is (for lighting up the list buttons). */
  activeList(): ListKind | null {
    const targets = this.listTargets();
    const kinds = targets.map((t) => listKindAt(t.text, 0, t.text.length));
    return kinds.length && kinds.every((k) => k === kinds[0]) ? kinds[0] : null;
  }

  private listTargets(): TextElement[] {
    const editing = this.getState().editingTextId;
    if (editing) {
      const el = this.scene.getElement(editing);
      return el?.type === 'text' ? [el] : [];
    }
    const out: TextElement[] = [];
    for (const e of this.getSelectedElements()) {
      if (e.locked) continue;
      if (e.type === 'text') out.push(e);
      else {
        const label = labelOf(this.scene.getElements(), e.id);
        if (label) out.push(label);
      }
    }
    return out.filter((t, i, a) => a.findIndex((u) => u.id === t.id) === i);
  }

  /** Ctrl/Cmd+B, I, U - works while typing and on selected text elements. */
  toggleTextFormat(kind: 'bold' | 'italic' | 'underline'): void {
    const editing = this.getState().editingTextId;
    // words selected in the text editor: format just those
    if (editing && this.formatSelection?.({ kind })) return;
    const targets = editing ? [editing] : this.getSelectedElements().filter((e) => e.type === 'text').map((e) => e.id);
    const first = targets.length ? (this.scene.getElement(targets[0]) as TextElement) : undefined;
    const s = first ?? this.getState().currentStyle;
    const patch: Partial<CurrentStyle> =
      kind === 'bold'
        ? { fontWeight: s.fontWeight === 'bold' ? 'normal' : 'bold' }
        : kind === 'italic'
          ? { fontStyle: s.fontStyle === 'italic' ? 'normal' : 'italic' }
          : { underline: !s.underline };
    if (!editing) return this.updateStyle(patch);
    const prev = Object.keys(this.getState().selectedIds);
    this.setSelection([editing]);
    this.updateStyle(patch);
    this.setSelection(prev);
  }

  /**
   * Text boxes measured before their web font loaded have the fallback font's size; fix them up.
   * Width/height are derived data, so the version isn't bumped (no sync/undo noise).
   */
  refreshTextMetrics(): void {
    const fixed: SketchElement[] = [];
    resetCodeMetrics(); // the monospace font may just have arrived
    for (const el of this.scene.getElements()) {
      if (el.type === 'code') {
        const l = codeLayout(el);
        if (Math.abs(l.width - el.width) > 0.5 || Math.abs(l.height - el.height) > 0.5) fixed.push({ ...el, width: l.width, height: l.height });
        continue;
      }
      if (el.type === 'table') {
        const next = relayout(el);
        if (Math.abs(next.height - el.height) > 0.5) fixed.push({ ...el, ...next });
        continue;
      }
      if (el.type !== 'text' || el.id === this.getState().editingTextId || el.containerId) continue;
      const m = textBoxSize(el);
      if (Math.abs(m.width - el.width) > 0.5 || Math.abs(m.height - el.height) > 0.5) {
        // centred / right-aligned text keeps its anchor when a web font arrives
        const dx = el.textAlign === 'center' ? (el.width - m.width) / 2 : el.textAlign === 'right' ? el.width - m.width : 0;
        fixed.push({ ...el, x: el.x + dx, width: m.width, height: m.height });
      }
    }
    if (fixed.length) this.scene.upsert(fixed, 'load');
    this.syncLabels(undefined, true);
  }

  // ───────────────────────────── Images & clipboard ─────────────────────────────

  /** Inserts image files (picker, paste or drag & drop), centred at `at` or the viewport. */
  async insertImages(files: readonly File[], at?: Point): Promise<void> {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    const v = this.getViewport();
    let center = at ?? this.lastPointer ?? this.viewportCenter();
    const created: SketchElement[] = [];
    let z = this.nextZIndex();
    for (const file of images) {
      try {
        const { file: bin, width, height } = await imageFileToBinary(file);
        fileStore.add([bin]);
        // fit within half of the visible area
        const maxW = (this.size.width / v.zoom) * 0.5 || 600;
        const maxH = (this.size.height / v.zoom) * 0.5 || 400;
        const s = Math.min(1, maxW / width, maxH / height);
        const w = width * s;
        const h = height * s;
        created.push(createImage(bin.id, { x: center.x - w / 2, y: center.y - h / 2, width: w, height: h }, z++));
        center = { x: center.x + 24, y: center.y + 24 };
      } catch (e) {
        this.toast(`Could not insert ${file.name || 'image'}: ${(e as Error).message}`);
      }
    }
    if (!created.length) return;
    this.scene.upsert(created);
    this.setTool('selection');
    this.setSelection(created.map((c) => c.id));
    this.commitHistory();
  }

  pickImages(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => void this.insertImages([...(input.files ?? [])], this.viewportCenter());
    input.click();
  }

  /**
   * System paste (Ctrl/Cmd+V, long-press → Paste on tablets): images, SketchBoard elements,
   * or plain text (becomes a text element).
   */
  async handlePaste(data: DataTransfer | null): Promise<void> {
    if (!data) return;
    const files = [...data.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) return this.insertImages(files);
    const text = data.getData('text/plain');
    // shapes copied in Excalidraw (Ctrl+C there, Ctrl+V here)
    if (text.includes('"excalidraw/clipboard"')) {
      try {
        const { scene } = fromExcalidraw(JSON.parse(text));
        if (scene.files) fileStore.add(Object.values(scene.files));
        return this.pasteElements(parseScene(scene).elements);
      } catch {
        /* fall through to plain text */
      }
    }
    if (text.includes(CLIPBOARD_MARKER)) {
      try {
        const parsed = JSON.parse(text) as { elements: SketchElement[]; files?: Record<string, BinaryFile> };
        if (parsed.files) fileStore.add(Object.values(parsed.files));
        return this.pasteElements(parseScene({ type: 'sketchboard', elements: parsed.elements }).elements);
      } catch {
        /* fall through to plain text */
      }
    }
    if (!text.trim() && this.clipboard.length) return this.pasteElements(this.clipboard);
    // a table (from a spreadsheet, a document, a web page or Markdown): into the selected table
    // at its current cell, otherwise as a new table
    const table = tableFromClipboard(text, data.getData('text/html'));
    if (table && table.cells.length * (table.cells[0]?.length ?? 0) > 1) {
      const target = this.selectedTable();
      if (target && !target.locked) {
        const cur = this.getTableCursor(target.id) ?? { row: 0, col: 0 };
        // a Markdown header row lands as the first row (like any other row)
        return this.pasteIntoTable(target.id, cur.row, cur.col, table.cells);
      }
      return this.insertTableFromCells(table);
    }
    // LaTeX ("$$ … $$", "\[ … \]", \frac{…} …): a rendered formula
    if (looksLikeLatex(text)) {
      await loadMath();
      const at = this.lastPointer ?? this.viewportCenter();
      const s = this.getState();
      const el = createMath(s.currentStyle, at, this.nextZIndex(), text.replace(/\r\n?/g, '\n').trim().slice(0, 20_000));
      this.scene.upsert([el]);
      this.setTool('selection');
      this.setSelection([el.id]);
      this.commitHistory();
      return;
    }
    if (text.trim()) {
      const at = this.lastPointer ?? this.viewportCenter();
      const el = createText(this.getState().currentStyle, at, this.nextZIndex(), text.replace(/\r\n/g, '\n').slice(0, 10_000));
      this.scene.upsert([el]);
      this.setTool('selection');
      this.setSelection([el.id]);
      this.commitHistory();
    }
  }

  toast(message: string): void {
    this.setState({ toast: { id: Date.now(), message } });
  }
}
