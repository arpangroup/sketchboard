import type { LibraryItem } from '../core/types';
import { ItemBuilder } from './ItemBuilder';
import { SALES_SECTIONS } from './builtinSales';
import { normalizeItemElements } from './libraryFormat';

/**
 * The built-in "SketchBoard library": ready-made diagram parts grouped in sections.
 * Items are generated (not stored as JSON), so they always match the current element model,
 * and they're built lazily the first time the library is opened.
 *
 * To add an item: add an entry to a section below — `build` gets a fresh ItemBuilder.
 */
interface Def {
  id: string;
  name: string;
  build: (b: ItemBuilder) => ItemBuilder;
}
export type BuiltinDef = Def;

export const BUILTIN_SECTIONS: Array<{ name: string; items: Def[] }> = [];
const section = (name: string, items: Def[]) => BUILTIN_SECTIONS.push({ name, items });

const GREY = '#868e96';
const BLUE = '#1971c2';
const BLUE_FILL = '#a5d8ff';
const GREEN = '#2f9e44';

/** Cylinder (database symbol). */
function cylinder(b: ItemBuilder, x: number, y: number, w: number, h: number, label: string, fill = 'transparent') {
  const ry = Math.min(14, h * 0.12);
  const bottom: Array<[number, number]> = Array.from({ length: 9 }, (_, i) => {
    const t = (i / 8) * Math.PI;
    return [x + w / 2 - (w / 2) * Math.cos(t), y + h - ry + ry * Math.sin(t)];
  });
  if (fill !== 'transparent') b.rect(x, y + ry, w, h - 2 * ry, { backgroundColor: fill, strokeColor: 'transparent', fillStyle: 'hachure' });
  b.line([[x, y + ry], [x, y + h - ry]]);
  b.line([[x + w, y + ry], [x + w, y + h - ry]]);
  b.line(bottom);
  b.ellipse(x, y, w, ry * 2, { backgroundColor: fill, fillStyle: 'hachure' });
  if (label) b.label(label, x + w / 2, y + h / 2 + ry / 2);
  return b;
}

/** UML class-like box with compartments; `parts[0]` is the (possibly multi-line) title. */
function compartments(b: ItemBuilder, parts: string[], o: { width?: number; italicTitle?: boolean } = {}) {
  const w = o.width ?? 220;
  const pad = 10;
  const heights = parts.map((p, i) => ItemBuilder.measure(p, i === 0 ? 17 : 15).height + pad * 2);
  const total = heights.reduce((a, c) => a + c, 0);
  b.rect(0, 0, w, total, { backgroundColor: '#fff9db', fillStyle: 'solid' });
  let y = 0;
  parts.forEach((p, i) => {
    if (i > 0) b.line([[0, y], [w, y]]);
    if (i === 0) b.label(p, w / 2, y + heights[0] / 2, { size: 17, bold: !o.italicTitle, italic: o.italicTitle });
    else b.text(p, pad, y + pad, { size: 15 });
    y += heights[i];
  });
  return b;
}

function checkbox(b: ItemBuilder, x: number, y: number, label: string, checked: boolean) {
  b.rect(x, y, 18, 18, { roughness: 0.5 });
  if (checked) b.line([[x + 4, y + 9], [x + 8, y + 14], [x + 15, y + 4]], { sharp: true, strokeColor: BLUE, strokeWidth: 2 });
  return b.textMid(label, x + 28, y + 9);
}

function radio(b: ItemBuilder, x: number, y: number, label: string, selected: boolean) {
  b.ellipse(x, y, 18, 18, { roughness: 0.5 });
  if (selected) b.ellipse(x + 5, y + 5, 8, 8, { backgroundColor: BLUE, strokeColor: BLUE, roughness: 0 });
  return b.textMid(label, x + 28, y + 9);
}

function input(b: ItemBuilder, x: number, y: number, label: string, value: string, o: { w?: number; muted?: boolean } = {}) {
  const w = o.w ?? 260;
  b.text(label, x, y, { size: 14 });
  b.rect(x, y + 24, w, 38, { rounded: true, roughness: 0.6 });
  return b.textMid(value, x + 12, y + 43, { size: 15, color: o.muted === false ? '#1e1e1e' : GREY });
}

