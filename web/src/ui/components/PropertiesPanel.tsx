import { type ReactNode, useEffect, useState } from 'react';
import { ensureFontLoaded, FONT_OPTIONS, fontCss, isKnownFont, presetFor, sanitizeFontName, TEXT_PRESETS, type TextPreset } from '../../core/fonts';
import { BACKGROUND_COLORS, HIGHLIGHT_COLORS, STROKE_COLORS } from '../../core/constants';
import type { Arrowhead, CurrentStyle, ElementType, SketchElement, TableDefaults, TableElement } from '../../core/types';
import { useAppState, useEditor, useIsCompact, useSceneRevision } from '../EditorContext';
import { Icons } from '../icons/Icons';

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
};

const FILLABLE = new Set<ElementType>(['rectangle', 'diamond', 'ellipse']);

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
  const editingId = useAppState((s) => s.editingTextId);
  // On phones the panel is a bottom sheet opened on demand, so it never hides the drawing.
  const compact = useIsCompact();
  const [sheetOpen, setSheetOpen] = useState(false);

  const selected = editor.getSelectedElements();
  const editingEl = editingId ? editor.scene.getElement(editingId) : undefined;
  const subjects = selected.length ? selected : editingEl ? [editingEl] : [];
  const types = new Set<ElementType>(
    subjects.length ? subjects.map((e) => e.type) : TOOL_TO_TYPE[tool] ? [TOOL_TO_TYPE[tool]!] : [],
  );
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
  const showFill = [...types].some((t) => FILLABLE.has(t));
  const arrowheads: Option<Arrowhead>[] = [
    { value: 'none', label: 'None', icon: mini('M4 12h16') },
    { value: 'arrow', label: 'Arrow', icon: mini('M4 12h16M14 7l6 5-6 5') },
    { value: 'triangle', label: 'Triangle', icon: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12h11" stroke="currentColor" strokeWidth="2" /><path d="M13 7l7 5-7 5z" fill="currentColor" /></svg> },
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
        !onlyImages && (
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

      {has('rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'table') && (
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

      {has('rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'table') && (
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

      {has('arrow') && (
        <Section title="Arrowheads">
          <div className="sb-arrowheads">
            <ButtonGroup value={v('startArrowhead')} onChange={(startArrowhead) => set({ startArrowhead })}
              options={arrowheads.map((o) => ({ ...o, icon: <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>{o.icon}</span> }))} />
            <ButtonGroup value={v('endArrowhead')} onChange={(endArrowhead) => set({ endArrowhead })} options={arrowheads} />
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
              <Toggle label="Bold (Ctrl+B)" active={v('fontWeight') === 'bold'} onClick={() => set({ fontWeight: v('fontWeight') === 'bold' ? 'normal' : 'bold' })}>
                <b className="sb-txt">B</b>
              </Toggle>
              <Toggle label="Italic (Ctrl+I)" active={v('fontStyle') === 'italic'} onClick={() => set({ fontStyle: v('fontStyle') === 'italic' ? 'normal' : 'italic' })}>
                <i className="sb-txt sb-serif">I</i>
              </Toggle>
              <Toggle label="Underline (Ctrl+U)" active={!!v('underline')} onClick={() => set({ underline: !v('underline') })}>
                <u className="sb-txt">U</u>
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

      <Section title="Opacity">
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

      {selected.length > 0 && (
        <Section title="Layers & actions">
          <div className="sb-btn-group">
            <IconBtn label="Send to back" onClick={() => actions.execute('sendToBack')}><Icons.back /></IconBtn>
            <IconBtn label="Bring to front" onClick={() => actions.execute('bringToFront')}><Icons.front /></IconBtn>
            <IconBtn label="Duplicate (Ctrl+D)" onClick={() => actions.execute('duplicate')}><Icons.copy /></IconBtn>
            <IconBtn label={selected.every((e) => e.locked) ? 'Unlock' : 'Lock'} onClick={() => actions.execute('lock')}>
              {selected.every((e) => e.locked) ? <Icons.lock /> : <Icons.unlock />}
            </IconBtn>
            <IconBtn label="Delete" onClick={() => actions.execute('delete')}><Icons.trash /></IconBtn>
          </div>
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
    <button className={`sb-opt ${p.active ? 'is-active' : ''}`} title={p.label} aria-label={p.label} aria-pressed={p.active} onClick={p.onClick}>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
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
