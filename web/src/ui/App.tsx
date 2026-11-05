import { type DragEvent, type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActionManager } from '../actions/actions';
import { CollabSession, parseRoomFromHash } from '../collab/CollabSession';
import { STORAGE_KEYS } from '../core/constants';
import type { DialogId, Theme } from '../core/types';
import { Editor } from '../editor/Editor';
import { Canvas } from './components/Canvas';
import { PageBadge, Toast, TopRightActions, WelcomeHint, ZoomControls } from './components/Chrome';
import { CollabDialog, HelpDialog, PageSetupDialog } from './components/dialogs/OtherDialogs';
import { ExportDialog } from './components/dialogs/ExportDialog';
import { PrintDialog } from './components/dialogs/PrintDialog';
import { MainMenu } from './components/MainMenu';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Sidebar, stopPresentation } from './components/Sidebar';
import { TextEditorOverlay } from './components/TextEditorOverlay';
import { CellEditorOverlay } from './components/CellEditorOverlay';
import { Toolbar } from './components/Toolbar';
import { EditorContext, type EditorServices, useAppState, useEditor } from './EditorContext';
import { InstallDialog, PwaBanners } from './components/Pwa';
import { onLaunchFiles } from '../pwa/pwa';
import { parseScene } from '../persistence/serialization';

/** Composition root: builds the object graph once and injects it via context. */
function createServices(): EditorServices {
  const editor = new Editor();
  return { editor, actions: new ActionManager(editor), collab: new CollabSession(editor) };
}

export default function App() {
  const services = useMemo(createServices, []);
  const { editor, collab } = services;

  useEffect(() => {
    try {
      const theme = localStorage.getItem(STORAGE_KEYS.theme) as Theme | null;
      if (theme) editor.setState({ theme });
      if (localStorage.getItem(STORAGE_KEYS.penMode) === 'true') editor.setState({ penMode: true });
      if (localStorage.getItem(STORAGE_KEYS.shapeRecognition) === 'true') editor.setState({ shapeRecognition: true });
      if (localStorage.getItem(STORAGE_KEYS.sidebarPinned) === 'true') {
        editor.setState((s) => ({ sidebar: { ...s.sidebar, pinned: true } }));
      }
    } catch {
      /* storage unavailable */
    }
    let cancelled = false;
    (async () => {
      if (parseRoomFromHash()) {
        await collab.joinFromUrl();
      } else if (await editor.restoreFromStorage()) {
        // keep the saved viewport
      } else if (!cancelled && editor.getState().pageSetup.size !== 'infinite') {
        requestAnimationFrame(() => editor.zoomToPage());
      }
    })().catch((e) => editor.toast(`Startup error: ${(e as Error).message}`));

    // Installed app: .sketchboard files opened from the OS arrive through the launch queue.
    onLaunchFiles(async (file) => {
      try {
        editor.loadScene(parseScene(await file.text()));
        editor.zoomToFit();
        editor.toast(`Opened ${file.name}`);
      } catch (e) {
        editor.toast(`Could not open ${file.name}: ${(e as Error).message}`);
      }
    });
    // App shortcuts from the manifest (long-press the home-screen icon).
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'collab') editor.setState({ openDialog: 'collab' });
    if (params.has('action') || params.has('source')) history.replaceState(null, '', location.pathname + location.hash);

    // Mobile browsers and installed apps rarely fire beforeunload - save when backgrounded.
    const onVisibility = () => document.visibilityState === 'hidden' && editor.flushSave();
    document.addEventListener('visibilitychange', onVisibility);

    const onHash = () => {
      if (parseRoomFromHash() && !collab.active) void collab.joinFromUrl();
    };
    const onUnload = () => editor.flushSave();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      collab.stop(false);
    };
  }, [editor, collab]);

  return (
    <EditorContext.Provider value={services}>
      <Shell />
    </EditorContext.Provider>
  );
}

