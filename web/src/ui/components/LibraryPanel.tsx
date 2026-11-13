import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { LibraryItem } from '../../core/types';
import { contentBounds } from '../../export/region';
import { exportToSvg } from '../../export/svgExport';
import { getBuiltinSections } from '../../library/builtin';
import type { LibrarySource } from '../../library/LibraryStore';
import { LIBRARY_FILE_ACCEPT } from '../../library/libraryFormat';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';
import { Icons } from '../icons/Icons';

/** dataTransfer type for dragging an item from the sidebar onto the board. */
export const LIBRARY_DRAG_MIME = 'application/x-sketchboard-library';

const svgCache = new WeakMap<LibraryItem, string>();

function previewSvg(item: LibraryItem): string {
  let svg = svgCache.get(item);
  if (!svg) {
    const region = contentBounds(item.elements, 6) ?? { x: 0, y: 0, width: 10, height: 10 };
    svg = exportToSvg(item.elements, { region, colorMode: 'color', background: false, embedFonts: false }).replace(
      /width="[\d.]+" height="[\d.]+"/,
      'width="100%" height="100%"',
    );
    svgCache.set(item, svg);
  }
  return svg;
}

function excalidrawLibrariesUrl(): string {
  const referrer = `${location.origin}${location.pathname}`;
  return `https://libraries.excalidraw.com/?target=_blank&referrer=${encodeURIComponent(referrer)}&useHash=true&version=2`;
}

/**
 * Sidebar "Libraries" tab: the personal library (add selection / whole canvas, rename, remove,
 * import & export) and the built-in SketchBoard library. Click an item to add it to the middle
 * of the screen, or drag it onto the board.
 */
export function LibraryPanel() {
  const { editor, library } = useEditor();
  const personal = useSyncExternalStore(library.subscribe, library.getItems);
  const selectedCount = useAppState((s) => Object.keys(s.selectedIds).length);
  useSceneRevision();
  const hasContent = editor.scene.getElements().length > 0;
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sections = useMemo(getBuiltinSections, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      editor.toast((e as Error).message);
    }
  };

  const add = (all: boolean) =>
    guard(() => {
      const elements = all ? editor.scene.getElements() : editor.getSelectedElements();
      const item = library.add(elements);
      if (item) editor.toast(`Added “${item.name}” to your library`);
    });

  const importFile = () => {
    setMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = LIBRARY_FILE_ACCEPT;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const n = library.importLibrary(await file.text());
        editor.toast(n ? `Added ${n} item${n === 1 ? '' : 's'} from ${file.name}` : 'Those items are already in your library');
      } catch (e) {
        editor.toast(`Couldn’t import ${file.name}: ${(e as Error).message}`);
      }
    };
    input.click();
  };

  const exportAs = (format: 'sketchboard' | 'excalidraw') => {
    setMenuOpen(false);
    if (!personal.length) return editor.toast('Your personal library is empty');
    void library.export(format).then(() => editor.toast(format === 'excalidraw' ? 'Exported my-library.excalidrawlib' : 'Exported my-library.sketchboardlib'));
  };

  const q = query.trim().toLowerCase();
  const match = (i: LibraryItem) => !q || i.name.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q);
  const mine = personal.filter(match);

  return (
    <div className="sb-lib">
      <div className="sb-search__field">
        <Icons.search />
        <input className="sb-input" placeholder="Search libraries…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search libraries" />
      </div>

      <div className="sb-lib__actions">
        <button className="sb-btn sb-btn--sm" disabled={!selectedCount} onClick={() => add(false)} title="Save the selected shapes as one library item">
          <Icons.libraryAdd />
          Add selection
        </button>
        <button className="sb-btn sb-btn--sm" disabled={!hasContent} onClick={() => add(true)} title="Save the whole drawing as one library item">
          <Icons.libraryAdd />
          Add canvas
        </button>
        <div className="sb-lib__more" ref={menuRef}>
          <button className="sb-icon-btn" aria-label="Library options" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <Icons.more />
          </button>
          {menuOpen && (
            <div className="sb-island sb-dropdown sb-lib__menu" role="menu">
              <button role="menuitem" className="sb-dropdown__item" onClick={importFile}>
                <Icons.folder /><span>Import library file…</span>
              </button>
              <button role="menuitem" className="sb-dropdown__item" onClick={() => exportAs('sketchboard')}>
                <Icons.download /><span>Export my library (.sketchboardlib)</span>
              </button>
              <button role="menuitem" className="sb-dropdown__item" onClick={() => exportAs('excalidraw')}>
                <Icons.download /><span>Export for Excalidraw (.excalidrawlib)</span>
              </button>
              <hr />
              <a role="menuitem" className="sb-dropdown__item" href={excalidrawLibrariesUrl()} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
                <Icons.external /><span>Browse Excalidraw libraries</span>
              </a>
            </div>
          )}
        </div>
      </div>

      <details className="sb-lib__section" open>
        <summary>
          Personal library <span className="sb-lib__count">{personal.length}</span>
        </summary>
        {personal.length === 0 ? (
          <p className="sb-muted sb-lib__hint">
            Select shapes and press <strong>Add selection</strong> (or add the whole canvas) to reuse them in any drawing. You can also import
            .sketchboardlib or .excalidrawlib files.
          </p>
        ) : mine.length === 0 ? (
          <p className="sb-muted sb-lib__hint">No matches</p>
        ) : (
          <ItemGrid items={mine} source="personal" />
        )}
      </details>

      <details className="sb-lib__section" open>
        <summary>SketchBoard library</summary>
        {sections.map((s) => {
          const items = s.items.filter(match);
          if (!items.length) return null;
          return (
            <details key={s.name} className="sb-lib__sub" open>
              <summary>
                {s.name} <span className="sb-lib__count">{items.length}</span>
              </summary>
              <ItemGrid items={items} source="builtin" />
            </details>
          );
        })}
      </details>
    </div>
  );
}

