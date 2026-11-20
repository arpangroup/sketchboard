import { describe, expect, it } from 'vitest';
import { createInitialAppState, DEFAULT_STYLE } from '../core/constants';
import type { LinearElement, SketchElement } from '../core/types';
import { createCode, createFrame, createLinear, createMath, createShape, createTable, createText } from '../elements/factory';
import { pointsToElementGeometry } from '../elements/handlers/pointShapes';
import { sceneToMarkdown } from '../export/markdownExport';
import { getBuiltinLibrary } from '../library/builtin';

const DATE = new Date('2026-11-21T00:00:00Z');
const rect = (id: string, x: number, y: number, w = 120, h = 60, o: Partial<SketchElement> = {}) =>
  ({ ...createShape('rectangle', DEFAULT_STYLE, { x, y }, 1), id, width: w, height: h, rounded: false, ...o }) as SketchElement;
const label = (id: string, text: string, containerId: string, x: number, y: number) =>
  ({ ...createText(DEFAULT_STYLE, { x, y }, 2, text), id, containerId }) as SketchElement;
const arrow = (id: string, pts: Array<[number, number]>, o: Partial<LinearElement> = {}): LinearElement => {
  const abs = pts.map(([x, y]) => ({ x, y }));
  return { ...createLinear('arrow', DEFAULT_STYLE, abs[0], 3), ...pointsToElementGeometry(abs), id, endArrowhead: 'arrow', startArrowhead: 'none', ...o } as LinearElement;
};
const fromLibrary = (id: string) => getBuiltinLibrary().find((i) => i.id === `builtin:${id}`)!.elements;

