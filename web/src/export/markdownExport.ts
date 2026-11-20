import type { Bounds, LinearElement, PageSetup, SketchElement, TextElement } from '../core/types';
import { getElementBounds } from '../elements/registry';
import { mathBlocks } from '../elements/math/mathSource';
import { toMarkdown } from '../elements/table/tableIO';

/**
 * A drawing as Markdown, written so a person — or an LLM — can read and review it without
 * seeing the picture:
 *  - a summary (what the drawing contains),
 *  - the diagram rebuilt as a Mermaid flowchart (boxes and the arrows between them),
 *  - the connections as a table (from → to, label, style),
 *  - every element with its label, kind and where it sits (top-to-bottom, left-to-right, per frame),
 *  - tables as Markdown tables, code as fenced code, formulas as $$ … $$, notes as quotes.
 * Pure: works on elements only, so it can be tested and reused (copy to clipboard, download).
 */

export interface MarkdownOptions {
  title?: string;
  /** Rebuild boxes + arrows as a Mermaid flowchart. */
  mermaid?: boolean;
  /** Add each element's position and size. */
  positions?: boolean;
  /** File name of a picture saved next to the Markdown, to reference it. */
  imageFile?: string;
  pageSetup?: PageSetup;
  /** Date shown in the header (defaults to today). */
  date?: Date;
}

/** Shapes that can be nodes of a diagram. */
const NODE_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'figure', 'image', 'table', 'code', 'math', 'frame']);
const KIND: Record<string, string> = {
  rectangle: 'Box',
  ellipse: 'Ellipse',
  diamond: 'Decision (diamond)',
  figure: 'Shape',
  image: 'Image',
  table: 'Table',
  code: 'Code block',
  math: 'Formula',
  frame: 'Frame',
  text: 'Text',
  arrow: 'Arrow',
  line: 'Line',
  freedraw: 'Hand-drawn stroke',
};

const FIGURE_NAMES: Record<string, string> = {
  'fc-decision': 'Decision',
  'fc-terminator': 'Start / end',
  'fc-data': 'Input / output',
  'fc-database': 'Database',
  'fc-document': 'Document',
  'fc-multidocument': 'Documents',
  'fc-predefined': 'Subprocess',
  'fc-manual-input': 'Manual input',
  'fc-delay': 'Delay',
  cylinder: 'Cylinder (database)',
  cloud: 'Cloud',
  chevron: 'Chevron (process step)',
  'pentagon-arrow': 'Process step',
  'callout-rect': 'Speech bubble',
  'callout-rounded': 'Speech bubble',
  'callout-oval': 'Speech bubble',
  'callout-cloud': 'Thought bubble',
  'star-5': 'Star',
  'arrow-right': 'Block arrow',
};

interface Node {
  el: SketchElement;
  id: string;
  label: string;
  kind: string;
  box: Bounds;
}

interface Edge {
  from?: Node;
  to?: Node;
  label: string;
  el: LinearElement;
  inferred: boolean;
}

/** Marks written at a relationship's ends: 1, *, 0..1, 1..*, n, m, N. */
const CARDINALITY = /^(?:[0-9]+|[*nNmM]|[0-9]+\.\.(?:[0-9]+|[*nN]))$/;
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' / ').replace(/\s+/g, ' ').trim();
const round = (n: number) => Math.round(n);
const centre = (b: Bounds) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const inside = (inner: Bounds, outer: Bounds, slack = 2) =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.width <= outer.x + outer.width + slack && inner.y + inner.height <= outer.y + outer.height + slack;
const area = (b: Bounds) => b.width * b.height;
const distToBox = (p: { x: number; y: number }, b: Bounds) => {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.width));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.height));
  return Math.hypot(dx, dy);
};

/** Reading order: rows top to bottom (things within ~half a box height share a row), then left to right. */
function readingOrder<T extends { box: Bounds }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const dy = a.box.y - b.box.y;
    if (Math.abs(dy) > Math.min(a.box.height, b.box.height, 40) / 2) return dy;
    return a.box.x - b.box.x;
  });
}

