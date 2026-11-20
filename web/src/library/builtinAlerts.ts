import type { TextRun } from '../core/types';
import { ItemBuilder } from './ItemBuilder';
import type { BuiltinDef } from './builtin';

/**
 * Alert / note boxes for annotating designs: a soft tinted rounded box with a border in the same
 * colour and real label text inside (double-click to edit; it wraps when the box is resized, and
 * bold or coloured words can be changed per word). One colour per meaning: note, error, warning,
 * success, info, tip, question, key takeaway, decision, quote.
 */

interface Tone {
  fill: string;
  border: string;
  text: string;
  /** Strong colour for the callout bar. */
  accent: string;
}

const TONES = {
  red: { fill: '#ffe3e3', border: '#f59a9a', text: '#e03131', accent: '#e03131' },
  green: { fill: '#e6f9e8', border: '#a5c9a9', text: '#1e1e1e', accent: '#40c057' },
  amber: { fill: '#fff4d6', border: '#f2c94c', text: '#8a5a00', accent: '#f59f00' },
  blue: { fill: '#e7f5ff', border: '#91c7f2', text: '#1864ab', accent: '#1c7ed6' },
  violet: { fill: '#f3f0ff', border: '#b7a6f2', text: '#5f3dc4', accent: '#7048e8' },
  teal: { fill: '#e3fafc', border: '#8bd3dc', text: '#0b7285', accent: '#1098ad' },
  yellow: { fill: '#fff9db', border: '#ffd43b', text: '#5c4a00', accent: '#fab005' },
  grey: { fill: '#f1f3f5', border: '#ced4da', text: '#343a40', accent: '#868e96' },
} satisfies Record<string, Tone>;

const FONT = 'normal'; // a clean sans serif, like the notes it imitates

/** Text pieces: "**bold**" marks bold parts; the result joins up to the plain text exactly. */
function parse(src: string, color?: string): { text: string; runs: TextRun[] } {
  const runs: TextRun[] = [];
  src.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (!part) return;
    const bold = part.startsWith('**') && part.endsWith('**');
    const text = bold ? part.slice(2, -2) : part;
    runs.push({ text, ...(bold ? { b: true } : {}), ...(color ? { c: color } : {}) });
  });
  return { text: runs.map((r) => r.text).join(''), runs };
}

/** One alert box `w` wide at (x, y). `allBold` makes the whole text bold (like a red warning note). */
function alert(b: ItemBuilder, x: number, y: number, w: number, tone: Tone, src: string, o: { size?: number; allBold?: boolean } = {}) {
  const { text, runs } = parse(src);
  const hasBold = runs.some((r) => r.b);
  b.labelled(x, y, w, text, {
    size: o.size ?? 18,
    family: FONT,
    color: tone.text,
    bold: o.allBold,
    runs: hasBold && !o.allBold ? runs : undefined,
    minHeight: 56,
    shape: { rounded: true, backgroundColor: tone.fill, strokeColor: tone.border, fillStyle: 'solid', strokeWidth: 1.5, roughness: 0 },
  });
  return b;
}

/** Alert box with a solid colour bar down its left edge (the "callout" style). */
function callout(b: ItemBuilder, tone: Tone, src: string, w = 460) {
  alert(b, 8, 0, w, tone, src, { size: 17 });
  const box = b.build()[0];
  // the bar sits just outside the box's left edge, so it never covers the text
  b.rect(0, 0, 8, box.height, { backgroundColor: tone.accent, strokeColor: tone.accent, fillStyle: 'solid', roughness: 0 });
  return b;
}

const items: BuiltinDef[] = [
  {
    id: 'alert-note-red',
    name: 'Note (red, bold)',
    build: (b) => alert(b, 0, 0, 470, TONES.red, 'Note: write the caveat or the thing people must not miss here.', { allBold: true, size: 22 }),
  },
  {
    id: 'alert-success',
    name: 'Success / solution (green)',
    build: (b) => alert(b, 0, 0, 520, TONES.green, '**Database atomic update** solves the actual problem\n**==> See Transactional Outbox Pattern** for the details'),
  },
  { id: 'alert-error', name: 'Error', build: (b) => alert(b, 0, 0, 440, TONES.red, '**✕ Error:** payment failed — the card was declined. Nothing was charged.') },
  { id: 'alert-warning', name: 'Warning', build: (b) => alert(b, 0, 0, 440, TONES.amber, '**⚠ Warning:** this call is not idempotent. Retries can create duplicates.') },
  { id: 'alert-info', name: 'Info', build: (b) => alert(b, 0, 0, 440, TONES.blue, '**ℹ Info:** reads are served from the replica and may lag by up to 1 s.') },
  { id: 'alert-ok', name: 'Success (short)', build: (b) => alert(b, 0, 0, 440, TONES.green, '**✓ Success:** order placed. A confirmation email is on its way.') },
  { id: 'alert-tip', name: 'Tip', build: (b) => alert(b, 0, 0, 440, TONES.violet, '**Tip:** cache the result for 60 s to cut database load by ~80%.') },
  { id: 'alert-question', name: 'Open question', build: (b) => alert(b, 0, 0, 440, TONES.teal, '**? Open question:** who owns retries — the client or the gateway?') },
  { id: 'alert-takeaway', name: 'Key takeaway', build: (b) => alert(b, 0, 0, 440, TONES.yellow, '**★ Key takeaway:** strong consistency for payments, eventual consistency for the feed.') },
  { id: 'alert-decision', name: 'Decision record', build: (b) => alert(b, 0, 0, 440, TONES.grey, '**Decision:** use PostgreSQL with row-level locks.\n**Why:** we need transactions across seats and orders.') },
  { id: 'alert-callout-red', name: 'Callout bar (red)', build: (b) => callout(b, TONES.red, '**Don’t** rely on a cache lock alone to prevent double booking.') },
  { id: 'alert-callout-green', name: 'Callout bar (green)', build: (b) => callout(b, TONES.green, '**Do** make the booking a single atomic database update.') },
  { id: 'alert-callout-blue', name: 'Callout bar (blue)', build: (b) => callout(b, TONES.blue, '**Note:** the outbox table is read by a relay that publishes events.') },
  {
    id: 'alert-do-dont',
    name: 'Do / Don’t pair',
    build: (b) => {
      alert(b, 0, 0, 300, TONES.green, '**✓ Do**\n• Use idempotency keys\n• Keep the update atomic\n• Retry with back-off', { size: 17 });
      return alert(b, 320, 0, 300, TONES.red, '**✕ Don’t**\n• Trust a cache lock alone\n• Retry without a key\n• Update two tables separately', { size: 17 });
    },
  },
  {
    id: 'alert-badges',
    name: 'Status badges',
    build: (b) => {
      let x = 0;
      for (const [label, tone] of [['✓ Success', TONES.green], ['ℹ Info', TONES.blue], ['⚠ Warning', TONES.amber], ['✕ Error', TONES.red]] as Array<[string, Tone]>) {
        const w = Math.round(ItemBuilder.measure(label, 15).width) + 34;
        b.box('rectangle', x, 0, w, 34, label, { rounded: true, backgroundColor: tone.fill, strokeColor: tone.border, fillStyle: 'solid', roughness: 0, size: 15, bold: true, color: tone.text === TONES.green.text ? '#2b8a3e' : tone.text, family: FONT });
        x += w + 10;
      }
      return b;
    },
  },
];

export const ALERT_SECTIONS: Array<{ name: string; items: BuiltinDef[] }> = [{ name: 'Alerts & notes', items }];
