import type { FontFamily, FontStyle, FontWeight } from './types';

/**
 * Font catalogue + on-demand loading. A text element's `fontFamily` is either a built-in id
 * ('hand' | 'normal' | 'code') or any font name. Google Fonts are fetched lazily the first time
 * they're used; any other name falls back to fonts installed on the device.
 */
export interface FontOption {
  id: FontFamily;
  label: string;
  css: string;
  /** Google Fonts family name, if it should be loaded from there. */
  google?: string;
  group: 'Handwritten' | 'Sans serif' | 'Serif' | 'Monospace';
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'hand', label: 'Kalam (hand-drawn)', css: '"Kalam", "Segoe Print", "Comic Sans MS", cursive', google: 'Kalam', group: 'Handwritten' },
  { id: 'Caveat', label: 'Caveat', css: '"Caveat", cursive', google: 'Caveat', group: 'Handwritten' },
  { id: 'Patrick Hand', label: 'Patrick Hand', css: '"Patrick Hand", cursive', google: 'Patrick Hand', group: 'Handwritten' },
  { id: 'Indie Flower', label: 'Indie Flower', css: '"Indie Flower", cursive', google: 'Indie Flower', group: 'Handwritten' },
  { id: 'Comic Sans MS', label: 'Comic Sans', css: '"Comic Sans MS", "Comic Neue", cursive', group: 'Handwritten' },
  { id: 'normal', label: 'Inter', css: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif', google: 'Inter', group: 'Sans serif' },
  { id: 'Roboto', label: 'Roboto', css: '"Roboto", system-ui, sans-serif', google: 'Roboto', group: 'Sans serif' },
  { id: 'Open Sans', label: 'Open Sans', css: '"Open Sans", system-ui, sans-serif', google: 'Open Sans', group: 'Sans serif' },
  { id: 'Montserrat', label: 'Montserrat', css: '"Montserrat", system-ui, sans-serif', google: 'Montserrat', group: 'Sans serif' },
  { id: 'Poppins', label: 'Poppins', css: '"Poppins", system-ui, sans-serif', google: 'Poppins', group: 'Sans serif' },
  { id: 'Arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif', group: 'Sans serif' },
  { id: 'Verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif', group: 'Sans serif' },
  { id: 'Merriweather', label: 'Merriweather', css: '"Merriweather", Georgia, serif', google: 'Merriweather', group: 'Serif' },
  { id: 'Playfair Display', label: 'Playfair Display', css: '"Playfair Display", Georgia, serif', google: 'Playfair Display', group: 'Serif' },
  { id: 'Lora', label: 'Lora', css: '"Lora", Georgia, serif', google: 'Lora', group: 'Serif' },
  { id: 'Georgia', label: 'Georgia', css: 'Georgia, "Times New Roman", serif', group: 'Serif' },
  { id: 'Times New Roman', label: 'Times New Roman', css: '"Times New Roman", Times, serif', group: 'Serif' },
  { id: 'code', label: 'JetBrains Mono', css: '"JetBrains Mono", "Cascadia Code", Consolas, monospace', google: 'JetBrains Mono', group: 'Monospace' },
  { id: 'Fira Code', label: 'Fira Code', css: '"Fira Code", Consolas, monospace', google: 'Fira Code', group: 'Monospace' },
  { id: 'Courier New', label: 'Courier New', css: '"Courier New", Courier, monospace', group: 'Monospace' },
];

const BY_ID = new Map(FONT_OPTIONS.map((f) => [f.id, f]));

export const isKnownFont = (family: FontFamily) => BY_ID.has(family);

/** Font names are user input: keep them to safe characters before they reach CSS. */
export const sanitizeFontName = (name: string) => name.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

export function fontCss(family: FontFamily): string {
  const known = BY_ID.get(family);
  if (known) return known.css;
  const safe = sanitizeFontName(family);
  return safe ? `"${safe}", "Inter", system-ui, sans-serif` : BY_ID.get('normal')!.css;
}

export const fontLabel = (family: FontFamily) => BY_ID.get(family)?.label ?? sanitizeFontName(family);

const googleName = (family: FontFamily): string | null => {
  const known = BY_ID.get(family);
  if (known) return known.google ?? null;
  return sanitizeFontName(family) || null; // custom names: try Google Fonts, fall back to local
};

export const googleFontUrl = (name: string) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;

const requested = new Set<string>();
const loads = new Map<string, Promise<void>>();

/** Ensures a font (with bold/italic variants) is available, injecting the stylesheet once. */
export function ensureFontLoaded(family: FontFamily, weight: FontWeight = 'normal', style: FontStyle = 'normal'): Promise<void> {
  const key = `${family}|${weight}|${style}`;
  let p = loads.get(key);
  if (!p) {
    p = loadFont(family, weight, style);
    loads.set(key, p);
  }
  return p;
}

async function loadFont(family: FontFamily, weight: FontWeight, style: FontStyle): Promise<void> {
  if (typeof document === 'undefined') return;
  const g = googleName(family);
  if (g && !requested.has(g)) {
    requested.add(g);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = googleFontUrl(g);
    document.head.appendChild(link);
  }
  try {
    await document.fonts?.load(`${style} ${weight} 20px ${fontCss(family)}`);
  } catch {
    /* offline or unknown font - the CSS fallback stack is used */
  }
}

/** @import URLs needed to render these families in an exported/printed SVG. */
export function fontImportUrls(families: Iterable<FontFamily>): string[] {
  const names = new Set<string>();
  for (const f of families) {
    const g = googleName(f);
    if (g) names.add(g);
  }
  return [...names].map(googleFontUrl);
}

/** Heading presets for the Text tool. */
export const TEXT_PRESETS = {
  h1: { label: 'H1', title: 'Heading 1', fontSize: 48, fontWeight: 'bold' as FontWeight },
  h2: { label: 'H2', title: 'Heading 2', fontSize: 36, fontWeight: 'bold' as FontWeight },
  h3: { label: 'H3', title: 'Heading 3', fontSize: 28, fontWeight: 'bold' as FontWeight },
  p: { label: 'P', title: 'Paragraph', fontSize: 20, fontWeight: 'normal' as FontWeight },
} as const;
export type TextPreset = keyof typeof TEXT_PRESETS;

export const presetFor = (fontSize: number, fontWeight: FontWeight): TextPreset | null =>
  (Object.keys(TEXT_PRESETS) as TextPreset[]).find(
    (k) => TEXT_PRESETS[k].fontSize === fontSize && TEXT_PRESETS[k].fontWeight === fontWeight,
  ) ?? null;
