import { serverConfigured } from '../cloud/serverConfig';
import { ApiError } from '../cloud/WorkspaceApi';
import type { WorkspaceService } from '../cloud/WorkspaceService';
import type { Editor } from '../editor/Editor';
import type { LibraryStore } from '../library/LibraryStore';
import type { Action } from './actions';

const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;

/** Friendly text for workspace errors (most often: the server isn't running). */
export function workspaceErrorMessage(e: unknown): string {
  if (!serverConfigured()) return 'this copy of SketchBoard has no server — use Save to file instead';
  if (e instanceof ApiError && e.offline) return 'The workspace server isn’t running — start it with “npm run dev” in collab-server';
  return (e as Error).message;
}

const openLibraryTab = (ed: Editor) => ed.setState((s) => ({ sidebar: { ...s.sidebar, open: true, tab: 'library' } }));

/** Actions that need the workspace service (registered by the composition root). */
export function workspaceActions(ws: WorkspaceService): Action[] {
  return [
    {
      id: 'dialog:workspace',
      label: 'Workspace…',
      perform: (ed) => ed.setState({ openDialog: 'workspace' }),
    },
    {
      id: 'saveToWorkspace',
      label: 'Save to workspace',
      shortcut: 'Ctrl+Shift+S',
      keyTest: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === 's',
      perform: async (ed) => {
        // not saved yet → ask for a name in the workspace dialog
        if (!ed.getState().workspaceFile) return ed.setState({ openDialog: 'workspace' });
        try {
          const meta = await ws.save();
          ed.toast(`Saved “${meta.name}” to the workspace`);
        } catch (e) {
          ed.toast(`Couldn’t save: ${workspaceErrorMessage(e)}`);
        }
      },
    },
    {
      id: 'dialog:link',
      label: 'Export to link…',
      enabled: (ed) => ed.scene.getElements().length > 0,
      perform: (ed) => ed.setState({ openDialog: 'link' }),
    },
  ];
}

/** Actions that need the library store. */
export function libraryActions(library: LibraryStore): Action[] {
  const add = (ed: Editor, all: boolean) => {
    const elements = all ? ed.scene.getElements() : ed.withFrameChildren(ed.getSelectedElements());
    if (!elements.length) return ed.toast(all ? 'The board is empty' : 'Select something to add to your library first');
    try {
      const item = library.add(elements);
      if (item) {
        ed.toast(`Added “${item.name}” to your library`);
        openLibraryTab(ed);
      }
    } catch (e) {
      ed.toast((e as Error).message);
    }
  };
  return [
    {
      id: 'addToLibrary',
      label: 'Add to library',
      shortcut: 'Shift+L',
      keyTest: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && e.code === 'KeyL',
      enabled: (ed) => Object.keys(ed.getState().selectedIds).length > 0,
      perform: (ed) => add(ed, false),
    },
    { id: 'addCanvasToLibrary', label: 'Add whole canvas to library', perform: (ed) => add(ed, true) },
    { id: 'openLibrary', label: 'Libraries', perform: openLibraryTab },
  ];
}