function ItemGrid({ items, source }: { items: readonly LibraryItem[]; source: LibrarySource }) {
  const { editor, library } = useEditor();
  const [renaming, setRenaming] = useState<string | null>(null);

  const rename = (item: LibraryItem, name: string) => {
    setRenaming(null);
    if (name.trim() && name.trim() !== item.name) library.rename(item.id, name);
  };

  return (
    <ul className="sb-lib__grid">
      {items.map((item) => (
        <li key={item.id} className="sb-lib-item">
          <button
            className="sb-lib-item__btn"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(LIBRARY_DRAG_MIME, JSON.stringify({ source, id: item.id }));
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => {
              editor.insertLibraryItem(item.elements);
              // on phones the sidebar covers the board: get out of the way so the new item is visible
              if (window.matchMedia('(max-width: 600px)').matches) editor.setState((s) => ({ sidebar: { ...s.sidebar, open: s.sidebar.pinned } }));
            }}
            title={`${item.name} — click to add, or drag onto the board`}
            aria-label={`Add ${item.name}`}
          >
            <span className="sb-lib-item__art" dangerouslySetInnerHTML={{ __html: previewSvg(item) }} />
          </button>
          {renaming === item.id ? (
            <input
              className="sb-input sb-lib-item__rename"
              autoFocus
              defaultValue={item.name}
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename(item, e.currentTarget.value);
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={(e) => rename(item, e.currentTarget.value)}
              aria-label="Item name"
            />
          ) : (
            <span className="sb-lib-item__name" title={item.name}>{item.name}</span>
          )}
          {source === 'personal' && (
            <span className="sb-lib-item__tools">
              <button className="sb-icon-btn" title="Rename" aria-label={`Rename ${item.name}`} onClick={() => setRenaming(item.id)}>
                <Icons.pencil />
              </button>
              <button
                className="sb-icon-btn"
                title="Remove from library"
                aria-label={`Remove ${item.name}`}
                onClick={() => {
                  try {
                    library.remove(item.id);
                  } catch (e) {
                    editor.toast((e as Error).message);
                  }
                }}
              >
                <Icons.close />
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