function button(b: ItemBuilder, x: number, y: number, w: number, text: string, primary = true) {
  return b.box('rectangle', x, y, w, 40, text, primary
    ? { rounded: true, backgroundColor: BLUE, strokeColor: BLUE, fillStyle: 'solid', color: '#ffffff', bold: true, roughness: 0.6 }
    : { rounded: true, roughness: 0.6, bold: true });
}

function stickFigure(b: ItemBuilder, x: number, y: number, label: string) {
  b.ellipse(x + 12, y, 26, 26);
  b.line([[x + 25, y + 26], [x + 25, y + 62]]);
  b.line([[x + 4, y + 38], [x + 46, y + 38]]);
  b.line([[x + 25, y + 62], [x + 8, y + 90]]);
  b.line([[x + 25, y + 62], [x + 42, y + 90]]);
  if (label) b.label(label, x + 25, y + 104);
  return b;
}

// ───────────────────────────── Database ─────────────────────────────
section('Database', [
  { id: 'db-cylinder', name: 'Database', build: (b) => cylinder(b, 0, 0, 110, 130, 'Database') },
  {
    id: 'db-entity',
    name: 'Entity / table',
    build: (b) =>
      b.text('users', 0, 0, { size: 18, bold: true }).table(0, 30, [
        ['Column', 'Type'],
        ['id  (PK)', 'uuid'],
        ['email', 'varchar(255)'],
        ['created_at', 'timestamp'],
      ], [120, 120]),
  },
  {
    id: 'db-one-many',
    name: 'One-to-many',
    build: (b) => b.line([[0, 30], [180, 30]], { startArrowhead: 'bar', endArrowhead: 'arrow' }).text('1', 8, 0, { size: 14 }).text('N', 150, 0, { size: 14 }),
  },
  {
    id: 'db-many-many',
    name: 'Many-to-many',
    build: (b) => b.line([[0, 30], [180, 30]], { startArrowhead: 'arrow', endArrowhead: 'arrow' }).text('N', 22, 0, { size: 14 }).text('M', 148, 0, { size: 14 }),
  },
  { id: 'db-cache', name: 'Cache', build: (b) => cylinder(b, 0, 0, 100, 90, 'Cache', '#ffc9c9') },
  {
    id: 'db-replica',
    name: 'Primary + replica',
    build: (b) => {
      cylinder(b, 0, 0, 100, 110, 'Primary', '#b2f2bb');
      cylinder(b, 200, 0, 100, 110, 'Replica');
      return b.arrow([[110, 58], [190, 58]], { strokeStyle: 'dashed' }).label('replication', 150, 40, { size: 13, color: GREY });
    },
  },
  {
    id: 'db-documents',
    name: 'Document store',
    build: (b) => b.rect(16, 0, 140, 90).rect(8, 8, 140, 90, { backgroundColor: '#ffffff' }).box('rectangle', 0, 16, 140, 90, 'Collection', { backgroundColor: '#ffffff' }),
  },
]);

