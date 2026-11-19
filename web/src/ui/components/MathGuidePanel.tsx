import { useEffect, useMemo, useRef, useState } from 'react';
import { MATH_CHEATSHEET, MATH_EXAMPLES, type MathExample } from '../../elements/math/mathExamples';
import { isMathReady, loadMath, onMathChange, renderMathHtml } from '../../elements/math/mathLayout';
import { Icons } from '../icons/Icons';
import { useAppState, useEditor } from '../EditorContext';

/** Copies text, with a fallback for browsers that block the async clipboard. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Copy button that turns into a tick for a moment. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      className={`sb-icon-btn sb-math-guide__copy ${done ? 'is-done' : ''}`}
      title={done ? 'Copied' : label}
      aria-label={done ? 'Copied' : label}
      onClick={() => void copyText(text).then(setDone)}
    >
      {done ? <Icons.check /> : <Icons.copy />}
    </button>
  );
}

function ExampleCard({ ex, editing, ready, onUse }: { ex: MathExample; editing: boolean; ready: boolean; onUse: () => void }) {
  const html = useMemo(() => (ready ? renderMathHtml(ex.source) : null), [ex.source, ready]);
  const [showSource, setShowSource] = useState(false);
  return (
    <article className="sb-math-guide__card">
      <header>
        <h4>{ex.title}</h4>
        {editing && (
          <button className="sb-btn sb-btn--sm" onClick={onUse} title="Replace the formula you're editing with this example">
            Use
          </button>
        )}
        <CopyButton text={ex.source} label={`Copy “${ex.title}” as LaTeX`} />
      </header>
      {html ? (
        // KaTeX output of our own examples (trust: false)
        <div className="sb-math-guide__preview" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="sb-math-guide__preview sb-muted">Loading…</div>
      )}
      <button className="sb-math-guide__toggle" onClick={() => setShowSource((v) => !v)} aria-expanded={showSource}>
        {showSource ? 'Hide LaTeX' : 'Show LaTeX'}
      </button>
      {showSource && <pre className="sb-math-guide__src">{ex.source}</pre>}
    </article>
  );
}

/**
 * The maths guide beside the board: how to write formulae, a cheat sheet and ready-made examples
 * (the same as docs/LATEX.md), each rendered, with a copy button — and, while a formula is being
 * edited, a "Use" button that puts the example into it.
 */
export function MathGuidePanel() {
  const { editor } = useEditor();
  const open = useAppState((s) => s.mathGuideOpen);
  const editingId = useAppState((s) => s.editingMathId);
  const [query, setQuery] = useState('');
  const [, rerender] = useState(0);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void loadMath();
    return onMathChange(() => rerender((n) => n + 1));
  }, [open]);

  if (!open) return null;
  const close = () => editor.setState({ mathGuideOpen: false });
  const q = query.trim().toLowerCase();
  const groups = MATH_EXAMPLES.map((g) => ({
    ...g,
    items: q ? g.items.filter((it) => `${g.category} ${it.title} ${it.source}`.toLowerCase().includes(q)) : g.items,
  })).filter((g) => g.items.length);
  const cheats = q ? MATH_CHEATSHEET.filter((c) => `${c.meaning} ${c.codes.join(' ')}`.toLowerCase().includes(q)) : MATH_CHEATSHEET;
  const jump = (id: string) => body.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const slug = (s: string) => `mg-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <aside
      className="sb-island sb-math-guide"
      aria-label="Maths guide"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
    >
      <div className="sb-math-guide__head">
        <Icons.math />
        <h3>Maths guide</h3>
        <button className="sb-icon-btn" onClick={close} aria-label="Close maths guide" title="Close">
          <Icons.close />
        </button>
      </div>
      <input
        className="sb-input sb-math-guide__search"
        type="search"
        placeholder="Search examples (fraction, matrix, QPS…)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search examples"
      />
      {!q && (
        <nav className="sb-math-guide__nav" aria-label="Sections">
          <button onClick={() => jump('mg-how')}>How to</button>
          <button onClick={() => jump('mg-cheat')}>Cheat sheet</button>
          {MATH_EXAMPLES.map((g) => (
            <button key={g.category} onClick={() => jump(slug(g.category))}>
              {g.category.replace(/:.*$/, '').replace(' & capacity estimates', '')}
            </button>
          ))}
        </nav>
      )}
      <div className="sb-math-guide__body" ref={body}>
        {!q && (
          <section id="mg-how" className="sb-math-guide__how">
            <h3>How to</h3>
            <ul>
              <li>
                Click <Icons.copy /> to copy an example, then press <kbd>Ctrl+V</kbd> on the board — or in the formula editor.
              </li>
              <li>
                {editingId ? 'You are editing a formula: ' : 'While editing a formula, '}
                <b>Use</b> replaces it with the example.
              </li>
              <li>
                New formula: <kbd>Alt+=</kbd>. Edit one: double-click it. Finish: <kbd>Ctrl+Enter</kbd> or <kbd>Esc</kbd>.
              </li>
              <li>
                Each <code>$$ … $$</code> block is one equation; several blocks stack in one formula.
              </li>
            </ul>
          </section>
        )}
        {cheats.length > 0 && (
          <section id="mg-cheat">
            <h3>Cheat sheet</h3>
            <dl className="sb-math-guide__cheats">
              {cheats.map((c) => (
                <div key={c.meaning + c.codes.join()} className="sb-math-guide__cheat">
                  <dt>
                    {c.codes.map((code) => (
                      <button key={code} className="sb-math-guide__chip" title={`Copy ${code}`} onClick={() => void copyText(code).then((ok) => ok && editor.toast(`Copied ${code}`))}>
                        <code>{code}</code>
                      </button>
                    ))}
                  </dt>
                  <dd>{c.meaning}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {groups.map((g) => (
          <section key={g.category} id={slug(g.category)}>
            <h3>{g.category}</h3>
            {g.items.map((ex) => (
              <ExampleCard key={ex.title} ex={ex} editing={!!editingId} ready={isMathReady()} onUse={() => editor.updateEditingMath(ex.source)} />
            ))}
          </section>
        ))}
        {!groups.length && !cheats.length && <p className="sb-muted">No examples match “{query}”.</p>}
        <p className="sb-muted sb-math-guide__more">
          Everything KaTeX supports:{' '}
          <a href="https://katex.org/docs/supported.html" target="_blank" rel="noreferrer">
            katex.org/docs/supported
          </a>
        </p>
      </div>
    </aside>
  );
}
