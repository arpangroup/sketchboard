import { decrypt, encrypt, generateKey, importKey } from '../collab/crypto';
import type { SceneData } from '../core/types';
import { parseScene } from '../persistence/serialization';
import type { WorkspaceApi } from './WorkspaceApi';

/**
 * "Export to link" (read-only snapshot): the drawing is AES-GCM encrypted in the browser, the
 * ciphertext is uploaded, and the key travels only in the URL fragment (#json=id,key), which
 * browsers never send to servers. The server stores data it cannot read.
 */
export async function exportToLink(api: WorkspaceApi, scene: SceneData, base = `${location.origin}${location.pathname}`): Promise<string> {
  const key = await generateKey();
  const id = await api.createLink(await encrypt(await importKey(key), scene));
  return `${base}#json=${id},${key}`;
}

export function parseLinkFromHash(hash = location.hash): { id: string; key: string } | null {
  const m = hash.match(/json=([\w-]+),([\w-]+)/);
  return m ? { id: m[1], key: m[2] } : null;
}

export async function loadFromLink(api: WorkspaceApi, id: string, key: string): Promise<SceneData> {
  const ciphertext = await api.getLink(id);
  try {
    return parseScene(await decrypt(await importKey(key), ciphertext));
  } catch {
    throw new Error('This link is damaged or incomplete');
  }
}
