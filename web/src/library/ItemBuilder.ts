import { DEFAULT_STYLE, LINE_HEIGHT } from '../core/constants';
import type { CurrentStyle, FigureElement, LinearElement, Point, ShapeElement, SketchElement, TableElement, TextElement } from '../core/types';
import { createFigure, createLinear, createShape, createTable, createText } from '../elements/factory';
import { pointsToElementGeometry } from '../elements/handlers/pointShapes';
import { relayout } from '../elements/table/tableLayout';
import { measureText } from '../elements/textMetrics';

/** Neutral sketchy style shared by every built-in item. */
export const LIBRARY_STYLE: CurrentStyle = {
  ...DEFAULT_STYLE,
  strokeWidth: 1.5,
  roughness: 1,
  fontSize: 16,
  fontFamily: 'hand',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  rounded: false,
  startArrowhead: 'none',
  endArrowhead: 'none',
};

type Pt = [number, number];

export interface TextOpts {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  family?: string;
}

/**
 * Builder for library items: a tiny drawing DSL over the element factory, so each built-in item
 * reads like a sketch ("rect, then centred label, then an arrow") instead of element plumbing.
 */
export class ItemBuilder {
  private els: SketchElement[] = [];

  constructor(private readonly style: CurrentStyle = LIBRARY_STYLE) {}

  private push<T extends SketchElement>(el: T): T {
    this.els.push({ ...el, zIndex: this.els.length });
    return el;
  }

  private shape(type: ShapeElement['type'], x: number, y: number, w: number, h: number, o: Partial<ShapeElement>): this {
    this.push({ ...createShape(type, this.style, { x, y }, 0), width: w, height: h, ...o });
    return this;
  }

  rect(x: number, y: number, w: number, h: number, o: Partial<ShapeElement> = {}): this {
    return this.shape('rectangle', x, y, w, h, o);
  }

  ellipse(x: number, y: number, w: number, h: number, o: Partial<ShapeElement> = {}): this {
    return this.shape('ellipse', x, y, w, h, o);
  }

  diamond(x: number, y: number, w: number, h: number, o: Partial<ShapeElement> = {}): this {
    return this.shape('diamond', x, y, w, h, o);
  }

  /** Gallery figure (callout, star, block arrow…) filling the box; `tail` is relative to the box. */
  figure(figure: string, x: number, y: number, w: number, h: number, o: Partial<FigureElement> = {}): this {
    this.push({ ...createFigure(figure, this.style, { x, y }, 0), width: w, height: h, ...o });
    return this;
  }

  /** Open path through points (curved unless `sharp`). */
  line(points: Pt[], o: Partial<LinearElement> = {}): this {
    const abs: Point[] = points.map(([x, y]) => ({ x, y }));
    this.push({ ...createLinear(o.type ?? 'line', this.style, abs[0], 0), ...pointsToElementGeometry(abs), startArrowhead: 'none', endArrowhead: 'none', ...o });
    return this;
  }

  arrow(points: Pt[], o: Partial<LinearElement> = {}): this {
    return this.line(points, { type: 'arrow', endArrowhead: 'arrow', sharp: true, ...o });
  }

  /** Closed straight-edged shape (parallelogram, hexagon…). */
  polygon(points: Pt[], o: Partial<LinearElement> = {}): this {
    return this.line(points, { polygon: true, sharp: true, ...o });
  }

  private makeText(text: string, x: number, y: number, align: TextElement['textAlign'], o: TextOpts): TextElement {
    const style: CurrentStyle = {
      ...this.style,
      fontSize: o.size ?? this.style.fontSize,
      fontFamily: o.family ?? this.style.fontFamily,
      fontWeight: o.bold ? 'bold' : 'normal',
      fontStyle: o.italic ? 'italic' : 'normal',
      textAlign: align,
      strokeColor: o.color ?? this.style.strokeColor,
    };
    return createText(style, { x, y }, 0, text);
  }

  /** Left-aligned text whose top-left is (x, y). */
  text(text: string, x: number, y: number, o: TextOpts = {}): this {
    this.push(this.makeText(text, x, y, 'left', o));
    return this;
  }

  /** Left-aligned text vertically centred on cy. */
  textMid(text: string, x: number, cy: number, o: TextOpts = {}): this {
    const t = this.makeText(text, x, 0, 'left', o);
    this.push({ ...t, y: cy - t.height / 2 });
    return this;
  }

  /** Centre-aligned text centred on (cx, cy). */
  label(text: string, cx: number, cy: number, o: TextOpts = {}): this {
    const t = this.makeText(text, 0, 0, 'center', o);
    this.push({ ...t, x: cx - t.width / 2, y: cy - t.height / 2 });
    return this;
  }

  /** Box with a centred label. */
  box(type: ShapeElement['type'], x: number, y: number, w: number, h: number, text: string, o: Partial<ShapeElement> & TextOpts = {}): this {
    const { size, bold, italic, color, family, ...shape } = o;
    this.shape(type, x, y, w, h, shape);
    if (text) this.label(text, x + w / 2, y + h / 2, { size, bold, italic, color, family });
    return this;
  }

  table(x: number, y: number, cells: string[][], colWidths: number[], o: Partial<TableElement> = {}): this {
    const rows = cells.length;
    const cols = colWidths.length;
    const base = createTable(
      { ...this.style, fontSize: 14 },
      { rows, cols, cellPadding: 6, headerRow: true, headerColor: '#e7f5ff', banded: false, textColor: '#1e1e1e' },
      { x, y, width: colWidths.reduce((a, b) => a + b, 0), height: rows * 30 },
      0,
    );
    const t: TableElement = { ...base, cells, colWidths, rowHeights: Array(rows).fill(20), ...o };
    this.push({ ...t, ...relayout(t) });
    return this;
  }

  /** Height of one line of text at a size (for stacking rows). */
  static lineHeight(size = LIBRARY_STYLE.fontSize): number {
    return size * LINE_HEIGHT;
  }

  static measure(text: string, size = LIBRARY_STYLE.fontSize) {
    return measureText(text, size, LIBRARY_STYLE.fontFamily);
  }

  build(): SketchElement[] {
    return this.els;
  }
}
