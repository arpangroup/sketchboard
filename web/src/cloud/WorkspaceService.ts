import { STORAGE_KEYS } from '../core/constants';
import type { WorkspaceFileRef } from '../core/types';
import type { Editor } from '../editor/Editor';
import { saveExcalidrawFile, saveSceneToFile } from '../persistence/fileService';
import { exportToLink, loadFromLink, parseLinkFromHash } from './shareLink';
import { makeThumbnail } from './thumbnail';
import { ApiError, type DrawingMeta, WorkspaceApi } from './WorkspaceApi';

/**
 * Application service for the workspace: saving the board to server storage, opening saved
 * drawings, downloads and shareable links. UI components call this; it coordinates the Editor
 * and the API so neither knows about the other.
 */
export class WorkspaceService {
  constructor(
    private readonly editor: Editor,
    readonly api: WorkspaceApi = new WorkspaceApi(),
  ) {
    // remember which saved drawing the board belongs to across reloads
    editor.store.subscribe((s, prev) => {
      if (s.workspaceFile === prev.workspaceFile) return;
      try {
        if (s.workspaceFile) localStorage.setItem(STORAGE_KEYS.workspaceFile, JSON.stringify(s.workspaceFile));
        else localStorage.removeItem(STORAGE_KEYS.workspaceFile);
      } catch {
        /* storage unavailable */
      }
    });
  }

  /** Called once after the autosaved board is restored. */
  restoreLink(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.workspaceFile);
      const ref = raw ? (JSON.parse(raw) as WorkspaceFileRef) : null;
      if (ref && typeof ref.id === 'string' && typeof ref.name === 'string') this.editor.setState({ workspaceFile: ref });
    } catch {
      /* ignore */
    }
  }

  private link(meta: DrawingMeta | null): void {
    this.editor.setState({ workspaceFile: meta ? { id: meta.id, name: meta.name, revision: meta.revision } : null });
  }

  /** Suggested name for the current board. */
  currentName(): string {
    const s = this.editor.getState();
    return s.workspaceFile?.name ?? s.pageSetup.title?.trim() ?? '';
  }

  /**
   * Saves the board: updates the linked drawing, or creates a new one (`asNew`, or nothing linked).
   * Concurrent edits are detected with the drawing's revision.
   */
  async save(opts: { name?: string; asNew?: boolean } = {}): Promise<DrawingMeta> {
    const scene = this.editor.getSceneData(false, true);
    const thumbnail = makeThumbnail(scene.elements);
    const current = this.editor.getState().workspaceFile;
    const name = opts.name?.trim() || current?.name || 'Untitled drawing';
    let meta: DrawingMeta;
    if (current && !opts.asNew) {
      try {
        meta = await this.api.update(current.id, { name, scene, thumbnail, revision: current.revision });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const overwrite = confirm(
            `“${name}” was changed somewhere else since you opened it.\n\nOK — replace it with your version\nCancel — keep both (save yours as a copy)`,
          );
          meta = overwrite
            ? await this.api.update(current.id, { name, scene, thumbnail })
            : await this.api.create({ name: `${name} (copy)`, scene, thumbnail });
        } else if (e instanceof ApiError && e.status === 404) {
          meta = await this.api.create({ name, scene, thumbnail }); // deleted meanwhile: save as new
        } else throw e;
      }
    } else {
      meta = await this.api.create({ name, scene, thumbnail });
    }
    this.link(meta);
    return meta;
  }

  async open(meta: DrawingMeta): Promise<void> {
    const scene = await this.api.scene(meta.id);
    this.editor.loadScene(scene, { workspaceFile: { id: meta.id, name: meta.name, revision: meta.revision } });
    this.editor.zoomToFit();
  }

  async rename(meta: DrawingMeta, name: string): Promise<DrawingMeta> {
    const next = await this.api.update(meta.id, { name });
    if (this.editor.getState().workspaceFile?.id === meta.id) this.link(next);
    return next;
  }

  async remove(meta: DrawingMeta): Promise<void> {
    await this.api.remove(meta.id);
    if (this.editor.getState().workspaceFile?.id === meta.id) this.link(null);
  }

  async download(meta: DrawingMeta, format: 'sketchboard' | 'excalidraw'): Promise<void> {
    const scene = await this.api.scene(meta.id);
    const name = meta.name.replace(/[\\/:*?"<>|]/g, '_');
    if (format === 'excalidraw') saveExcalidrawFile(scene, name);
    else saveSceneToFile(scene, name);
  }

  /** Read-only, end-to-end encrypted snapshot link of the current board. */
  shareCurrent(): Promise<string> {
    return exportToLink(this.api, this.editor.getSceneData(false, true));
  }

  async shareSaved(meta: DrawingMeta): Promise<string> {
    return exportToLink(this.api, await this.api.scene(meta.id));
  }

  /** Opens a `#json=id,key` link. Asks before replacing a non-empty board. Returns true if handled. */
  async openLinkFromHash(): Promise<boolean> {
    const link = parseLinkFromHash();
    if (!link) return false;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const scene = await loadFromLink(this.api, link.id, link.key);
      const hasWork = this.editor.scene.getElements().length > 0;
      if (hasWork && !confirm('Open the shared drawing? It replaces what is on your board now (you can save your board to the workspace first).')) {
        return true;
      }
      this.editor.loadScene(scene);
      this.editor.zoomToFit();
      this.editor.toast('Opened shared drawing — it’s your own copy, edits don’t change the link');
    } catch (e) {
      this.editor.toast(`Couldn’t open the shared link: ${(e as Error).message}`);
    }
    return true;
  }
}
