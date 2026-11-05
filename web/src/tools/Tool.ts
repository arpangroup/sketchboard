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
  /** Remember the last table cell touched (row/column commands act on it). */
  noteTableCell(id: string, row: number, col: number): void;
  nextZIndex(): number;
  panBy(dxScreen: number, dyScreen: number): void;
  getViewport(): Viewport;
  toast(message: string): void;
  /** Adds a point to the local laser-pointer trail (and shares it with collaborators). */
  emitLaser(world: Point, startStroke: boolean): void;
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
