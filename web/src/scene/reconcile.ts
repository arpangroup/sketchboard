import type { SketchElement } from '../core/types';

/**
 * Deterministic last-writer-wins rule used by every peer, so all peers converge
 * without a central authority:
 *   - higher `version` wins
 *   - equal version: lower `versionNonce` wins (arbitrary but consistent)
 */
export function shouldAcceptRemote(local: SketchElement | undefined, remote: SketchElement): boolean {
  if (!local) return true;
  if (remote.version > local.version) return true;
  if (remote.version < local.version) return false;
  return remote.versionNonce < local.versionNonce;
}

export function reconcileElements(
  getLocal: (id: string) => SketchElement | undefined,
  remote: readonly SketchElement[],
  /** Elements the local user is actively manipulating - never overwrite mid-gesture. */
  protectedIds: ReadonlySet<string> = new Set(),
): SketchElement[] {
  return remote.filter((r) => !protectedIds.has(r.id) && shouldAcceptRemote(getLocal(r.id), r));
}
