/**
 * Reads a typed colour code: "e1e1e1", "#E1E1E1", "#abc" (short form) or with transparency
 * ("#e1e1e180", "#abc8"). Returns it as lower-case "#rrggbb" / "#rrggbbaa", or null if it isn't one.
 */
export function parseHexColor(input: string): string | null {
  const hex = input.trim().replace(/^#/, '').toLowerCase();
  if (!/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) return null;
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
  // a fully opaque alpha adds nothing
  return `#${full.length === 8 && full.endsWith('ff') ? full.slice(0, 6) : full}`;
}
