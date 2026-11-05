import type { BinaryFile, Point, SketchElement } from '../core/types';

/** Wire protocol between browser and relay server (server never sees decrypted payloads). */
export type ClientMessage =
  | { type: 'join'; roomId: string }
  | { type: 'broadcast'; payload: string; volatile?: boolean };

export type ServerMessage =
  | { type: 'joined'; clientId: string; peers: string[] }
  | { type: 'peer-joined'; clientId: string }
  | { type: 'peer-left'; clientId: string }
  | { type: 'message'; from: string; payload: string }
  | { type: 'error'; message: string };

/** Encrypted application payloads exchanged between peers. */
export type PeerPayload =
  | { kind: 'request-scene' }
  | { kind: 'scene-init'; elements: SketchElement[]; files?: BinaryFile[] }
  | { kind: 'scene-update'; elements: SketchElement[]; files?: BinaryFile[] }
  | { kind: 'laser'; points: Array<{ x: number; y: number; start: boolean }> }
  | { kind: 'pointer'; pointer: Point; username: string }
  | { kind: 'chat'; id: string; text: string; username: string; at: number };