// ───────────────────────────── UML / class diagrams ─────────────────────────────
section('UML & class diagrams', [
  { id: 'uml-class', name: 'Class', build: (b) => compartments(b, ['User', '- id: string\n- email: string', '+ save(): void\n+ findById(id): User']) },
  { id: 'uml-interface', name: 'Interface', build: (b) => compartments(b, ['«interface»\nRepository<T>', '+ find(id): T\n+ save(item: T): void']) },
  { id: 'uml-abstract', name: 'Abstract class', build: (b) => compartments(b, ['Shape', '# x: number\n# y: number', '+ area(): number\n+ draw(): void'], { italicTitle: true }) },
  { id: 'uml-enum', name: 'Enumeration', build: (b) => compartments(b, ['«enumeration»\nStatus', 'ACTIVE\nSUSPENDED\nDELETED'], { width: 180 }) },
  { id: 'uml-inheritance', name: 'Inheritance (extends)', build: (b) => b.arrow([[0, 0], [160, 0]], { endArrowhead: 'triangle_outline' }) },
  { id: 'uml-realization', name: 'Realization (implements)', build: (b) => b.arrow([[0, 0], [160, 0]], { endArrowhead: 'triangle_outline', strokeStyle: 'dashed' }) },
  { id: 'uml-association', name: 'Association', build: (b) => b.arrow([[0, 30], [160, 30]]).text('1', 6, 0, { size: 14 }).text('*', 128, 0, { size: 14 }) },
  { id: 'uml-dependency', name: 'Dependency', build: (b) => b.arrow([[0, 0], [160, 0]], { strokeStyle: 'dashed' }) },
  { id: 'uml-aggregation', name: 'Aggregation', build: (b) => b.line([[0, 0], [160, 0]], { startArrowhead: 'diamond_outline' }) },
  { id: 'uml-composition', name: 'Composition', build: (b) => b.line([[0, 0], [160, 0]], { startArrowhead: 'diamond' }) },
  {
    id: 'uml-note',
    name: 'Note',
    build: (b) => b.polygon([[0, 0], [150, 0], [170, 20], [170, 90], [0, 90]], { backgroundColor: '#ffec99', fillStyle: 'solid' }).line([[150, 0], [150, 20], [170, 20]], { sharp: true }).text('Note…', 12, 30),
  },
  { id: 'uml-actor', name: 'Actor', build: (b) => stickFigure(b, 0, 0, 'Actor') },
  { id: 'uml-usecase', name: 'Use case', build: (b) => b.box('ellipse', 0, 0, 180, 70, 'Place order') },
]);

// ───────────────────────────── Callouts ─────────────────────────────
// Speech bubbles with text already placed inside; select one and drag the yellow handle to aim the tail.
section('Callouts', [
  { id: 'callout-speech', name: 'Speech bubble', build: (b) => b.figure('callout-rect', 0, 0, 200, 100, { tail: { x: 0.2, y: 1.45 } }).label('Hello there!', 100, 50) },
  { id: 'callout-rounded', name: 'Rounded speech bubble', build: (b) => b.figure('callout-rounded', 0, 0, 200, 100, { backgroundColor: BLUE_FILL, tail: { x: 0.8, y: 1.45 } }).label('Got it 👍', 100, 50) },
  { id: 'callout-oval', name: 'Oval speech bubble', build: (b) => b.figure('callout-oval', 0, 0, 200, 110, { tail: { x: 0.15, y: 1.4 } }).label('What do\nyou think?', 100, 55) },
  { id: 'callout-thought', name: 'Thought bubble', build: (b) => b.figure('callout-cloud', 0, 0, 210, 120, { tail: { x: 0.1, y: 1.55 } }).label('Hmm…', 105, 60) },
  {
    id: 'callout-note',
    name: 'Comment callout',
    build: (b) =>
      b.figure('callout-rounded', 0, 0, 240, 110, { backgroundColor: '#ffec99', tail: { x: -0.25, y: 0.5 } })
        .text('Note', 16, 12, { size: 15, bold: true })
        .text('Explain this step\nin a sentence or two.', 16, 38, { size: 14 }),
  },
  {
    id: 'callout-warning',
    name: 'Warning callout',
    build: (b) =>
      b.figure('callout-rect', 0, 0, 240, 90, { backgroundColor: '#ffc9c9', strokeColor: '#e03131', tail: { x: 0.25, y: 1.5 } })
        .label('⚠ Check this before release', 120, 45, { size: 15, color: '#c92a2a' }),
  },
  {
    id: 'callout-dialogue',
    name: 'Dialogue (two people)',
    build: (b) => {
      stickFigure(b, 0, 150, 'Alex');
      stickFigure(b, 300, 150, 'Sam');
      b.figure('callout-rounded', 0, 0, 170, 80, { tail: { x: 0.2, y: 1.85 } }).label('Ready to ship?', 85, 40);
      return b.figure('callout-oval', 200, 30, 160, 80, { backgroundColor: '#b2f2bb', tail: { x: 0.78, y: 1.5 } }).label('Almost!', 280, 70);
    },
  },
  {
    id: 'callout-shout',
    name: 'Shout / burst',
    build: (b) => b.figure('explosion', 0, 0, 200, 150, { backgroundColor: '#ffec99' }).label('NEW!', 100, 78, { size: 24, bold: true }),
  },
]);

