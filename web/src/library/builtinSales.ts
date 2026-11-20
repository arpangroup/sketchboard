import { ItemBuilder } from './ItemBuilder';
import type { BuiltinDef } from './builtin';

/**
 * Built-in library sections for sales work: CRM records and processes, sales dashboards and
 * charts, and products / inventory / CPQ. Everything is drawn from plain shapes, text and tables,
 * so each part can be edited after it is placed (rename a stage, change a number, recolour a bar).
 * Marketing channels are shown as labelled badges, not as the companies' logos.
 */

type Pt = [number, number];

const INK = '#1e1e1e';
const GREY = '#868e96';
const LINE = '#ced4da';
const C = {
  blue: ['#1971c2', '#d0ebff'],
  green: ['#2f9e44', '#d3f9d8'],
  orange: ['#e8590c', '#ffe8cc'],
  red: ['#e03131', '#ffe3e3'],
  violet: ['#6741d9', '#e5dbff'],
  yellow: ['#f08c00', '#fff3bf'],
  teal: ['#0c8599', '#c5f6fa'],
  grey: ['#495057', '#f1f3f5'],
} as const;
type Hue = keyof typeof C;

const width = (text: string, size: number) => ItemBuilder.measure(text, size).width;

/** Rounded badge; returns its width. */
function pill(b: ItemBuilder, x: number, y: number, text: string, hue: Hue, o: { size?: number; h?: number } = {}): number {
  const size = o.size ?? 14;
  const h = o.h ?? 28;
  const w = Math.round(width(text, size) + 26);
  b.box('rectangle', x, y, w, h, text, { rounded: true, backgroundColor: C[hue][1], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.6, size, color: C[hue][0], bold: true });
  return w;
}

/** Several badges centred on cx, in one row. */
function pillRow(b: ItemBuilder, cx: number, y: number, items: Array<[string, Hue]>, size = 13, gap = 8): ItemBuilder {
  const ws = items.map(([t]) => Math.round(width(t, size) + 26));
  let x = cx - (ws.reduce((a, c) => a + c, 0) + gap * (items.length - 1)) / 2;
  items.forEach(([t, hue], i) => {
    pill(b, x, y, t, hue, { size, h: 26 });
    x += ws[i] + gap;
  });
  return b;
}

/** Circle with a letter (record type icon). */
function badge(b: ItemBuilder, cx: number, cy: number, r: number, letter: string, hue: Hue) {
  b.ellipse(cx - r, cy - r, r * 2, r * 2, { backgroundColor: C[hue][0], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.4 });
  return b.label(letter, cx, cy, { size: r, bold: true, color: '#ffffff' });
}

/** Head-and-shoulders avatar in a circle. */
function avatar(b: ItemBuilder, x: number, y: number, d: number, hue: Hue = 'blue') {
  b.ellipse(x, y, d, d, { backgroundColor: C[hue][1], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.5 });
  b.ellipse(x + d * 0.34, y + d * 0.18, d * 0.32, d * 0.32, { strokeColor: C[hue][0], roughness: 0.4 });
  const arc: Pt[] = Array.from({ length: 9 }, (_, i) => {
    const t = Math.PI + (i / 8) * Math.PI;
    return [x + d / 2 + Math.cos(t) * d * 0.3, y + d * 0.84 + Math.sin(t) * d * 0.28];
  });
  return b.line(arc, { strokeColor: C[hue][0], roughness: 0.4 });
}

/**
 * A CRM record card: coloured header with an icon and title, then "label  value" rows.
 * A value written as "[Text]" is drawn as a status badge.
 */
function record(b: ItemBuilder, title: string, letter: string, hue: Hue, rows: Array<[string, string]>, o: { w?: number; badgeHue?: Hue } = {}) {
  const w = o.w ?? 280;
  const head = 46;
  const rowH = 26;
  const h = head + rows.length * rowH + 14;
  b.rect(0, 0, w, h, { rounded: true, backgroundColor: '#ffffff', fillStyle: 'solid', roughness: 0.6 });
  b.rect(0, 0, w, head, { backgroundColor: C[hue][1], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.6 });
  badge(b, 24, head / 2, 13, letter, hue);
  b.textMid(title, 46, head / 2, { size: 17, bold: true });
  const valueX = Math.round(w * 0.42);
  rows.forEach(([label, value], i) => {
    const cy = head + 8 + i * rowH + rowH / 2;
    b.textMid(label, 14, cy, { size: 13, color: GREY });
    const status = value.match(/^\[(.+)\]$/);
    if (status) pill(b, valueX, cy - 11, status[1], o.badgeHue ?? hue, { size: 12, h: 22 });
    else b.textMid(value, valueX, cy, { size: 14 });
  });
  return b;
}

/** A row of chevrons (process stages), each with its own colour. */
function chevrons(b: ItemBuilder, x: number, y: number, stages: Array<[string, Hue]>, w = 130, h = 54, size = 14) {
  stages.forEach(([label, hue], i) => {
    const sx = x + i * (w - 12);
    b.figure(i === 0 ? 'pentagon-arrow' : 'chevron', sx, y, w, h, { backgroundColor: C[hue][1], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.6 });
    b.label(label, sx + w / 2 + (i === 0 ? -6 : 4), y + h / 2, { size, bold: true, color: C[hue][0] });
  });
  return b;
}

