import type { DialogId, ToolType } from '../core/types';
import type { Editor } from '../editor/Editor';
import { fileNameFor, openSceneFile, saveExcalidrawFile, saveSceneToFile } from '../persistence/fileService';
import { describeImport } from '../persistence/importScene';
import { STORAGE_KEYS } from '../core/constants';

/**
 * Command pattern: every user-invokable operation is an Action. Toolbar buttons, menus and
 * keyboard shortcuts all dispatch through ActionManager, so behaviour is defined once and
 * new commands are added without touching UI or keyboard code.
 */
export interface Action {
  id: string;
  label: string;
  /** Human readable shortcut, e.g. "Ctrl+Z" */
  shortcut?: string;
  /** Returns true if this keyboard event should trigger the action. */
  keyTest?: (e: KeyboardEvent, editor: Editor) => boolean;
  perform: (editor: Editor) => void | Promise<void>;
  /** Action is unavailable when this returns false. */
  enabled?: (editor: Editor) => boolean;
}

const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;
const plain = (e: KeyboardEvent) => !e.ctrlKey && !e.metaKey && !e.altKey;
const key = (e: KeyboardEvent, k: string) => e.key.toLowerCase() === k;
const hasSelection = (ed: Editor) => Object.keys(ed.getState().selectedIds).length > 0;

const toolAction = (tool: ToolType, label: string, keys: string[]): Action => ({
  id: `tool:${tool}`,
  label,
  shortcut: keys.map((k) => k.toUpperCase()).join(' or '),
  keyTest: (e) => plain(e) && !e.shiftKey && keys.some((k) => key(e, k)),
  perform: (ed) => ed.setTool(tool),
});

const dialogAction = (id: DialogId, label: string, shortcut?: string, test?: Action['keyTest']): Action => ({
  id: `dialog:${id}`,
  label,
  shortcut,
  keyTest: test,
  perform: (ed) => ed.setState({ openDialog: id }),
});

