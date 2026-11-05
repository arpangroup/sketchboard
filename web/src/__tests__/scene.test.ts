import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../core/constants';
import type { SketchElement } from '../core/types';
import { createShape, updateElement } from '../elements/factory';
import { History } from '../scene/History';
import { reconcileElements, shouldAcceptRemote } from '../scene/reconcile';
import { Scene } from '../scene/Scene';

const rect = (x = 0) => createShape('rectangle', DEFAULT_STYLE, { x, y: 0 }, 1);

describe('Scene', () => {
  it('orders elements by zIndex and hides tombstones', () => {
    const scene = new Scene();
    const a = { ...rect(), zIndex: 2 };
    const b = { ...rect(), zIndex: 1 };
    scene.upsert([a, b]);
    expect(scene.getElements().map((e) => e.id)).toEqual([b.id, a.id]);
    scene.upsert([updateElement(a, { isDeleted: true })]);
    expect(scene.getElements()).toHaveLength(1);
    expect(scene.getAllElements()).toHaveLength(2);
  });
});

describe('History', () => {
  it('undoes and redoes a gesture as one step', () => {
    const scene = new Scene();
    const history = new History(scene);
    const el = rect();
    scene.upsert([el]);
    history.commit();
    // a drag = many intermediate updates, one commit
    let cur: SketchElement = el;
    for (let i = 1; i <= 5; i++) {
      cur = updateElement(cur, { x: i * 10 });
      scene.upsert([cur]);
    }
    history.commit();
    expect(scene.getElement(el.id)!.x).toBe(50);
    history.undo();
    expect(scene.getElement(el.id)!.x).toBe(0);
    history.undo();
    expect(scene.getElements()).toHaveLength(0);
    history.redo();
    history.redo();
    expect(scene.getElement(el.id)!.x).toBe(50);
  });

  it('never reverts remote changes', () => {
    const scene = new Scene();
    const history = new History(scene);
    const mine = rect();
    scene.upsert([mine]);
    history.commit();
    const theirs = rect(100);
    scene.upsert([theirs], 'remote');
    history.undo();
    expect(scene.getElement(theirs.id)?.isDeleted).toBe(false);
    expect(scene.getElements().map((e) => e.id)).toEqual([theirs.id]);
  });

  it('ignores elements created and discarded in the same gesture', () => {
    const scene = new Scene();
    const history = new History(scene);
    scene.upsert([{ ...rect(), isDeleted: true }]);
    expect(history.commit()).toBe(false);
  });
});

describe('reconcile', () => {
  it('prefers higher versions, then lower nonce', () => {
    const base = rect();
    const newer = { ...base, version: base.version + 1 };
    expect(shouldAcceptRemote(base, newer)).toBe(true);
    expect(shouldAcceptRemote(newer, base)).toBe(false);
    const a = { ...base, versionNonce: 1 };
    const b = { ...base, versionNonce: 2 };
    expect(shouldAcceptRemote(b, a)).toBe(true);
    expect(shouldAcceptRemote(a, b)).toBe(false);
  });

  it('skips elements the local user is manipulating', () => {
    const el = rect();
    const remote = { ...el, version: 99 };
    expect(reconcileElements(() => el, [remote], new Set([el.id]))).toHaveLength(0);
    expect(reconcileElements(() => el, [remote])).toHaveLength(1);
  });
});
