/**
 * Minimal observable store (Observer pattern). Framework-agnostic so the editor core
 * has no React dependency; React binds to it via useSyncExternalStore.
 */
export type Listener<T> = (state: T, prev: T) => void;

export class Store<T extends object> {
  private state: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.state = initial;
  }

  getState = (): T => this.state;

  setState = (update: Partial<T> | ((s: T) => Partial<T>)): void => {
    const patch = typeof update === 'function' ? update(this.state) : update;
    let changed = false;
    for (const key in patch) {
      if (!Object.is(patch[key], this.state[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    const prev = this.state;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state, prev));
  };

  subscribe = (listener: Listener<T>): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/** Tiny typed event emitter used by Scene and collaboration. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    (this.handlers[event] ??= new Set()).add(handler);
    return () => this.handlers[event]?.delete(handler);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers[event]?.forEach((h) => h(payload));
  }
}
