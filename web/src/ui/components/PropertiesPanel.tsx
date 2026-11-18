import { type ReactNode, useEffect, useState } from 'react';
import { ensureFontLoaded, FONT_OPTIONS, fontCss, isKnownFont, presetFor, sanitizeFontName, TEXT_PRESETS, type TextPreset } from '../../core/fonts';
import { BACKGROUND_COLORS, HIGHLIGHT_COLORS, STROKE_COLORS } from '../../core/constants';
import type { Arrowhead, CodeElement, CurrentStyle, ElementType, SketchElement, TableDefaults, TableElement } from '../../core/types';
import { CODE_LANGUAGES } from '../../elements/code/highlight';
import { formatLineList, MARK_COLORS, parseLineList, codeLines } from '../../elements/code/codeLayout';
import { useAppState, useEditor, useIsCompact, useSceneRevision } from '../EditorContext';
import { Icons } from '../icons/Icons';
import { FIGURE_CATEGORIES, FIGURES } from '../../elements/figures/figures';
import { bakesRotation } from '../../elements/rotation';
import { LASER_SIZES } from '../../renderer/LaserLayer';
import { withLabels } from '../../elements/boundText';

interface Option<T> {
  value: T;
  label: string;
  icon: ReactNode;
}

function ButtonGroup<T extends string | number | boolean>(p: {
  value: T | undefined;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="sb-btn-group">
      {p.options.map((o) => (
        <button
          key={String(o.value)}
          className={`sb-opt ${p.value === o.value ? 'is-active' : ''}`}
          title={o.label}
          aria-label={o.label}
          aria-pressed={p.value === o.value}
          onClick={() => p.onChange(o.value)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

const mini = (d: string, extra: Record<string, string | number> = {}) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2} {...extra}>
    <path d={d} />
  </svg>
);

function ColorRow(p: { colors: string[]; value: string; onChange: (c: string) => void; label: string }) {
  const custom = p.value !== 'transparent' && !p.colors.includes(p.value) ? p.value : null;
  return (
    <div className="sb-colors" role="radiogroup" aria-label={p.label}>
      {p.colors.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={p.value === c}
          aria-label={c === 'transparent' ? 'Transparent' : c}
          title={c === 'transparent' ? 'Transparent' : c}
          className={`sb-swatch ${p.value === c ? 'is-active' : ''} ${c === 'transparent' ? 'is-transparent' : ''}`}
          style={{ background: c === 'transparent' ? undefined : c }}
          // keep the text editor's selection, so a swatch can colour just the selected words
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => p.onChange(c)}
        />
      ))}
      <label className={`sb-swatch sb-swatch--custom ${custom ? 'is-active' : ''}`} title="Custom colour" style={custom ? { background: custom } : undefined}>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(p.value) ? p.value : '#000000'}
          onChange={(e) => p.onChange(e.target.value)}
          aria-label={`Custom ${p.label.toLowerCase()}`}
        />
      </label>
    </div>
  );
}

const TOOL_TO_TYPE: Partial<Record<string, ElementType>> = {
  rectangle: 'rectangle',
  diamond: 'diamond',
  ellipse: 'ellipse',
  arrow: 'arrow',
  line: 'line',
  freedraw: 'freedraw',
  highlighter: 'freedraw',
  text: 'text',
  table: 'table',
  figure: 'figure',
};

const FILLABLE = new Set<ElementType>(['rectangle', 'diamond', 'ellipse', 'figure']);

/** Reads the value to display: the first selected element's, else the current style. */
function displayed<K extends keyof CurrentStyle>(key: K, style: CurrentStyle, sel: SketchElement[]): CurrentStyle[K] {
  const el = sel.find((e) => key in e);
  return el ? ((el as unknown as CurrentStyle)[key] ?? style[key]) : style[key];
}