// ───────────────────────────── Flowchart ─────────────────────────────
section('Flowchart', [
  { id: 'flow-terminator', name: 'Terminator', build: (b) => b.figure('fc-terminator', 0, 0, 170, 64, { backgroundColor: '#b2f2bb' }).label('Start', 85, 32) },
  { id: 'flow-doc', name: 'Document (wavy)', build: (b) => b.figure('fc-document', 0, 0, 170, 100).label('Invoice', 85, 42) },
  { id: 'flow-database', name: 'Database symbol', build: (b) => b.figure('fc-database', 0, 0, 110, 130).label('Orders', 55, 74) },
  { id: 'flow-terminal', name: 'Start / end', build: (b) => b.box('rectangle', 0, 0, 160, 56, 'Start', { rounded: true, backgroundColor: '#b2f2bb' }) },
  { id: 'flow-process', name: 'Process', build: (b) => b.box('rectangle', 0, 0, 160, 70, 'Process') },
  { id: 'flow-decision', name: 'Decision', build: (b) => b.box('diamond', 0, 0, 150, 100, 'Valid?', { backgroundColor: '#ffec99' }) },
  {
    id: 'flow-io',
    name: 'Input / output',
    build: (b) => b.polygon([[24, 0], [184, 0], [160, 70], [0, 70]]).label('Input', 92, 35),
  },
  {
    id: 'flow-document',
    name: 'Document',
    build: (b) =>
      b.line([[0, 70], [0, 0], [160, 0], [160, 70]], { sharp: true })
        .line([[0, 70], [40, 82], [80, 70], [120, 58], [160, 70]])
        .label('Report', 80, 36),
  },
  {
    id: 'flow-subprocess',
    name: 'Predefined process',
    build: (b) => b.box('rectangle', 0, 0, 170, 70, 'Subroutine').line([[14, 0], [14, 70]]).line([[156, 0], [156, 70]]),
  },
  { id: 'flow-connector', name: 'Connector', build: (b) => b.box('ellipse', 0, 0, 44, 44, 'A') },
  {
    id: 'flow-yes-no',
    name: 'Yes / no branch',
    build: (b) =>
      b.box('diamond', 60, 0, 140, 90, 'OK?', { backgroundColor: '#ffec99' })
        .arrow([[130, 90], [130, 150]]).text('Yes', 138, 104, { size: 14 })
        .arrow([[200, 45], [270, 45]]).text('No', 220, 22, { size: 14 })
        .box('rectangle', 70, 150, 120, 56, 'Continue')
        .box('rectangle', 270, 17, 120, 56, 'Retry'),
  },
]);