/** Box with a centred label, light fill. */
function node(b: ItemBuilder, x: number, y: number, w: number, h: number, text: string, hue: Hue, size = 15) {
  return b.box('rectangle', x, y, w, h, text, { rounded: true, backgroundColor: C[hue][1], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.6, size, bold: true });
}

/** Chart axes with value grid lines; returns the plot box. */
function axes(b: ItemBuilder, x: number, y: number, w: number, h: number, ticks: string[]) {
  ticks.forEach((t, i) => {
    const ty = y + h - (i / (ticks.length - 1)) * h;
    if (i > 0) b.line([[x, ty], [x + w, ty]], { strokeColor: LINE, strokeWidth: 1, roughness: 0.2 });
    b.label(t, x - 18, ty, { size: 11, color: GREY });
  });
  b.line([[x, y], [x, y + h], [x + w, y + h]], { sharp: true, roughness: 0.4 });
  return b;
}

/** Closed wedge from angle a0 to a1 (radians, 0 = 3 o'clock). */
function wedge(cx: number, cy: number, r: number, a0: number, a1: number, inner = 0): Pt[] {
  const n = Math.max(3, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 36));
  const outer: Pt[] = Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
  });
  if (!inner) return [[cx, cy], ...outer];
  const back: Pt[] = Array.from({ length: n + 1 }, (_, i) => {
    const t = a1 - ((a1 - a0) * i) / n;
    return [cx + Math.cos(t) * inner, cy + Math.sin(t) * inner];
  });
  return [...outer, ...back];
}

/** Pie or donut with a legend on the right. */
function pie(b: ItemBuilder, parts: Array<[string, number, Hue]>, o: { donut?: boolean; center?: string } = {}) {
  const r = 80;
  const cx = r;
  const cy = r;
  const total = parts.reduce((a, [, v]) => a + v, 0);
  let a = -Math.PI / 2;
  parts.forEach(([, v, hue]) => {
    const a1 = a + (v / total) * Math.PI * 2;
    b.polygon(wedge(cx, cy, r, a, a1, o.donut ? r * 0.55 : 0), { backgroundColor: C[hue][0], strokeColor: '#ffffff', fillStyle: 'solid', roughness: 0.3, strokeWidth: 2 });
    a = a1;
  });
  if (o.center) b.label(o.center, cx, cy, { size: 18, bold: true });
  parts.forEach(([label, v, hue], i) => {
    const ly = 30 + i * 28;
    b.rect(2 * r + 24, ly - 7, 14, 14, { backgroundColor: C[hue][0], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0 });
    b.textMid(`${label}  ${Math.round((v / total) * 100)}%`, 2 * r + 46, ly, { size: 14 });
  });
  return b;
}

/** KPI tile: label, big value, change line. */
function kpi(b: ItemBuilder, x: number, y: number, label: string, value: string, change: string, up = true, w = 180) {
  b.rect(x, y, w, 100, { rounded: true, backgroundColor: '#ffffff', fillStyle: 'solid', roughness: 0.6 });
  b.text(label, x + 14, y + 12, { size: 13, color: GREY });
  b.text(value, x + 14, y + 32, { size: 26, bold: true });
  return b.text(`${up ? '▲' : '▼'} ${change}`, x + 14, y + 72, { size: 13, color: up ? C.green[0] : C.red[0] });
}

/** Vertical bar chart into a box. */
function bars(b: ItemBuilder, x: number, y: number, w: number, h: number, data: Array<[string, number]>, max: number, hue: Hue = 'blue') {
  const slot = w / data.length;
  const bw = slot * 0.56;
  data.forEach(([label, v], i) => {
    const bh = (v / max) * h;
    const bx = x + i * slot + (slot - bw) / 2;
    b.rect(bx, y + h - bh, bw, bh, { backgroundColor: C[hue][0], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.4 });
    b.label(label, bx + bw / 2, y + h + 14, { size: 12, color: GREY });
  });
  return b;
}

/** Card with a picture placeholder (crossed box). */
function picture(b: ItemBuilder, x: number, y: number, w: number, h: number) {
  b.rect(x, y, w, h, { backgroundColor: '#f1f3f5', fillStyle: 'solid', strokeColor: LINE, roughness: 0.4 });
  // a little "mountains and sun" picture
  b.polygon([[x + w * 0.15, y + h * 0.8], [x + w * 0.4, y + h * 0.42], [x + w * 0.58, y + h * 0.66], [x + w * 0.7, y + h * 0.52], [x + w * 0.88, y + h * 0.8]], { backgroundColor: '#ced4da', strokeColor: GREY, fillStyle: 'solid', roughness: 0.4 });
  return b.ellipse(x + w * 0.66, y + h * 0.18, w * 0.12, w * 0.12, { backgroundColor: '#ffd43b', strokeColor: '#f08c00', fillStyle: 'solid', roughness: 0.3 });
}