export function PropertiesPanel() {
  const { editor, actions } = useEditor();
  useSceneRevision();
  const style = useAppState((s) => s.currentStyle);
  const tool = useAppState((s) => s.activeTool);
  useAppState((s) => s.selectedIds);
  const editingId = useAppState((s) => s.editingTextId ?? s.editingCodeId);
  // On phones the panel is a bottom sheet opened on demand, so it never hides the drawing.
  const compact = useIsCompact();
  const [sheetOpen, setSheetOpen] = useState(false);

  // a selected shape's label counts too, so its font, size and colour can be changed from here
  const picked = editor.getSelectedElements();
  const selected = withLabels(editor.scene.getElements(), picked);
  const editingEl = editingId ? editor.scene.getElement(editingId) : undefined;
  const editingBox = editingEl?.type === 'text' && editingEl.containerId ? editor.scene.getElement(editingEl.containerId) : undefined;
  const subjects = selected.length
    ? selected
    : editingBox && !editingBox.isDeleted
      ? withLabels(editor.scene.getElements(), [editingBox])
      : editingEl
        ? [editingEl]
        : [];
  const labelText = subjects.find((e) => e.type === 'text' && e.containerId);
  // free-standing text boxes (not shape labels) that are selected: they get the width setting
  const freeTexts = picked.filter((e): e is Extract<SketchElement, { type: 'text' }> => e.type === 'text' && !e.containerId);
  // words inside a shape get their own colour row (the Stroke row colours the shape's outline)
  const showTextColor = !!labelText && subjects.some((e) => e.type !== 'text');
  const types = new Set<ElementType>(
    subjects.length ? subjects.map((e) => e.type) : TOOL_TO_TYPE[tool] ? [TOOL_TO_TYPE[tool]!] : [],
  );
  if (!subjects.length && (tool === 'eraser' || tool === 'precisionEraser')) return <EraserPanel />;
  if (!subjects.length && tool === 'laser') return <LaserPanel />;
  if (types.size === 0) return null;
  if (compact && !sheetOpen) {
    return (
      <button className="sb-island sb-icon-btn sb-style-fab" onClick={() => setSheetOpen(true)} aria-label="Style options" title="Style options">
        <Icons.palette />
        <span className="sb-style-fab__swatch" style={{ background: displayed('strokeColor', style, subjects) }} />
      </button>
    );
  }

  const has = (...t: ElementType[]) => t.some((x) => types.has(x));
  const v = <K extends keyof CurrentStyle>(k: K) => displayed(k, style, subjects);
  const set = (patch: Partial<CurrentStyle>) => editor.updateStyle(patch);
  const isHighlighter =
    (subjects.length === 0 && tool === 'highlighter') ||
    (subjects.length > 0 && subjects.every((e) => e.type === 'freedraw' && e.kind === 'highlighter'));
  const onlyImages = subjects.length > 0 && subjects.every((e) => e.type === 'image');
  const onlyTables = types.size === 1 && types.has('table');
  const onlyCode = types.size === 1 && types.has('code');
  const codeEl = onlyCode && subjects.length === 1 && subjects[0].type === 'code' ? subjects[0] : null;
  const showFill = [...types].some((t) => FILLABLE.has(t));
  const arrowheads: Option<Arrowhead>[] = [
    { value: 'none', label: 'None', icon: mini('M4 12h16') },
    { value: 'arrow', label: 'Arrow', icon: mini('M4 12h16M14 7l6 5-6 5') },
    { value: 'triangle', label: 'Triangle', icon: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12h11" stroke="currentColor" strokeWidth="2" /><path d="M13 7l7 5-7 5z" fill="currentColor" /></svg> },
    { value: 'triangle_outline', label: 'Hollow triangle (inheritance)', icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h9" /><path d="M13 7l7 5-7 5z" /></svg> },
    { value: 'diamond', label: 'Diamond (composition)', icon: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 12h8" stroke="currentColor" strokeWidth="2" /><path d="M11 12l4.5-4 4.5 4-4.5 4z" fill="currentColor" /></svg> },
    { value: 'diamond_outline', label: 'Hollow diamond (aggregation)', icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h8" /><path d="M11 12l4.5-4 4.5 4-4.5 4z" /></svg> },
    { value: 'bar', label: 'Bar', icon: mini('M4 12h16M20 6v12') },
    { value: 'dot', label: 'Dot', icon: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12h12" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="12" r="3.5" fill="currentColor" /></svg> },
  ];

  return (
    <aside className={`sb-island sb-props ${compact ? 'is-sheet' : ''}`} aria-label="Element properties">
      {compact && (
        <div className="sb-props__sheet-head">
          <span className="sb-props__grabber" />
          <button className="sb-icon-btn" onClick={() => setSheetOpen(false)} aria-label="Close style options">
            <Icons.close />
          </button>
        </div>
      )}
      {isHighlighter ? (
        <Section title="Highlight">
          <ColorRow
            label="Highlight colour"
            colors={HIGHLIGHT_COLORS}
            value={subjects.find((e) => e.type === 'freedraw' && e.kind === 'highlighter')?.strokeColor ?? style.highlightColor}
            onChange={(c) => set({ highlightColor: c })}
          />
        </Section>
      ) : (
        !onlyImages && !onlyCode && (
          <Section title={onlyTables ? 'Border' : 'Stroke'}>
            <ColorRow label="Stroke colour" colors={STROKE_COLORS} value={v('strokeColor')} onChange={(c) => set({ strokeColor: c })} />
          </Section>
        )
      )}

      {showFill && (
        <Section title="Background">
          <ColorRow label="Background colour" colors={BACKGROUND_COLORS} value={v('backgroundColor')} onChange={(c) => set({ backgroundColor: c })} />
        </Section>
      )}

      {showFill && v('backgroundColor') !== 'transparent' && (
        <Section title="Fill">
          <ButtonGroup
            value={v('fillStyle')}
            onChange={(fillStyle) => set({ fillStyle })}
            options={[
              { value: 'hachure', label: 'Hachure', icon: mini('M5 19L19 5M5 13l8-8M11 19l8-8') },
              { value: 'cross-hatch', label: 'Cross-hatch', icon: mini('M5 19L19 5M5 13l8-8M11 19l8-8M5 5l14 14M5 11l8 8M11 5l8 8') },
              { value: 'solid', label: 'Solid', icon: <svg viewBox="0 0 24 24" width="18" height="18"><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" /></svg> },
              { value: 'dots', label: 'Dots', icon: mini('M7 7h.01M12 7h.01M17 7h.01M7 12h.01M12 12h.01M17 12h.01M7 17h.01M12 17h.01M17 17h.01', { strokeWidth: 3 }) },
            ]}
          />
        </Section>
      )}

      {has('rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'table', 'figure') && (
        <Section title={onlyTables ? 'Border width' : 'Stroke width'}>
          <ButtonGroup
            value={v('strokeWidth')}
            onChange={(strokeWidth) => set({ strokeWidth })}
            options={[
              { value: 1, label: 'Thin', icon: mini('M4 12h16', { strokeWidth: 1.25 }) },
              { value: 2, label: 'Bold', icon: mini('M4 12h16', { strokeWidth: 2.5 }) },
              { value: 4, label: 'Extra bold', icon: mini('M4 12h16', { strokeWidth: 4.5 }) },
            ]}
          />
        </Section>
      )}

      {has('rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'table', 'figure') && (
        <>
          <Section title={onlyTables ? 'Border style' : 'Stroke style'}>
            <ButtonGroup
              value={v('strokeStyle')}
              onChange={(strokeStyle) => set({ strokeStyle })}
              options={[
                { value: 'solid', label: 'Solid', icon: mini('M4 12h16') },
                { value: 'dashed', label: 'Dashed', icon: mini('M4 12h4M10 12h4M16 12h4') },
                { value: 'dotted', label: 'Dotted', icon: mini('M4 12h.01M8 12h.01M12 12h.01M16 12h.01M20 12h.01', { strokeWidth: 2.6 }) },
              ]}
            />
          </Section>
          <Section title="Sloppiness">
            <ButtonGroup
              value={v('roughness')}
              onChange={(roughness) => set({ roughness })}
              options={[
                { value: 0, label: 'Architect', icon: mini('M3 15c4-5 7-6 9-3s5 2 9-3') },
                { value: 1, label: 'Artist', icon: mini('M3 15c3-5 6-6 8.5-3.5S16 13 21 8M3 16c3-5 6-5.5 9-3') },
                { value: 2, label: 'Cartoonist', icon: mini('M3 15c2-6 5-4 7-2s3 1 4-2 4-4 7-1M3 17c3-4 5-4 8-2.5s5 0 9-4') },
              ]}
            />
          </Section>
        </>
      )}

      {has('rectangle') && (
        <Section title="Edges">
          <ButtonGroup
            value={v('rounded')}
            onChange={(rounded) => set({ rounded })}
            options={[
              { value: false, label: 'Sharp', icon: mini('M5 19V5h14') },
              { value: true, label: 'Round', icon: mini('M5 19V11a6 6 0 016-6h8') },
            ]}
          />
        </Section>
      )}

      {types.size === 1 && has('figure') && (
        <Section title="Shape">
          <select
            className="sb-input sb-shape-select"
            value={(subjects.find((e) => e.type === 'figure') as { figure?: string } | undefined)?.figure ?? editor.getState().currentFigure}
            onChange={(e) => editor.changeFigure(e.target.value)}
            aria-label="Shape"
          >
            {FIGURE_CATEGORIES.map((c) => (
              <optgroup key={c} label={c}>
                {FIGURES.filter((f) => f.category === c).map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {subjects.some((e) => e.type === 'figure' && e.tail) && <p className="sb-muted sb-props__hint">Drag the yellow handle to point the tail.</p>}
        </Section>
      )}

      {has('arrow') && (
        <Section title="Arrowheads">
          <div className="sb-arrowheads">
            <div className="sb-arrowheads__row">
              <span className="sb-arrowheads__label">Start</span>
              <ButtonGroup value={v('startArrowhead')} onChange={(startArrowhead) => set({ startArrowhead })}
                options={arrowheads.map((o) => ({ ...o, label: `Start: ${o.label}`, icon: <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>{o.icon}</span> }))} />
            </div>
            <div className="sb-arrowheads__row">
              <span className="sb-arrowheads__label">End</span>
              <ButtonGroup value={v('endArrowhead')} onChange={(endArrowhead) => set({ endArrowhead })}
                options={arrowheads.map((o) => ({ ...o, label: `End: ${o.label}` }))} />
            </div>
            <button
              className="sb-btn sb-btn--sm sb-arrowheads__swap"
              onClick={() => {
                const start = v('startArrowhead');
                const end = v('endArrowhead');
                if (start !== undefined && end !== undefined) set({ startArrowhead: end, endArrowhead: start });
              }}
              title="Swap the start and end arrowheads"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7h13l-4-4M17 17H4l4 4" /></svg>
              Swap ends
            </button>
          </div>
        </Section>
      )}

      {has('text') && (
        <>
          <Section title="Text style">
            <ButtonGroup
              value={presetFor(v('fontSize'), v('fontWeight')) ?? undefined}
              onChange={(k) => set({ fontSize: TEXT_PRESETS[k].fontSize, fontWeight: TEXT_PRESETS[k].fontWeight })}
              options={(Object.keys(TEXT_PRESETS) as TextPreset[]).map((k) => ({
                value: k,
                label: TEXT_PRESETS[k].title,
                icon: <b className={`sb-txt sb-preset sb-preset--${k}`}>{TEXT_PRESETS[k].label}</b>,
              }))}
            />
          </Section>
          {showTextColor && (
            <Section title="Text colour">
              <ColorRow label="Text colour" colors={STROKE_COLORS} value={labelText!.strokeColor} onChange={(c) => set({ textColor: c })} />
            </Section>
          )}
          <Section title="Font">
            <FontPicker value={v('fontFamily')} onChange={(fontFamily) => set({ fontFamily })} />
          </Section>
          <Section title="Size">
            <div className="sb-size-row">
              <ButtonGroup
                value={v('fontSize')}
                onChange={(fontSize) => set({ fontSize })}
                options={[
                  { value: 16, label: 'Small', icon: <b className="sb-txt">S</b> },
                  { value: 24, label: 'Medium', icon: <b className="sb-txt">M</b> },
                  { value: 36, label: 'Large', icon: <b className="sb-txt">L</b> },
                ]}
              />
              <NumberInput value={v('fontSize')} min={6} max={400} onCommit={(fontSize) => set({ fontSize })} label="Font size in px" />
            </div>
          </Section>
          <Section title="Format">
            <div className="sb-btn-group">
              <Toggle label="Bold (Ctrl+B)" active={v('fontWeight') === 'bold'} onClick={() => (editor.getState().editingTextId ? editor.toggleTextFormat('bold') : set({ fontWeight: v('fontWeight') === 'bold' ? 'normal' : 'bold' }))}>
                <b className="sb-txt">B</b>
              </Toggle>
              <Toggle label="Italic (Ctrl+I)" active={v('fontStyle') === 'italic'} onClick={() => (editor.getState().editingTextId ? editor.toggleTextFormat('italic') : set({ fontStyle: v('fontStyle') === 'italic' ? 'normal' : 'italic' }))}>
                <i className="sb-txt sb-serif">I</i>
              </Toggle>
              <Toggle label="Underline (Ctrl+U)" active={!!v('underline')} onClick={() => (editor.getState().editingTextId ? editor.toggleTextFormat('underline') : set({ underline: !v('underline') }))}>
                <u className="sb-txt">U</u>
              </Toggle>
              <Toggle label="Bulleted list (Ctrl+Shift+8)" active={editor.activeList() === 'bullet'} onClick={() => editor.toggleList('bullet')}>
                {mini('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01')}
              </Toggle>
              <Toggle label="Numbered list (Ctrl+Shift+7)" active={editor.activeList() === 'number'} onClick={() => editor.toggleList('number')}>
                {mini('M10 6h10M10 12h10M10 18h10M4 4.5h1.5v4M3.5 8.5h3M3.5 13.5c0-1 2.5-1.5 2.5 0S3.5 16 3.5 17.5h3')}
              </Toggle>
            </div>
          </Section>
          <Section title="Text align">
            <ButtonGroup
              value={v('textAlign')}
              onChange={(textAlign) => set({ textAlign })}
              options={[
                { value: 'left', label: 'Left', icon: mini('M4 6h16M4 12h10M4 18h13') },
                { value: 'center', label: 'Center', icon: mini('M4 6h16M7 12h10M5.5 18h13') },
                { value: 'right', label: 'Right', icon: mini('M4 6h16M10 12h10M7 18h13') },
              ]}
            />
          </Section>
          {freeTexts.length > 0 && (
            <Section title="Text width">
              <ButtonGroup
                value={freeTexts.every((t) => t.fixedWidth) ? 'fixed' : freeTexts.some((t) => t.fixedWidth) ? undefined : 'auto'}
                onChange={(mode) => editor.setTextWidthMode(mode === 'fixed')}
                options={[
                  { value: 'auto', label: 'Auto width — the box fits its longest line', icon: mini('M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3') },
                  { value: 'fixed', label: 'Fixed width — text wraps onto new lines (or drag a side handle)', icon: mini('M4 6h16M4 12h13a3 3 0 0 1 0 6h-4M15 16l-2 2 2 2M4 18h5') },
                ]}
              />
            </Section>
          )}
        </>
      )}

      {has('table') && (
        <TableSection
          table={subjects.find((e): e is TableElement => e.type === 'table')}
          fontSize={v('fontSize')}
          fontFamily={v('fontFamily')}
          textAlign={v('textAlign')}
          backgroundColor={v('backgroundColor')}
          onStyle={set}
        />
      )}

      {codeEl && <CodeSection key={codeEl.id} el={codeEl} />}

      <Section
        title={
          v('opacity') !== undefined && Number(v('opacity')) < 100 ? (
            <>
              Opacity <span className="sb-props__value">{v('opacity')}%</span>
            </>
          ) : (
            'Opacity'
          )
        }
      >
        <input
          className="sb-range"
          type="range"
          min={10}
          max={100}
          step={10}
          value={v('opacity')}
          onChange={(e) => set({ opacity: Number(e.target.value) })}
          aria-label="Opacity"
        />
      </Section>

      {picked.length === 1 && picked[0].type === 'frame' && <FrameSection frame={picked[0]} />}

      {picked.length > 0 && !picked.every((e) => e.locked) && <RotationSection selected={picked} />}

      {picked.length > 0 && (
        <Section title="Layers & actions">
          <div className="sb-btn-group">
            <IconBtn label="Send to back" onClick={() => actions.execute('sendToBack')}><Icons.back /></IconBtn>
            <IconBtn label="Bring to front" onClick={() => actions.execute('bringToFront')}><Icons.front /></IconBtn>
            <IconBtn label="Duplicate (Ctrl+D)" onClick={() => actions.execute('duplicate')}><Icons.copy /></IconBtn>
            <IconBtn label="Add to library (Shift+L)" onClick={() => actions.execute('addToLibrary')}><Icons.libraryAdd /></IconBtn>
            {actions.isEnabled('ungroup') ? (
              <IconBtn label="Ungroup (Ctrl+Shift+G)" onClick={() => actions.execute('ungroup')}><Icons.ungroup /></IconBtn>
            ) : (
              picked.length > 1 && <IconBtn label="Group (Ctrl+G)" onClick={() => actions.execute('group')}><Icons.group /></IconBtn>
            )}
            {picked.some((e) => e.type !== 'frame') && (
              <IconBtn label="Wrap in frame (Shift+F)" onClick={() => actions.execute('wrapInFrame')}><Icons.frame /></IconBtn>
            )}
            <IconBtn label="Flip horizontal (Shift+H)" onClick={() => actions.execute('flipHorizontal')}><Icons.flipH /></IconBtn>
            <IconBtn label="Flip vertical (Shift+V)" onClick={() => actions.execute('flipVertical')}><Icons.flipV /></IconBtn>
            <IconBtn label={picked.some((e) => e.link) ? 'Edit link (Ctrl+K)' : 'Add link (Ctrl+K)'} onClick={() => actions.execute('hyperlink')}><Icons.link /></IconBtn>
            <IconBtn label={picked.every((e) => e.locked) ? 'Unlock' : 'Lock'} onClick={() => actions.execute('lock')}>
              {picked.every((e) => e.locked) ? <Icons.lock /> : <Icons.unlock />}
            </IconBtn>
            <IconBtn label="Delete" onClick={() => actions.execute('delete')}><Icons.trash /></IconBtn>
          </div>
        </Section>
      )}
    </aside>
  );
}

/** Code block settings: language, theme, size, title, line numbers and marked lines. */
function CodeSection({ el }: { el: CodeElement }) {
  const { editor } = useEditor();
  const markColor = useAppState((s) => s.codeDefaults.markColor);
  const [lines, setLines] = useState('');
  const [title, setTitle] = useState<string | null>(null);
  const total = codeLines(el.code).length;
  const marked = Object.keys(el.marks).map(Number).filter((n) => n <= total);
  const apply = (color: CodeElement['marks'][string] | null) => {
    const list = parseLineList(lines, total);
    if (!list.length) return editor.toast(`Type line numbers like “3, 5-7” (1–${total})`);
    editor.setCodeMarks(el.id, list, color);
    setLines('');
  };
  const commitTitle = () => {
    if (title !== null && title !== el.title) editor.updateCode({ title });
    setTitle(null);
  };
  return (
    <>
      <Section title="Language">
        <select className="sb-input sb-shape-select" value={el.language} onChange={(e) => editor.updateCode({ language: e.target.value })} aria-label="Language">
          {CODE_LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </Section>
      <Section title="Theme & size">
        <div className="sb-row">
          <ButtonGroup
            value={el.theme}
            onChange={(theme) => editor.updateCode({ theme })}
            options={[
              { value: 'light', label: 'Light theme', icon: <Icons.sun /> },
              { value: 'dark', label: 'Dark theme', icon: <Icons.moon /> },
            ]}
          />
          <NumberInput value={el.fontSize} min={8} max={64} label="Code font size" unit="px" onCommit={(fontSize) => editor.updateCode({ fontSize })} />
        </div>
      </Section>
      <Section title="Show">
        <div className="sb-code-toggles">
          <label className="sb-switch">
            <input type="checkbox" checked={el.lineNumbers} onChange={(e) => editor.updateCode({ lineNumbers: e.target.checked })} />
            <span>Line numbers</span>
          </label>
          <label className="sb-switch">
            <input type="checkbox" checked={el.showLanguage !== false} onChange={(e) => editor.updateCode({ showLanguage: e.target.checked })} />
            <span title="Language name in the header">Language label</span>
          </label>
        </div>
      </Section>
      <Section title="Title">
        <input
          className="sb-input"
          placeholder="File name (optional)"
          value={title ?? el.title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && commitTitle()}
          aria-label="Code block title"
        />
      </Section>
      <Section title="Mark lines">
        <div className="sb-code-marks">
          <div className="sb-colors" role="radiogroup" aria-label="Mark colour">
            {MARK_COLORS.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={markColor === m.id}
                aria-label={m.label}
                title={m.label}
                className={`sb-swatch ${markColor === m.id ? 'is-active' : ''}`}
                style={{ background: m.swatch }}
                onClick={() => editor.setState((s) => ({ codeDefaults: { ...s.codeDefaults, markColor: m.id } }))}
              />
            ))}
          </div>
          <div className="sb-code-marks__row">
            <input
              className="sb-input"
              placeholder="e.g. 3, 5-7"
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply(markColor)}
              aria-label="Lines to mark"
            />
            <button className="sb-btn sb-btn--sm" onClick={() => apply(markColor)}>Mark</button>
            <button className="sb-btn sb-btn--sm" onClick={() => apply(null)} title="Remove the marks from these lines">Unmark</button>
          </div>
          {marked.length > 0 ? (
            <p className="sb-muted sb-props__hint">
              Marked: {formatLineList(marked)} ·{' '}
              <button className="sb-link-btn" onClick={() => editor.setCodeMarks(el.id, marked, null)}>clear all</button>
            </p>
          ) : (
            <p className="sb-muted sb-props__hint">Tip: with the block selected, click a line number to mark or unmark it.</p>
          )}
        </div>
      </Section>
    </>
  );
}

/** Angle in degrees (for shapes, text, images, tables, code…) plus quick 90° turns for anything. */
function RotationSection({ selected }: { selected: SketchElement[] }) {
  const { editor } = useEditor();
  const angled = selected.filter((e) => !bakesRotation(e));
  const deg = angled.length ? Math.round(((angled[0].angle ?? 0) * 180) / Math.PI) % 360 : null;
  const same = angled.every((e) => Math.round(((e.angle ?? 0) * 180) / Math.PI) % 360 === deg);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(v)) editor.setSelectionAngle((v * Math.PI) / 180);
    setDraft(null);
  };
  return (
    <Section title="Rotation">
      <div className="sb-row">
        {angled.length > 0 && (
          <label className="sb-number" title="Angle in degrees (clockwise)">
            <input
              type="number"
              inputMode="numeric"
              min={-360}
              max={360}
              step={15}
              value={draft ?? (same && deg !== null ? deg : '')}
              placeholder="mixed"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
              aria-label="Rotation angle in degrees"
            />
            <span>°</span>
          </label>
        )}
        <IconBtn label="Rotate 90° counter-clockwise (Shift+Alt+R)" onClick={() => editor.rotateSelection(-Math.PI / 2)}><Icons.rotateCcw /></IconBtn>
        <IconBtn label="Rotate 90° clockwise (Shift+R)" onClick={() => editor.rotateSelection(Math.PI / 2)}><Icons.rotateCw /></IconBtn>
        {angled.some((e) => e.angle) && (
          <button className="sb-btn sb-btn--sm" onClick={() => editor.setSelectionAngle(0)} title="Back to upright">Reset</button>
        )}
      </div>
    </Section>
  );
}

/** Laser pointer: how the trail behaves and how thick it is. */
function LaserPanel() {
  const { editor } = useEditor();
  const laser = useAppState((s) => s.laser);
  return (
    <aside className="sb-island sb-props sb-props--eraser" aria-label="Laser pointer options">
      <Section title="Laser trail">
        <ButtonGroup
          value={laser.mode}
          onChange={(mode) => editor.setLaser({ mode })}
          options={[
            {
              value: 'fade',
              label: 'Fade as you draw — the trail disappears behind the pointer',
              icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 16c3-6 6-6 9-2" opacity="0.25" /><path d="M12 14c2.5 3 5 2 8-5" /></svg>,
            },
            {
              value: 'hold',
              label: 'Keep until release — the whole trail stays while the pen / mouse is down',
              icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 16c3-6 6-6 9-2s5 2 8-5" /><circle cx="20" cy="9" r="2" fill="currentColor" /></svg>,
            },
          ]}
        />
        <p className="sb-muted sb-props__hint">
          {laser.mode === 'hold' ? 'The trail stays visible until you lift the pen or release the mouse, then fades.' : 'The trail fades away behind the pointer as you move.'}
        </p>
      </Section>
      <Section title="Size">
        <ButtonGroup
          value={laser.size}
          onChange={(size) => editor.setLaser({ size })}
          options={LASER_SIZES.map((s) => ({
            value: s.value,
            label: s.label,
            icon: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12h16" stroke="#ff3b30" strokeWidth={Math.min(9, s.core * 0.75)} strokeLinecap="round" /></svg>,
          }))}
        />
      </Section>
    </aside>
  );
}

const ERASER_SIZES = [
  { value: 6, label: 'Fine' },
  { value: 12, label: 'Medium' },
  { value: 22, label: 'Large' },
  { value: 36, label: 'Extra large' },
];

/** Shown while an eraser is active: stroke vs precision, and the precision eraser's size. */
function EraserPanel() {
  const { editor } = useEditor();
  const tool = useAppState((s) => s.activeTool);
  const size = useAppState((s) => s.eraser.size);
  const precise = tool === 'precisionEraser';
  return (
    <aside className="sb-island sb-props sb-props--eraser" aria-label="Eraser options">
      <Section title="Eraser">
        <ButtonGroup
          value={precise ? 'precision' : 'stroke'}
          onChange={(m) => editor.setEraser(m)}
          options={[
            { value: 'stroke', label: 'Stroke eraser — removes whole strokes and shapes (E)', icon: <Icons.eraser /> },
            { value: 'precision', label: 'Precision eraser — rubs out only what it touches (Shift+E)', icon: <Icons.precisionEraser /> },
          ]}
        />
        <p className="sb-muted sb-props__hint">
          {precise ? 'Rubs out just the part of pen, highlighter and line strokes it touches.' : 'Removes any stroke or shape you touch.'}
        </p>
      </Section>
      {precise && (
        <Section title="Size">
          <ButtonGroup
            value={size}
            onChange={(s) => editor.setState((st) => ({ eraser: { ...st.eraser, size: s } }))}
            options={ERASER_SIZES.map((o) => ({
              value: o.value,
              label: `${o.label} (${o.value * 2}px)`,
              icon: <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r={Math.max(2, o.value / 3.6)} fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>,
            }))}
          />
        </Section>
      )}
    </aside>
  );
}

/** Table-specific settings: grid size, structure, padding, header, banding, text. */
function TableSection(p: {
  table?: TableElement;
  fontSize: number;
  fontFamily: string;
  textAlign: CurrentStyle['textAlign'];
  backgroundColor: string;
  onStyle: (patch: Partial<CurrentStyle>) => void;
}) {
  const { editor } = useEditor();
  const defaults = useAppState((s) => s.tableDefaults);
  const t = p.table;
  const val = {
    rows: t?.rows ?? defaults.rows,
    cols: t?.cols ?? defaults.cols,
    cellPadding: t?.cellPadding ?? defaults.cellPadding,
    headerRow: t?.headerRow ?? defaults.headerRow,
    headerColor: t?.headerColor ?? defaults.headerColor,
    banded: t?.banded ?? defaults.banded,
    textColor: t?.textColor ?? defaults.textColor,
  };
  const set = (patch: Partial<TableDefaults>) => editor.updateTable(patch);
  const cursor = t ? editor.getTableCursor(t.id) : null;
  const cmd = (op: Parameters<typeof editor.tableCommand>[0]) => () => editor.tableCommand(op);
  return (
    <>
      <Section title="Table size">
        <div className="sb-grid-size">
          <label>
            Rows
            <NumberInput value={val.rows} min={1} max={500} onCommit={(rows) => set({ rows })} label="Rows" unit="" />
          </label>
          <span aria-hidden="true">×</span>
          <label>
            Columns
            <NumberInput value={val.cols} min={1} max={100} onCommit={(cols) => set({ cols })} label="Columns" unit="" />
          </label>
        </div>
      </Section>
      {t && (
        <Section title={cursor ? `Row ${cursor.row + 1} · Column ${cursor.col + 1}` : 'Rows & columns'}>
          <div className="sb-table-ops">
            <button className="sb-chip-btn" onClick={cmd('rowAbove')} title="Insert row above">+ Row ↑</button>
            <button className="sb-chip-btn" onClick={cmd('rowBelow')} title="Insert row below">+ Row ↓</button>
            <button className="sb-chip-btn is-danger" onClick={cmd('deleteRow')} disabled={t.rows <= 1} title="Delete row">− Row</button>
            <button className="sb-chip-btn" onClick={cmd('colLeft')} title="Insert column left">+ Col ←</button>
            <button className="sb-chip-btn" onClick={cmd('colRight')} title="Insert column right">+ Col →</button>
            <button className="sb-chip-btn is-danger" onClick={cmd('deleteCol')} disabled={t.cols <= 1} title="Delete column">− Col</button>
            <button className="sb-chip-btn sb-chip-btn--wide" onClick={cmd('distribute')} title="Make all columns the same width">⇔ Equal column widths</button>
          </div>
        </Section>
      )}
      <Section title="Cell padding">
        <div className="sb-size-row">
          <ButtonGroup
            value={val.cellPadding}
            onChange={(cellPadding) => set({ cellPadding })}
            options={[4, 10, 16].map((v) => ({ value: v, label: `${v}px`, icon: <span className="sb-txt">{v}</span> }))}
          />
          <NumberInput value={val.cellPadding} min={0} max={64} onCommit={(cellPadding) => set({ cellPadding })} label="Cell padding in px" />
        </div>
      </Section>
      <Section title="Header row">
        <div className="sb-btn-group">
          <Toggle label="Header row (bold first row)" active={val.headerRow} onClick={() => set({ headerRow: !val.headerRow })}>
            <span className="sb-txt">H</span>
          </Toggle>
          <Toggle label="Banded rows (alternate rows use the cell fill)" active={val.banded} onClick={() => set({ banded: !val.banded })}>
            {mini('M4 7h16M4 12h16M4 17h16', { strokeWidth: 3.2, opacity: 0.55 })}
          </Toggle>
        </div>
        {val.headerRow && (
          <ColorRow label="Header colour" colors={HEADER_COLORS} value={val.headerColor} onChange={(headerColor) => set({ headerColor })} />
        )}
      </Section>
      <Section title={val.banded ? 'Band colour' : 'Cell fill'}>
        <ColorRow label="Cell fill colour" colors={BACKGROUND_COLORS} value={p.backgroundColor} onChange={(backgroundColor) => p.onStyle({ backgroundColor })} />
      </Section>
      <Section title="Text colour">
        <ColorRow label="Text colour" colors={STROKE_COLORS} value={val.textColor} onChange={(textColor) => set({ textColor })} />
      </Section>
      <Section title="Font">
        <FontPicker value={p.fontFamily} onChange={(fontFamily) => p.onStyle({ fontFamily })} />
        <div className="sb-size-row" style={{ marginTop: 6 }}>
          <NumberInput value={p.fontSize} min={6} max={120} onCommit={(fontSize) => p.onStyle({ fontSize })} label="Table font size in px" />
          <ButtonGroup
            value={p.textAlign}
            onChange={(textAlign) => p.onStyle({ textAlign })}
            options={[
              { value: 'left', label: 'Align left', icon: mini('M4 6h16M4 12h10M4 18h13') },
              { value: 'center', label: 'Align center', icon: mini('M4 6h16M7 12h10M5.5 18h13') },
              { value: 'right', label: 'Align right', icon: mini('M4 6h16M10 12h10M7 18h13') },
            ]}
          />
        </div>
      </Section>
      {t && <p className="sb-props__hint">Click a cell to type · Tab to move · drag grid lines to resize</p>}
    </>
  );
}

const HEADER_COLORS = ['transparent', '#e7f5ff', '#ebfbee', '#fff9db', '#fff0f6', '#f1f3f5'];

function Toggle(p: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`sb-opt ${p.active ? 'is-active' : ''}`}
      title={p.label}
      aria-label={p.label}
      aria-pressed={p.active}
      // keep the text editor's selection: B / I / U can then format just the selected words
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  );
}

/** Numeric input that commits on Enter/blur, so typing "4" on the way to "48" doesn't resize text. */
function NumberInput(p: { value: number; min: number; max: number; onCommit: (v: number) => void; label: string; unit?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n > 0) p.onCommit(Math.min(p.max, Math.max(p.min, n)));
    setDraft(null);
  };
  return (
    <label className="sb-number">
      <input
        type="number"
        inputMode="numeric"
        min={p.min}
        max={p.max}
        aria-label={p.label}
        value={draft ?? Math.round(p.value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          e.stopPropagation();
        }}
      />
      {p.unit !== '' && <span>{p.unit ?? 'px'}</span>}
    </label>
  );
}

/** Font dropdown (grouped, each name previewed in its own font) + "Custom font…" for any Google/installed font. */
function FontPicker({ value, onChange }: { value: string; onChange: (family: string) => void }) {
  const known = isKnownFont(value);
  const [custom, setCustom] = useState(known ? '' : value);
  const [showCustom, setShowCustom] = useState(!known);
  useEffect(() => {
    if (isKnownFont(value)) setShowCustom(false); // e.g. a custom name that matches a listed font
  }, [value]);
  useEffect(() => {
    // preload the catalogue's web fonts so the dropdown previews render correctly
    FONT_OPTIONS.forEach((f) => f.google && void ensureFontLoaded(f.id));
  }, []);
  const groups = [...new Set(FONT_OPTIONS.map((f) => f.group))];
  return (
    <div className="sb-font-picker">
      <select
        className="sb-input sb-select"
        value={showCustom ? '__custom' : value}
        style={{ fontFamily: fontCss(showCustom ? custom || 'normal' : value) }}
        onChange={(e) => {
          if (e.target.value === '__custom') {
            setShowCustom(true);
            return;
          }
          setShowCustom(false);
          onChange(e.target.value);
        }}
        aria-label="Font family"
      >
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {FONT_OPTIONS.filter((f) => f.group === g).map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="__custom">Custom font…</option>
      </select>
      {showCustom && (
        <form
          className="sb-custom-font"
          onSubmit={(e) => {
            e.preventDefault();
            const name = sanitizeFontName(custom);
            if (name) onChange(name);
          }}
        >
          <input
            className="sb-input"
            placeholder="e.g. Pacifico, Nunito, Segoe UI"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Custom font name"
          />
          <button className="sb-btn sb-btn--sm" type="submit" disabled={!sanitizeFontName(custom)}>
            Use
          </button>
        </form>
      )}
      {showCustom && <small className="sb-field__hint">Any Google Font name, or a font installed on this device.</small>}
    </div>
  );
}

/** Frame name + quick actions. */
function FrameSection({ frame }: { frame: Extract<SketchElement, { type: 'frame' }> }) {
  const { editor, actions } = useEditor();
  const [name, setName] = useState(frame.name);
  useEffect(() => setName(frame.name), [frame.id, frame.name]);
  const commit = () => name.trim() !== frame.name && editor.renameFrame(frame.id, name.trim() || 'Frame');
  return (
    <Section title="Frame">
      <input
        className="sb-input"
        value={name}
        aria-label="Frame name"
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <div className="sb-row-btns">
        <button className="sb-btn sb-btn--sm" onClick={() => actions.execute('selectFrameContents')}>Select contents</button>
        <button className="sb-btn sb-btn--sm" onClick={() => actions.execute('removeFrame')}>Remove frame</button>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="sb-props__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="sb-opt" title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}
