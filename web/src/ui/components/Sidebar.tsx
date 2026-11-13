import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { PagesPanel } from './PagesPanel';
import { LibraryPanel } from './LibraryPanel';
import { STORAGE_KEYS } from '../../core/constants';
import type { SidebarTab } from '../../core/types';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';
import { type IconName, Icons } from '../icons/Icons';

const TABS: Array<{ id: SidebarTab; label: string; icon: IconName }> = [
  { id: 'pages', label: 'Pages', icon: 'pages' },
  { id: 'search', label: 'Find text on canvas', icon: 'search' },
  { id: 'library', label: 'Libraries', icon: 'library' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'presentation', label: 'Presentation', icon: 'presentation' },
];

/** Right-hand sidebar. Unpinned it floats over the canvas; pinned it docks and the canvas shrinks. */
export function Sidebar() {
  const { editor } = useEditor();
  const sidebar = useAppState((s) => s.sidebar);
  const unread = useAppState((s) => s.chat.unread);

  const setTab = (tab: SidebarTab) => editor.setState((s) => ({ sidebar: { ...s.sidebar, tab } }));
  const togglePin = () => {
    const pinned = !sidebar.pinned;
    editor.setState((s) => ({ sidebar: { ...s.sidebar, pinned } }));
    try {
      localStorage.setItem(STORAGE_KEYS.sidebarPinned, String(pinned));
    } catch {
      /* ignore */
    }
  };
  const close = () => editor.setState((s) => ({ sidebar: { ...s.sidebar, open: false } }));

  return (
    <aside className={`sb-sidebar ${sidebar.pinned ? 'is-pinned' : 'sb-island'}`} aria-label="Sidebar">
      <header className="sb-sidebar__header">
        <nav className="sb-sidebar__tabs" role="tablist">
          {TABS.map((t) => {
            const Icon = Icons[t.icon];
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={sidebar.tab === t.id}
                aria-label={t.label}
                title={t.label}
                className={`sb-icon-btn ${sidebar.tab === t.id ? 'is-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <Icon />
                {t.id === 'chat' && unread > 0 && <span className="sb-badge-dot">{unread}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sb-sidebar__actions">
          <button
            className={`sb-icon-btn ${sidebar.pinned ? 'is-active' : ''}`}
            onClick={togglePin}
            aria-pressed={sidebar.pinned}
            title={sidebar.pinned ? 'Unpin sidebar' : 'Pin sidebar (dock it next to the canvas)'}
            aria-label={sidebar.pinned ? 'Unpin sidebar' : 'Pin sidebar'}
          >
            {sidebar.pinned ? <Icons.pinOff /> : <Icons.pin />}
          </button>
          <button className="sb-icon-btn" onClick={close} title="Close sidebar" aria-label="Close sidebar">
            <Icons.close />
          </button>
        </div>
      </header>
      <h2 className="sb-sidebar__title">{TABS.find((t) => t.id === sidebar.tab)?.label}</h2>
      <div className="sb-sidebar__body">
        {sidebar.tab === 'pages' && <PagesPanel />}
        {sidebar.tab === 'search' && <SearchPanel />}
        {sidebar.tab === 'library' && <LibraryPanel />}
        {sidebar.tab === 'chat' && <ChatPanel />}
        {sidebar.tab === 'presentation' && <PresentationPanel />}
      </div>
    </aside>
  );
}

function SearchPanel() {
  const { editor } = useEditor();
  useSceneRevision();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [jumped, setJumped] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = editor.findText(query);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    setActive(0);
    setJumped(-1);
  }, [query]);

  const go = (i: number) => {
    if (!results.length) return;
    const idx = (i + results.length) % results.length;
    setActive(idx);
    setJumped(idx);
    const hit = results[idx];
    editor.focusElement(hit.el.id);
    if (hit.cell) editor.noteTableCell(hit.el.id, hit.cell.row, hit.cell.col);
  };

  return (
    <div className="sb-search">
      <div className="sb-search__field">
        <Icons.search />
        <input
          ref={inputRef}
          className="sb-input"
          placeholder="Find text on canvas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(e.shiftKey ? active - 1 : jumped === active ? active + 1 : active);
            if (e.key === 'Escape') setQuery('');
          }}
        />
      </div>
      {query.trim() && (
        <p className="sb-muted">
          {results.length ? `${results.length} match${results.length === 1 ? '' : 'es'} · Enter for next` : 'No matches'}
        </p>
      )}
      <ul className="sb-search__results">
        {results.map((hit, i) => (
          <li key={`${hit.el.id}:${hit.cell?.row ?? ''}:${hit.cell?.col ?? ''}:${hit.line ?? ''}`}>
            <button className={i === active ? 'is-active' : ''} onClick={() => go(i)}>
              {hit.cell && <small className="sb-search__where">Table · row {hit.cell.row + 1}, col {hit.cell.col + 1}</small>}
              {hit.line && <small className="sb-search__where">Code · line {hit.line}</small>}
              <Snippet text={hit.text} query={query} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Snippet({ text: raw, query }: { text: string; query: string }) {
  const text = raw.replace(/\n/g, ' ');
  const i = text.toLowerCase().indexOf(query.trim().toLowerCase());
  const q = query.trim().length;
  const start = Math.max(0, i - 24);
  return (
    <span>
      {start > 0 && '…'}
      {text.slice(start, i)}
      <mark>{text.slice(i, i + q)}</mark>
      {text.slice(i + q, i + q + 40)}
      {i + q + 40 < text.length && '…'}
    </span>
  );
}

function ChatPanel() {
  const { editor, collab } = useEditor();
  const status = useAppState((s) => s.collab.status);
  const messages = useAppState((s) => s.chat.messages);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Opening the chat tab marks everything as read.
  useEffect(() => {
    editor.setState((s) => (s.chat.unread ? { chat: { ...s.chat, unread: 0 } } : {}));
  }, [editor, messages.length]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  if (status === 'idle') {
    return (
      <div className="sb-empty">
        <div className="sb-empty__art">
          <Icons.chat />
        </div>
        <p className="sb-empty__title">Chat with collaborators</p>
        <p className="sb-muted">Start a live session to chat with everyone on this board. Messages are end-to-end encrypted.</p>
        <button className="sb-btn sb-btn--primary" onClick={() => editor.setState({ openDialog: 'collab' })}>
          Start live session
        </button>
      </div>
    );
  }

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (await collab.sendChat(draft)) setDraft('');
  };

  return (
    <div className="sb-chat">
      <div className="sb-chat__list" ref={listRef}>
        {messages.length === 0 && <p className="sb-muted sb-chat__hint">No messages yet. Say hi 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className={`sb-chat__msg ${m.own ? 'is-own' : ''}`}>
            {!m.own && <span className="sb-chat__author">{m.username || 'Guest'}</span>}
            <p>{m.text}</p>
            <time>{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
        ))}
      </div>
      <form className="sb-chat__form" onSubmit={send}>
        <input
          className="sb-input"
          placeholder={status === 'connected' ? 'Message…' : 'Connecting…'}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="sb-btn sb-btn--primary" type="submit" disabled={!draft.trim() || status !== 'connected'} aria-label="Send">
          <Icons.send />
        </button>
      </form>
    </div>
  );
}

function PresentationPanel() {
  const { editor } = useEditor();
  const page = useAppState((s) => s.pageSetup);
  useSceneRevision();
  const hasContent = editor.scene.getElements().length > 0;
  const hasPage = page.size !== 'infinite';
  const options = useMemo(
    () => [
      ...(hasPage ? [{ id: 'page' as const, label: 'Present page', hint: 'Shows the page frame full screen' }] : []),
      { id: 'content' as const, label: 'Present whole drawing', hint: 'Fits everything you have drawn' },
    ],
    [hasPage],
  );

  return (
    <div className="sb-present">
      <p className="sb-muted">
        Present full screen with all toolbars hidden. You can still pan (drag) and zoom (Ctrl + scroll / pinch). Press <kbd>Esc</kbd> to stop.
      </p>
      {options.map((o) => (
        <button key={o.id} className="sb-present__option" disabled={!hasContent && o.id === 'content'} onClick={() => startPresentation(editor, o.id)}>
          <Icons.presentation />
          <span>
            <strong>{o.label}</strong>
            <small>{o.hint}</small>
          </span>
        </button>
      ))}
      <p className="sb-muted">Slide-by-slide presentations using frames are planned for a later version.</p>
    </div>
  );
}

type EditorT = ReturnType<typeof useEditor>['editor'];

export function startPresentation(editor: EditorT, target: 'page' | 'content'): void {
  editor.setState((s) => ({ presenting: true, selectedIds: {}, sidebar: { ...s.sidebar, open: s.sidebar.pinned ? s.sidebar.open : false } }));
  editor.setTool('hand');
  const fit = () => (target === 'page' ? editor.zoomToPage() : editor.zoomToFit());
  document.documentElement.requestFullscreen?.().catch(() => undefined).finally(() => setTimeout(fit, 150));
  setTimeout(fit, 50);
}

export function stopPresentation(editor: EditorT): void {
  if (!editor.getState().presenting) return;
  editor.setState({ presenting: false });
  editor.setTool('selection');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}
