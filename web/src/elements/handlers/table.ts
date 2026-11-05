import type { Drawable } from 'roughjs/bin/core';
import type { RoughGenerator } from 'roughjs/bin/generator';
import { LINE_HEIGHT } from '../../core/constants';
import { fontCss } from '../../core/fonts';
import { pointInBounds } from '../../core/geometry';
import type { Bounds, Point, TableElement } from '../../core/types';
import type { ElementHandler, PointMapper, ShapeOutput } from '../ElementHandler';
import { isTransparent, toRoughOptions } from '../roughOptions';
import { cellLines, cellWeight, colOffsets, isHeaderRow, MIN_COL_WIDTH, MIN_ROW_HEIGHT, relayout, rowOffsets } from '../table/tableLayout';
import { fontString } from '../textMetrics';

export class TableHandler implements ElementHandler<TableElement> {
  readonly type = 'table' as const;

  getBounds(el: TableElement): Bounds {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }

  /** Tables are solid: clicking anywhere inside selects them. */
  hitTest(el: TableElement, p: Point, tolerance: number): boolean {
    return pointInBounds(p, this.getBounds(el), tolerance);
  }

  /** Resizing scales columns/rows proportionally; rows never shrink below their text. */
  transform(el: TableElement, map: PointMapper, scale: { x: number; y: number }): Partial<TableElement> {
    const a = map({ x: el.x, y: el.y });
    const b = map({ x: el.x + el.width, y: el.y + el.height });
    const sx = Math.abs(scale.x);
    const sy = Math.abs(scale.y);
    const scaled: TableElement = {
      ...el,
      colWidths: el.colWidths.map((w) => Math.max(MIN_COL_WIDTH, w * sx)),
      rowHeights: el.rowHeights.map((h) => Math.max(MIN_ROW_HEIGHT, h * sy)),
    };
    // rows reflow against the new column widths; start from the scaled heights
    const fitted = relayout({ ...scaled, rowHeights: scaled.rowHeights.map(() => MIN_ROW_HEIGHT) });
    const rowHeights = scaled.rowHeights.map((h, i) => Math.max(h, fitted.rowHeights[i]));
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      colWidths: scaled.colWidths,
      rowHeights,
      width: fitted.width,
      height: rowHeights.reduce((s, v) => s + v, 0),
    };
  }

  generateShape(el: TableElement, g: RoughGenerator): ShapeOutput {
    const xs = colOffsets(el);
    const ys = rowOffsets(el);
    const W = xs[xs.length - 1];
    const H = ys[ys.length - 1];
    const drawables: Drawable[] = [];
    const fill = (x: number, y: number, w: number, h: number, color: string) =>
      drawables.push(g.rectangle(x, y, w, h, { fill: color, fillStyle: 'solid', stroke: 'none', roughness: 0, seed: el.seed }));

    // backgrounds: body fill (or bands), then header
    if (!isTransparent(el.backgroundColor)) {
      for (let r = el.headerRow ? 1 : 0; r < el.rows; r++) {
        const bodyIndex = r - (el.headerRow ? 1 : 0);
        if (!el.banded || bodyIndex % 2 === 1) fill(0, ys[r], W, el.rowHeights[r], el.backgroundColor);
      }
    }
    if (el.headerRow && !isTransparent(el.headerColor)) fill(0, 0, W, el.rowHeights[0], el.headerColor);

    // grid: outer frame + inner lines, each with its own seed so the sketchy wobble varies
    const base = toRoughOptions(el);
    drawables.push(g.rectangle(0, 0, W, H, base));
    xs.slice(1, -1).forEach((x, i) => drawables.push(g.line(x, 0, x, H, { ...base, seed: el.seed + 101 + i })));
    ys.slice(1, -1).forEach((y, i) => {
      const heavier = el.headerRow && i === 0; // slightly bolder rule under the header
      drawables.push(g.line(0, y, W, y, { ...base, seed: el.seed + 503 + i, strokeWidth: (base.strokeWidth ?? 1) * (heavier ? 1.6 : 1) }));
    });

    // cell text (top-left inside padding; header rows bold)
    const texts: NonNullable<ShapeOutput['texts']> = [];
    const family = fontCss(el.fontFamily);
    for (let r = 0; r < el.rows; r++) {
      for (let c = 0; c < el.cols; c++) {
        const lines = cellLines(el, r, c);
        if (lines.length === 1 && !lines[0]) continue;
        const weight = cellWeight(el, r);
        const textH = lines.length * el.fontSize * LINE_HEIGHT;
        texts.push({
          x: xs[c] + el.cellPadding,
          // vertically centre short content in tall rows
          y: ys[r] + Math.max(el.cellPadding, (el.rowHeights[r] - textH) / 2),
          text: {
            lines,
            fontSize: el.fontSize,
            font: fontString(el.fontSize, el.fontFamily, { fontWeight: weight }),
            align: isHeaderRow(el, r) && el.textAlign === 'left' ? 'left' : el.textAlign,
            color: el.textColor,
            width: Math.max(0, el.colWidths[c] - el.cellPadding * 2),
            lineHeightPx: el.fontSize * LINE_HEIGHT,
            underline: false,
            family,
            fontWeight: weight,
            fontStyle: 'normal',
          },
        });
      }
    }
    return { drawables, paths: [], texts };
  }
}