function Shell() {
  const { editor } = useEditor();
  const theme = useAppState((s) => s.theme);
  const dialog = useAppState((s) => s.openDialog);
  const sidebar = useAppState((s) => s.sidebar);
  const presenting = useAppState((s) => s.presenting);
  const [dragging, setDragging] = useState(false);
  useKeyboard();

  // System paste: images (screenshots, copied pictures), SketchBoard elements, or plain text.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || editor.getState().openDialog || editor.getState().editingTextId) return;
      e.preventDefault();
      void editor.handlePaste(e.clipboardData);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editor]);

  const hasImageFiles = (e: DragEvent) => [...e.dataTransfer.items].some((i) => i.kind === 'file');
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const v = editor.getViewport();
    const at = { x: (e.clientX - rect.left) / v.zoom - v.scrollX, y: (e.clientY - rect.top) / v.zoom - v.scrollY };
    const scene = files.find((f) => f.name.endsWith('.sketchboard') || f.type === 'application/json');
    if (scene) {
      scene
        .text()
        .then((t) => {
          editor.loadScene(parseScene(t));
          editor.zoomToFit();
        })
        .catch((err) => editor.toast(`Could not open ${scene.name}: ${(err as Error).message}`));
      return;
    }
    void editor.insertImages(files, at);
  };

  // Leaving browser fullscreen (Esc / F11) also ends presentation mode.
  useEffect(() => {
    const onFs = () => !document.fullscreenElement && stopPresentation(editor);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [editor]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const close = () => editor.setState({ openDialog: null });
  const dialogs: Record<DialogId, ReactElement> = {
    export: <ExportDialog onClose={close} />,
    print: <PrintDialog onClose={close} />,
    page: <PageSetupDialog onClose={close} />,
    collab: <CollabDialog onClose={close} />,
    help: <HelpDialog onClose={close} />,
    install: <InstallDialog onClose={close} />,
  };

  return (
    <div className={`sb-app ${sidebar.open && sidebar.pinned && !presenting ? 'is-docked' : ''} ${presenting ? 'is-presenting' : ''}`}>
      {/* Full-bleed drawing surface; every control below floats on top of it. */}
      <main
        className="sb-stage"
        onDragOver={(e) => {
          if (!hasImageFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        {dragging && <div className="sb-drop-hint">Drop images here</div>}
        <Canvas />
        <TextEditorOverlay />
        <CellEditorOverlay />
        {presenting ? (
          <button className="sb-island sb-btn sb-present-exit" onClick={() => stopPresentation(editor)}>
            Exit presentation <kbd>Esc</kbd>
          </button>
        ) : (
          <>
            <WelcomeHint />
            <div className="sb-top">
              <MainMenu />
              <Toolbar />
              <TopRightActions />
            </div>
            <PropertiesPanel />
            <ZoomControls />
            <PageBadge />
          </>
        )}
        <Toast />
        {!presenting && <PwaBanners />}
      </main>
      {sidebar.open && !presenting && <Sidebar />}
      {dialog && dialogs[dialog]}
    </div>
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function useKeyboard() {
  const { editor, actions } = useEditor();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editor.getState().presenting && e.key === 'Escape') {
        stopPresentation(editor);
        return;
      }
      if (isTyping(e.target) || editor.getState().openDialog) return;
      if (e.code === 'Space') {
        editor.setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        const sb = editor.getState().sidebar;
        if (sb.open && !sb.pinned) editor.setState({ sidebar: { ...sb, open: false } });
        editor.setSelection([]);
        editor.setTool('selection');
        return;
      }
      if ((e.key === 'PageDown' || e.key === 'PageUp') && editor.getState().pageSetup.size !== 'infinite') {
        e.preventDefault();
        editor.goToPage(editor.currentPageIndex() + (e.key === 'PageDown' ? 1 : -1));
        return;
      }
      if (e.key === 'Enter') {
        const sel = editor.getSelectedElements();
        if (sel.length === 1 && sel[0].type === 'text') {
          e.preventDefault();
          editor.startTextEditing(sel[0].id);
          return;
        }
      }
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (arrows[e.key] && Object.keys(editor.getState().selectedIds).length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        editor.nudgeSelected(arrows[e.key][0] * step, arrows[e.key][1] * step);
        return;
      }
      actions.handleKeyDown(e);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') editor.setSpaceHeld(false);
    };
    const onBlur = () => editor.setSpaceHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [editor, actions]);
}
