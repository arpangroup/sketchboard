import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ActionManager } from '../actions/actions';
import type { CollabSession } from '../collab/CollabSession';
import type { WorkspaceService } from '../cloud/WorkspaceService';
import type { LibraryStore } from '../library/LibraryStore';
import type { AppState } from '../core/types';
import type { Editor } from '../editor/Editor';
import { pwa, type PwaState } from '../pwa/pwa';

export interface EditorServices {
  editor: Editor;
  actions: ActionManager;
  collab: CollabSession;
  workspace: WorkspaceService;
  library: LibraryStore;
}

export const EditorContext = createContext<EditorServices | null>(null);

export function useEditor(): EditorServices {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside <EditorContext.Provider>');
  return ctx;
}

/**
 * Subscribes a component to a slice of app state. The selector must return a primitive or an
 * existing reference so React only re-renders when that slice actually changes.
 */
export function useAppState<T>(selector: (s: AppState) => T): T {
  const { editor } = useEditor();
  return useSyncExternalStore(editor.store.subscribe, () => selector(editor.store.getState()));
}

/** PWA status (installability, updates, connectivity). */
export function usePwa(): PwaState {
  return useSyncExternalStore(pwa.subscribe, pwa.getState);
}

/** True on phone-sized screens - used to switch to touch-friendly layouts. */
export function useIsCompact(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(max-width: 600px)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(max-width: 600px)').matches,
  );
}

/** Re-renders when undo/redo availability or the scene changes. */
export function useSceneRevision(): number {
  const { editor } = useEditor();
  return useSyncExternalStore(
    (cb) => {
      const a = editor.scene.onChange(cb);
      const b = editor.history.subscribe(cb);
      return () => {
        a();
        b();
      };
    },
    () => editor.scene.revision * 1000 + (editor.history.canUndo ? 1 : 0) + (editor.history.canRedo ? 2 : 0),
  );
}