// ───────────────────────────── Sales & CRM ─────────────────────────────
const crm: BuiltinDef[] = [
  {
    id: 'sales-cloud',
    name: 'Sales Cloud (CRM)',
    build: (b) => {
      b.figure('cloud', 0, 0, 340, 220, { backgroundColor: C.blue[1], strokeColor: C.blue[0], fillStyle: 'solid', roughness: 0.7 });
      b.label('Sales Cloud', 170, 74, { size: 22, bold: true, color: C.blue[0] });
      pillRow(b, 170, 104, [['Leads', 'orange'], ['Accounts', 'violet'], ['Deals', 'green']]);
      return pillRow(b, 170, 138, [['Contacts', 'teal'], ['Reports', 'grey']]);
    },
  },
  {
    id: 'sales-campaign',
    name: 'Campaign',
    build: (b) =>
      record(b, 'Campaign', 'C', 'orange', [
        ['Name', 'Spring launch'],
        ['Type', 'Social media'],
        ['Channel', 'LinkedIn'],
        ['Budget', '$25,000'],
        ['Leads', '412'],
        ['Status', '[Active]'],
      ], { badgeHue: 'green' }),
  },
  {
    id: 'sales-channels',
    name: 'Campaign channels',
    build: (b) => {
      const channels: Array<[string, Hue]> = [['Facebook', 'blue'], ['LinkedIn', 'blue'], ['Instagram', 'violet'], ['Google Ads', 'green'], ['Email', 'orange'], ['Webinar', 'teal']];
      channels.forEach(([name, hue], i) => {
        const y = i * 40;
        // each arrow starts at its own badge's edge
        const w = pill(b, 0, y, name, hue, { size: 14, h: 30 });
        b.arrow([[w + 4, y + 15], [200, 120]], { strokeColor: GREY, roughness: 0.6 });
      });
      node(b, 200, 92, 130, 56, 'Campaign', 'orange', 16);
      b.arrow([[330, 120], [390, 120]], { roughness: 0.6 });
      return node(b, 390, 92, 110, 56, 'Leads', 'yellow', 16);
    },
  },
  {
    id: 'sales-lead',
    name: 'Lead',
    build: (b) =>
      record(b, 'Lead', 'L', 'yellow', [
        ['Name', 'Jane Doe'],
        ['Company', 'Acme Corp'],
        ['Email', 'jane@acme.com'],
        ['Source', 'Webinar'],
        ['Rating', 'Hot'],
        ['Status', '[Contacted]'],
      ], { badgeHue: 'blue' }),
  },
  {
    id: 'sales-lead-status',
    name: 'Lead status badges',
    build: (b) => {
      let x = 0;
      for (const [t, hue] of [['New', 'grey'], ['Contacted', 'blue'], ['Qualified', 'violet']] as Array<[string, Hue]>) x += pill(b, x, 0, t, hue) + 10;
      x = 0;
      for (const [t, hue] of [['Converted', 'green'], ['Closed – lost', 'red'], ['Nurturing', 'yellow']] as Array<[string, Hue]>) x += pill(b, x, 40, t, hue) + 10;
      return b;
    },
  },
  {
    id: 'sales-lead-lifecycle',
    name: 'Lead lifecycle',
    build: (b) => {
      chevrons(b, 0, 0, [['New', 'grey'], ['Contacted', 'blue'], ['Qualified', 'violet'], ['Converted', 'green']]);
      b.arrow([[180, 56], [180, 110]], { strokeColor: C.red[0], roughness: 0.6 });
      b.arrow([[298, 56], [258, 110]], { strokeColor: C.red[0], roughness: 0.6 });
      node(b, 140, 110, 160, 44, 'Closed – not a fit', 'red', 14);
      return b.text('or unqualified', 152, 160, { size: 12, color: GREY });
    },
  },
  {
    id: 'sales-lead-conversion',
    name: 'Lead conversion',
    build: (b) => {
      node(b, 0, 96, 110, 56, 'Lead', 'yellow', 17);
      b.label('Convert', 160, 112, { size: 13, color: GREY, italic: true });
      [['Account', 'violet', 20], ['Contact', 'teal', 96], ['Opportunity', 'green', 172]].forEach(([name, hue, y]) => {
        b.arrow([[110, 124], [220, (y as number) + 26]], { roughness: 0.6 });
        node(b, 220, y as number, 140, 52, name as string, hue as Hue, 16);
      });
      return b;
    },
  },
  {
    id: 'sales-account',
    name: 'Account',
    build: (b) =>
      record(b, 'Account', 'A', 'violet', [
        ['Name', 'Acme Corp'],
        ['Industry', 'Manufacturing'],
        ['Type', '[Customer]'],
        ['Revenue', '$12M / year'],
        ['Employees', '850'],
        ['Owner', 'Alex Kim'],
      ], { badgeHue: 'green' }),
  },
  {
    id: 'sales-contact',
    name: 'Contact',
    build: (b) => {
      b.rect(0, 0, 280, 210, { rounded: true, backgroundColor: '#ffffff', fillStyle: 'solid', roughness: 0.6 });
      avatar(b, 16, 16, 60, 'teal');
      b.text('Jane Doe', 92, 24, { size: 18, bold: true });
      b.text('Head of Operations', 92, 50, { size: 13, color: GREY });
      ([['Account', 'Acme Corp'], ['Email', 'jane@acme.com'], ['Phone', '+1 555 0100'], ['Role', 'Decision maker']] as Array<[string, string]>).forEach(([k, v], i) => {
        b.textMid(k, 16, 104 + i * 26, { size: 13, color: GREY });
        b.textMid(v, 100, 104 + i * 26, { size: 14 });
      });
      return b;
    },
  },
  {
    id: 'sales-opportunity',
    name: 'Opportunity / deal',
    build: (b) =>
      record(b, 'Opportunity', '$', 'green', [
        ['Name', 'Acme – 500 seats'],
        ['Account', 'Acme Corp'],
        ['Amount', '$48,000'],
        ['Stage', '[Proposal]'],
        ['Probability', '60%'],
        ['Close date', '30 Dec'],
      ], { badgeHue: 'violet' }),
  },
  {
    id: 'sales-pipeline',
    name: 'Deal pipeline board',
    build: (b) => {
      const cols: Array<[string, Hue, string[]]> = [
        ['Prospecting', 'grey', ['Globex · $12k', 'Initech · $8k', 'Umbrella · $20k']],
        ['Qualification', 'blue', ['Acme · $48k', 'Hooli · $15k']],
        ['Proposal', 'violet', ['Stark · $90k', 'Wayne · $33k']],
        ['Negotiation', 'orange', ['Soylent · $27k']],
        ['Closed won', 'green', ['Wonka · $60k', 'Tyrell · $18k']],
      ];
      cols.forEach(([name, hue, deals], i) => {
        const x = i * 150;
        b.rect(x, 0, 140, 250, { backgroundColor: C.grey[1], strokeColor: LINE, fillStyle: 'solid', roughness: 0.4 });
        b.rect(x, 0, 140, 34, { backgroundColor: C[hue][1], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.4 });
        b.label(`${name} (${deals.length})`, x + 70, 17, { size: 13, bold: true, color: C[hue][0] });
        deals.forEach((d, j) => b.box('rectangle', x + 8, 44 + j * 50, 124, 40, d, { rounded: true, backgroundColor: '#ffffff', fillStyle: 'solid', roughness: 0.5, size: 13 }));
      });
      return b;
    },
  },
  {
    id: 'sales-funnel',
    name: 'Sales funnel',
    build: (b) => {
      const stages: Array<[string, string, Hue]> = [
        ['Leads', '1,000', 'blue'],
        ['Marketing qualified', '400', 'teal'],
        ['Sales qualified', '150', 'violet'],
        ['Opportunities', '60', 'orange'],
        ['Customers', '18', 'green'],
      ];
      const h = 46;
      stages.forEach(([label, n, hue], i) => {
        const top = 360 - i * 64;
        const bottom = 360 - (i + 1) * 64;
        const y = i * (h + 4);
        b.polygon([[180 - top / 2, y], [180 + top / 2, y], [180 + bottom / 2, y + h], [180 - bottom / 2, y + h]], { backgroundColor: C[hue][1], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.5 });
        b.label(n, 180, y + h / 2, { size: 15, bold: true, color: C[hue][0] });
        b.textMid(label, 380, y + h / 2, { size: 14 });
      });
      return b;
    },
  },
  {
    id: 'sales-stages',
    name: 'Sales stages',
    build: (b) => chevrons(b, 0, 0, [['Prospect', 'grey'], ['Qualify', 'blue'], ['Demo', 'teal'], ['Proposal', 'violet'], ['Negotiate', 'orange'], ['Close', 'green']], 124, 52, 14),
  },
  {
    id: 'sales-data-model',
    name: 'CRM data model',
    build: (b) => {
      const box = (x: number, y: number, t: string, hue: Hue) => node(b, x, y, 130, 48, t, hue, 15);
      box(0, 0, 'Lead', 'yellow');
      box(220, 0, 'Account', 'violet');
      box(0, 130, 'Contact', 'teal');
      box(220, 130, 'Opportunity', 'green');
      box(440, 130, 'Product', 'blue');
      box(220, 260, 'Quote', 'orange');
      box(440, 0, 'Campaign', 'red');
      const rel = (pts: Pt[], a: string, z: string, ax: number, ay: number, zx: number, zy: number) => {
        b.line(pts, { sharp: true, roughness: 0.5 });
        b.label(a, ax, ay, { size: 12, color: GREY });
        b.label(z, zx, zy, { size: 12, color: GREY });
      };
      b.arrow([[130, 24], [220, 24]], { strokeColor: GREY, strokeStyle: 'dashed', roughness: 0.5 });
      b.label('converts to', 175, 10, { size: 11, color: GREY, italic: true });
      rel([[250, 48], [100, 130]], '1', '*', 238, 62, 112, 116);
      rel([[285, 48], [285, 130]], '1', '*', 296, 62, 296, 116);
      rel([[350, 154], [440, 154]], '*', '*', 364, 142, 426, 142);
      rel([[285, 178], [285, 260]], '1', '*', 296, 192, 296, 246);
      rel([[505, 48], [505, 130]], '1', '*', 516, 62, 516, 116);
      return b;
    },
  },
  {
    id: 'sales-activity',
    name: 'Activity timeline',
    build: (b) => {
      const items: Array<[string, string, string, Hue]> = [
        ['Call', 'Intro call with Jane', 'Mon 10:00', 'blue'],
        ['Email', 'Sent pricing overview', 'Tue 14:20', 'orange'],
        ['Meeting', 'Product demo (45 min)', 'Thu 11:00', 'violet'],
        ['Proposal', 'Quote Q-1042 sent', 'Fri 16:30', 'green'],
      ];
      b.line([[16, 16], [16, 16 + (items.length - 1) * 64]], { strokeColor: LINE, strokeWidth: 2, roughness: 0.3 });
      items.forEach(([kind, what, when, hue], i) => {
        const y = i * 64;
        b.ellipse(4, y + 4, 24, 24, { backgroundColor: C[hue][0], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.3 });
        b.text(kind, 44, y, { size: 15, bold: true, color: C[hue][0] });
        b.text(what, 44, y + 22, { size: 14 });
        b.text(when, 250, y + 2, { size: 12, color: GREY });
      });
      return b;
    },
  },
  {
    id: 'sales-team',
    name: 'Sales team',
    build: (b) => {
      ([['Sales rep', 'blue'], ['Sales manager', 'violet'], ['Customer', 'green']] as Array<[string, Hue]>).forEach(([who, hue], i) => {
        avatar(b, i * 130 + 20, 0, 70, hue);
        b.label(who, i * 130 + 55, 90, { size: 14 });
      });
      return b;
    },
  },
];

