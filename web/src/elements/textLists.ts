import type { TextRun } from '../core/types';

/**
 * Bulleted and numbered lists inside a text box. A list item is simply a line that starts with a
 * marker — "• " or "1. " — so the list reads the same in exports, copies and Excalidraw. These pure
 * helpers add / remove markers on lines, continue a list on Enter and keep numbers in order, while
 * keeping the formatting of the words (TextElement.runs) in step with the text.
 */
export type ListKind = 'bullet' | 'number';

export const BULLET = '•';
/** Marker at the start of a line: leading spaces, then "•" or "12." / "12)", then a space. */
const MARKER_RE = /^(\s*)(•|\d+[.)]) /;

export function listKindOf(line: string): ListKind | null {
  const m = line.match(MARKER_RE);
  if (!m) return null;
  return m[2] === BULLET ? 'bullet' : 'number';
}

/** Length of a line's marker (with its indent and space), or 0. */
export const markerLength = (line: string): number => line.match(MARKER_RE)?.[0].length ?? 0;

// ───────── text + formatting, edited together ─────────

/** One style per character (undefined = the box's own style). */
type Styles = Array<Omit<TextRun, 'text'> | undefined>;

function explode(text: string, runs: TextRun[] | undefined): Styles {
  if (!runs || runs.map((r) => r.text).join('') !== text) return Array.from(text, () => undefined);
  const out: Styles = [];
  for (const { text: t, ...style } of runs) for (let i = 0; i < t.length; i++) out.push(Object.keys(style).length ? style : undefined);
  return out;
}

function implode(text: string, styles: Styles): TextRun[] | undefined {
  const runs: TextRun[] = [];
  const key = (s: Styles[number]) => JSON.stringify(s ?? {});
  for (let i = 0; i < text.length; i++) {
    const last = runs[runs.length - 1];
    if (last && key(styles[i - 1]) === key(styles[i])) last.text += text[i];
    else runs.push({ text: text[i], ...(styles[i] ?? {}) });
  }
  return runs.some((r) => Object.keys(r).length > 1) ? runs : undefined;
}

export interface TextEdit {
  text: string;
  runs?: TextRun[];
  /** Selection after the edit (character offsets). */
  from: number;
  to: number;
}

/** Applies replacements (sorted, non-overlapping) to text, formatting and selection together. */
function replaceRanges(base: TextEdit, edits: Array<{ at: number; remove: number; insert: string }>): TextEdit {
  let styles = explode(base.text, base.runs);
  let text = base.text;
  let { from, to } = base;
  for (const e of [...edits].sort((a, b) => b.at - a.at)) {
    text = text.slice(0, e.at) + e.insert + text.slice(e.at + e.remove);
    // the marker takes the box's own style, not the first word's
    styles = [...styles.slice(0, e.at), ...Array.from(e.insert, () => undefined), ...styles.slice(e.at + e.remove)];
    // a caret at or inside the replaced marker ends up just after the new one
    const shift = (p: number) => (p < e.at ? p : p <= e.at + e.remove ? e.at + e.insert.length : p + e.insert.length - e.remove);
    from = shift(from);
    to = shift(to);
  }
  return { text, runs: implode(text, styles), from, to };
}

const lineStarts = (text: string): number[] => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
};

/**
 * Turns the lines touched by the selection into a list of `kind` — or, if they all already are
 * one, back into plain lines. With no selection, the line with the caret.
 */
export function toggleList(base: TextEdit, kind: ListKind): TextEdit {
  const lines = base.text.split('\n');
  const starts = lineStarts(base.text);
  const lo = Math.min(base.from, base.to);
  const hi = Math.max(base.from, base.to);
  const touched = lines.map((_, i) => i).filter((i) => {
    const s = starts[i];
    const e = s + lines[i].length;
    if (lo === hi) return lo >= s && lo <= e;
    // a selection ending right at the start of a line doesn't take that line
    return e >= lo && s <= hi && !(s === hi && i > 0);
  });
  const all = touched.every((i) => listKindOf(lines[i]) === kind);
  // numbering carries on from a numbered line right above the block
  const prev = touched[0] > 0 ? lines[touched[0] - 1].match(/^\s*(\d+)[.)] /) : null;
  let n = prev ? Number(prev[1]) : 0;
  const edits = touched.map((i) => {
    const current = markerLength(lines[i]);
    const indent = lines[i].match(/^\s*/)?.[0] ?? '';
    const insert = all ? '' : kind === 'bullet' ? `${indent}${BULLET} ` : `${indent}${++n}. `;
    // a plain line keeps its own leading spaces after the new marker
    const remove = current || (all ? 0 : indent.length);
    return { at: starts[i], remove, insert };
  });
  return renumber(replaceRanges(base, edits));
}

/**
 * Enter inside a list item: a new item with the next marker. Enter on an item with nothing after
 * its marker ends the list there (the marker is removed). Returns null when the caret line isn't a list item.
 */
export function continueList(base: TextEdit): TextEdit | null {
  const caret = base.to;
  const starts = lineStarts(base.text);
  let li = 0;
  while (li + 1 < starts.length && starts[li + 1] <= caret) li++;
  const lineStart = starts[li];
  const line = base.text.split('\n')[li];
  const m = line.match(MARKER_RE);
  if (!m || caret < lineStart + m[0].length) return null;
  if (!line.slice(m[0].length).trim() && caret >= lineStart + line.length) {
    // empty item: finish the list
    const out = replaceRanges({ ...base, from: caret, to: caret }, [{ at: lineStart, remove: m[0].length, insert: '' }]);
    return renumber(out);
  }
  const next = m[2] === BULLET ? `${m[1]}${BULLET} ` : `${m[1]}${Number.parseInt(m[2], 10) + 1}${m[2].slice(-1)} `;
  const lo = Math.min(base.from, base.to);
  const insert = `\n${next}`;
  const out = replaceRanges({ ...base, from: lo, to: lo }, [{ at: lo, remove: Math.abs(base.to - base.from), insert }]);
  const after = lo + insert.length; // just after the new marker
  return renumber({ ...out, from: after, to: after });
}

/** Numbers each run of consecutive numbered lines 1, 2, 3… (the first keeps its own start number). */
export function renumber(base: TextEdit): TextEdit {
  const lines = base.text.split('\n');
  const starts = lineStarts(base.text);
  const edits: Array<{ at: number; remove: number; insert: string }> = [];
  let expected: number | null = null;
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*)(\d+)([.)]) /);
    if (!m) {
      expected = null;
      return;
    }
    const num = Number(m[2]);
    if (expected === null) expected = num;
    else if (num !== expected) edits.push({ at: starts[i] + m[1].length, remove: m[2].length, insert: String(expected) });
    expected++;
  });
  return edits.length ? replaceRanges(base, edits) : base;
}

/** Which list (if any) every line touched by the selection is — for lighting up the list buttons. */
export function listKindAt(text: string, from: number, to: number): ListKind | null {
  const lines = text.split('\n');
  const starts = lineStarts(text);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const kinds = lines
    .map((l, i) => ({ l, s: starts[i], e: starts[i] + l.length }))
    .filter(({ s, e }) => (lo === hi ? lo >= s && lo <= e : e >= lo && s <= hi))
    .map(({ l }) => listKindOf(l));
  return kinds.length && kinds.every((k) => k === kinds[0]) ? kinds[0] : null;
}
