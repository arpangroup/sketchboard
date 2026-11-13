import { useEffect, useRef, useState } from 'react';
import { COLOR_MODE_OPTIONS } from '../../renderer/colorModes';
import { pwa } from '../../pwa/pwa';
import { useAppState, useEditor, usePwa } from '../EditorContext';
import { type IconName, Icons } from '../icons/Icons';

interface Item {
  action: string;
  icon: IconName;
  label?: string;
  danger?: boolean;
}

const ITEMS: Array<Item | 'sep'> = [
  { action: 'openFile', icon: 'folder', label: 'Open… (.sketchboard, .excalidraw)' },
  { action: 'saveFile', icon: 'download', label: 'Save to file…' },
  { action: 'saveExcalidraw', icon: 'download', label: 'Save as Excalidraw…' },
  'sep',
  { action: 'dialog:workspace', icon: 'cloud', label: 'Workspace (saved drawings)…' },
  { action: 'saveToWorkspace', icon: 'cloud', label: 'Save to workspace' },
  { action: 'dialog:link', icon: 'link', label: 'Export to link…' },
  'sep',
  { action: 'dialog:export', icon: 'image', label: 'Export image…' },
  { action: 'dialog:print', icon: 'print', label: 'Print…' },
  { action: 'dialog:page', icon: 'page', label: 'Page setup…' },
  'sep',
  { action: 'dialog:collab', icon: 'share', label: 'Live collaboration…' },
  { action: 'toggleGrid', icon: 'grid', label: 'Toggle grid' },
  { action: 'dialog:help', icon: 'keyboard', label: 'Keyboard shortcuts' },
  'sep',
  { action: 'clearCanvas', icon: 'trash', label: 'Clear canvas', danger: true },
];

export function MainMenu() {
  const { editor, actions } = useEditor();
  const [open, setOpen] = useState(false);
  const theme = useAppState((s) => s.theme);
  const viewMode = useAppState((s) => s.viewColorMode);
  const ref = useRef<HTMLDivElement>(null);
  const pwaState = usePwa();
  const showInstall = !pwaState.installed && (pwaState.canInstall || pwaState.needsIosInstructions);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="sb-menu" ref={ref}>
      <button className="sb-island sb-icon-btn" aria-label="Main menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icons.menu />
      </button>
      {open && (
        <div className="sb-island sb-dropdown" role="menu">
          {ITEMS.map((it, i) => {
            if (it === 'sep') return <hr key={`sep${i}`} />;
            const Icon = Icons[it.icon];
            const action = actions.get(it.action);
            return (
              <button
                key={it.action}
                role="menuitem"
                className={`sb-dropdown__item ${it.danger ? 'is-danger' : ''}`}
                onClick={() => {
                  setOpen(false);
                  actions.execute(it.action);
                }}
              >
                <Icon />
                <span>{it.label ?? action?.label}</span>
                {action?.shortcut && <kbd>{action.shortcut}</kbd>}
              </button>
            );
          })}
          {showInstall && (
            <button
              role="menuitem"
              className="sb-dropdown__item is-accent"
              onClick={() => {
                setOpen(false);
                if (pwaState.canInstall) void pwa.promptInstall();
                else editor.setState({ openDialog: 'install' });
              }}
            >
              <Icons.install />
              <span>Install app</span>
              <kbd>works offline</kbd>
            </button>
          )}
          <hr />
          <div className="sb-dropdown__row">
            <span>Theme</span>
            <button
              className="sb-chip"
              onClick={() => editor.setState({ theme: theme === 'light' ? 'dark' : 'light' })}
            >
              {theme === 'light' ? <Icons.moon /> : <Icons.sun />}
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
          </div>
          <div className="sb-dropdown__row">
            <span>Preview</span>
            <div className="sb-segmented">
              {COLOR_MODE_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  className={viewMode === m.id ? 'is-active' : ''}
                  onClick={() => editor.setState({ viewColorMode: m.id })}
                  title={`Preview the board in ${m.label.toLowerCase()}`}
                >
                  {m.id === 'color' ? 'Colour' : m.id === 'grayscale' ? 'Gray' : 'B/W'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
