import { LINE_HEIGHT } from '../core/constants';
import type { SketchElement, TextElement } from '../core/types';
import { wrapText } from './textMetrics';

/**
 * Shape labels ("bound text"): a text element with `containerId` that sits centred in its shape,
 * wraps to the shape's usable width and follows it around. Pure layout helpers — the editor applies them.
 */
export const LABEL_PADDING = 8;

/** Shapes that can hold a label. */
export const canHoldLabel = (el: SketchElement): boolean =>
  el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse' || el.type === 'figure';

/** Width available for text inside the shape (inscribed area, minus padding). */
export function labelWidth(container: SketchElement): number {
  const w = container.width;
  const inner = container.type === 'ellipse' ? w / Math.SQRT2 : container.type === 'diamond' ? w / 2 : container.type === 'figure' ? w * 0.8 : w;
  return Math.max(16, inner - LABEL_PADDING * 2);
}

/** Position, size and turn of a label for its shape: centred, wrapped to the shape's width. */
export function layoutLabel(text: TextElement, container: SketchElement): Pick<TextElement, 'x' | 'y' | 'width' | 'height' | 'angle'> {
  const width = labelWidth(container);
  const lines = wrapText(text.text || ' ', width, text.fontSize, text.fontFamily, text);
  const height = Math.ceil(lines.length * text.fontSize * LINE_HEIGHT);
  const cx = container.x + container.width / 2;
  const cy = container.y + container.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height, angle: container.angle || undefined };
}

/** Whether a label's stored geometry is out of date. */
export function labelNeedsLayout(text: TextElement, container: SketchElement): boolean {
  const l = layoutLabel(text, container);
  const d = (a: number, b: number) => Math.abs(a - b) > 0.01;
  return d(text.x, l.x) || d(text.y, l.y) || d(text.width, l.width) || d(text.height, l.height) || d(text.angle ?? 0, l.angle ?? 0);
}

/** The live label of a shape, if it has one. */
export const labelOf = (all: readonly SketchElement[], containerId: string): TextElement | undefined =>
  all.find((e): e is TextElement => e.type === 'text' && e.containerId === containerId && !e.isDeleted);

/** The elements plus the labels of any shapes among them. */
export function withLabels(all: readonly SketchElement[], els: readonly SketchElement[]): SketchElement[] {
  const ids = new Set(els.map((e) => e.id));
  const extra = all.filter((e) => e.type === 'text' && e.containerId && ids.has(e.containerId) && !ids.has(e.id) && !e.isDeleted);
  return extra.length ? [...els, ...extra] : [...els];
}
