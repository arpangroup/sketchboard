import type { AppState, Point, SketchElement, ToolType, Viewport } from '../core/types';
import type { Scene } from '../scene/Scene';

export interface PointerInfo {
  world: Point;
  screen: Point;
  shiftKey: boolean;
  altKey: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS */
  modKey: boolean;
  button: number;
  pointerType: string;
  /** 0..1 stylus pressure (0.5 for mice, which have no sensor). */
  pressure: number;
}

/**
 * The narrow API a tool may use (Interface Segregation): tools never see React,
 * the renderer, persistence or collaboration.
 */
export interface ToolContext {
  readonly scene: Scene;
  getState(): AppState;
  setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void;
  commitHistory(): void;
  requestRender(): void;
  setCursor(cursor: string): void;
  /** Topmost element at a world point. */
  hitTest(world: Point): SketchElement | null;
  getSelectedElements(): SketchElement[];
  setSelection(ids: readonly string[]): void;
  /** Called by creation tools when a new element is done. */
  finishCreation(el: SketchElement): void;
  startTextEditing(id: string): void;
  startCellEditing(id: string, row: number, col: number): void;
  startCodeEditing(id: string): void;
  /** Click on a code block's line number: toggles that line's mark. */
  toggleCodeLine(id: string, line: number): void;
  /** Remember the last table cell touched (row/column commands act on it). */
  noteTableCell(id: string, row: number, col: number): void;
  nextZIndex(): number;
  panBy(dxScreen: number, dyScreen: number): void;
  getViewport(): Viewport;
  toast(message: string): void;
  /** Adds a point to the local laser-pointer trail (and shares it with collaborators). */
  emitLaser(world: Point, startStroke: boolean): void;
  /** The laser stroke ended (pen / mouse released). */
  releaseLaser(): void;
  /** Ids widened to whole groups (clicking one member selects its group). */
  expandToGroups(ids: Iterable<string>): string[];
  /** The selection plus the contents of any selected frame. */
  withFrameChildren(els: readonly SketchElement[]): SketchElement[];
  /** Re-checks which frame each element sits in after it moved or was created. */
  assignFrames(ids: Iterable<string>, commit?: boolean): void;
  /** The element whose link badge is at this world point. */
  linkBadgeAt(world: Point): SketchElement | null;
  openLink(el: SketchElement): void;
  /** Shape an arrow end at this point would attach to (null with nothing near). */
  bindingTargetAt(world: Point, exclude: Iterable<string>): SketchElement | null;
  /** Attaches (or detaches) the arrow's ends to whatever shapes they now touch. */
  bindArrow(id: string, ends?: 'start' | 'end' | 'both', allowBind?: boolean): void;
  /** After arrows moved: ends that travelled without their shape re-attach to what they touch now. */
  rebindMoved(movedIds: Iterable<string>): void;
  /** Highlights the shape an arrow end is about to attach to (null clears it). */
  setBindingHint(id: string | null): void;
  /** Topmost shape that can hold a label whose area contains the point (filled or not). */
  labelShapeAt(world: Point): SketchElement | null;
  /** Edits a shape's label, starting one if it has none. */
  editLabel(box: SketchElement): void;
  /** Re-centres labels after their shapes were resized. */
  syncLabels(containerIds?: Iterable<string>): void;
}

/**
 * State pattern: each tool encapsulates its own pointer-handling state machine.
 * The editor simply forwards events to the active tool.
 */
export interface Tool {
  readonly type: ToolType;
  readonly cursor: string;
  onPointerDown(p: PointerInfo): void;
  onPointerMove(p: PointerInfo, isDown: boolean): void;
  onPointerUp(p: PointerInfo): void;
  onDoubleClick?(p: PointerInfo): void;
  onActivate?(): void;
  onDeactivate?(): void;
  /** Abort the current gesture without committing it (e.g. a palm stroke cut short by the pen). */
  onCancel?(): void;
  /** Extra drawing on top of the scene in world space (marquee, eraser trail...). */
  renderOverlay?(ctx: CanvasRenderingContext2D, zoom: number): void;
  /** Elements under active manipulation: shielded from remote overwrites. */
  activeIds?(): ReadonlySet<string>;
  /** Elements rendered semi-transparent (e.g. pending erase). */
  fadedIds?(): ReadonlySet<string>;
}

export const EMPTY_SET: ReadonlySet<string> = new Set();
