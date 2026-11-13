import { useEffect, useMemo, useRef, useState } from 'react';
import { FIGURE_CATEGORIES, FIGURES, figureGeometry, getFigure } from '../../elements/figures/figures';
import { useAppState, useEditor } from '../EditorContext';

const iconCache = new Map<string, { viewBox: string; outline: string; details: string }>();

/** Small line drawing of a figure, generated from the same geometry the board uses. */
export function FigureIcon({ id, size = 22 }: { id: string; size?: number }) {
  let icon = iconCache.get(id);
  if (!icon) {
    const def = getFigure(id);
    const ratio = def?.ratio ?? 1;
    const w = ratio >= 1 ? 40 : 40 * ratio;
    const h = ratio >= 1 ? 40 / ratio : 40;
    const g = figureGeometry(id, w, h, def?.tail);
    const pts = [...g.polylines, ...g.detailLines].flat();
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const side = Math.max(x1 - x0, y1 - y0) + 6;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    icon = { viewBox: `${cx - side / 2} ${cy - side / 2} ${side} ${side}`, outline: g.outline, details: g.details };
    iconCache.set(id, icon);
  }
  return (
    <svg viewBox={icon.viewBox} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={icon.outline} />
      {icon.details && <path d={icon.details} />}
    </svg>
  );
}

/** Toolbar button + popover with every gallery shape, grouped in sections. */
export function ShapeGallery() {
  const { editor } = useEditor();
  const active = useAppState((s) => s.activeTool);
  const current = useAppState((s) => s.currentFigure);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FIGURE_CATEGORIES.map((c) => ({
      name: c,
      items: FIGURES.filter((f) => f.category === c && (!q || f.label.toLowerCase().includes(q) || c.toLowerCase().includes(q))),
    })).filter((s) => s.items.length);
  }, [query]);

  const label = getFigure(current)?.label ?? 'Shapes';
  return (
    <div className="sb-more sb-shapes" ref={ref}>
      <button
        className={`sb-tool ${active === 'figure' ? 'is-active' : ''} ${open ? 'is-open' : ''}`}
        aria-label="Shapes"
        aria-expanded={open}
        title={`Shapes — ${label} (S). Callouts, stars, arrows, flowchart…`}
        onClick={() => {
          // first click on an inactive tool picks the last shape; the popover is one click away
          if (active !== 'figure' && !open) editor.setTool('figure');
          setOpen(!open);
        }}
      >
        <FigureIcon id={current} size={20} />
        <span className="sb-tool__key">S</span>
      </button>
      {open && (
        <div className="sb-island sb-more__menu sb-shapes__menu" role="dialog" aria-label="Shapes">
          <input
            className="sb-input sb-shapes__search"
            placeholder="Search shapes…"
            value={query}
            autoFocus={!('ontouchstart' in window)}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search shapes"
          />
          <div className="sb-shapes__scroll">
            {sections.map((s) => (
              <section key={s.name}>
                <p className="sb-more__heading">{s.name}</p>
                <div className="sb-shapes__grid">
                  {s.items.map((f) => (
                    <button
                      key={f.id}
                      className={`sb-shapes__item ${active === 'figure' && current === f.id ? 'is-active' : ''}`}
                      title={f.label}
                      aria-label={f.label}
                      onClick={() => {
                        editor.setFigure(f.id);
                        setOpen(false);
                      }}
                    >
                      <FigureIcon id={f.id} size={26} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {!sections.length && <p className="sb-muted sb-shapes__empty">No shapes match “{query}”</p>}
          </div>
          <p className="sb-muted sb-shapes__hint">Drag on the board to draw · click to drop · Shift keeps proportions</p>
        </div>
      )}
    </div>
  );
}