// ───────────────────────────── Dashboards & charts ─────────────────────────────
const charts: BuiltinDef[] = [
  { id: 'sales-kpi', name: 'KPI tile', build: (b) => kpi(b, 0, 0, 'Revenue (this quarter)', '$1.24M', '12% vs last quarter', true, 210) },
  {
    id: 'sales-kpi-row',
    name: 'KPI row',
    build: (b) => {
      kpi(b, 0, 0, 'Revenue', '$1.24M', '12%');
      kpi(b, 194, 0, 'Deals won', '86', '9%');
      kpi(b, 388, 0, 'Win rate', '31%', '2 pts', false);
      return kpi(b, 582, 0, 'Avg deal size', '$14.4k', '5%');
    },
  },
  {
    id: 'sales-bar-chart',
    name: 'Bar chart (sales by quarter)',
    build: (b) => {
      b.text('Sales by quarter', 0, 0, { size: 16, bold: true });
      axes(b, 40, 36, 300, 180, ['0', '100k', '200k', '300k']);
      return bars(b, 40, 36, 300, 180, [['Q1', 180], ['Q2', 220], ['Q3', 195], ['Q4', 280]], 300);
    },
  },
  {
    id: 'sales-line-chart',
    name: 'Line chart (monthly trend)',
    build: (b) => {
      b.text('Monthly revenue', 0, 0, { size: 16, bold: true });
      axes(b, 40, 36, 320, 180, ['0', '50k', '100k', '150k']);
      const vals = [62, 70, 66, 84, 95, 90, 112, 120];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
      const pts: Pt[] = vals.map((v, i) => [40 + 20 + i * 40, 36 + 180 - (v / 150) * 180]);
      b.line(pts, { strokeColor: C.blue[0], strokeWidth: 2.5, roughness: 0.6 });
      pts.forEach(([x, y], i) => {
        b.ellipse(x - 4, y - 4, 8, 8, { backgroundColor: C.blue[0], strokeColor: C.blue[0], fillStyle: 'solid', roughness: 0 });
        b.label(months[i], x, 230, { size: 11, color: GREY });
      });
      return b;
    },
  },
  {
    id: 'sales-pie',
    name: 'Pie chart (revenue by region)',
    build: (b) => pie(b, [['Americas', 45, 'blue'], ['Europe', 30, 'green'], ['Asia Pacific', 18, 'orange'], ['Other', 7, 'grey']]),
  },
  {
    id: 'sales-donut',
    name: 'Donut chart (deals by source)',
    build: (b) => pie(b, [['Inbound', 38, 'violet'], ['Outbound', 27, 'blue'], ['Partners', 20, 'teal'], ['Events', 15, 'yellow']], { donut: true, center: '214' }),
  },
  {
    id: 'sales-gauge',
    name: 'Quota attainment gauge',
    build: (b) => {
      const cx = 120;
      const cy = 120;
      const pct = 0.72;
      b.polygon(wedge(cx, cy, 110, Math.PI, Math.PI * 2, 72), { backgroundColor: C.grey[1], strokeColor: LINE, fillStyle: 'solid', roughness: 0.3 });
      b.polygon(wedge(cx, cy, 110, Math.PI, Math.PI * (1 + pct), 72), { backgroundColor: C.green[0], strokeColor: C.green[0], fillStyle: 'solid', roughness: 0.3 });
      b.label('72%', cx, cy - 26, { size: 26, bold: true });
      b.label('of quota', cx, cy - 2, { size: 13, color: GREY });
      b.label('0', cx - 92, cy + 12, { size: 11, color: GREY });
      return b.label('$500k', cx + 92, cy + 12, { size: 11, color: GREY });
    },
  },
  {
    id: 'sales-forecast',
    name: 'Forecast bar',
    build: (b) => {
      const parts: Array<[string, number, Hue]> = [['Closed', 320, 'green'], ['Commit', 140, 'blue'], ['Best case', 90, 'violet'], ['Pipeline', 150, 'grey']];
      const total = 700;
      b.text('Q4 forecast vs target $600k', 0, 0, { size: 15, bold: true });
      let x = 0;
      parts.forEach(([, v, hue]) => {
        const w = (v / total) * 460;
        b.rect(x, 30, w, 40, { backgroundColor: C[hue][0], strokeColor: '#ffffff', fillStyle: 'solid', roughness: 0.3 });
        x += w;
      });
      const tx = (600 / total) * 460;
      b.line([[tx, 22], [tx, 78]], { strokeColor: C.red[0], strokeWidth: 2.5, roughness: 0.3 });
      b.label('Target', tx, 90, { size: 12, color: C.red[0] });
      x = 0;
      parts.forEach(([label, v, hue]) => {
        b.rect(x, 110, 12, 12, { backgroundColor: C[hue][0], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0 });
        b.textMid(`${label} $${v}k`, x + 18, 116, { size: 13 });
        x += 118;
      });
      return b;
    },
  },
  {
    id: 'sales-leaderboard',
    name: 'Sales leaderboard',
    build: (b) =>
      b.table(0, 0, [
        ['#', 'Sales rep', 'Deals won', 'Revenue', 'Quota'],
        ['1', 'Alex Kim', '24', '$312k', '124%'],
        ['2', 'Maria Lopez', '21', '$287k', '108%'],
        ['3', 'Sam Patel', '18', '$240k', '96%'],
        ['4', 'Chris Ng', '15', '$198k', '82%'],
      ], [36, 130, 90, 90, 70]),
  },
  {
    id: 'sales-stats',
    name: 'Statistics table',
    build: (b) =>
      b.table(0, 0, [
        ['Metric', 'This month', 'Last month', 'Change'],
        ['New leads', '1,240', '1,090', '▲ 13.8%'],
        ['Conversion rate', '4.2%', '3.9%', '▲ 0.3 pts'],
        ['Avg deal size', '$14.4k', '$15.1k', '▼ 4.6%'],
        ['Sales cycle', '38 days', '41 days', '▲ 3 days faster'],
        ['Churn', '1.8%', '2.1%', '▲ 0.3 pts better'],
      ], [150, 100, 100, 140]),
  },
  {
    id: 'sales-target-actual',
    name: 'Target vs actual',
    build: (b) => {
      const rows: Array<[string, number, number]> = [['North', 82, 100], ['South', 104, 100], ['East', 67, 100], ['West', 93, 100]];
      rows.forEach(([name, actual], i) => {
        const y = i * 42;
        b.textMid(name, 0, y + 14, { size: 14 });
        b.rect(70, y, 300, 28, { backgroundColor: C.grey[1], strokeColor: LINE, fillStyle: 'solid', roughness: 0.3 });
        const hue: Hue = actual >= 100 ? 'green' : actual >= 80 ? 'blue' : 'orange';
        b.rect(70, y + 6, Math.min(1.15, actual / 100) * 260, 16, { backgroundColor: C[hue][0], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.3 });
        b.line([[330, y - 3], [330, y + 31]], { strokeColor: INK, strokeWidth: 2.5, roughness: 0.2 });
        b.textMid(`${actual}%`, 382, y + 14, { size: 13, color: GREY });
      });
      return b.label('Target', 330, rows.length * 42 + 6, { size: 12, color: GREY });
    },
  },
  {
    id: 'sales-dashboard',
    name: 'Sales dashboard',
    build: (b) => {
      b.rect(0, 0, 820, 470, { rounded: true, backgroundColor: '#f8f9fa', fillStyle: 'solid', roughness: 0.5 });
      b.rect(0, 0, 820, 48, { backgroundColor: C.blue[0], strokeColor: C.blue[0], fillStyle: 'solid', roughness: 0.4 });
      b.textMid('Sales dashboard', 20, 24, { size: 18, bold: true, color: '#ffffff' });
      b.textMid('This quarter ▾', 690, 24, { size: 14, color: '#ffffff' });
      kpi(b, 20, 66, 'Revenue', '$1.24M', '12%');
      kpi(b, 216, 66, 'Deals won', '86', '9%');
      kpi(b, 412, 66, 'Win rate', '31%', '2 pts', false);
      kpi(b, 608, 66, 'Pipeline', '$3.8M', '18%', true, 192);
      b.rect(20, 186, 400, 264, { rounded: true, backgroundColor: '#ffffff', fillStyle: 'solid', roughness: 0.5 });
      b.text('Revenue by month', 36, 198, { size: 14, bold: true });
      axes(b, 70, 232, 330, 170, ['0', '200k', '400k']);
      bars(b, 70, 232, 330, 170, [['Jul', 260], ['Aug', 310], ['Sep', 285], ['Oct', 350], ['Nov', 380], ['Dec', 330]], 400);
      b.rect(436, 186, 364, 264, { rounded: true, backgroundColor: '#ffffff', fillStyle: 'solid', roughness: 0.5 });
      b.text('Deals by stage', 452, 198, { size: 14, bold: true });
      const stages: Array<[string, number, Hue]> = [['Qualify', 34, 'blue'], ['Proposal', 22, 'violet'], ['Negotiate', 14, 'orange'], ['Won', 30, 'green']];
      let a = -Math.PI / 2;
      stages.forEach(([label, v, hue], i) => {
        const a1 = a + (v / 100) * Math.PI * 2;
        b.polygon(wedge(540, 330, 78, a, a1, 42), { backgroundColor: C[hue][0], strokeColor: '#ffffff', fillStyle: 'solid', roughness: 0.3, strokeWidth: 2 });
        a = a1;
        b.rect(642, 284 + i * 26, 12, 12, { backgroundColor: C[hue][0], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0 });
        b.textMid(`${label} ${v}%`, 660, 290 + i * 26, { size: 13 });
      });
      return b;
    },
  },
];

