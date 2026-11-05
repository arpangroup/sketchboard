/**
 * End-to-end encryption for live collaboration (AES-GCM 128).
 * The key lives only in the URL fragment (#room=id,key) - fragments are never sent to a
 * server - so the relay server only ever sees ciphertext (zero-knowledge relay).
 */

const toBase64Url = (bytes: Uint8Array): string => {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (str: string): Uint8Array => {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function generateRoomId(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(10)));
}

export async function generateKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt', 'decrypt']);
  return toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export function importKey(encoded: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64Url(encoded) as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encrypt(key: CryptoKey, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv);
  packed.set(cipher, iv.length);
  return toBase64Url(packed);
}

export async function decrypt<T = unknown>(key: CryptoKey, payload: string): Promise<T> {
  const packed = fromBase64Url(payload);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: packed.slice(0, 12) },
    key,
    packed.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
