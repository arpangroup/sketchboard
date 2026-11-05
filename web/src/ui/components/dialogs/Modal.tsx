import { type ReactNode, useEffect, useRef } from 'react';
import { Icons } from '../../icons/Icons';

export function Modal(p: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(p.onClose);
  onCloseRef.current = p.onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, []);

  return (
    <div className="sb-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={p.title}
        className={`sb-modal ${p.wide ? 'sb-modal--wide' : ''}`}
      >
        <header className="sb-modal__header">
          <h2>{p.title}</h2>
          <button className="sb-icon-btn" onClick={p.onClose} aria-label="Close">
            <Icons.close />
          </button>
        </header>
        <div className="sb-modal__body">{p.children}</div>
      </div>
    </div>
  );
}

export function Field(p: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="sb-field">
      <span className="sb-field__label">{p.label}</span>
      <div className="sb-field__control">{p.children}</div>
      {p.hint && <span className="sb-field__hint">{p.hint}</span>}
    </div>
  );
}

export function Segmented<T extends string | number>(p: {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="sb-segmented sb-segmented--lg" role="radiogroup">
      {p.options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={p.value === o.value}
          disabled={o.disabled}
          className={p.value === o.value ? 'is-active' : ''}
          onClick={() => p.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
