import { COLLAB_COLORS, STORAGE_KEYS } from '../core/constants';
import { generateId, throttle } from '../core/utils';
import type { ChatMessage, Collaborator, Point, SketchElement } from '../core/types';
import type { Editor } from '../editor/Editor';
import { MemoryStorageAdapter, LocalStorageAdapter } from '../persistence/StorageAdapter';
import { reconcileElements } from '../scene/reconcile';
import { fileStore } from '../files/FileStore';
import { decrypt, encrypt, generateKey, generateRoomId, importKey } from './crypto';
import type { PeerPayload, ServerMessage } from './protocol';
import { type CollabTransport, WebSocketTransport } from './Transport';

const SYNC_INTERVAL_MS = 40;
const STALE_COLLABORATOR_MS = 60_000;

export const getCollabServerUrl = (): string =>
  import.meta.env.VITE_COLLAB_SERVER_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:3002`;

export function parseRoomFromHash(hash = location.hash): { roomId: string; key: string } | null {
  const m = hash.match(/room=([\w-]+),([\w-]+)/);
  return m ? { roomId: m[1], key: m[2] } : null;
}

const colorFor = (id: string) =>
  COLLAB_COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLLAB_COLORS.length];

/**
 * Live, end-to-end encrypted collaboration.
 *
 * Sync model: each peer broadcasts only the elements it changed (delta sync). Receivers merge
 * with the deterministic version/nonce rule (see reconcile.ts), so every peer converges
 * without server-side conflict resolution - the server is a dumb, horizontally-scalable relay.
 */
export class CollabSession {
  private transport: CollabTransport | null = null;
  private key: CryptoKey | null = null;
  private roomId: string | null = null;
  private pending = new Map<string, SketchElement>();
  private unsubscribers: Array<() => void> = [];
  private pruneTimer: ReturnType<typeof setInterval> | undefined;
  /** Bumped on every stop(); guards async connects that were superseded meanwhile. */
  private generation = 0;

  constructor(
    private editor: Editor,
    private transportFactory: (url: string) => CollabTransport = (url) => new WebSocketTransport(url),
  ) {}

  get active(): boolean {
    return this.transport !== null;
  }

  /** Creates a new room and shares the current drawing into it. */
  async startNewRoom(): Promise<string> {
    const roomId = generateRoomId();
    const key = await generateKey();
    history.replaceState(null, '', `${location.pathname}${location.search}#room=${roomId},${key}`);
    await this.connect(roomId, key);
    return location.href;
  }

  /** Joins the room referenced by the URL fragment, if any. */
  async joinFromUrl(): Promise<boolean> {
    const room = parseRoomFromHash();
    if (!room) return false;
    // Room content replaces the on-screen drawing for the session; the local copy in
    // storage is left untouched (we never loaded it, so don't overwrite it).
    this.editor.setStorage(new MemoryStorageAdapter(), false);
    this.editor.loadScene({ type: 'sketchboard', version: 1, elements: [] }, { keepViewport: true });
    await this.connect(room.roomId, room.key);
    return true;
  }

  private async connect(roomId: string, encodedKey: string): Promise<void> {
    this.stop(false);
    const generation = this.generation;
    const key = await importKey(encodedKey);
    if (generation !== this.generation) return; // stopped or restarted while awaiting
    this.roomId = roomId;
    this.key = key;
    const username = localStorage.getItem(STORAGE_KEYS.username) || '';
    this.editor.setState((s) => ({
      collab: { ...s.collab, status: 'connecting', roomLink: location.href, username, collaborators: {} },
    }));

    const transport = this.transportFactory(getCollabServerUrl());
    this.transport = transport;
    transport.onStatus((status) => {
      if (status === 'open') transport.send({ type: 'join', roomId });
      this.setStatus(status === 'open' ? 'connected' : status === 'connecting' ? 'connecting' : 'error');
    });
    transport.onMessage((m) => void this.onServerMessage(m));
    transport.connect();

    this.unsubscribers.push(
      this.editor.scene.onChange(({ changed, source }) => {
        if (source === 'remote' || source === 'load') return;
        changed.forEach((el) => this.pending.set(el.id, el));
        this.flush();
      }),
      this.editor.events.on('pointerMove', (p) => this.sendPointer(p)),
      this.editor.events.on('laser', ({ point, start, size, mode }) => {
        this.laserQueue.push({ x: point.x, y: point.y, start });
        this.laserStyle = { size, mode };
        this.flushLaser();
      }),
      this.editor.events.on('laserEnd', ({ size, mode }) => {
        // send what's queued, then a reliable "released" marker (not volatile, so it isn't dropped)
        const points = this.laserQueue.splice(0);
        void this.broadcast({ kind: 'laser', points, size, mode, end: true }, false);
      }),
    );
    this.pruneTimer = setInterval(() => this.pruneCollaborators(), 10_000);
  }

  /** Leaves the room; the current drawing stays in place and is saved locally again. */
  stop(clearHash = true): void {
    this.generation++;
    this.transport?.close();
    this.transport = null;
    this.unsubscribers.splice(0).forEach((u) => u());
    clearInterval(this.pruneTimer);
    this.pending.clear();
    this.sentFileIds.clear();
    if (clearHash && this.roomId) {
      history.replaceState(null, '', location.pathname + location.search);
      this.editor.setStorage(new LocalStorageAdapter());
      this.editor.flushSave();
    }
    this.roomId = null;
    this.editor.setState((s) => ({ collab: { ...s.collab, status: 'idle', roomLink: null, collaborators: {} } }));
  }

  setUsername(name: string): void {
    localStorage.setItem(STORAGE_KEYS.username, name);
    this.editor.setState((s) => ({ collab: { ...s.collab, username: name } }));
  }

  private setStatus(status: 'connecting' | 'connected' | 'error'): void {
    this.editor.setState((s) => ({ collab: { ...s.collab, status } }));
  }

  private flush = throttle(() => {
    if (!this.pending.size) return;
    const elements = [...this.pending.values()];
    this.pending.clear();
    void this.broadcast({ kind: 'scene-update', elements, files: this.unsentFiles(elements) });
  }, SYNC_INTERVAL_MS);

  /** Image data is sent once per room, alongside the first update that references it. */
  private sentFileIds = new Set<string>();
  private unsentFiles(elements: readonly SketchElement[]) {
    const ids = this.editor.referencedFileIds(elements).filter((id) => !this.sentFileIds.has(id));
    ids.forEach((id) => this.sentFileIds.add(id));
    const files = Object.values(fileStore.pick(ids));
    return files.length ? files : undefined;
  }

  private laserQueue: Array<{ x: number; y: number; start: boolean }> = [];
  private laserStyle: { size: number; mode: 'fade' | 'hold' } = { size: 2, mode: 'fade' };
  private flushLaser = throttle(() => {
    if (!this.laserQueue.length) return;
    const points = this.laserQueue.splice(0);
    void this.broadcast({ kind: 'laser', points, ...this.laserStyle }, true);
  }, 30);

  private sendPointer = throttle((pointer: Point) => {
    void this.broadcast({ kind: 'pointer', pointer, username: this.editor.getState().collab.username }, true);
  }, SYNC_INTERVAL_MS);

  private async broadcast(payload: PeerPayload, volatile = false): Promise<void> {
    if (!this.transport || !this.key) return;
    this.transport.send({ type: 'broadcast', payload: await encrypt(this.key, payload), volatile });
  }

  private async onServerMessage(m: ServerMessage): Promise<void> {
    switch (m.type) {
      case 'joined':
        // Ask existing peers for the full scene (all of them answer; reconcile dedupes).
        if (m.peers.length) await this.broadcast({ kind: 'request-scene' });
        return;
      case 'peer-joined':
        this.upsertCollaborator(m.clientId, {});
        return;
      case 'peer-left':
        this.editor.setState((s) => {
          const collaborators = { ...s.collab.collaborators };
          delete collaborators[m.clientId];
          return { collab: { ...s.collab, collaborators } };
        });
        return;
      case 'message':
        return this.onPeerMessage(m.from, m.payload);
      case 'error':
        this.editor.toast(`Collaboration error: ${m.message}`);
    }
  }

  private async onPeerMessage(from: string, encrypted: string): Promise<void> {
    if (!this.key) return;
    let payload: PeerPayload;
    try {
      payload = await decrypt<PeerPayload>(this.key, encrypted);
    } catch {
      return; // wrong key / tampered message
    }
    switch (payload.kind) {
      case 'request-scene':
        await this.broadcast({
          kind: 'scene-init',
          elements: this.editor.scene.getAllElements(),
          files: Object.values(fileStore.pick(this.editor.referencedFileIds())),
        });
        return;
      case 'scene-init':
      case 'scene-update': {
        if (payload.files?.length) {
          fileStore.add(payload.files);
          payload.files.forEach((f) => this.sentFileIds.add(f.id)); // peers already have it
        }
        const accepted = reconcileElements(
          (id) => this.editor.scene.getElement(id),
          payload.elements,
          this.editor.getProtectedIds(),
        );
        this.editor.scene.upsert(accepted, 'remote');
        return;
      }
      case 'pointer':
        this.upsertCollaborator(from, { pointer: payload.pointer, username: payload.username });
        return;
      case 'laser': {
        const color = this.editor.getState().collab.collaborators[from]?.color ?? colorFor(from);
        const size = Math.min(4, Math.max(1, Math.round(Number(payload.size) || 2)));
        const mode = payload.mode === 'hold' ? 'hold' : 'fade';
        for (const p of payload.points.slice(0, 500)) this.editor.laser.add(from, color, p, p.start, { size, mode });
        if (payload.end) this.editor.laser.release(from);
        this.editor.requestRender();
        return;
      }
      case 'chat':
        this.appendChat({
          id: payload.id,
          authorId: from,
          username: payload.username,
          text: payload.text.slice(0, 2000),
          at: payload.at,
          own: false,
        });
    }
  }

  /** Sends an end-to-end encrypted chat message to everyone in the room. */
  async sendChat(text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed || !this.transport) return false;
    const username = this.editor.getState().collab.username;
    const msg = { id: generateId(), text: trimmed, username, at: Date.now() };
    await this.broadcast({ kind: 'chat', ...msg });
    this.appendChat({ ...msg, authorId: 'me', own: true });
    return true;
  }

  private appendChat(m: ChatMessage): void {
    this.editor.setState((s) => {
      const viewing = s.sidebar.open && s.sidebar.tab === 'chat';
      return {
        chat: {
          messages: [...s.chat.messages, m].slice(-200),
          unread: viewing || m.own ? s.chat.unread : s.chat.unread + 1,
        },
      };
    });
  }

  private upsertCollaborator(id: string, patch: Partial<Collaborator>): void {
    this.editor.setState((s) => {
      const prev = s.collab.collaborators[id];
      const base: Collaborator = prev ?? { id, color: colorFor(id), username: '', lastSeen: 0 };
      const next: Collaborator = { ...base, ...patch, lastSeen: Date.now() };
      return { collab: { ...s.collab, collaborators: { ...s.collab.collaborators, [id]: next } } };
    });
  }

  private pruneCollaborators(): void {
    const now = Date.now();
    this.editor.setState((s) => {
      const entries = Object.entries(s.collab.collaborators).filter(([, c]) => now - c.lastSeen < STALE_COLLABORATOR_MS);
      if (entries.length === Object.keys(s.collab.collaborators).length) return {};
      return { collab: { ...s.collab, collaborators: Object.fromEntries(entries) } };
    });
  }
}