export const ACTIONS: Action[] = [
  toolAction('selection', 'Select', ['v', '1']),
  toolAction('rectangle', 'Rectangle', ['r', '2']),
  toolAction('diamond', 'Diamond', ['d', '3']),
  toolAction('ellipse', 'Ellipse', ['o', '4']),
  toolAction('arrow', 'Arrow', ['a', '5']),
  toolAction('line', 'Line', ['l', '6']),
  toolAction('freedraw', 'Pen', ['p', '7']),
  toolAction('highlighter', 'Highlighter', ['m']),
  toolAction('laser', 'Laser pointer', ['k']),
  {
    id: 'insertImage',
    label: 'Insert image',
    shortcut: '9',
    keyTest: (e) => plain(e) && !e.shiftKey && e.key === '9',
    perform: (ed) => ed.pickImages(),
  },
  ...(['bold', 'italic', 'underline'] as const).map(
    (kind): Action => ({
      id: `text:${kind}`,
      label: kind[0].toUpperCase() + kind.slice(1),
      shortcut: `Ctrl+${kind[0].toUpperCase()}`,
      keyTest: (e, ed) => mod(e) && !e.shiftKey && key(e, kind[0]) && ed.getSelectedElements().some((el) => el.type === 'text'),
      perform: (ed) => ed.toggleTextFormat(kind),
    }),
  ),
  ...(['bullet', 'number'] as const).map(
    (kind): Action => ({
      id: `text:${kind}List`,
      label: kind === 'bullet' ? 'Bulleted list' : 'Numbered list',
      shortcut: kind === 'bullet' ? 'Ctrl+Shift+8' : 'Ctrl+Shift+7',
      keyTest: (e, ed) => mod(e) && e.shiftKey && e.code === (kind === 'bullet' ? 'Digit8' : 'Digit7') && ed.getSelectedElements().length > 0,
      perform: (ed) => ed.toggleList(kind),
    }),
  ),
  {
    id: 'toggleShapeRecognition',
    label: 'Draw to shape',
    shortcut: 'Shift+S',
    keyTest: (e) => !mod(e) && !e.altKey && e.shiftKey && key(e, 's'),
    perform: (ed) => {
      const on = !ed.getState().shapeRecognition;
      ed.setState({ shapeRecognition: on });
      try {
        localStorage.setItem(STORAGE_KEYS.shapeRecognition, String(on));
      } catch {
        /* ignore */
      }
      ed.toast(on ? 'Draw to shape on — pen strokes snap to clean shapes' : 'Draw to shape off');
    },
  },
  {
    id: 'togglePenMode',
    label: 'Pen mode (fingers pan, pen draws)',
    perform: (ed) => ed.setPenMode(!ed.getState().penMode),
  },
  toolAction('text', 'Text', ['t', '8']),
  toolAction('table', 'Table', ['g']),
  {
    id: 'tool:eraser',
    label: 'Eraser (last used: stroke or precision)',
    shortcut: 'E or 0',
    keyTest: (e) => plain(e) && !e.shiftKey && (key(e, 'e') || e.key === '0'),
    perform: (ed) => ed.setEraser(),
  },
  {
    id: 'tool:precisionEraser',
    label: 'Precision eraser',
    shortcut: 'Shift+E',
    keyTest: (e) => plain(e) && e.shiftKey && key(e, 'e'),
    perform: (ed) => ed.setEraser('precision'),
  },
  {
    id: 'rotateRight',
    label: 'Rotate 90° clockwise',
    shortcut: 'Shift+R',
    keyTest: (e) => e.shiftKey && !e.altKey && !mod(e) && e.code === 'KeyR',
    enabled: hasSelection,
    perform: (ed) => ed.rotateSelection(Math.PI / 2),
  },
  {
    id: 'rotateLeft',
    label: 'Rotate 90° counter-clockwise',
    shortcut: 'Shift+Alt+R',
    keyTest: (e) => e.shiftKey && e.altKey && !mod(e) && e.code === 'KeyR',
    enabled: hasSelection,
    perform: (ed) => ed.rotateSelection(-Math.PI / 2),
  },
  {
    id: 'insertCode',
    label: 'Insert code block',
    shortcut: 'C',
    keyTest: (e) => plain(e) && !e.shiftKey && key(e, 'c'),
    perform: (ed) => ed.insertCode(),
  },
  {
    id: 'insertMath',
    label: 'Insert maths (LaTeX)',
    shortcut: 'Alt+=',
    keyTest: (e) => e.altKey && !mod(e) && e.code === 'Equal',
    perform: (ed) => void ed.insertMath(),
  },
  {
    id: 'tool:figure',
    label: 'Shapes gallery (last used shape)',
    shortcut: 'S',
    keyTest: (e) => plain(e) && !e.shiftKey && key(e, 's'),
    perform: (ed) => ed.setTool('figure'),
  },
  toolAction('hand', 'Hand (pan)', ['h']),
  {
    id: 'toggleToolLock',
    label: 'Keep selected tool active',
    shortcut: 'Q',
    keyTest: (e) => plain(e) && key(e, 'q'),
    perform: (ed) => ed.setState((s) => ({ toolLocked: !s.toolLocked })),
  },
  {
    id: 'undo',
    label: 'Undo',
    shortcut: 'Ctrl+Z',
    keyTest: (e) => mod(e) && !e.shiftKey && key(e, 'z'),
    perform: (ed) => ed.undo(),
    enabled: (ed) => ed.history.canUndo,
  },
  {
    id: 'redo',
    label: 'Redo',
    shortcut: 'Ctrl+Shift+Z',
    keyTest: (e) => mod(e) && ((e.shiftKey && key(e, 'z')) || key(e, 'y')),
    perform: (ed) => ed.redo(),
    enabled: (ed) => ed.history.canRedo,
  },
  {
    id: 'delete',
    label: 'Delete',
    shortcut: 'Delete',
    keyTest: (e) => e.key === 'Delete' || e.key === 'Backspace',
    perform: (ed) => ed.deleteSelected(),
    enabled: hasSelection,
  },
  {
    id: 'duplicate',
    label: 'Duplicate',
    shortcut: 'Ctrl+D',
    keyTest: (e) => mod(e) && key(e, 'd'),
    perform: (ed) => ed.duplicateSelected(),
    enabled: hasSelection,
  },
  {
    id: 'selectAll',
    label: 'Select all',
    shortcut: 'Ctrl+A',
    keyTest: (e) => mod(e) && key(e, 'a'),
    perform: (ed) => ed.selectAll(),
  },
  {
    id: 'copy',
    label: 'Copy',
    shortcut: 'Ctrl+C',
    keyTest: (e) => mod(e) && !e.altKey && !e.shiftKey && key(e, 'c'),
    perform: (ed) => ed.copySelected(),
    enabled: hasSelection,
  },
  {
    id: 'cut',
    label: 'Cut',
    shortcut: 'Ctrl+X',
    keyTest: (e) => mod(e) && !e.altKey && key(e, 'x'),
    perform: (ed) => ed.copySelected(true),
    enabled: hasSelection,
  },
  {
    id: 'paste',
    label: 'Paste',
    shortcut: 'Ctrl+V',
    // no keyTest: Ctrl/Cmd+V is handled by the native 'paste' event (it carries images & text)
    perform: (ed) => ed.paste(),
  },
  {
    id: 'lock',
    label: 'Lock / unlock',
    shortcut: 'Ctrl+Shift+L',
    keyTest: (e) => mod(e) && e.shiftKey && key(e, 'l'),
    perform: (ed) => ed.toggleLockSelected(),
    enabled: hasSelection,
  },
  {
    id: 'bringToFront',
    label: 'Bring to front',
    shortcut: 'Ctrl+Shift+]',
    keyTest: (e) => mod(e) && e.shiftKey && (e.code === 'BracketRight'),
    perform: (ed) => ed.reorderSelected('front'),
    enabled: hasSelection,
  },
  {
    id: 'bringForward',
    label: 'Bring forward',
    shortcut: 'Ctrl+]',
    keyTest: (e) => mod(e) && !e.shiftKey && e.code === 'BracketRight',
    perform: (ed) => ed.reorderSelected('forward'),
    enabled: hasSelection,
  },
  {
    id: 'sendBackward',
    label: 'Send backward',
    shortcut: 'Ctrl+[',
    keyTest: (e) => mod(e) && !e.shiftKey && e.code === 'BracketLeft',
    perform: (ed) => ed.reorderSelected('backward'),
    enabled: hasSelection,
  },
  {
    id: 'sendToBack',
    label: 'Send to back',
    shortcut: 'Ctrl+Shift+[',
    keyTest: (e) => mod(e) && e.shiftKey && e.code === 'BracketLeft',
    perform: (ed) => ed.reorderSelected('back'),
    enabled: hasSelection,
  },
  {
    id: 'group',
    label: 'Group selection',
    shortcut: 'Ctrl+G',
    keyTest: (e) => mod(e) && !e.shiftKey && !e.altKey && e.code === 'KeyG',
    perform: (ed) => ed.groupSelected(),
    enabled: (ed) => ed.canGroup(),
  },
  {
    id: 'ungroup',
    label: 'Ungroup',
    shortcut: 'Ctrl+Shift+G',
    keyTest: (e) => mod(e) && e.shiftKey && !e.altKey && e.code === 'KeyG',
    perform: (ed) => ed.ungroupSelected(),
    enabled: (ed) => ed.canUngroup(),
  },
  {
    id: 'wrapInFrame',
    label: 'Wrap selection in frame',
    shortcut: 'Shift+F',
    keyTest: (e) => !mod(e) && !e.altKey && e.shiftKey && e.code === 'KeyF',
    perform: (ed) => ed.wrapSelectionInFrame(),
    enabled: (ed) => ed.getSelectedElements().some((el) => el.type !== 'frame'),
  },
  {
    id: 'removeFrame',
    label: 'Remove frame (keep contents)',
    perform: (ed) => ed.removeFrameSelected(),
    enabled: (ed) => ed.getSelectedElements().some((el) => el.type === 'frame'),
  },
  {
    id: 'selectFrameContents',
    label: 'Select frame contents',
    perform: (ed) => ed.selectFrameContents(),
    enabled: (ed) => ed.getSelectedElements().some((el) => el.type === 'frame'),
  },
  {
    id: 'flipHorizontal',
    label: 'Flip horizontal',
    shortcut: 'Shift+H',
    keyTest: (e) => !mod(e) && !e.altKey && e.shiftKey && e.code === 'KeyH',
    perform: (ed) => ed.flipSelected('horizontal'),
    enabled: hasSelection,
  },
  {
    id: 'flipVertical',
    label: 'Flip vertical',
    shortcut: 'Shift+V',
    keyTest: (e) => !mod(e) && !e.altKey && e.shiftKey && e.code === 'KeyV',
    perform: (ed) => ed.flipSelected('vertical'),
    enabled: hasSelection,
  },
  {
    id: 'insertPageAbove',
    label: 'Insert blank page above',
    perform: (ed) => ed.insertPageAt(ed.pageForCommand()),
    enabled: (ed) => ed.getState().pageSetup.size !== 'infinite',
  },
  {
    id: 'insertPageBelow',
    label: 'Insert blank page below',
    perform: (ed) => ed.insertPageAt(ed.pageForCommand() + 1),
    enabled: (ed) => ed.getState().pageSetup.size !== 'infinite',
  },
  {
    id: 'deletePage',
    label: 'Delete this page',
    perform: (ed) => ed.deletePageAt(ed.pageForCommand()),
    enabled: (ed) => ed.getState().pageSetup.size !== 'infinite' && ed.getPageCount() > 1,
  },
  {
    id: 'straighten',
    label: 'Straighten line (remove bends)',
    perform: (ed) => ed.straightenSelected(),
    enabled: (ed) => ed.canStraighten(),
  },
  {
    id: 'copyAsPng',
    label: 'Copy to clipboard as PNG',
    shortcut: 'Shift+Alt+C',
    keyTest: (e) => !mod(e) && e.altKey && e.shiftKey && e.code === 'KeyC',
    perform: (ed) => ed.copyAsPng(),
    enabled: (ed) => ed.scene.getElements().length > 0,
  },
  {
    id: 'copyAsSvg',
    label: 'Copy to clipboard as SVG',
    shortcut: 'Shift+Alt+S',
    keyTest: (e) => !mod(e) && e.altKey && e.shiftKey && e.code === 'KeyS',
    perform: (ed) => ed.copyAsSvg(),
    enabled: (ed) => ed.scene.getElements().length > 0,
  },
  {
    id: 'copyStyles',
    label: 'Copy styles',
    shortcut: 'Ctrl+Alt+C',
    keyTest: (e) => mod(e) && e.altKey && !e.shiftKey && e.code === 'KeyC',
    perform: (ed) => ed.copyStyles(),
    enabled: hasSelection,
  },
  {
    id: 'pasteStyles',
    label: 'Paste styles',
    shortcut: 'Ctrl+Alt+V',
    keyTest: (e) => mod(e) && e.altKey && !e.shiftKey && e.code === 'KeyV',
    perform: (ed) => ed.pasteStyles(),
    enabled: (ed) => hasSelection(ed) && ed.hasCopiedStyles(),
  },
  {
    id: 'hyperlink',
    label: 'Add link…',
    shortcut: 'Ctrl+K',
    keyTest: (e) => mod(e) && !e.shiftKey && !e.altKey && e.code === 'KeyK',
    perform: (ed) => ed.setState({ openDialog: 'hyperlink' }),
    enabled: hasSelection,
  },
  {
    id: 'openLink',
    label: 'Open link',
    perform: (ed) => {
      const el = ed.getSelectedElements().find((x) => x.link);
      if (el) ed.openLink(el);
    },
    enabled: (ed) => ed.getSelectedElements().some((x) => x.link),
  },
  {
    id: 'zoomIn',
    label: 'Zoom in',
    shortcut: 'Ctrl++',
    keyTest: (e) => mod(e) && (e.key === '=' || e.key === '+'),
    perform: (ed) => ed.zoomIn(),
  },
  {
    id: 'zoomOut',
    label: 'Zoom out',
    shortcut: 'Ctrl+-',
    keyTest: (e) => mod(e) && e.key === '-',
    perform: (ed) => ed.zoomOut(),
  },
  {
    id: 'resetZoom',
    label: 'Reset zoom',
    shortcut: 'Ctrl+0',
    keyTest: (e) => mod(e) && e.key === '0',
    perform: (ed) => ed.resetZoom(),
  },
  {
    id: 'zoomToFit',
    label: 'Zoom to fit drawing',
    shortcut: 'Shift+1',
    keyTest: (e) => e.shiftKey && e.code === 'Digit1' && !mod(e),
    perform: (ed) => ed.zoomToFit(),
  },
  {
    id: 'zoomToPage',
    label: 'Zoom to page',
    shortcut: 'Shift+2',
    keyTest: (e) => e.shiftKey && e.code === 'Digit2' && !mod(e),
    perform: (ed) => ed.zoomToPage(),
  },
  {
    id: 'toggleGrid',
    label: 'Toggle grid',
    shortcut: "Ctrl+'",
    keyTest: (e) => mod(e) && e.key === "'",
    perform: (ed) => ed.setState((s) => ({ gridEnabled: !s.gridEnabled })),
  },
  {
    id: 'saveFile',
    label: 'Save to file',
    shortcut: 'Ctrl+S',
    keyTest: (e) => mod(e) && !e.shiftKey && key(e, 's'),
    perform: (ed) => saveSceneToFile(ed.getSceneData(false, true), fileNameFor(ed.getState().pageSetup)),
  },
  {
    id: 'saveExcalidraw',
    label: 'Save as Excalidraw file',
    perform: (ed) => {
      const name = fileNameFor(ed.getState().pageSetup);
      saveExcalidrawFile(ed.getSceneData(false, true), name);
      ed.toast(`Saved ${name}.excalidraw — open it at excalidraw.com`);
    },
  },
  {
    id: 'openFile',
    label: 'Open file',
    shortcut: 'Ctrl+O',
    keyTest: (e) => mod(e) && key(e, 'o'),
    perform: async (ed) => {
      try {
        const opened = await openSceneFile();
        if (opened) {
          ed.loadScene(opened.scene);
          ed.zoomToFit();
          ed.toast(describeImport(opened.name, opened));
        }
      } catch (err) {
        ed.toast(`Could not open file: ${(err as Error).message}`);
      }
    },
  },
  {
    id: 'clearCanvas',
    label: 'Clear canvas',
    // asks first (ClearCanvasDialog), then calls editor.clearCanvas()
    perform: (ed) => (ed.scene.getElements().length ? ed.setState({ openDialog: 'clearCanvas' }) : ed.toast('The canvas is already empty')),
  },
  dialogAction('export', 'Export image…', 'Ctrl+Shift+E', (e) => mod(e) && e.shiftKey && key(e, 'e')),
  dialogAction('print', 'Print…', 'Ctrl+P', (e) => mod(e) && key(e, 'p')),
  dialogAction('page', 'Page setup…'),
  dialogAction('collab', 'Live collaboration…'),
  dialogAction('help', 'Keyboard shortcuts', '?', (e) => e.key === '?'),
];

export class ActionManager {
  private actions = new Map<string, Action>();

  constructor(private editor: Editor, actions: Action[] = ACTIONS) {
    actions.forEach((a) => this.register(a));
  }

  register(action: Action): void {
    this.actions.set(action.id, action);
  }

  get(id: string): Action | undefined {
    return this.actions.get(id);
  }

  list(): Action[] {
    return [...this.actions.values()];
  }

  isEnabled(id: string): boolean {
    const a = this.actions.get(id);
    return !!a && (a.enabled?.(this.editor) ?? true);
  }

  execute(id: string): void {
    const a = this.actions.get(id);
    if (a && this.isEnabled(id)) void a.perform(this.editor);
  }

  /** Returns true if an action handled the event. */
  handleKeyDown(e: KeyboardEvent): boolean {
    for (const a of this.actions.values()) {
      if (a.keyTest?.(e, this.editor)) {
        if (!this.isEnabled(a.id)) return false;
        e.preventDefault();
        void a.perform(this.editor);
        return true;
      }
    }
    return false;
  }
}
