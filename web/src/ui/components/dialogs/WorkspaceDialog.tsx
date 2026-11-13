import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { workspaceErrorMessage } from '../../../actions/serviceActions';
import { ApiError, type DrawingMeta } from '../../../cloud/WorkspaceApi';
import { exportToSvg } from '../../../export/svgExport';
import { contentBounds } from '../../../export/region';
import { fileStore } from '../../../files/FileStore';
import { useAppState, useEditor, useSceneRevision } from '../../EditorContext';
import { Icons } from '../../icons/Icons';
import { Modal } from './Modal';
import { NoServerDialog } from './NoServerDialog';
import { serverConfigured } from '../../../cloud/serverConfig';

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function timeAgo(t: number): string {
  const s = Math.round((t - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(t).toLocaleDateString();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Workspace: save the board to server storage and browse every saved drawing
 * (preview, open, download as .sketchboard/.excalidraw, share link, rename, delete).
 */
export function WorkspaceDialog({ onClose }: { onClose: () => void }) {
  return serverConfigured() ? <WorkspaceView onClose={onClose} /> : <NoServerDialog title="Workspace" onClose={onClose} />;
}

function WorkspaceView({ onClose }: { onClose: () => void }) {
  const { editor, workspace } = useEditor();
  useSceneRevision();
  const current = useAppState((s) => s.workspaceFile);
  const [items, setItems] = useState<DrawingMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [name, setName] = useState(() => workspace.currentName());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<DrawingMeta | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const hasContent = editor.scene.getElements().length > 0;

  const refresh = useCallback(async () => {
    try {
      setItems(await workspace.api.list());
      setError(null);
      setOffline(false);
    } catch (e) {
      setOffline(e instanceof ApiError && e.offline);
      setError(workspaceErrorMessage(e));
    }
  }, [workspace]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  /** Runs an async operation with a busy flag and error toast. */
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      editor.toast(workspaceErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const save = (asNew: boolean) =>
    run('save', async () => {
      const meta = await workspace.save({ name, asNew });
      setName(meta.name);
      editor.toast(`Saved “${meta.name}” to the workspace`);
      await refresh();
    });

  const open = (meta: DrawingMeta) =>
    run(meta.id, async () => {
      const replacing = editor.scene.getElements().length > 0 && current?.id !== meta.id;
      if (replacing && !confirm(`Open “${meta.name}”? It replaces what is on your board now — save your board first if you need it.`)) return;
      await workspace.open(meta);
      editor.toast(`Opened “${meta.name}”`);
      onClose();
    });

  const share = (meta: DrawingMeta) =>
    run(`link:${meta.id}`, async () => {
      const url = await workspace.shareSaved(meta);
      setLinks((l) => ({ ...l, [meta.id]: url }));
      editor.toast((await copyText(url)) ? 'Link copied to clipboard' : 'Link created');
    });

  const rename = (meta: DrawingMeta, next: string) => {
    setRenaming(null);
    if (!next.trim() || next.trim() === meta.name) return;
    void run(meta.id, async () => {
      await workspace.rename(meta, next);
      await refresh();
    });
  };

  const remove = (meta: DrawingMeta) => {
    if (!confirm(`Delete “${meta.name}” from the workspace? This can’t be undone.`)) return;
    void run(meta.id, async () => {
      await workspace.remove(meta);
      editor.toast(`Deleted “${meta.name}”`);
      await refresh();
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <Modal title="Workspace" onClose={onClose} wide>
      <div className="sb-ws">
        <section className="sb-ws__save">
          <div className="sb-ws__save-row">
            <input
              className="sb-input"
              placeholder="Name this drawing"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && hasContent && !offline && void save(false)}
              aria-label="Drawing name"
            />
            <button className="sb-btn sb-btn--primary" disabled={!hasContent || busy === 'save' || offline} onClick={() => save(false)}>
              <Icons.cloud />
              {busy === 'save' ? 'Saving…' : current ? 'Save changes' : 'Save to workspace'}
            </button>
            {current && (
              <button className="sb-btn" disabled={!hasContent || busy === 'save' || offline} onClick={() => save(true)}>
                Save as new
              </button>
            )}
          </div>
          <p className="sb-muted">
            {current
              ? <>This board is <strong>“{current.name}”</strong>. Save changes updates it (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>).</>
              : hasContent
                ? 'Saved drawings are stored by the SketchBoard server in its storage folder, so you can open them from any device.'
                : 'Draw something to save it here.'}
          </p>
        </section>

        <div className="sb-ws__bar">
          <div className="sb-search__field">
            <Icons.search />
            <input className="sb-input" placeholder="Search saved drawings…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <span className="sb-muted">{items ? `${items.length} drawing${items.length === 1 ? '' : 's'}` : ''}</span>
          <button className="sb-icon-btn" onClick={() => void refresh()} title="Refresh" aria-label="Refresh">
            <Icons.refresh />
          </button>
        </div>

        {error ? (
          <div className="sb-empty">
            <div className="sb-empty__art"><Icons.cloud /></div>
            <p className="sb-empty__title">{offline ? 'Workspace server not reachable' : 'Couldn’t load the workspace'}</p>
            <p className="sb-muted">
              {offline ? (
                <>
                  Start it with <code>npm run dev</code> in the <code>collab-server</code> folder (it serves {workspace.api.baseUrl}). Drawings are saved in its{' '}
                  <code>storage/</code> folder.
                </>
              ) : (
                error
              )}
            </p>
            <button className="sb-btn" onClick={() => void refresh()}>Try again</button>
          </div>
        ) : items === null ? (
          <p className="sb-muted sb-ws__loading">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="sb-empty">
            <div className="sb-empty__art"><Icons.folder /></div>
            <p className="sb-empty__title">{items.length ? 'No matches' : 'No saved drawings yet'}</p>
            {!items.length && <p className="sb-muted">Name your drawing above and press “Save to workspace”.</p>}
          </div>
        ) : (
          <ul className="sb-ws__grid">
            {visible.map((m) => (
              <li key={m.id} className={`sb-ws-card ${current?.id === m.id ? 'is-current' : ''}`}>
                <button className="sb-ws-card__thumb" onClick={() => setPreview(m)} aria-label={`Preview ${m.name}`} title="Preview">
                  {m.hasThumbnail ? <img src={workspace.api.thumbnailUrl(m)} alt="" loading="lazy" /> : <span className="sb-muted">No preview</span>}
                  {current?.id === m.id && <span className="sb-ws-card__badge">On your board</span>}
                </button>
                <div className="sb-ws-card__body">
                  {renaming === m.id ? (
                    <input
                      className="sb-input"
                      autoFocus
                      defaultValue={m.name}
                      maxLength={120}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') rename(m, e.currentTarget.value);
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setRenaming(null);
                        }
                      }}
                      onBlur={(e) => rename(m, e.currentTarget.value)}
                      aria-label="New name"
                    />
                  ) : (
                    <strong title={m.name}>{m.name}</strong>
                  )}
                  <small className="sb-muted">
                    {m.elementCount} item{m.elementCount === 1 ? '' : 's'} · {formatSize(m.size)} · {timeAgo(m.updatedAt)}
                  </small>
                </div>
                <div className="sb-ws-card__actions">
                  <button className="sb-btn sb-btn--primary sb-btn--sm" disabled={busy === m.id} onClick={() => open(m)}>
                    Open
                  </button>
                  <button className="sb-icon-btn" title="Download .sketchboard" aria-label="Download" onClick={() => run(m.id, () => workspace.download(m, 'sketchboard'))}>
                    <Icons.download />
                  </button>
                  <button className="sb-icon-btn" title="Create a share link (copied to clipboard)" aria-label="Share link" disabled={busy === `link:${m.id}`} onClick={() => share(m)}>
                    <Icons.link />
                  </button>
                  <div className="sb-ws-card__more" onPointerDown={(e) => e.stopPropagation()}>
                    <button className="sb-icon-btn" aria-label="More" aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}>
                      <Icons.more />
                    </button>
                    {menu === m.id && (
                      <div className="sb-island sb-dropdown sb-ws-card__menu" role="menu">
                        <button role="menuitem" className="sb-dropdown__item" onClick={() => (setMenu(null), setRenaming(m.id))}>
                          <Icons.pencil /><span>Rename</span>
                        </button>
                        <button role="menuitem" className="sb-dropdown__item" onClick={() => (setMenu(null), void run(m.id, () => workspace.download(m, 'excalidraw')))}>
                          <Icons.download /><span>Download as Excalidraw</span>
                        </button>
                        <a role="menuitem" className="sb-dropdown__item" href={workspace.api.downloadUrl(m.id)} onClick={() => setMenu(null)}>
                          <Icons.external /><span>Direct file URL</span>
                        </a>
                        <hr />
                        <button role="menuitem" className="sb-dropdown__item is-danger" onClick={() => (setMenu(null), remove(m))}>
                          <Icons.trash /><span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {links[m.id] && (
                  <div className="sb-ws-card__link">
                    <input className="sb-input" readOnly value={links[m.id]} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
                    <button className="sb-btn sb-btn--sm" onClick={async () => editor.toast((await copyText(links[m.id])) ? 'Link copied' : 'Select the link and copy it')}>
                      Copy
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {preview && (
        <DrawingPreview
          meta={preview}
          onClose={() => setPreview(null)}
          onOpen={() => {
            setPreview(null);
            void open(preview);
          }}
          onDownload={() => run(preview.id, () => workspace.download(preview, 'sketchboard'))}
        />
      )}
    </Modal>
  );
}

/** Full-size preview: fetches the drawing and renders it as SVG (nothing changes on the board). */
function DrawingPreview(p: { meta: DrawingMeta; onClose: () => void; onOpen: () => void; onDownload: () => void }) {
  const { workspace } = useEditor();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    workspace.api
      .scene(p.meta.id)
      .then((scene) => {
        if (scene.files) fileStore.add(Object.values(scene.files), false);
        const elements = scene.elements.filter((e) => !e.isDeleted);
        const region = contentBounds(elements, 24) ?? { x: 0, y: 0, width: 400, height: 300 };
        const markup = exportToSvg(elements, { region, colorMode: 'color', background: true, embedFonts: false });
        if (alive) setSvg(markup.replace(/width="[\d.]+" height="[\d.]+"/, 'width="100%" height="100%"'));
      })
      .catch((e) => alive && setError(workspaceErrorMessage(e)));
    return () => {
      alive = false;
    };
  }, [workspace, p.meta.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        p.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [p]);

  return (
    <div className="sb-ws-preview" data-overlay role="dialog" aria-label={`Preview of ${p.meta.name}`} onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="sb-island sb-ws-preview__panel">
        <header>
          <strong>{p.meta.name}</strong>
          <div>
            <button className="sb-btn sb-btn--primary sb-btn--sm" onClick={p.onOpen}>Open</button>
            <button className="sb-btn sb-btn--sm" onClick={p.onDownload}><Icons.download />Download</button>
            <button className="sb-icon-btn" onClick={p.onClose} aria-label="Close preview"><Icons.close /></button>
          </div>
        </header>
        <div className="sb-ws-preview__art" ref={ref}>
          {error ? <p className="sb-muted">{error}</p> : svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="sb-muted">Loading preview…</p>}
        </div>
      </div>
    </div>
  );
}
