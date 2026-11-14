import type { RoughGenerator } from 'roughjs/bin/generator';
import { distanceToPolyline, normalizeBounds } from '../../core/geometry';
import type { Bounds, FrameElement, Point } from '../../core/types';
import { fontCss } from '../../core/fonts';
import type { ElementHandler, PointMapper, ShapeOutput } from '../ElementHandler';
import { fontString, measureText } from '../textMetrics';

export const FRAME_LABEL_SIZE = 13;
const LABEL_GAP = 6;

/** The frame's name tag, above its top-left corner (element-local). */
export function frameLabelBox(el: FrameElement): Bounds {
  const m = measureText(el.name || 'Frame', FRAME_LABEL_SIZE, 'normal');
  return { x: 0, y: -m.height - LABEL_GAP, width: Math.min(m.width, Math.max(40, el.width)), height: m.height };
}

/**
 * Frames are named containers. The box is drawn crisply (no sketchy wobble) with the name above it;
 * they are hit only on the outline or name tag, so drawing and marquee-selecting inside still work.
 */
export class FrameHandler implements ElementHandler<FrameElement> {
  readonly type = 'frame' as const;

  getBounds(el: FrameElement): Bounds {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }

  hitTest(el: FrameElement, p: Point, tolerance: number): boolean {
    const local = { x: p.x - el.x, y: p.y - el.y };
    const label = frameLabelBox(el);
    if (local.x >= label.x - tolerance && local.x <= label.x + label.width + tolerance && local.y >= label.y - tolerance && local.y <= 0) return true;
    const corners = [
      { x: 0, y: 0 },
      { x: el.width, y: 0 },
      { x: el.width, y: el.height },
      { x: 0, y: el.height },
    ];
    return distanceToPolyline(local, corners, true) <= Math.max(tolerance, 4);
  }

  transform(el: FrameElement, map: PointMapper): Partial<FrameElement> {
    const a = map({ x: el.x, y: el.y });
    const b = map({ x: el.x + el.width, y: el.y + el.height });
    return normalizeBounds({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
  }

  generateShape(el: FrameElement, g: RoughGenerator): ShapeOutput {
    const fill = el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : undefined;
    const box = g.rectangle(0, 0, el.width, el.height, {
      stroke: el.strokeColor,
      strokeWidth: el.strokeWidth,
      roughness: 0,
      seed: el.seed,
      fill,
      fillStyle: 'solid',
      strokeLineDash: el.strokeStyle === 'dashed' ? [8, 6] : el.strokeStyle === 'dotted' ? [2, 4] : undefined,
    });
    const label = frameLabelBox(el);
    const name = el.name || 'Frame';
    return {
      drawables: [box],
      paths: [],
      texts: [
        {
          x: label.x,
          y: label.y,
          text: {
            lines: [name],
            fontSize: FRAME_LABEL_SIZE,
            font: fontString(FRAME_LABEL_SIZE, 'normal'),
            align: 'left',
            color: el.strokeColor,
            width: label.width,
            lineHeightPx: label.height,
            underline: false,
            family: fontCss('normal'),
            fontWeight: 'normal',
            fontStyle: 'normal',
          },
        },
      ],
    };
  }
}
