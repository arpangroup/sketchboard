import type { SceneData } from '../core/types';
import { parseScene } from '../persistence/serialization';

/** Mirrors the server's DrawingMeta (collab-server/src/storage/repositories.ts). */
export interface DrawingMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  size: number;
  elementCount: number;
  hasThumbnail: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  /** Server not running / unreachable. */
  get offline(): boolean {
    return this.status === 0;
  }
}

/** HTTP base URL of the SketchBoard server (same host as the collaboration relay by default). */
export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  if (import.meta.env.VITE_COLLAB_SERVER_URL) return import.meta.env.VITE_COLLAB_SERVER_URL.replace(/^ws/, 'http').replace(/\/$/, '');
  return `${location.protocol}//${location.hostname}:3002`;
}

/**
 * Typed client for the workspace REST API. The only place that knows URLs and status codes,
 * so swapping the backend (e.g. a hosted cloud API with auth) touches nothing else.
 */
export class WorkspaceApi {
  constructor(readonly baseUrl: string = getApiBaseUrl()) {}

  private async request<T>(path: string, init: RequestInit = {}, parse: 'json' | 'text' | 'none' = 'json'): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api${path}`, init);
    } catch {
      throw new ApiError(0, `Can't reach the SketchBoard server at ${this.baseUrl}`);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new ApiError(res.status, String(body.error ?? `Request failed (${res.status})`), body);
    }
    if (parse === 'none') return undefined as T;
    return (parse === 'json' ? res.json() : res.text()) as Promise<T>;
  }

  private sendJson = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  async list(): Promise<DrawingMeta[]> {
    return (await this.request<{ drawings: DrawingMeta[] }>('/drawings')).drawings;
  }

  create(input: { name: string; scene: SceneData; thumbnail?: string }): Promise<DrawingMeta> {
    return this.request('/drawings', this.sendJson('POST', input));
  }

  update(id: string, input: { name?: string; scene?: SceneData; thumbnail?: string; revision?: number }): Promise<DrawingMeta> {
    return this.request(`/drawings/${encodeURIComponent(id)}`, this.sendJson('PUT', input));
  }

  remove(id: string): Promise<void> {
    return this.request(`/drawings/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'none');
  }

  async scene(id: string): Promise<SceneData> {
    return parseScene(await this.request<string>(`/drawings/${encodeURIComponent(id)}/scene`, {}, 'text'));
  }

  thumbnailUrl(meta: Pick<DrawingMeta, 'id' | 'updatedAt'>): string {
    return `${this.baseUrl}/api/drawings/${encodeURIComponent(meta.id)}/thumbnail?v=${meta.updatedAt}`;
  }

  downloadUrl(id: string): string {
    return `${this.baseUrl}/api/drawings/${encodeURIComponent(id)}/scene?download=1`;
  }

  async createLink(ciphertext: string): Promise<string> {
    return (await this.request<{ id: string }>('/links', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: ciphertext })).id;
  }

  getLink(id: string): Promise<string> {
    return this.request(`/links/${encodeURIComponent(id)}`, {}, 'text');
  }
}
