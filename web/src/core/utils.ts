export const randomInteger = (): number => Math.floor(Math.random() * 2 ** 31);

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  debounced.flush = () => {
    if (t) {
      clearTimeout(t);
      t = undefined;
    }
  };
  return debounced;
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let last = 0;
  let pending: A | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else {
      pending = args;
      if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = undefined;
          if (pending) fn(...pending);
          pending = null;
        }, remaining);
      }
    }
  };
}

export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