// ───────────────────────────── Products, inventory & CPQ ─────────────────────────────
const products: BuiltinDef[] = [
  {
    id: 'sales-product',
    name: 'Product card',
    build: (b) => {
      b.rect(0, 0, 220, 300, { rounded: true, backgroundColor: '#ffffff', fillStyle: 'solid', roughness: 0.6 });
      picture(b, 14, 14, 192, 130);
      b.text('Pro Laptop 14"', 14, 156, { size: 17, bold: true });
      b.text('SKU  LAP-14-PRO', 14, 182, { size: 12, color: GREY });
      b.text('Category  Computers', 14, 200, { size: 12, color: GREY });
      b.text('$1,299', 14, 226, { size: 22, bold: true, color: C.blue[0] });
      pill(b, 14, 262, 'In stock · 42', 'green', { size: 12, h: 24 });
      return b;
    },
  },
  {
    id: 'sales-catalog',
    name: 'Product catalogue (categories)',
    build: (b) => {
      node(b, 200, 0, 140, 46, 'Catalogue', 'grey', 16);
      const cats: Array<[string, Hue, string[]]> = [
        ['Hardware', 'blue', ['Laptops', 'Monitors']],
        ['Software', 'violet', ['Licences', 'Add-ons']],
        ['Services', 'teal', ['Support', 'Training']],
      ];
      cats.forEach(([cat, hue, items], i) => {
        const x = i * 190;
        b.line([[270, 46], [270, 70], [x + 70, 70], [x + 70, 92]], { sharp: true, roughness: 0.4 });
        node(b, x, 92, 140, 44, cat, hue, 15);
        items.forEach((it, j) => {
          const y = 160 + j * 48;
          b.line([[x + 20, 136], [x + 20, y + 18], [x + 34, y + 18]], { sharp: true, strokeColor: GREY, roughness: 0.4 });
          b.box('rectangle', x + 34, y, 112, 36, it, { rounded: true, backgroundColor: '#ffffff', fillStyle: 'solid', roughness: 0.5, size: 14 });
        });
      });
      return b;
    },
  },
  {
    id: 'sales-inventory',
    name: 'Inventory levels',
    build: (b) => {
      // warehouse
      b.polygon([[0, 50], [60, 10], [120, 50], [120, 130], [0, 130]], { backgroundColor: C.orange[1], strokeColor: C.orange[0], fillStyle: 'solid', roughness: 0.6 });
      b.rect(36, 78, 48, 52, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: C.orange[0], roughness: 0.5 });
      [92, 106, 120].forEach((y) => b.line([[36, y], [84, y]], { strokeColor: C.orange[0], roughness: 0.3 }));
      b.label('Warehouse', 60, 148, { size: 13 });
      const rows: Array<[string, number, string, Hue]> = [
        ['Laptops', 0.82, '412 in stock', 'green'],
        ['Monitors', 0.24, '38 · low stock', 'orange'],
        ['Docks', 0, 'Out of stock', 'red'],
      ];
      rows.forEach(([name, level, note, hue], i) => {
        const y = 14 + i * 44;
        b.textMid(name, 150, y + 10, { size: 14, bold: true });
        b.rect(240, y, 180, 20, { backgroundColor: C.grey[1], strokeColor: LINE, fillStyle: 'solid', roughness: 0.3 });
        if (level > 0) b.rect(240, y, 180 * level, 20, { backgroundColor: C[hue][0], strokeColor: C[hue][0], fillStyle: 'solid', roughness: 0.3 });
        b.textMid(note, 432, y + 10, { size: 13, color: C[hue][0] });
      });
      return b;
    },
  },
  {
    id: 'sales-inventory-table',
    name: 'Inventory table',
    build: (b) =>
      b.table(0, 0, [
        ['SKU', 'Product', 'On hand', 'Reorder at', 'Status'],
        ['LAP-14-PRO', 'Pro Laptop 14"', '412', '100', 'In stock'],
        ['MON-27-4K', '27" 4K monitor', '38', '50', 'Low stock'],
        ['DOC-USB-C', 'USB-C dock', '0', '40', 'Out of stock'],
        ['KEY-WL', 'Wireless keyboard', '260', '80', 'In stock'],
      ], [110, 150, 80, 90, 100]),
  },
  {
    id: 'sales-price-book',
    name: 'Price book',
    build: (b) =>
      b.table(0, 0, [
        ['Product', 'List price', 'Discount', 'Net price'],
        ['Pro Laptop 14"', '$1,299', '10%', '$1,169'],
        ['27" 4K monitor', '$449', '5%', '$427'],
        ['Premium support (1 yr)', '$199', '0%', '$199'],
        ['Onboarding (per day)', '$1,200', '15%', '$1,020'],
      ], [190, 100, 90, 100]),
  },
  {
    id: 'sales-cpq',
    name: 'CPQ flow',
    build: (b) => {
      chevrons(b, 0, 0, [['Configure', 'blue'], ['Price', 'violet'], ['Quote', 'orange'], ['Approve', 'yellow'], ['Order', 'green']], 132, 54, 14);
      const notes = ['pick products\n& options', 'price book,\ndiscounts', 'generate\nthe document', 'discount\nsign-off', 'contract\n& invoice'];
      notes.forEach((t, i) => b.label(t, i * 120 + 64, 82, { size: 12, color: GREY }));
      return b;
    },
  },
  {
    id: 'sales-quote',
    name: 'Quote document',
    build: (b) => {
      b.figure('fc-document', 0, 0, 340, 440, { backgroundColor: '#ffffff', fillStyle: 'solid', roughness: 0.6 });
      b.text('QUOTE', 20, 18, { size: 22, bold: true, color: C.blue[0] });
      b.text('Q-1042  ·  valid until 31 Dec', 20, 50, { size: 12, color: GREY });
      b.text('For: Acme Corp', 20, 74, { size: 14 });
      b.table(20, 104, [
        ['Item', 'Qty', 'Price'],
        ['Pro Laptop 14"', '20', '$23,380'],
        ['Premium support', '20', '$3,980'],
        ['Onboarding', '2', '$2,040'],
      ], [150, 50, 100], { fontSize: 13 });
      b.line([[190, 260], [320, 260]], { roughness: 0.3 });
      b.textMid('Total', 190, 280, { size: 15, bold: true });
      b.textMid('$29,400', 250, 280, { size: 15, bold: true });
      return b.box('rectangle', 26, 300, 120, 34, 'APPROVED', { rounded: true, strokeColor: C.green[0], strokeWidth: 2.5, color: C.green[0], bold: true, size: 15, roughness: 0.8, angle: -0.12 });
    },
  },
  {
    id: 'sales-quote-to-cash',
    name: 'Quote-to-cash',
    build: (b) => {
      const steps: Array<[string, Hue]> = [['Opportunity', 'green'], ['Quote', 'orange'], ['Contract', 'violet'], ['Order', 'blue'], ['Invoice', 'teal'], ['Payment', 'green']];
      steps.forEach(([s, hue], i) => {
        node(b, i * 140, 0, 110, 50, s, hue, 14);
        if (i < steps.length - 1) b.arrow([[i * 140 + 110, 25], [i * 140 + 140, 25]], { roughness: 0.5 });
      });
      b.arrow([[(steps.length - 1) * 140 + 55, 50], [(steps.length - 1) * 140 + 55, 86], [55, 86], [55, 50]], { strokeColor: GREY, strokeStyle: 'dashed', roughness: 0.4 });
      return b.label('renewal / upsell', ((steps.length - 1) * 140 + 110) / 2, 100, { size: 12, color: GREY, italic: true });
    },
  },
  {
    id: 'sales-order',
    name: 'Order',
    build: (b) =>
      record(b, 'Order SO-2291', 'O', 'blue', [
        ['Account', 'Acme Corp'],
        ['Quote', 'Q-1042'],
        ['Total', '$29,400'],
        ['Ship by', '15 Jan'],
        ['Status', '[Fulfilled]'],
      ], { badgeHue: 'green' }),
  },
  {
    id: 'sales-discount-approval',
    name: 'Discount approval',
    build: (b) => {
      node(b, 0, 46, 120, 50, 'Quote ready', 'orange', 14);
      b.arrow([[120, 71], [170, 71]], { roughness: 0.5 });
      b.diamond(170, 16, 170, 110, { backgroundColor: C.yellow[1], strokeColor: C.yellow[0], fillStyle: 'solid', roughness: 0.6 });
      b.label('Discount\nover 20%?', 255, 71, { size: 14, bold: true });
      // yes: a manager signs off first
      b.arrow([[340, 71], [400, 71]], { roughness: 0.5 });
      b.label('yes', 368, 58, { size: 12, color: GREY });
      node(b, 400, 46, 150, 50, 'Manager approval', 'red', 14);
      // no: approved automatically
      b.arrow([[255, 126], [255, 176]], { roughness: 0.5 });
      b.label('no – auto-approved', 316, 150, { size: 12, color: GREY });
      node(b, 180, 176, 150, 48, 'Send to customer', 'green', 14);
      b.arrow([[475, 96], [475, 200], [330, 200]], { roughness: 0.5 });
      b.label('approved', 506, 150, { size: 12, color: GREY });
      b.arrow([[550, 60], [600, 60], [600, 6], [60, 6], [60, 46]], { strokeColor: C.red[0], strokeStyle: 'dashed', roughness: 0.4 });
      return b.label('rejected – revise the quote', 330, -8, { size: 12, color: C.red[0] });
    },
  },
];

export const SALES_SECTIONS: Array<{ name: string; items: BuiltinDef[] }> = [
  { name: 'Sales & CRM', items: crm },
  { name: 'Sales dashboards & charts', items: charts },
  { name: 'Products, inventory & CPQ', items: products },
];
