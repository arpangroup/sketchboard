import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from '../EditorContext';

export interface ContextMenuRequest {
  x: number;
  y: number;
  kind: 'element' | 'canvas';
}

type Entry = string | '-';

/** Menu layout by target. Actions that don't apply right now are left out; separators collapse. */
const ELEMENT_MENU: Entry[] = [
  'cut', 'copy', 'paste', '-',
  'copyAsPng', 'copyAsSvg', 'copyStyles', 'pasteStyles', '-',
  'copyTable:spreadsheet', 'copyTable:markdown', 'copyTable:csv', '-',
  'addToLibrary', 'hyperlink', 'openLink', '-',
  'group', 'ungroup', 'wrapInFrame', 'selectFrameContents', 'removeFrame', '-',
  'bringForward', 'bringToFront', 'sendBackward', 'sendToBack', '-',
  'flipHorizontal', 'flipVertical', 'rotateRight', 'straighten', '-',
  'duplicate', 'lock', 'delete',
];

const CANVAS_MENU: Entry[] = [
  'paste', 'selectAll', '-',
  'copyAsPng', 'copyAsSvg', '-',
  'importTable', '-',
  'undo', 'redo', '-',
  'toggleGrid', 'zoomToFit', 'zoomToPage', '-',
  'insertPageAbove', 'insertPageBelow', 'deletePage', '-',
  'addCanvasToLibrary',
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
/** "Ctrl+Shift+G" → "⌘⇧G" on Apple devices. */
export const formatShortcut = (s?: string): string =>
  !s ? '' : isMac ? s.replace(/Ctrl\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥') : s;

/** Labels that read better in a menu than the action's general label. */
function labelFor(id: string, fallback: string, ed: ReturnType<typeof useEditor>['editor']): string {
  const sel = ed.getSelectedElements();
  switch (id) {
    case 'lock':
      return sel.length && sel.every((e) => e.locked) ? 'Unlock' : 'Lock';
    case 'hyperlink':
      return sel.some((e) => e.link) ? 'Edit link…' : 'Add link…';
    case 'copyAsPng':
      return sel.length ? fallback : 'Copy canvas as PNG';
    case 'copyAsSvg':
      return sel.length ? fallback : 'Copy canvas as SVG';
    case 'toggleGrid':
      return ed.getState().gridEnabled ? 'Hide grid' : 'Show grid';
    case 'addCanvasToLibrary':
      return 'Add whole canvas to library';
    default:
      return fallback;
  }
}

/**
 * Right-click menu for the board. Every entry is an Action, so labels, shortcuts and enabled
 * state come from the same place as the toolbar and keyboard.
 */
export function ContextMenu({ request, onClose }: { request: ContextMenuRequest; onClose: () => void }) {
  const { editor, actions } = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: request.x, top: request.y });

  const layout = request.kind === 'element' ? ELEMENT_MENU : CANVAS_MENU;
  const items: Array<{ id: string; label: string; shortcut: string; danger?: boolean } | '-'> = [];
  for (const entry of layout) {
    if (entry === '-') {
      if (items.length && items[items.length - 1] !== '-') items.push('-');
      continue;
    }
    const a = actions.get(entry);
    if (!a || !actions.isEnabled(entry)) continue;
    if (entry === 'zoomToPage' && editor.getState().pageSetup.size === 'infinite') continue;
    items.push({ id: entry, label: labelFor(entry, a.label, editor), shortcut: formatShortcut(a.shortcut), danger: entry === 'delete' });
  }
  while (items[items.length - 1] === '-') items.pop();

  // keep the menu on screen
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      left: Math.max(pad, Math.min(request.x, window.innerWidth - r.width - pad)),
      top: Math.max(pad, Math.min(request.y, window.innerHeight - r.height - pad)),
    });
    el.focus({ preventScroll: true }); // arrow keys then move into the items
  }, [request]);

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('wheel', onClose, { passive: true });
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('wheel', onClose);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (d: number) => buttons[i < 0 ? (d > 0 ? 0 : buttons.length - 1) : (i + d + buttons.length) % buttons.length]?.focus();
    if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'Home') buttons[0]?.focus();
    else if (e.key === 'End') buttons[buttons.length - 1]?.focus();
    else return;
    e.preventDefault();
  };

  if (!items.length) return null;
  return (
    <div
      ref={ref}
      className="sb-context-menu"
      role="menu"
      tabIndex={-1}
      aria-label={request.kind === 'element' ? 'Selection actions' : 'Canvas actions'}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it === '-' ? (
          <div key={`sep-${i}`} className="sb-context-menu__sep" role="separator" />
        ) : (
          <button
            key={it.id}
            role="menuitem"
            className={`sb-context-menu__item${it.danger ? ' is-danger' : ''}`}
            onClick={() => {
              onClose();
              actions.execute(it.id);
            }}
          >
            <span>{it.label}</span>
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
