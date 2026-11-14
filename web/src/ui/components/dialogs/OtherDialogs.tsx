import { useEffect, useState } from 'react';
import type {
  HeaderFooterSlot,
  HeaderFooterText,
  PageNumberFormat,
  PageNumberPosition,
  PageMargins,
  PageSection,
  PageSetup,
} from '../../../core/types';
import { MAX_PAGES, PAGE_NUMBER_FORMAT_OPTIONS, requiredPageCount, sectionOfPage } from '../../../page/pageLayout';
import { addSection, removeSection, setOwnArea, updateSection } from '../../../page/sections';
import { Icons } from '../../icons/Icons';
import { normalizeLink } from '../../../elements/structure';
import { getPageDimensions, isUniformMargins, MAX_MARGIN_MM, MM_TO_PX, PAGE_SIZE_OPTIONS, type PageDimensions, resolveMargins } from '../../../page/pageSizes';
import { useAppState, useEditor, useSceneRevision } from '../../EditorContext';
import { Field, Modal, Segmented } from './Modal';
import { NoServerDialog } from './NoServerDialog';
import { serverConfigured } from '../../../cloud/serverConfig';

export function PageSetupDialog({ onClose }: { onClose: () => void }) {
  const { editor } = useEditor();
  const setup = useAppState((s) => s.pageSetup);
  const update = (patch: Partial<PageSetup>) => {
    const next = { ...setup, ...patch };
    editor.setState({ pageSetup: next });
    // Choosing a paper format centres the page; "Infinite" keeps the full-screen canvas as is.
    if (next.size !== 'infinite' && (patch.size || patch.orientation)) {
      requestAnimationFrame(() => editor.zoomToPage());
    }
  };
  const dims = getPageDimensions(setup);

  return (
    <Modal title="Page setup" onClose={onClose} wide={setup.size !== 'infinite'}>
      <p className="sb-muted">
        The page frame shows exactly what will be printed. Draw outside it freely — the area outside is ignored when printing “page as drawn”.
      </p>
      <Field label="Page size">
        <div className="sb-page-grid">
          {PAGE_SIZE_OPTIONS.map((o) => (
            <button key={o.id} className={`sb-page-card ${setup.size === o.id ? 'is-active' : ''}`} onClick={() => update({ size: o.id })}>
              <span className={`sb-page-card__shape ${o.id === 'infinite' ? 'is-infinite' : ''}`} />
              {o.label}
            </button>
          ))}
        </div>
      </Field>
      {setup.size !== 'infinite' && (
        <>
          <Field label="Orientation">
            <Segmented
              value={setup.orientation}
              onChange={(orientation) => update({ orientation })}
              options={[
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
              ]}
            />
          </Field>
          {dims && <MarginsField setup={setup} dims={dims} update={update} />}
          <PagesField />
          <HeaderFooterFields setup={setup} update={update} />
        </>
      )}
      <div className="sb-modal__actions">
        {setup.size !== 'infinite' && (
          <button className="sb-btn" onClick={() => { editor.zoomToPage(); onClose(); }}>
            Zoom to page
          </button>
        )}
        <button className="sb-btn sb-btn--primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

const SIDES: Array<{ side: keyof PageMargins; label: string }> = [
  { side: 'top', label: 'Top' },
  { side: 'bottom', label: 'Bottom' },
  { side: 'left', label: 'Left' },
  { side: 'right', label: 'Right' },
];

/** Margins: presets apply to all four sides; each side can also be typed separately. */
function MarginsField({ setup, dims, update }: { setup: PageSetup; dims: PageDimensions; update: (p: Partial<PageSetup>) => void }) {
  const m = resolveMargins(setup);
  const uniform = isUniformMargins(m) ? m.top : -1;
  const [focus, setFocus] = useState<keyof PageMargins | null>(null);
  const effective = dims.margins; // px, after shrinking to fit the paper
  const shrunk = SIDES.some(({ side }) => Math.abs(effective[side] / MM_TO_PX - m[side]) > 0.05);

  const setAll = (v: number) => update({ marginMm: v, margins: { top: v, right: v, bottom: v, left: v } });
  const setSide = (side: keyof PageMargins, v: number) => update({ margins: { ...m, [side]: v } });

  const pct = (px: number, total: number) => `${(px / total) * 100}%`;
  return (
    <Field
      label="Margins"
      hint={
        shrunk
          ? 'These margins are larger than the paper allows — they’re reduced to fit.'
          : `${dims.widthMm} × ${dims.heightMm} mm paper · header & footer sit in the top & bottom margins`
      }
    >
      <div className="sb-margins">
        <Segmented value={uniform} onChange={setAll} options={[0, 5, 10, 15, 20, 25].map((v) => ({ value: v, label: `${v} mm` }))} />
        <div className="sb-margins__body">
          <div className="sb-margins__inputs">
            {SIDES.map(({ side, label }) => (
              <label key={side} className={`sb-margins__input ${focus === side ? 'is-focus' : ''}`}>
                <span>{label}</span>
                <MarginInput value={m[side]} onChange={(v) => setSide(side, v)} onFocus={() => setFocus(side)} onBlur={() => setFocus(null)} label={`${label} margin`} />
                <small>mm</small>
              </label>
            ))}
          </div>
          <div className="sb-margins__paper" style={{ aspectRatio: `${dims.widthPx} / ${dims.heightPx}` }} aria-hidden="true">
            <div
              className="sb-margins__area"
              style={{
                top: pct(effective.top, dims.heightPx),
                bottom: pct(effective.bottom, dims.heightPx),
                left: pct(effective.left, dims.widthPx),
                right: pct(effective.right, dims.widthPx),
              }}
            />
            {focus && <div className={`sb-margins__band is-${focus}`} style={{ [focus === 'top' || focus === 'bottom' ? 'height' : 'width']: pct(effective[focus], focus === 'top' || focus === 'bottom' ? dims.heightPx : dims.widthPx) }} />}
          </div>
        </div>
      </div>
    </Field>
  );
}

/** Number box that lets you clear and retype; commits valid values (0 – 100 mm) as you type. */
function MarginInput(p: { value: number; onChange: (v: number) => void; onFocus: () => void; onBlur: () => void; label: string }) {
  const [text, setText] = useState(String(p.value));
  useEffect(() => setText((t) => (Number(t) === p.value ? t : String(p.value))), [p.value]);
  return (
    <input
      className="sb-input"
      type="number"
      inputMode="decimal"
      min={0}
      max={MAX_MARGIN_MM}
      step={1}
      value={text}
      aria-label={p.label}
      onFocus={p.onFocus}
      onBlur={() => {
        p.onBlur();
        setText(String(p.value)); // drop an empty / invalid entry
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(v)) p.onChange(Math.min(MAX_MARGIN_MM, Math.max(0, Math.round(v * 10) / 10)));
      }}
    />
  );
}

function PagesField() {
  const { editor } = useEditor();
  useSceneRevision();
  const setup = useAppState((s) => s.pageSetup);
  const count = editor.getPageCount();
  const minForContent = requiredPageCount({ ...setup, pageCount: 1 }, editor.scene.getElements());
  const setCount = (pageCount: number) => editor.setState({ pageSetup: { ...setup, pageCount } });
  return (
    <Field label="Pages" hint="Pages are added automatically when you draw below the last one.">
      <div className="sb-pages-row">
        <strong>{count}</strong> {count === 1 ? 'page' : 'pages'}
        <button className="sb-btn sb-btn--sm" onClick={() => setCount(count + 1)} disabled={count >= MAX_PAGES}>
          + Add page
        </button>
        <button
          className="sb-btn sb-btn--sm"
          onClick={() => setCount(Math.max(1, count - 1))}
          disabled={count <= Math.max(1, minForContent)}
          title={count <= minForContent ? 'The last page has drawings on it' : 'Remove the last (empty) page'}
        >
          − Remove empty page
        </button>
      </div>
    </Field>
  );
}

const SLOTS: HeaderFooterSlot[] = ['left', 'center', 'right'];
const EMPTY_HF: HeaderFooterText = { left: '', center: '', right: '' };

/** Three slot inputs (left / centre / right) for a header or footer. */
function HfInputs(p: {
  area: 'header' | 'footer';
  values: HeaderFooterText;
  pn: NonNullable<PageSetup['pageNumbers']>;
  onChange: (v: HeaderFooterText) => void;
  labelPrefix?: string;
}) {
  return (
    <div className="sb-hf-row">
      {SLOTS.map((slot) => {
        const numbered = p.pn.enabled && p.pn.position === `${p.area}-${slot}`;
        return (
          <input
            key={slot}
            className={`sb-input sb-hf-input sb-hf-input--${slot}`}
            placeholder={numbered ? `${slot} · page number` : slot[0].toUpperCase() + slot.slice(1)}
            value={p.values[slot]}
            onChange={(e) => p.onChange({ ...p.values, [slot]: e.target.value.slice(0, 120) })}
            aria-label={`${p.labelPrefix ?? ''}${p.area} ${slot}`}
          />
        );
      })}
    </div>
  );
}

const DEFAULT_PN = { enabled: false, position: 'footer-center' as PageNumberPosition, format: 'page-n-of-m' as PageNumberFormat };

/** Header, footer and page numbering - the default for every page, plus optional per-section overrides. */
function HeaderFooterFields({ setup, update }: { setup: PageSetup; update: (p: Partial<PageSetup>) => void }) {
  const pn = setup.pageNumbers ?? DEFAULT_PN;
  const setPn = (patch: Partial<typeof pn>) => update({ pageNumbers: { ...pn, ...patch } });
  const hasSections = (setup.sections?.length ?? 0) > 0;
  const row = (area: 'header' | 'footer') => (
    <Field
      label={`${hasSections ? 'Default ' : ''}${area === 'header' ? 'header' : 'footer'}`.replace(/^./, (c) => c.toUpperCase())}
      hint={hasSections && area === 'footer' ? 'Used on every page that isn’t in a section with its own.' : undefined}
    >
      <HfInputs area={area} values={setup[area] ?? EMPTY_HF} pn={pn} onChange={(v) => update({ [area]: v })} />
    </Field>
  );
  return (
    <section className="sb-hf">
      <h3 className="sb-hf__title">Header, footer &amp; page numbers</h3>
      <Field label="Document title" hint="Use {title}, {section}, {page}, {pages} and {date} in any header or footer.">
        <input
          className="sb-input"
          placeholder="Untitled"
          value={setup.title ?? ''}
          onChange={(e) => update({ title: e.target.value.slice(0, 120) })}
        />
      </Field>
      {row('header')}
      {row('footer')}
      <Field label="Page numbers">
        <div className="sb-pn-row">
          <label className="sb-switch">
            <input type="checkbox" checked={pn.enabled} onChange={(e) => setPn({ enabled: e.target.checked })} />
            <span>Show</span>
          </label>
          <select
            className="sb-input sb-pn-select"
            value={pn.position}
            disabled={!pn.enabled}
            onChange={(e) => setPn({ position: e.target.value as PageNumberPosition })}
            aria-label="Page number position"
          >
            {(['footer', 'header'] as const).flatMap((a) =>
              SLOTS.map((s) => (
                <option key={`${a}-${s}`} value={`${a}-${s}`}>
                  {a === 'footer' ? 'Footer' : 'Header'} · {s}
                </option>
              )),
            )}
          </select>
          <Segmented
            value={pn.format}
            onChange={(format) => setPn({ format })}
            options={PAGE_NUMBER_FORMAT_OPTIONS.map((o) => ({ value: o.id, label: o.label, disabled: !pn.enabled }))}
          />
        </div>
      </Field>
      <SectionsField setup={setup} pn={pn} />
    </section>
  );
}

/** Sections: runs of pages with their own title, header and footer (like section breaks in a word processor). */
function SectionsField({ setup, pn }: { setup: PageSetup; pn: NonNullable<PageSetup['pageNumbers']> }) {
  const { editor } = useEditor();
  useSceneRevision();
  const count = editor.getPageCount();
  const sections = setup.sections ?? [];
  const set = (next: PageSetup) => editor.setState({ pageSetup: next });
  const add = () => {
    const last = sections[sections.length - 1];
    const here = editor.currentPageIndex() + 1;
    const start = here > 1 && !sections.some((s) => s.startPage === here) ? here : last ? last.startPage + 1 : Math.min(2, count);
    set(addSection(setup, start).setup);
  };

  return (
    <div className="sb-sections">
      <div className="sb-sections__head">
        <div>
          <h4 className="sb-sections__title">Sections</h4>
          <p className="sb-muted">
            Give a range of pages its own title, footer or header. A section runs from its first page up to the next section.
          </p>
        </div>
        <button className="sb-btn sb-btn--sm" onClick={add} disabled={sections.length >= MAX_PAGES}>
          + Add section
        </button>
      </div>
      {sections.length > 0 && (
        <p className="sb-sections__default sb-muted">
          {sections[0].startPage > 1
            ? <>Pages 1–{Math.min(count, sections[0].startPage - 1)} use the default header and footer.</>
            : <>Every page is in a section.</>}
        </p>
      )}
      {sections.map((sec) => {
        const { first, last } = sectionOfPage(setup, Math.min(sec.startPage, count), count);
        const beyond = sec.startPage > count;
        const shadowed = !beyond && sectionOfPage(setup, sec.startPage, count).section?.id !== sec.id;
        const patch = (p: Partial<PageSection>) => set(updateSection(setup, sec.id, p));
        return (
          <div key={sec.id} className="sb-section-card" data-section={sec.id}>
            <div className="sb-section-card__head">
              <strong>{sec.title?.trim() || 'Untitled section'}</strong>
              <span className="sb-muted">
                {beyond
                  ? `starts on page ${sec.startPage} — the document has ${count}`
                  : shadowed
                    ? 'another section starts on the same page'
                    : first === last
                      ? `page ${first}`
                      : `pages ${first}–${last}`}
              </span>
              <button className="sb-icon-btn" onClick={() => set(removeSection(setup, sec.id))} aria-label={`Remove ${sec.title || 'section'}`} title="Remove section">
                <Icons.trash />
              </button>
            </div>
            <div className="sb-section-card__row">
              <label className="sb-section-card__start">
                <span>Starts on page</span>
                <input
                  className="sb-input"
                  type="number"
                  min={1}
                  max={MAX_PAGES}
                  value={sec.startPage}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (Number.isFinite(v) && v >= 1) patch({ startPage: Math.min(MAX_PAGES, v) });
                  }}
                  aria-label="Section start page"
                />
              </label>
              <label className="sb-section-card__name">
                <span>Section title</span>
                <input
                  className="sb-input"
                  placeholder={setup.title?.trim() || 'Untitled'}
                  value={sec.title ?? ''}
                  onChange={(e) => patch({ title: e.target.value.slice(0, 120) })}
                  aria-label="Section title"
                />
              </label>
              <label className="sb-switch" title="Number this section’s pages from 1">
                <input type="checkbox" checked={!!sec.restartNumbering} onChange={(e) => patch({ restartNumbering: e.target.checked })} />
                <span>Restart numbering</span>
              </label>
            </div>
            {(['footer', 'header'] as const).map((area) => {
              const own = !!sec[area];
              return (
                <div key={area} className="sb-section-card__area">
                  <label className="sb-switch">
                    <input type="checkbox" checked={own} onChange={(e) => set(setOwnArea(setup, sec.id, area, e.target.checked))} />
                    <span>Own {area}</span>
                  </label>
                  {own ? (
                    <HfInputs area={area} values={sec[area]!} pn={pn} labelPrefix="section " onChange={(v) => patch({ [area]: v })} />
                  ) : (
                    <span className="sb-muted">Same as the default {area}</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function CollabDialog({ onClose }: { onClose: () => void }) {
  const active = useAppState((s) => s.collab.status) !== 'idle';
  return serverConfigured() || active ? <CollabView onClose={onClose} /> : <NoServerDialog title="Live collaboration" onClose={onClose} />;
}

function CollabView({ onClose }: { onClose: () => void }) {
  const { editor, collab } = useEditor();
  const c = useAppState((s) => s.collab);
  const [name, setName] = useState(c.username);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      collab.setUsername(name);
      await collab.startNewRoom();
    } catch (e) {
      editor.toast(`Could not start session: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.roomLink ?? location.href);
      editor.toast('Link copied');
    } catch {
      editor.toast('Copy failed — select the link and copy it manually');
    }
  };

  const peers = Object.values(c.collaborators);

  return (
    <Modal title="Live collaboration" onClose={onClose}>
      <Field label="Your name">
        <input
          className="sb-input"
          value={name}
          placeholder="Shown next to your cursor"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => collab.setUsername(name)}
        />
      </Field>
      {c.status === 'idle' ? (
        <>
          <p className="sb-muted">
            Invite people to draw with you in real time. The session is end-to-end encrypted — the key is part of the link, and the
            server only relays data it cannot read. No account needed.
          </p>
          <div className="sb-modal__actions">
            <button className="sb-btn sb-btn--primary" onClick={start} disabled={busy}>
              {busy ? 'Starting…' : 'Start session'}
            </button>
          </div>
        </>
      ) : (
        <>
          <Field label="Share this link">
            <div className="sb-copy-row">
              <input className="sb-input" readOnly value={c.roomLink ?? ''} onFocus={(e) => e.target.select()} />
              <button className="sb-btn" onClick={copy}>Copy</button>
            </div>
          </Field>
          <p className="sb-status">
            <span className={`sb-dot sb-dot--${c.status}`} />
            {c.status === 'connected' ? 'Connected' : c.status === 'connecting' ? 'Connecting…' : 'Connection lost — retrying…'}
            {peers.length > 0 && ` · ${peers.length} other ${peers.length === 1 ? 'person' : 'people'} here`}
          </p>
          {peers.length > 0 && (
            <ul className="sb-peers">
              {peers.map((p) => (
                <li key={p.id}>
                  <span className="sb-dot" style={{ background: p.color }} />
                  {p.username || 'Guest'}
                </li>
              ))}
            </ul>
          )}
          <div className="sb-modal__actions">
            <button className="sb-btn sb-btn--danger" onClick={() => { collab.stop(); onClose(); }}>
              Stop session
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { actions } = useEditor();
  const list = actions.list().filter((a) => a.shortcut);
  const extra = [
    ['Pan', 'Space + drag · Scroll · Middle mouse'],
    ['Zoom', 'Ctrl + scroll · Pinch'],
    ['Square / circle / snap angle', 'Hold Shift while drawing'],
    ['Draw from centre', 'Hold Alt while drawing'],
    ['Duplicate while moving', 'Alt + drag'],
    ['Nudge', 'Arrow keys (Shift = 10px)'],
    ['Edit text', 'Double-click or Enter'],
    ['Connect shapes (arrow follows them)', 'Draw an arrow from one shape to another · hold Ctrl to keep it free'],
    ['Insert or delete a page', 'Pages panel: hover between two pages, or hover a page for its buttons · or right-click the page'],
    ['Curve a line or arrow', 'Select it and drag the dot in the middle of a segment'],
    ['Remove a bend', 'Double-click the bend point (or right-click → Straighten)'],
    ['Label a shape (centred text inside it)', 'Double-click the shape, or select it and press Enter'],
    ['More actions', 'Right-click (group, frame, flip, copy as PNG…)'],
    ['Open an element’s link', 'Ctrl+click it, or click its link badge'],
    ['Bold / italic / underline', 'Ctrl+B / Ctrl+I / Ctrl+U'],
    ['Paste image or text', 'Ctrl+V (or drag & drop files)'],
    ['Stylus', 'Pen draws, fingers pan & pinch (Pen mode)'],
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="sb-shortcuts">
        {list.map((a) => (
          <div key={a.id} className="sb-shortcut">
            <span>{a.label}</span>
            <kbd>{a.shortcut}</kbd>
          </div>
        ))}
        {extra.map(([l, k]) => (
          <div key={l} className="sb-shortcut">
            <span>{l}</span>
            <kbd>{k}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Add / edit / remove the hyperlink on the selected elements. */
export function HyperlinkDialog({ onClose }: { onClose: () => void }) {
  const { editor } = useEditor();
  const sel = editor.getSelectedElements();
  const existing = sel.find((e) => e.link)?.link ?? '';
  const [value, setValue] = useState(existing);
  const [error, setError] = useState<string | null>(null);
  const preview = value.trim() ? normalizeLink(value) : null;

  const save = () => {
    if (!editor.setLinkOnSelection(value)) return setError('That doesn’t look like a web address — try https://example.com');
    editor.toast(value.trim() ? 'Link added — Ctrl+click or use the link badge to open it' : 'Link removed');
    onClose();
  };

  return (
    <Modal title={existing ? 'Edit link' : 'Add link'} onClose={onClose}>
      <Field
        label={`Link for ${sel.length === 1 ? 'this element' : `${sel.length} elements`}`}
        hint={error ?? (preview && preview !== value.trim() ? `Opens ${preview}` : 'A web page, email address or phone link.')}
      >
        <input
          className="sb-input"
          autoFocus
          placeholder="https://example.com"
          value={value}
          aria-label="Link address"
          aria-invalid={!!error}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </Field>
      <div className="sb-modal__actions">
        {existing && (
          <button
            className="sb-btn"
            onClick={() => {
              editor.setLinkOnSelection(null);
              editor.toast('Link removed');
              onClose();
            }}
          >
            Remove link
          </button>
        )}
        <button className="sb-btn" onClick={onClose}>Cancel</button>
        <button className="sb-btn sb-btn--primary" onClick={save} disabled={!sel.length}>
          Save
        </button>
      </div>
    </Modal>
  );
}

/** "Clear canvas?" — the board is only wiped after this is confirmed. */
export function ClearCanvasDialog({ onClose }: { onClose: () => void }) {
  const { editor } = useEditor();
  const count = editor.scene.getElements().length;
  const live = useAppState((s) => s.collab.status) === 'connected';
  const clear = () => {
    editor.clearCanvas();
    editor.toast('Canvas cleared — press Ctrl+Z to undo');
    onClose();
  };
  return (
    <Modal title="Clear canvas?" onClose={onClose}>
      <p className="sb-confirm__text">
        This deletes everything on the board ({count} {count === 1 ? 'element' : 'elements'}).
        {live && ' It also clears the board for everyone in this live session.'} You can undo it with Ctrl+Z.
      </p>
      <div className="sb-modal__actions">
        <button className="sb-btn" onClick={onClose} autoFocus>
          Cancel
        </button>
        <button className="sb-btn sb-btn--danger-fill" onClick={clear}>
          Clear canvas
        </button>
      </div>
    </Modal>
  );
}
