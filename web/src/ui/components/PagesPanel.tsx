import { memo, useEffect, useRef, useState } from 'react';
import { pageRects } from '../../page/pageLayout';
import { PAGE_SIZES } from '../../page/pageSizes';
import { drawPageThumbnail } from '../../page/pageThumbnail';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';
import { Icons } from '../icons/Icons';

const THUMB_WIDTH = 150;

/**
 * PDF-viewer style page strip: a live thumbnail per page, the page in view highlighted,
 * click to jump (the board flashes the page outline). Thumbnails are rendered lazily -
 * only while scrolled into view - and debounced while you draw, so long documents stay fast.
 */
export function PagesPanel() {
  const { editor } = useEditor();
  const setup = useAppState((s) => s.pageSetup);
  useAppState((s) => s.viewport); // re-evaluate the current page while scrolling the board
  const revision = useSceneRevision();
  const listRef = useRef<HTMLDivElement>(null);

  const count = setup.size === 'infinite' ? 0 : editor.getPageCount();
  const current = editor.currentPageIndex();

  // keep the active thumbnail visible as the board scrolls
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-page="${current}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current]);

  if (setup.size === 'infinite') {
    return (
      <div className="sb-empty">
        <div className="sb-empty__art">
          <Icons.pages />
        </div>
        <p className="sb-empty__title">No pages on an infinite canvas</p>
        <p className="sb-muted">Pick a paper size (A4, A3, Letter…) to turn the board into pages with numbers, headers and footers.</p>
        <button className="sb-btn sb-btn--primary" onClick={() => editor.setState({ openDialog: 'page' })}>
          Choose paper size
        </button>
      </div>
    );
  }

  const go = (i: number) => editor.goToPage(Math.max(0, Math.min(count - 1, i)));

  return (
    <div className="sb-pages">
      <div className="sb-pages__bar">
        <button className="sb-icon-btn" onClick={() => go(current - 1)} disabled={current <= 0} aria-label="Previous page" title="Previous page (PageUp)">
          <Icons.chevronUp />
        </button>
        <span className="sb-pages__counter">
          Page <PageInput value={current + 1} max={count} onCommit={(n) => go(n - 1)} /> of {count}
        </span>
        <button className="sb-icon-btn" onClick={() => go(current + 1)} disabled={current >= count - 1} aria-label="Next page" title="Next page (PageDown)">
          <Icons.chevronDown />
        </button>
      </div>
      <div className="sb-pages__list" ref={listRef}>
        {Array.from({ length: count }, (_, i) => (
          <PageThumb key={i} index={i} active={i === current} revision={revision} onSelect={() => go(i)} />
        ))}
      </div>
      <div className="sb-pages__foot">
        <span className="sb-muted">
          {PAGE_SIZES[setup.size as keyof typeof PAGE_SIZES]?.label} · {setup.orientation}
        </span>
        <button
          className="sb-btn sb-btn--sm"
          onClick={() => {
            editor.setState({ pageSetup: { ...setup, pageCount: count + 1 } });
            requestAnimationFrame(() => editor.goToPage(count));
          }}
        >
          + Add page
        </button>
      </div>
    </div>
  );
}

function PageInput({ value, max, onCommit }: { value: number; max: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number(draft);
    if (draft !== null && Number.isFinite(n) && n >= 1) onCommit(Math.min(max, Math.round(n)));
    setDraft(null);
  };
  return (
    <input
      className="sb-pages__input"
      inputMode="numeric"
      aria-label="Go to page"
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

const PageThumb = memo(function PageThumb(p: { index: number; active: boolean; revision: number; onSelect: () => void }) {
  const { editor } = useEditor();
  const setup = useAppState((s) => s.pageSetup);
  const colorMode = useAppState((s) => s.viewColorMode);
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  // lazy: only thumbnails scrolled into view are rendered
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !ref.current) return;
    const canvas = ref.current;
    // debounce while drawing: the board updates every frame, thumbnails don't need to
    const t = setTimeout(() => {
      const rect = pageRects(setup, editor.getPageCount())[p.index];
      if (!rect) return;
      drawPageThumbnail(canvas, {
        elements: editor.scene.getElements(),
        page: rect,
        decorations: editor.getPageDecorations().filter((d) => d.page === p.index + 1),
        colorMode,
        width: THUMB_WIDTH,
        dpr: Math.min(2, window.devicePixelRatio || 1),
      });
    }, 250);
    return () => clearTimeout(t);
  }, [visible, p.revision, p.index, setup, colorMode, editor]);

  const ratio = setup.orientation === 'landscape' ? '1.414 / 1' : '1 / 1.414';
  return (
    <button
      className={`sb-thumb ${p.active ? 'is-active' : ''}`}
      data-page={p.index}
      onClick={p.onSelect}
      aria-label={`Go to page ${p.index + 1}`}
      aria-current={p.active ? 'page' : undefined}
    >
      <canvas ref={ref} className="sb-thumb__canvas" style={{ aspectRatio: ratio, width: THUMB_WIDTH }} />
      <span className="sb-thumb__num">{p.index + 1}</span>
    </button>
  );
});
