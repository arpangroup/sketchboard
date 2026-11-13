import { useEffect, useState } from 'react';
import type {
  HeaderFooterSlot,
  HeaderFooterText,
  PageNumberFormat,
  PageNumberPosition,
  PageMargins,
  PageSetup,
} from '../../../core/types';
import { MAX_PAGES, PAGE_NUMBER_FORMAT_OPTIONS, requiredPageCount } from '../../../page/pageLayout';
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

/** Header, footer and page numbering - printed on every page. */
function HeaderFooterFields({ setup, update }: { setup: PageSetup; update: (p: Partial<PageSetup>) => void }) {
  const pn = setup.pageNumbers ?? { enabled: false, position: 'footer-center' as PageNumberPosition, format: 'page-n-of-m' as PageNumberFormat };
  const setPn = (patch: Partial<typeof pn>) => update({ pageNumbers: { ...pn, ...patch } });
  const row = (area: 'header' | 'footer') => {
    const values = setup[area] ?? EMPTY_HF;
    return (
      <Field label={area === 'header' ? 'Header' : 'Footer'}>
        <div className="sb-hf-row">
          {SLOTS.map((slot) => {
            const numbered = pn.enabled && pn.position === `${area}-${slot}`;
            return (
              <input
                key={slot}
                className={`sb-input sb-hf-input sb-hf-input--${slot}`}
                placeholder={numbered ? `${slot} · page number` : slot[0].toUpperCase() + slot.slice(1)}
                value={values[slot]}
                onChange={(e) => update({ [area]: { ...values, [slot]: e.target.value.slice(0, 120) } })}
                aria-label={`${area} ${slot}`}
              />
            );
          })}
        </div>
      </Field>
    );
  };
  return (
    <section className="sb-hf">
      <h3 className="sb-hf__title">Header, footer &amp; page numbers</h3>
      <Field label="Document title" hint="Use {title}, {page}, {pages} and {date} in any header or footer.">
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
    </section>
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
