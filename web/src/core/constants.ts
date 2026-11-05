import type { AppState, CurrentStyle, PageSetup } from './types';

export const LINE_HEIGHT = 1.25;

export const STROKE_COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
export const BACKGROUND_COLORS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa'];

export const COLLAB_COLORS = ['#e8590c', '#1c7ed6', '#2b8a3e', '#c2255c', '#7048e8', '#0c8599'];

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;

/** Size of resize handles in screen pixels */
export const HANDLE_SIZE = 9;
/** Hit tolerance in screen pixels (divided by zoom to get world units) */
export const HIT_TOLERANCE = 8;

export const DEFAULT_STYLE: CurrentStyle = {
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'hachure',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  fontSize: 24,
  fontFamily: 'hand',
  textAlign: 'left',
  fontWeight: 'normal',
  fontStyle: 'normal',
  underline: false,
  rounded: true,
  startArrowhead: 'none',
  endArrowhead: 'arrow',
  highlightColor: '#ffd43b',
};

export const HIGHLIGHT_COLORS = ['#ffd43b', '#69db7c', '#4dabf7', '#f783ac', '#ffa94d', '#b197fc'];

export const DEFAULT_PAGE_SETUP: PageSetup = {
  size: 'infinite',
  orientation: 'landscape',
  marginMm: 10,
};

export const createInitialAppState = (): AppState => ({
  activeTool: 'selection',
  toolLocked: false,
  currentStyle: { ...DEFAULT_STYLE },
  selectedIds: {},
  viewport: { scrollX: 60, scrollY: 80, zoom: 1 },
  pageSetup: { ...DEFAULT_PAGE_SETUP },
  viewColorMode: 'color',
  editingTextId: null,
  editingCell: null,
  tableDefaults: {
    rows: 3,
    cols: 3,
    cellPadding: 10,
    headerRow: true,
    headerColor: '#e7f5ff',
    banded: false,
    textColor: '#1e1e1e',
  },
  gridEnabled: false,
  theme: 'light',
  openDialog: null,
  collab: { status: 'idle', roomLink: null, username: '', collaborators: {} },
  toast: null,
  sidebar: { open: false, pinned: false, tab: 'pages' },
  presenting: false,
  penMode: false,
  shapeRecognition: false,
  chat: { messages: [], unread: 0 },
});

export const STORAGE_KEYS = {
  scene: 'sketchboard:scene',
  username: 'sketchboard:username',
  theme: 'sketchboard:theme',
  sidebarPinned: 'sketchboard:sidebar-pinned',
  penMode: 'sketchboard:pen-mode',
  shapeRecognition: 'sketchboard:shape-recognition',
} as const;

export const FILE_EXTENSION = '.sketchboard';
export const MIME_TYPE = 'application/vnd.sketchboard+json';