describe('drawing → Markdown (for people and LLMs)', () => {
  it('rebuilds boxes and attached arrows as a Mermaid flowchart and a connections table', () => {
    const els: SketchElement[] = [
      rect('a', 0, 0),
      label('ta', 'Web app', 'a', 20, 20),
      { ...rect('b', 300, 0), type: 'diamond' } as SketchElement,
      label('tb', 'Logged in?', 'b', 320, 20),
      rect('c', 600, 0, 120, 60, { rounded: true } as Partial<SketchElement>),
      label('tc', 'Dashboard', 'c', 620, 20),
      arrow('ab', [[120, 30], [300, 30]], { startBinding: { elementId: 'a', anchor: { x: 1, y: 0.5 } }, endBinding: { elementId: 'b', anchor: { x: 0, y: 0.5 } } }),
      arrow('bc', [[420, 30], [600, 30]], { strokeStyle: 'dashed', startBinding: { elementId: 'b', anchor: { x: 1, y: 0.5 } }, endBinding: { elementId: 'c', anchor: { x: 0, y: 0.5 } } }),
      { ...createText(DEFAULT_STYLE, { x: 490, y: 8 }, 4, 'yes'), id: 'yes' } as SketchElement,
    ];
    const md = sceneToMarkdown(els, { title: 'Login flow', date: DATE });
    expect(md).toContain('# Login flow');
    expect(md).toContain('Exported from SketchBoard on 2026-11-21');
    expect(md).toContain('```mermaid\nflowchart LR');
    expect(md).toContain('n1["Web app"]');
    expect(md).toContain('n2{"Logged in?"}');
    expect(md).toContain('n3("Dashboard")');
    expect(md).toContain('n1 --> n2');
    expect(md).toContain('n2 -.->|"yes"| n3');
    expect(md).toMatch(/\| Web app \(n1\) +\| Logged in\? \(n2\) +\| +\| arrow +\|/);
    expect(md).toContain('- `n1` Box: **Web app** — at (0, 0), 120×60');
  });

  it('describes tables, code, formulas, frames and notes in their own formats', () => {
    const table = { ...createTable(DEFAULT_STYLE, { rows: 2, cols: 2, cellPadding: 6, headerRow: true, headerColor: '#eee', banded: false, textColor: '#000' }, { x: 0, y: 200, width: 200, height: 60 }, 5), id: 't', cells: [['Region', 'Users'], ['EU', '1200']] } as SketchElement;
    const code = { ...createCode(DEFAULT_STYLE, createInitialAppState().codeDefaults, { x: 400, y: 200 }, 6, 'print("hi")'), id: 'k', language: 'python' } as SketchElement;
    const math = { ...createMath(DEFAULT_STYLE, { x: 0, y: 400 }, 7, '$$\nk = \\frac{m}{n} \\ln 2\n$$'), id: 'm' } as SketchElement;
    const frame = { ...createFrame({ x: -20, y: 380, width: 400, height: 200 }, 8, 'Maths'), id: 'f' } as SketchElement;
    const note = { ...createText(DEFAULT_STYLE, { x: 600, y: 600 }, 9, 'Remember:\nreview with the team'), id: 'note' } as SketchElement;
    const md = sceneToMarkdown([table, code, { ...math, frameId: 'f' }, frame, note], { title: 'Mixed', date: DATE, positions: false });
    expect(md).toContain('| Region | Users |');
    expect(md).toContain('| EU     | 1200  |');
    expect(md).toContain('```python');
    expect(md).toContain('print("hi")');
    expect(md).toContain('$$\n  k = \\frac{m}{n} \\ln 2\n  $$');
    expect(md).toContain('### Frame: Maths');
    expect(md).toContain('> review with the team');
    expect(md).not.toContain(' at (');
  });

  it('reads diagrams made of tiles, captions and group boxes (AWS serverless API)', () => {
    const md = sceneToMarkdown(fromLibrary('aws-arch-serverless-api'), { title: 'Serverless', date: DATE });
    expect(md).toContain('subgraph g2["AWS Cloud"]');
    for (const name of ['API Gateway', 'Lambda', 'DynamoDB', 'Cognito', 'CloudWatch']) expect(md).toContain(`("${name}")`);
    expect(md).toContain('n1 -->|"HTTPS"| n3');
    expect(md).toContain('n3 --> n4');
    expect(md).toContain('n6 -.->|"auth"| n3');
    // the tiles' symbols (λ, { }) aren't labels
    expect(md).not.toContain('λ');
  });

  it('nests groups (VPC › Availability Zone › subnet) and reads relationship ends (1 to *)', () => {
    const vpc = sceneToMarkdown(fromLibrary('aws-arch-three-tier'), { date: DATE });
    expect(vpc).toMatch(/subgraph g\d+\["VPC"\]\n {4}subgraph g\d+\["Availability Zone A"\]\n {6}subgraph g\d+\["Private subnet · app"\]\n {8}n\d+\("App server"\)/);
    expect(vpc).toMatch(/-\.->\|"sync replication"\|/);
    const erd = sceneToMarkdown(fromLibrary('sales-data-model'), { date: DATE });
    expect(erd).toMatch(/n\d+ ---\|"1 to \*"\| n\d+/);
    expect(erd).toContain('("Account")');
  });

  it('pairs label/value rows in cards and leaves charts out of the flowchart', () => {
    const card = sceneToMarkdown(fromLibrary('sales-lead'), { date: DATE, positions: false });
    expect(card).toContain('**Group: Lead**');
    expect(card).toContain('- Name: Jane Doe');
    const dash = sceneToMarkdown(fromLibrary('sales-dashboard'), { date: DATE });
    expect(dash).not.toContain('```mermaid');
    expect(dash).toContain('Revenue / $1.24M');
  });

  it('handles an empty drawing and links a saved picture', () => {
    expect(sceneToMarkdown([], { title: 'Blank' })).toBe('# Blank\n\n_The drawing is empty._\n');
    expect(sceneToMarkdown([rect('x', 0, 0)], { title: 'Pic', imageFile: 'Pic.png', date: DATE })).toContain('![Pic](Pic.png)');
  });
});
