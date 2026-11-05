import { useEffect } from 'react';
import { PAGE_SIZES } from '../../page/pageSizes';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';
import { Icons } from '../icons/Icons';

/** Top-right: print + share. */
export function TopRightActions() {
  const { actions } = useEditor();
  const status = useAppState((s) => s.collab.status);
  const peers = useAppState((s) => s.collab.collaborators);
  const count = Object.keys(peers).length;
  const { editor } = useEditor();
  const sidebarOpen = useAppState((s) => s.sidebar.open);
  const unread = useAppState((s) => s.chat.unread);
  return (
    <div className="sb-top-right">
      <button className="sb-island sb-btn" onClick={() => actions.execute('dialog:print')} title="Print (Ctrl+P)">
        <Icons.print />
        <span>Print</span>
      </button>
      <button
        className={`sb-btn sb-btn--primary ${status === 'connected' ? 'is-live' : ''}`}
        onClick={() => actions.execute('dialog:collab')}
        title="Live collaboration"
      >
        <Icons.share />
        <span>{status === 'connected' ? `Live${count ? ` · ${count + 1}` : ''}` : 'Share'}</span>
      </button>
      <button
        className={`sb-island sb-icon-btn sb-sidebar-toggle ${sidebarOpen ? 'is-active' : ''}`}
        onClick={() => editor.setState((s) => ({ sidebar: { ...s.sidebar, open: !s.sidebar.open } }))}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        aria-expanded={sidebarOpen}
        title="Sidebar — search, libraries, chat, presentation"
      >
        <Icons.sidebar />
        {unread > 0 && <span className="sb-badge-dot">{unread}</span>}
      </button>
    </div>
  );
}

/** Bottom-left: zoom + undo/redo. */
export function ZoomControls() {
  const { editor, actions } = useEditor();
  const zoom = useAppState((s) => s.viewport.zoom);
  useSceneRevision();
  return (
    <div className="sb-bottom-left">
      <div className="sb-island sb-group">
        <button className="sb-icon-btn" onClick={editor.zoomOut} aria-label="Zoom out" title="Zoom out (Ctrl -)">
          <Icons.minus />
        </button>
        <button className="sb-zoom-label" onClick={editor.resetZoom} title="Reset zoom (Ctrl 0)">
          {Math.round(zoom * 100)}%
        </button>
        <button className="sb-icon-btn" onClick={editor.zoomIn} aria-label="Zoom in" title="Zoom in (Ctrl +)">
          <Icons.plus />
        </button>
        <button className="sb-icon-btn" onClick={() => editor.zoomToFit()} aria-label="Zoom to fit" title="Zoom to fit (Shift 1)">
          <Icons.fit />
        </button>
      </div>
      <div className="sb-island sb-group">
        <button className="sb-icon-btn" disabled={!editor.history.canUndo} onClick={() => actions.execute('undo')} aria-label="Undo" title="Undo (Ctrl Z)">
          <Icons.undo />
        </button>
        <button className="sb-icon-btn" disabled={!editor.history.canRedo} onClick={() => actions.execute('redo')} aria-label="Redo" title="Redo (Ctrl Shift Z)">
          <Icons.redo />
        </button>
      </div>
    </div>
  );
}

/** Bottom-right: page format badge. */
export function PageBadge() {
  const { actions, editor } = useEditor();
  const page = useAppState((s) => s.pageSetup);
  const mode = useAppState((s) => s.viewColorMode);
  useSceneRevision();
  const pages = editor.getPageCount();
  const label =
    page.size === 'infinite'
      ? 'Infinite canvas'
      : `${PAGE_SIZES[page.size].label} · ${page.orientation}${pages > 1 ? ` · ${pages} pages` : ''}`;
  return (
    <div className="sb-bottom-right">
      {mode !== 'color' && (
        <button className="sb-island sb-badge sb-badge--warn" onClick={() => editor.setState({ viewColorMode: 'color' })} title="Back to colour preview">
          {mode === 'blackwhite' ? 'B/W preview' : 'Grayscale preview'} ✕
        </button>
      )}
      <button className="sb-island sb-badge" onClick={() => actions.execute('dialog:page')} title="Page setup">
        <Icons.page />
        {label}
      </button>
    </div>
  );
}

export function Toast() {
  const { editor } = useEditor();
  const toast = useAppState((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => editor.setState({ toast: null }), 3200);
    return () => clearTimeout(t);
  }, [toast, editor]);
  if (!toast) return null;
  return (
    <div className="sb-toast" role="status" key={toast.id}>
      {toast.message}
    </div>
  );
}

export function WelcomeHint() {
  const { editor } = useEditor();
  useSceneRevision();
  const tool = useAppState((s) => s.activeTool);
  if (editor.scene.getElements().length > 0) return null;
  return (
    <div className="sb-welcome" aria-hidden="true">
      <p className="sb-welcome__title">SketchBoard</p>
      <p>Pick a tool and start sketching{tool === 'selection' ? ' — try R for a rectangle, A for an arrow' : ''}.</p>
      <p className="sb-welcome__small">Everything is saved in your browser · No account needed</p>
    </div>
  );
}