const figureName = (el: SketchElement) => (el.type === 'figure' ? (FIGURE_NAMES[el.figure] ?? el.figure.replace(/^fc-/, '').replace(/-/g, ' ')) : '');

/** Text content of an element itself (tables, code, formulas, frames). */
function ownText(el: SketchElement): string {
  switch (el.type) {
    case 'text':
      return el.text;
    case 'frame':
      return el.name ?? '';
    case 'code':
      return el.title ?? '';
    case 'math':
      return mathBlocks(el.latex).join('; ');
    case 'table':
      return el.cells[0]?.filter(Boolean).join(' | ') ?? '';
    default:
      return '';
  }
}

export function sceneToMarkdown(all: readonly SketchElement[], o: MarkdownOptions = {}): string {
  const els = all.filter((e) => !e.isDeleted);
  const title = o.title?.trim() || 'Untitled drawing';
  const out: string[] = [];
  if (!els.length) return `# ${title}\n\n_The drawing is empty._\n`;

  const boxes = new Map(els.map((e) => [e.id, getElementBounds(e)]));
  const box = (e: SketchElement) => boxes.get(e.id)!;
  const origin = { x: Math.min(...[...boxes.values()].map((b) => b.x)), y: Math.min(...[...boxes.values()].map((b) => b.y)) };
  const pos = (b: Bounds) => `at (${round(b.x - origin.x)}, ${round(b.y - origin.y)}), ${round(b.width)}×${round(b.height)}`;

  // ── which texts label which shapes, which small pieces are just decoration, which boxes are groups
  const texts = els.filter((e): e is TextElement => e.type === 'text');
  const usedText = new Set<string>();
  const shapeEls = els.filter((e) => NODE_TYPES.has(e.type) && e.type !== 'frame');
  const labelOf = new Map<string, string>();
  const addLabel = (id: string, t: TextElement) => {
    labelOf.set(id, [labelOf.get(id), t.text].filter(Boolean).join('\n'));
    usedText.add(t.id);
  };
  const smallestHost = (b: Bounds, pool: SketchElement[], self?: string) =>
    pool.filter((s) => s.id !== self && area(box(s)) > area(b) && inside(b, box(s))).sort((a, c) => area(box(a)) - area(box(c)))[0];

  // 1. labels bound to a shape
  for (const t of texts) if (t.containerId && boxes.has(t.containerId)) addLabel(t.containerId, t);
  // 2. a short caption right under a shape (e.g. a service tile's name) — unless the text sits in a box of its own
  const holdsShapes = (h: SketchElement) => shapeEls.some((c) => c.id !== h.id && box(c).width > 32 && box(c).height > 32 && area(box(c)) < area(box(h)) && inside(box(c), box(h)));
  for (const t of texts) {
    const own = smallestHost(box(t), shapeEls);
    if (own && !holdsShapes(own)) continue;
    // a caption is a name: at least one word (not "1" or "*" next to a line end)
    if (usedText.has(t.id) || t.text.length > 60 || !/[A-Za-z]{2,}/.test(t.text)) continue;
    const tb = box(t);
    const tc = centre(tb);
    const host = shapeEls
      .filter((s) => !labelOf.has(s.id) && box(s).width <= 140 && box(s).height <= 140)
      .find((s) => {
        const b = box(s);
        return tb.y >= b.y + b.height - 2 && tb.y - (b.y + b.height) < 22 && Math.abs(tc.x - (b.x + b.width / 2)) < Math.max(b.width, tb.width) / 2;
      });
    if (host) addLabel(host.id, t);
  }
  // 3. decoration: pieces drawn inside a smaller shape (icons, stripes, badges) that carry no text of their own
  const decoration = new Set<string>();
  for (const e of els) {
    if (e.type === 'text' || e.type === 'frame' || e.type === 'table' || e.type === 'code' || e.type === 'math' || labelOf.has(e.id)) continue;
    if ((e.type === 'arrow' || e.type === 'line') && (e.startBinding || e.endBinding)) continue;
    const b = box(e);
    // a tiny unlabelled shape (icon, badge, dot) is decoration wherever it is
    if (NODE_TYPES.has(e.type) && b.width <= 32 && b.height <= 32) {
      decoration.add(e.id);
      continue;
    }
    // strokes or small shapes inside an icon-sized shape (a tile's symbol, a queue's stripes)
    const stroke = e.type === 'line' || e.type === 'arrow' || e.type === 'freedraw';
    const small = (h: SketchElement) => area(box(h)) < 130 * 130 && (stroke || area(b) < area(box(h)) * 0.6);
    if (shapeEls.some((h) => h.id !== e.id && area(box(h)) > area(b) && inside(b, box(h)) && small(h))) decoration.add(e.id);
  }
  const real = shapeEls.filter((s) => !decoration.has(s.id));
  // 4. groups: a shape that holds other shapes; its title is the text nearest its top edge
  const groupIds = new Set(real.filter((s) => real.some((c) => c.id !== s.id && area(box(c)) < area(box(s)) * 0.6 && inside(box(c), box(s)))).map((s) => s.id));
  // 5. other text inside a shape labels the smallest shape around it; symbols (λ, { }) on a named tile are decoration
  const ordered = readingOrder(texts.map((t) => ({ t, box: box(t) }))).map((x) => x.t);
  const isSymbol = (t: TextElement) => !/[A-Za-z0-9]{2,}/.test(t.text);
  // words first, then symbols (a badge letter or λ) only where nothing else names the shape
  for (const t of [...ordered.filter((x) => !isSymbol(x)), ...ordered.filter(isSymbol)]) {
    if (usedText.has(t.id)) continue;
    const host = smallestHost(box(t), real);
    if (!host) continue;
    const symbol = isSymbol(t);
    if (groupIds.has(host.id)) {
      // only the group's title (text along its top edge) — other notes inside stay notes
      if (!labelOf.has(host.id) && box(t).y - box(host).y < 40) addLabel(host.id, t);
      continue;
    }
    if (symbol && labelOf.has(host.id)) usedText.add(t.id);
    else addLabel(host.id, t);
  }

  // an untitled group takes its title from a header strip along its top (a record card's title bar)
  const headers = new Set<string>();
  for (const g of real.filter((s) => groupIds.has(s.id) && !labelOf.has(s.id))) {
    const gb = box(g);
    const header = real.find((c) => c.id !== g.id && labelOf.has(c.id) && inside(box(c), gb) && box(c).y - gb.y < 6 && box(c).width > gb.width * 0.8);
    if (header) {
      labelOf.set(g.id, labelOf.get(header.id)!);
      headers.add(header.id);
    }
  }

  // ── nodes (shapes) and groups
  const nodes: Node[] = [];
  const nodeById = new Map<string, Node>();
  let n = 0;
  for (const e of real) {
    if (headers.has(e.id)) continue; // shown as its group's title
    const label = labelOf.get(e.id) ?? ownText(e);
    const kind = groupIds.has(e.id)
      ? 'Group box'
      : e.type === 'figure' ? figureName(e) : e.type === 'rectangle' && e.rounded ? 'Rounded box' : KIND[e.type];
    const node: Node = { el: e, id: `${groupIds.has(e.id) ? 'g' : 'n'}${++n}`, label: label.trim(), kind, box: box(e) };
    nodes.push(node);
    nodeById.set(e.id, node);
  }
  const leaves = nodes.filter((nd) => !groupIds.has(nd.el.id));
  const nearestNode = (p: { x: number; y: number }, exclude?: Node, reach = 24, groups = true) => {
    // a shape the end touches (the smallest, if several), else the group it's inside
    let best: Node | undefined;
    let bestD = reach;
    for (const nd of leaves) {
      if (nd === exclude) continue;
      const d = distToBox(p, nd.box);
      if (d < bestD || (d === bestD && best && area(nd.box) < area(best.box))) {
        best = nd;
        bestD = d;
      }
    }
    if (best || !groups) return best;
    return nodes.filter((nd) => groupIds.has(nd.el.id) && nd !== exclude && distToBox(p, nd.box) < 8).sort((a, b) => area(a.box) - area(b.box))[0];
  };

  // ── edges: bound ends, or (for free arrows) whatever shape an end touches
  const edges: Edge[] = [];
  for (const e of els) {
    if ((e.type !== 'arrow' && e.type !== 'line') || decoration.has(e.id) || e.points.length < 2 || e.polygon) continue;
    const start = { x: e.x + e.points[0].x, y: e.y + e.points[0].y };
    const last = e.points[e.points.length - 1];
    const end = { x: e.x + last.x, y: e.y + last.y };
    let from = e.startBinding ? nodeById.get(e.startBinding.elementId) : undefined;
    let to = e.endBinding ? nodeById.get(e.endBinding.elementId) : undefined;
    const inferred = !from || !to;
    // an arrow end near a shape points at it; a plain line must actually touch shapes at both ends
    const plain = e.type === 'line' || (e.startArrowhead === 'none' && e.endArrowhead === 'none');
    const reach = plain ? 6 : 24;
    from ??= nearestNode(start, undefined, reach, !plain);
    to ??= nearestNode(end, from, reach, !plain);
    if (plain && !(from && to)) continue; // an axis, divider or underline isn't a connection
    // cardinality marks ("1", "*", "0..n") right by either end
    const mark = (p: { x: number; y: number }) => {
      const t = texts.find((x) => !usedText.has(x.id) && CARDINALITY.test(x.text.trim()) && distToBox(p, box(x)) < 26);
      if (t) usedText.add(t.id);
      return t?.text.trim() ?? '';
    };
    const [m1, m2] = [mark(start), mark(end)];
    // a short text near the middle of the arrow is its label
    const mid = e.points[Math.floor(e.points.length / 2)];
    const m = e.points.length % 2 ? { x: e.x + mid.x, y: e.y + mid.y } : centre(box(e));
    const near = texts.find((t) => !usedText.has(t.id) && t.text.length <= 40 && distToBox(m, box(t)) < 22);
    if (near) usedText.add(near.id);
    const text = oneLine(labelOf.get(e.id) ?? near?.text ?? '');
    const cards = m1 || m2 ? `${m1 || '?'} to ${m2 || '?'}` : '';
    edges.push({ from, to, label: [text, cards && (text ? `(${cards})` : cards)].filter(Boolean).join(' '), el: e, inferred });
  }

  // what holds what: frames (by membership or geometry) and group boxes; the smallest holder wins
  const holders = [...els.filter((e) => e.type === 'frame'), ...real.filter((s) => groupIds.has(s.id))];
  const parentOf = (e: SketchElement): SketchElement | undefined =>
    holders
      .filter((h) => h.id !== e.id && (e.frameId === h.id || (area(box(h)) > area(box(e)) && inside(box(e), box(h)))))
      .sort((a, b) => area(box(a)) - area(box(b)))[0];
  const frames = els.filter((e) => e.type === 'frame');
  const freeTexts = texts.filter((t) => !usedText.has(t.id));
  const strokes = els.filter((e) => e.type === 'freedraw');
  const count = (type: string) => els.filter((e) => e.type === type).length;

  // ── header
  out.push(`# ${title}`);
  out.push('');
  const date = (o.date ?? new Date()).toISOString().slice(0, 10);
  const setup = o.pageSetup;
  const canvas = !setup || setup.size === 'infinite' ? 'infinite canvas' : `${setup.size} ${setup.orientation} pages`;
  out.push(`> Exported from SketchBoard on ${date} (${canvas}). This file describes the drawing in words so it can be read and reviewed without the picture.`);
  out.push('');
  if (o.imageFile) {
    out.push(`![${title}](${o.imageFile})`);
    out.push('');
  }

  out.push('## Summary');
  out.push('');
  const parts: string[] = [];
  const add = (num: number, one: string, many: string) => num && parts.push(`${num} ${num === 1 ? one : many}`);
  add(nodes.filter((x) => !['table', 'code', 'math', 'image'].includes(x.el.type)).length, 'shape', 'shapes');
  add(edges.length, 'connection', 'connections');
  add(freeTexts.length, 'text note', 'text notes');
  add(count('table'), 'table', 'tables');
  add(count('code'), 'code block', 'code blocks');
  add(count('math'), 'formula', 'formulas');
  add(count('image'), 'image', 'images');
  add(frames.length, 'frame', 'frames');
  add(strokes.length, 'hand-drawn stroke', 'hand-drawn strokes');
  out.push(`- Contains ${parts.join(', ')}.`);
  const bounds = [...boxes.values()];
  const w = Math.max(...bounds.map((b) => b.x + b.width)) - origin.x;
  const h = Math.max(...bounds.map((b) => b.y + b.height)) - origin.y;
  out.push(`- Size about ${round(w)} × ${round(h)} px; positions below are measured from the top-left corner of the drawing (x to the right, y down).`);
  const linked = els.filter((e) => e.link);
  if (linked.length) out.push(`- ${linked.length} element${linked.length === 1 ? ' has a link' : 's have links'} (listed below).`);
  out.push('');

  // ── Mermaid
  const connected = edges.filter((e) => e.from && e.to);
  if (o.mermaid !== false && connected.length) {
    const used = new Set(connected.flatMap((e) => [e.from!, e.to!]));
    const xs = [...used].map((u) => centre(u.box));
    const spanX = Math.max(...xs.map((p) => p.x)) - Math.min(...xs.map((p) => p.x));
    const spanY = Math.max(...xs.map((p) => p.y)) - Math.min(...xs.map((p) => p.y));
    const esc = (s: string) => s.replace(/"/g, '#quot;').replace(/\n/g, '<br/>');
    const shape = (nd: Node) => {
      const text = `"${esc(nd.label || nd.kind)}"`;
      const t = nd.el.type;
      if (t === 'ellipse') return `((${text}))`;
      if (t === 'diamond' || (t === 'figure' && nd.el.figure === 'fc-decision')) return `{${text}}`;
      if (t === 'figure' && /cylinder|database/.test(nd.el.figure)) return `[(${text})]`;
      if ((t === 'rectangle' && nd.el.rounded) || (t === 'figure' && nd.el.figure === 'fc-terminator')) return `(${text})`;
      return `[${text}]`;
    };
    out.push('## Diagram (Mermaid)');
    out.push('');
    out.push('The boxes and arrows of the drawing, rebuilt as a flowchart:');
    out.push('');
    out.push('```mermaid');
    out.push(`flowchart ${spanX >= spanY ? 'LR' : 'TD'}`);
    // frames and group boxes become (nested) subgraphs
    const holderUsed = new Set<string>();
    for (const nd of used) {
      if (groupIds.has(nd.el.id)) holderUsed.add(nd.el.id);
      for (let p = parentOf(nd.el); p; p = parentOf(p)) holderUsed.add(p.id);
    }
    const holderName = (h: SketchElement) => (h.type === 'frame' ? h.name || 'Frame' : nodeById.get(h.id)?.label || 'Group');
    const emit = (parent: SketchElement | undefined, depth: number) => {
      const pad = '  '.repeat(depth + 1);
      for (const h of holders.filter((h) => holderUsed.has(h.id) && parentOf(h) === parent)) {
        out.push(`${pad}subgraph ${nodeById.get(h.id)?.id ?? `f${h.id.replace(/\W/g, '')}`}["${esc(oneLine(holderName(h)))}"]`);
        emit(h, depth + 1);
        out.push(`${pad}end`);
      }
      for (const nd of readingOrder([...used].filter((u) => !groupIds.has(u.el.id) && parentOf(u.el) === parent))) out.push(`${pad}${nd.id}${shape(nd)}`);
    };
    emit(undefined, 0);
    for (const e of connected) {
      const dashed = e.el.strokeStyle !== 'solid';
      const both = e.el.type === 'arrow' && e.el.startArrowhead !== 'none' && e.el.endArrowhead !== 'none';
      const arrowless = e.el.type === 'line' || (e.el.startArrowhead === 'none' && e.el.endArrowhead === 'none');
      const reversed = !arrowless && !both && e.el.endArrowhead === 'none';
      const [a, b] = reversed ? [e.to!, e.from!] : [e.from!, e.to!];
      const link = arrowless ? (dashed ? '-.-' : '---') : both ? (dashed ? '<-.->' : '<-->') : dashed ? '-.->' : '-->';
      out.push(`  ${a.id} ${link}${e.label ? `|"${esc(e.label)}"|` : ''} ${b.id}`);
    }
    out.push('```');
    out.push('');
  }

  // ── connections
  if (edges.length) {
    out.push('## Connections');
    out.push('');
    const name = (nd?: Node) => (nd ? `${nd.label ? oneLine(nd.label) : nd.kind} (${nd.id})` : '— (open end)');
    const rows = edges.map((e) => {
      const style = [e.el.type === 'line' ? 'line' : 'arrow', e.el.strokeStyle !== 'solid' ? e.el.strokeStyle : '', e.el.startArrowhead !== 'none' && e.el.endArrowhead !== 'none' ? 'both ways' : '', e.inferred ? 'ends touch, not attached' : '']
        .filter(Boolean)
        .join(', ');
      const reversed = e.el.type === 'arrow' && e.el.endArrowhead === 'none' && e.el.startArrowhead !== 'none';
      return reversed ? [name(e.to), name(e.from), e.label, style] : [name(e.from), name(e.to), e.label, style];
    });
    out.push(toMarkdown([['From', 'To', 'Label', 'Style'], ...rows]));
    out.push('');
  }

  // ── elements, per frame then the rest, in reading order
  const describe = (nd: Node): string[] => {
    const e = nd.el;
    const lines: string[] = [];
    const label = nd.label ? ` **${oneLine(nd.label)}**` : '';
    const extras: string[] = [];
    if (o.positions !== false) extras.push(pos(nd.box));
    if ('backgroundColor' in e && e.backgroundColor && e.backgroundColor !== 'transparent' && e.type !== 'table') extras.push(`fill ${e.backgroundColor}`);
    if (e.link) extras.push(`link: ${e.link}`);
    if (e.locked) extras.push('locked');
    lines.push(`- \`${nd.id}\` ${nd.kind}:${label || ' _(no label)_'}${extras.length ? ` — ${extras.join(', ')}` : ''}`);
    if (e.type === 'table') {
      lines.push('');
      lines.push(toMarkdown(e.cells.slice(0, e.rows).map((r) => r.slice(0, e.cols))).split('\n').map((l) => `  ${l}`).join('\n'));
      lines.push('');
    } else if (e.type === 'code') {
      lines.push('');
      lines.push(`  \`\`\`${e.language === 'plain' ? '' : e.language}`);
      lines.push(e.code.split('\n').map((l) => `  ${l}`).join('\n'));
      lines.push('  ```');
      lines.push('');
    } else if (e.type === 'math') {
      lines.push('');
      for (const m of mathBlocks(e.latex)) lines.push(`  $$\n  ${m}\n  $$`);
      lines.push('');
    } else if (e.type === 'image') {
      lines.push('  (picture not included in this file)');
    }
    return lines;
  };
  const describeText = (t: TextElement) => {
    const extras = o.positions !== false ? ` — ${pos(box(t))}` : '';
    const body = t.text.trim().split('\n');
    if (body.length === 1) return [`- Text: “${body[0]}”${extras}${t.link ? `, link: ${t.link}` : ''}`];
    return [`- Text${extras}:`, ...body.map((l) => `  > ${l}`)];
  };
  type Item = { box: Bounds; lines: string[] };
  /** One-line texts side by side on a row read as one line ("Name: Jane Doe"); others stay on their own. */
  const rowsOf = (list: TextElement[]): Item[] => {
    const items: Item[] = [];
    const left = readingOrder(list.map((t) => ({ t, box: box(t) })));
    while (left.length) {
      const first = left.shift()!;
      const row = [first];
      if (!first.t.text.includes('\n')) {
        for (let i = 0; i < left.length; ) {
          const c = left[i];
          if (!c.t.text.includes('\n') && Math.abs(centre(c.box).y - centre(first.box).y) < 8) row.push(...left.splice(i, 1));
          else i++;
        }
      }
      if (row.length === 1) items.push({ box: first.box, lines: describeText(first.t) });
      else {
        row.sort((a, b) => a.box.x - b.box.x);
        const words = row.map((r) => r.t.text.trim());
        const text = words.length === 2 ? `${words[0]}: ${words[1]}` : words.join(' | ');
        items.push({ box: first.box, lines: [`- ${text}${o.positions !== false ? ` — ${pos(first.box)}` : ''}`] });
      }
    }
    return items;
  };
  const indent = (lines: string[], by: number) => lines.map((l) => (l ? ' '.repeat(by) + l : l));
  /** Everything directly inside `parent` (undefined = the board), nested groups with their contents. */
  const itemsIn = (parent: SketchElement | undefined): Item[] => [
    ...nodes
      .filter((nd) => parentOf(nd.el) === parent && !(nd.el.type !== 'frame' && groupIds.has(nd.el.id)))
      .map((nd) => ({ box: nd.box, lines: describe(nd) })),
    ...rowsOf(freeTexts.filter((t) => parentOf(t) === parent)),
    ...holders
      .filter((h) => h.type !== 'frame' && parentOf(h) === parent)
      .map((h) => {
        const nd = nodeById.get(h.id)!;
        const head = `- \`${nd.id}\` **Group: ${oneLine(nd.label || 'untitled')}**${o.positions !== false ? ` — ${pos(nd.box)}` : ''}, contains:`;
        const inner = readingOrder(itemsIn(h)).flatMap((i) => i.lines);
        return { box: nd.box, lines: [head, ...indent(inner.length ? inner : ['- _(nothing)_'], 2)] };
      }),
  ];

  out.push('## Elements');
  out.push('');
  out.push('In reading order (top to bottom, left to right), nested inside the frames and group boxes that hold them. IDs like `n3` match the diagram and connections above.');
  out.push('');
  const topFrames = holders.filter((h) => h.type === 'frame' && !parentOf(h));
  for (const f of readingOrder(topFrames.map((f) => ({ f, box: box(f) })))) {
    out.push(`### Frame: ${f.f.type === 'frame' ? f.f.name || 'Frame' : 'Frame'}`);
    out.push('');
    const items = readingOrder(itemsIn(f.f));
    out.push(...(items.length ? items.flatMap((i) => i.lines) : ['_(empty)_']));
    out.push('');
  }
  const loose = readingOrder(itemsIn(undefined));
  if (loose.length) {
    if (topFrames.length) {
      out.push('### Outside frames');
      out.push('');
    }
    out.push(...loose.flatMap((i) => i.lines));
    out.push('');
  }
  if (strokes.length) {
    out.push(`- ${strokes.length} hand-drawn stroke${strokes.length === 1 ? '' : 's'} (pen / highlighter) — not described; see the picture.`);
    out.push('');
  }
  if (decoration.size) {
    out.push(`_${decoration.size} small decorative piece${decoration.size === 1 ? '' : 's'} inside shapes (icons, stripes) are left out._`);
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
