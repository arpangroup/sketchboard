import type { StyledRun } from './textMetrics';
import type { Drawable } from 'roughjs/bin/core';
import type { RoughGenerator } from 'roughjs/bin/generator';
import type { Bounds, Point, SketchElement, TextAlign } from '../core/types';

/** A plain (non-rough) vector path, e.g. smoothed free-hand strokes. */
export interface PathPrimitive {
  d: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  /** Extra opacity on top of the element's (highlighter ink). */
  opacity?: number;
  /** 'multiply' lets highlighter ink tint what's underneath instead of covering it. */
  blend?: 'multiply';
  lineCap?: 'round' | 'butt';
}

/** Raster image, drawn at the element's size. */
export interface ImagePrimitive {
  fileId: string;
  width: number;
  height: number;
}

/** Text block in element-local coordinates. */
export interface TextPrimitive {
  lines: string[];
  fontSize: number;
  font: string;
  align: TextAlign;
  color: string;
  width: number;
  lineHeightPx: number;
  underline: boolean;
  /** CSS font-family list + weight/style (for SVG output). */
  family: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  /** Lines made of differently formatted pieces (bold / italic / underlined words); `lines` holds the same text. */
  rich?: StyledRun[][];
  /** Left indent of each rich line (px), for list items that wrap. */
  indents?: number[];
}

/**
 * Renderer-agnostic description of an element's geometry, in ELEMENT-LOCAL coordinates
 * (origin at element.x / element.y). Both the canvas renderer and SVG exporter consume it,
 * so adding a new output target never requires touching element code (Open/Closed).
 */
export interface ShapeOutput {
  drawables: Drawable[];
  paths: PathPrimitive[];
  text?: TextPrimitive;
  /** Several positioned text blocks (table cells), element-local offsets. */
  texts?: Array<{ x: number; y: number; text: TextPrimitive }>;
  image?: ImagePrimitive;
}

export type PointMapper = (p: Point) => Point;

/**
 * Strategy interface implemented once per element type. The rest of the editor talks to
 * elements only through this interface (Dependency Inversion) - to add e.g. a "star" shape
 * you implement a handler and register it; no switch statements elsewhere need to change.
 */
export interface ElementHandler<T extends SketchElement = SketchElement> {
  readonly type: T['type'];
  /** Axis-aligned bounds in world coordinates. */
  getBounds(el: T): Bounds;
  /** Whether a world point "touches" the element. `tolerance` is in world units. */
  hitTest(el: T, p: Point, tolerance: number): boolean;
  /**
   * Geometric transform used for resizing (single or multi-selection).
   * `map` maps an old world point to a new world point; `scale` is the signed scale factor.
   */
  transform(el: T, map: PointMapper, scale: { x: number; y: number }): Partial<T>;
  /** Builds the hand-drawn geometry. Called rarely thanks to ShapeCache. */
  generateShape(el: T, generator: RoughGenerator): ShapeOutput;
}