// ───────────────────────────── Forms & UI ─────────────────────────────
section('Forms & UI', [
  { id: 'ui-input', name: 'Text input', build: (b) => input(b, 0, 0, 'Email', 'you@example.com') },
  {
    id: 'ui-password',
    name: 'Password input',
    build: (b) =>
      input(b, 0, 0, 'Password', '••••••••', { muted: false })
        .ellipse(222, 36, 24, 14, { strokeWidth: 1.2, roughness: 0.4 })
        .ellipse(230, 39, 8, 8, { backgroundColor: '#1e1e1e', roughness: 0 }),
  },
  { id: 'ui-checkbox', name: 'Checkbox', build: (b) => checkbox(b, 0, 0, 'Remember me', true) },
  {
    id: 'ui-checkbox-list',
    name: 'Checkbox list',
    build: (b) => checkbox(checkbox(checkbox(b.text('Interests', 0, 0, { size: 14 }), 0, 28, 'Design', true), 0, 58, 'Engineering', true), 0, 88, 'Marketing', false),
  },
  {
    id: 'ui-radio',
    name: 'Radio group',
    build: (b) => radio(radio(radio(b.text('Plan', 0, 0, { size: 14 }), 0, 28, 'Free', false), 0, 58, 'Pro', true), 0, 88, 'Team', false),
  },
  { id: 'ui-button', name: 'Button', build: (b) => button(b, 0, 0, 140, 'Submit') },
  { id: 'ui-button-secondary', name: 'Secondary button', build: (b) => button(b, 0, 0, 140, 'Cancel', false) },
  {
    id: 'ui-select',
    name: 'Dropdown / select',
    build: (b) =>
      b.text('Country', 0, 0, { size: 14 })
        .rect(0, 24, 240, 38, { rounded: true, roughness: 0.6 })
        .textMid('Select an option', 12, 43, { size: 15, color: GREY })
        .line([[212, 39], [219, 47], [226, 39]], { sharp: true }),
  },
  {
    id: 'ui-toggle',
    name: 'Toggle switch',
    build: (b) =>
      b.rect(0, 0, 48, 26, { rounded: true, backgroundColor: GREEN, strokeColor: GREEN, fillStyle: 'solid', roughness: 0.4 })
        .ellipse(25, 3, 20, 20, { backgroundColor: '#ffffff', strokeColor: '#ffffff', roughness: 0 })
        .textMid('Notifications', 60, 13),
  },
  {
    id: 'ui-textarea',
    name: 'Text area',
    build: (b) => b.text('Message', 0, 0, { size: 14 }).rect(0, 24, 280, 100, { rounded: true, roughness: 0.6 }).text('Write something…', 12, 34, { size: 15, color: GREY }),
  },
  {
    id: 'ui-list',
    name: 'List',
    build: (b) => {
      b.rect(0, 0, 220, 160, { rounded: true, roughness: 0.6 });
      ['Inbox', 'Starred', 'Sent', 'Drafts'].forEach((t, i) => {
        if (i) b.line([[0, i * 40], [220, i * 40]], { strokeColor: '#ced4da' });
        b.ellipse(14, i * 40 + 16, 8, 8, { backgroundColor: '#1e1e1e', roughness: 0 });
        b.textMid(t, 32, i * 40 + 20, { size: 15 });
      });
      return b;
    },
  },
  {
    id: 'ui-slider',
    name: 'Slider',
    build: (b) =>
      b.text('Volume', 0, 0, { size: 14 })
        .line([[0, 40], [220, 40]], { strokeColor: '#ced4da', strokeWidth: 4, roughness: 0 })
        .line([[0, 40], [130, 40]], { strokeColor: BLUE, strokeWidth: 4, roughness: 0 })
        .ellipse(120, 30, 20, 20, { backgroundColor: '#ffffff', strokeColor: BLUE, roughness: 0 }),
  },
  {
    id: 'ui-search',
    name: 'Search box',
    build: (b) =>
      b.rect(0, 0, 260, 40, { rounded: true, roughness: 0.6 })
        .ellipse(12, 11, 14, 14, { roughness: 0.4 })
        .line([[24, 23], [30, 29]], { roughness: 0.4 })
        .textMid('Search…', 40, 20, { size: 15, color: GREY }),
  },
  {
    id: 'ui-login',
    name: 'Login form',
    build: (b) => {
      b.rect(0, 0, 320, 340, { rounded: true, backgroundColor: '#f8f9fa', fillStyle: 'solid' });
      b.label('Sign in', 160, 34, { size: 22, bold: true });
      input(b, 30, 64, 'Email', 'you@example.com');
      input(b, 30, 140, 'Password', '••••••••', { muted: false });
      checkbox(b, 30, 222, 'Remember me', true);
      return button(b, 30, 262, 260, 'Sign in');
    },
  },
]);

