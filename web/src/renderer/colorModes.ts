import type { ColorMode, SketchElement } from '../core/types';
import { isTransparent } from '../elements/roughOptions';

/**
 * Strategy for converting an element's colours for a given output (screen, print, export).
 * Adding e.g. a "sepia" or "high-contrast" mode = one new class + registration.
 */
export interface ColorTransformer {
  readonly mode: ColorMode;
  readonly label: string;
  transformElement(el: SketchElement): SketchElement;
  transformColor(color: string): string;
  /** Canvas/page background colour for this mode. */
  background(base: string): string;
}

function parseColor(color: string): [number, number, number, number] | null {
  const hex = color.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)).concat(1) as [number, number, number, number];
  }
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), a];
  }
  const m = color.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map((s) => s.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  if (color.toLowerCase() === 'white') return [255, 255, 255, 1];
  if (color.toLowerCase() === 'black') return [0, 0, 0, 1];
  return null;
}

/** Perceived luminance 0..255 (ITU-R BT.601). */
export function luminance(color: string): number {
  const c = parseColor(color);
  if (!c) return 0;
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

class IdentityTransformer implements ColorTransformer {
  readonly mode = 'color' as const;
  readonly label = 'Colour';
  transformElement = (el: SketchElement) => el;
  transformColor = (c: string) => c;
  background = (base: string) => base;
}

class GrayscaleTransformer implements ColorTransformer {
  readonly mode = 'grayscale' as const;
  readonly label = 'Grayscale';

  transformColor(color: string): string {
    if (isTransparent(color)) return color;
    const l = toHex(luminance(color));
    return `#${l}${l}${l}`;
  }

  transformElement(el: SketchElement): SketchElement {
    const out = {
      ...el,
      strokeColor: this.transformColor(el.strokeColor),
      backgroundColor: this.transformColor(el.backgroundColor),
    };
    if (out.type === 'table') {
      out.textColor = this.transformColor(out.textColor);
      out.headerColor = this.transformColor(out.headerColor);
    }
    if (out.type === 'code') out.printMode = 'grayscale';
    if (out.type === 'math') out.printMode = 'grayscale';
    if (out.type === 'text' && out.runs) out.runs = out.runs.map((r) => (r.c ? { ...r, c: this.transformColor(r.c) } : r));
    return out;
  }

  background = (base: string) => this.transformColor(base);
}

/**
 * Pure black & white, ideal for laser printers / photocopies:
 *  - every stroke and text becomes black
 *  - solid fills (any colour) print as plain white paper: no hatching behind text. White still
 *    covers what's underneath, so overlapping shapes keep their order
 *  - a fill drawn as a pattern on purpose (hachure, cross-hatch, dots…) keeps that pattern, in black,
 *    lighter for pale colours
 *  - background becomes white
 */
export const BW_WHITE = 250;
export const BW_TINT = 228;
export const BW_PASTEL = 150;

class BlackWhiteTransformer implements ColorTransformer {
  readonly mode = 'blackwhite' as const;
  readonly label = 'Black & white';

  transformColor(color: string): string {
    return isTransparent(color) ? color : '#000000';
  }

  transformElement(el: SketchElement): SketchElement {
    if (el.type === 'code') return { ...el, printMode: 'blackwhite', opacity: 100 };
    if (el.type === 'math') return { ...el, strokeColor: '#000000', printMode: 'blackwhite', opacity: 100 };
    if (el.type === 'table') {
      // tables: black rules & text, no fills (keeps text readable on any printer)
      return { ...el, strokeColor: '#000000', textColor: '#000000', opacity: 100, backgroundColor: 'transparent', headerColor: 'transparent' };
    }
    // coloured words print black like the rest of the text
    const words = el.type === 'text' && el.runs ? { runs: el.runs.map(({ text, b, i, u }) => ({ text, b, i, u })) } : {};
    const base = { ...el, strokeColor: '#000000', opacity: 100, ...words } as SketchElement;
    if (isTransparent(el.backgroundColor)) return { ...base, backgroundColor: 'transparent' };
    // solid fills → white paper (no hatching behind text)
    if (el.fillStyle === 'solid') return { ...base, backgroundColor: '#ffffff', fillStyle: 'solid' };
    // a pattern fill the user chose stays a pattern, in black; near-white ones are left blank
    const l = luminance(el.backgroundColor);
    if (l >= BW_TINT) return { ...base, backgroundColor: 'transparent' };
    return { ...base, backgroundColor: '#000000', ...(l >= BW_PASTEL ? { fillDensity: 'light' as const } : {}) };
  }

  background = () => '#ffffff';
}

const transformers: Record<ColorMode, ColorTransformer> = {
  color: new IdentityTransformer(),
  grayscale: new GrayscaleTransformer(),
  blackwhite: new BlackWhiteTransformer(),
};

export const getColorTransformer = (mode: ColorMode): ColorTransformer => transformers[mode];

export const COLOR_MODE_OPTIONS = (Object.values(transformers) as ColorTransformer[]).map((t) => ({
  id: t.mode,
  label: t.label,
}));
