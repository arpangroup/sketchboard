import type { Options } from 'roughjs/bin/core';
import type { ElementStyle } from '../core/types';

export const isTransparent = (color: string): boolean =>
  !color || color === 'transparent' || /^#[0-9a-f]{6}00$/i.test(color);

/** Maps our style model onto rough.js options. Single place to tune the "sketchy" look. */
export function toRoughOptions(
  el: ElementStyle & { seed: number },
  opts: { fillable?: boolean; preserveVertices?: boolean } = {},
): Options {
  const sw = el.strokeWidth;
  const o: Options = {
    seed: el.seed,
    stroke: el.strokeColor,
    strokeWidth: sw,
    roughness: el.roughness,
    bowing: el.roughness === 0 ? 0 : 1,
    preserveVertices: opts.preserveVertices ?? el.roughness < 2,
    fillWeight: sw / 2,
    hachureGap: sw * 4,
  };
  if (el.strokeStyle === 'dashed') {
    o.strokeLineDash = [8, 8 + sw];
    o.disableMultiStroke = true;
    o.strokeWidth = sw + 0.5;
  } else if (el.strokeStyle === 'dotted') {
    o.strokeLineDash = [1.5, 6 + sw];
    o.disableMultiStroke = true;
    o.strokeWidth = sw + 0.5;
  }
  if (opts.fillable && !isTransparent(el.backgroundColor)) {
    o.fill = el.backgroundColor;
    o.fillStyle = el.fillStyle;
    if (el.fillDensity === 'light') {
      // pale fills in black & white: a light tint of hatching that text stays readable on
      o.hachureGap = Math.max(sw * 4, 8) * 2.4;
      o.fillWeight = 0.6;
    }
  }
  return o;
}