// ───────────────────────────── Architecture ─────────────────────────────
section('Architecture', [
  { id: 'arch-user', name: 'User', build: (b) => stickFigure(b, 0, 0, 'User') },
  {
    id: 'arch-server',
    name: 'Server',
    build: (b) => {
      b.rect(0, 0, 110, 120, { backgroundColor: '#e9ecef', fillStyle: 'solid' });
      [0, 1, 2].forEach((i) => {
        b.line([[10, 30 + i * 30], [100, 30 + i * 30]]);
        b.ellipse(14, 12 + i * 30, 7, 7, { backgroundColor: GREEN, strokeColor: GREEN, roughness: 0 });
      });
      return b.label('Server', 55, 136, { size: 15 });
    },
  },
  {
    id: 'arch-browser',
    name: 'Browser window',
    build: (b) => {
      b.rect(0, 0, 300, 200, { rounded: true });
      b.line([[0, 32], [300, 32]]);
      ['#ff6b6b', '#fcc419', '#51cf66'].forEach((c, i) => b.ellipse(10 + i * 16, 11, 10, 10, { backgroundColor: c, strokeColor: c, roughness: 0 }));
      return b.rect(64, 7, 220, 18, { rounded: true, roughness: 0.4 }).textMid('https://', 72, 16, { size: 12, color: GREY });
    },
  },
  {
    id: 'arch-phone',
    name: 'Mobile phone',
    build: (b) => b.rect(0, 0, 110, 200, { rounded: true }).line([[42, 12], [68, 12]]).ellipse(47, 178, 16, 16).rect(8, 26, 94, 144, { strokeColor: '#ced4da' }),
  },
  {
    id: 'arch-cloud',
    name: 'Cloud',
    build: (b) => {
      const pts: Array<[number, number]> = Array.from({ length: 17 }, (_, i) => {
        const t = (i / 16) * Math.PI * 2;
        const r = i % 2 ? 0.82 : 1;
        return [90 + Math.cos(t) * 90 * r, 50 + Math.sin(t) * 50 * r];
      });
      return b.line(pts, { backgroundColor: BLUE_FILL }).label('Cloud', 90, 50);
    },
  },
  {
    id: 'arch-lb',
    name: 'Load balancer',
    build: (b) =>
      b.box('rectangle', 0, 50, 140, 56, 'Load balancer', { rounded: true, backgroundColor: '#d0bfff', size: 15 })
        .arrow([[140, 66], [210, 20]]).arrow([[140, 78], [210, 78]]).arrow([[140, 90], [210, 136]]),
  },
  {
    id: 'arch-queue',
    name: 'Message queue',
    build: (b) => {
      b.rect(0, 0, 200, 50, { backgroundColor: '#ffe8cc', fillStyle: 'solid' });
      [40, 80, 120, 160].forEach((x) => b.line([[x, 0], [x, 50]]));
      return b.label('Queue', 100, 68, { size: 15 });
    },
  },
  {
    id: 'arch-service',
    name: 'Service',
    build: (b) => b.polygon([[30, 0], [120, 0], [150, 45], [120, 90], [30, 90], [0, 45]], { backgroundColor: BLUE_FILL, fillStyle: 'hachure' }).label('Service', 75, 45),
  },
  {
    id: 'arch-api-gateway',
    name: 'API gateway',
    build: (b) => b.box('rectangle', 0, 0, 70, 180, 'API\nGateway', { rounded: true, backgroundColor: '#c3fae8', size: 15 }),
  },
]);

// Sales: CRM, dashboards & charts, products / inventory / CPQ (in their own file)
for (const s of SALES_SECTIONS) section(s.name, s.items);

let cache: LibraryItem[] | null = null;

/** All built-in items, built on first use. */
export function getBuiltinLibrary(): LibraryItem[] {
  if (!cache) {
    cache = BUILTIN_SECTIONS.flatMap((s) =>
      s.items.map((d) => ({ id: `builtin:${d.id}`, name: d.name, created: 0, category: s.name, elements: normalizeItemElements(d.build(new ItemBuilder()).build()) })),
    );
  }
  return cache;
}

/** Sections in display order with their items. */
export function getBuiltinSections(): Array<{ name: string; items: LibraryItem[] }> {
  const all = getBuiltinLibrary();
  return BUILTIN_SECTIONS.map((s) => ({ name: s.name, items: all.filter((i) => i.category === s.name) }));
}

