import { useEffect, useRef, useState } from 'react';
import type { MathElement } from '../../core/types';
import { isMathReady, mathLayout } from '../../elements/math/mathLayout';
import { Icons } from '../icons/Icons';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';

/** Snippets for the buttons: inserted at the caret; "|" marks where the caret goes. */
const SNIPPETS: Array<{ label: string; title: string; text: string }> = [
  { label: 'a/b', title: 'Fraction', text: '\\frac{|}{}' },
  { label: '√', title: 'Square root', text: '\\sqrt{|}' },
  { label: 'xⁿ', title: 'Power', text: '^{|}' },
  { label: 'xₙ', title: 'Subscript', text: '_{|}' },
  { label: '( )', title: 'Brackets that grow', text: '\\left( | \\right)' },
  { label: 'Σ', title: 'Sum', text: '\\sum_{i=1}^{n} |' },
  { label: '∫', title: 'Integral', text: '\\int_{a}^{b} | \\,dx' },
  { label: 'lim', title: 'Limit', text: '\\lim_{x \\to \\infty} |' },
  { label: '[ ]', title: 'Matrix', text: '\\begin{bmatrix} | & b \\\\ c & d \\end{bmatrix}' },
  { label: 'α', title: 'alpha', text: '\\alpha|' },
  { label: 'π', title: 'pi', text: '\\pi|' },
  { label: '∞', title: 'infinity', text: '\\infty|' },
  { label: '≤', title: 'less or equal', text: '\\le |' },
  { label: '×', title: 'times', text: '\\times |' },
];

/**
 * Edits a formula's LaTeX in a small panel next to it. The formula on the board redraws as you type,
 * so it is its own preview; KaTeX's messages show below. Ctrl+Enter or Esc finishes.
 */
export function MathEditorPanel() {
  const { editor } = useEditor();
  const editingId = useAppState((s) => s.editingMathId);
  const guideOpen = useAppState((s) => s.mathGuideOpen);
  const viewport = useAppState((s) => s.viewport);
  useSceneRevision();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [, force] = useState(0);
  const el = editingId ? (editor.scene.getElement(editingId) as MathElement | undefined) : undefined;

  useEffect(() => {
    if (!editingId || !ref.current) return;
    const ta = ref.current;
    ta.value = (editor.scene.getElement(editingId) as MathElement | undefined)?.latex ?? '';
    requestAnimationFrame(() => {
      ta.focus();
      // a new formula: its sample is selected, so typing replaces it
      if (editor.isFreshMath()) ta.select();
      else ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }, [editingId, editor]);

  // the formula changed from outside (the guide's "Use" button): show it here
  const latex = el?.type === 'math' ? el.latex : undefined;
  useEffect(() => {
    const ta = ref.current;
    if (ta && latex !== undefined && ta.value !== latex) {
      ta.value = latex;
      ta.focus();
      ta.setSelectionRange(latex.length, latex.length);
    }
  }, [latex]);

  // KaTeX arriving updates the error list
  useEffect(() => {
    if (!editingId || isMathReady()) return;
    const t = setInterval(() => isMathReady() && (force((n) => n + 1), clearInterval(t)), 200);
    return () => clearInterval(t);
  }, [editingId]);

  if (!el || el.type !== 'math') return null;
  const z = viewport.zoom;
  const W = 440;
  const sx = (el.x + viewport.scrollX) * z;
  const sy = (el.y + viewport.scrollY) * z;
  const below = (el.y + el.height + viewport.scrollY) * z + 12;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.max(8, Math.min(vw - W - 8, sx + (el.width * z) / 2 - W / 2));
  const top = below + 260 < vh ? below : Math.max(8, sy - 272);
  const errors = mathLayout(el.latex, el.textAlign)?.errors ?? [];

  const insert = (snippet: string) => {
    const ta = ref.current;
    if (!ta) return;
    const at = snippet.indexOf('|');
    const text = snippet.replace('|', '');
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    // a selection goes inside the snippet (where the caret would go)
    const picked = ta.value.slice(s, e);
    const value = ta.value.slice(0, s) + text.slice(0, at) + picked + text.slice(at) + ta.value.slice(e);
    ta.value = value;
    const caret = s + at + picked.length;
    ta.focus();
    ta.setSelectionRange(caret, caret);
    editor.updateEditingMath(value);
  };

  return (
    <div
      className="sb-island sb-math-editor"
      style={{ left, top, width: W }}
      role="dialog"
      aria-label="Edit formula"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="sb-math-editor__head">
        <strong>LaTeX</strong>
        <span className="sb-muted">
          <code>$$ … $$</code> per equation, or one formula
        </span>
        <button
          className="sb-math-editor__guide"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.setState((s) => ({ mathGuideOpen: !s.mathGuideOpen }))}
          aria-pressed={guideOpen}
          title="Examples to copy, cheat sheet and how-to"
        >
          <Icons.math /> Examples &amp; help
        </button>
      </div>
      <div className="sb-math-editor__snippets" role="toolbar" aria-label="Insert">
        {SNIPPETS.map((sn) => (
          <button key={sn.title} className="sb-math-editor__snip" title={sn.title} aria-label={sn.title} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(sn.text)}>
            {sn.label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        className="sb-input sb-math-editor__src"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={6}
        aria-label="LaTeX source"
        aria-invalid={errors.length > 0}
        onChange={(e) => editor.updateEditingMath(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            editor.finishMathEditing();
          }
        }}
      />
      {errors.length > 0 && (
        <p className="sb-math-editor__error" role="status">
          {errors[0].replace(/^(ParseError:\s*)?KaTeX parse error:\s*/, '')}
        </p>
      )}
      <div className="sb-math-editor__foot">
        <span className="sb-muted">{isMathReady() ? 'Rendered with KaTeX' : 'Loading the maths renderer…'}</span>
        <button className="sb-btn sb-btn--primary" onClick={() => editor.finishMathEditing()}>
          Done <kbd>Ctrl+Enter</kbd>
        </button>
      </div>
    </div>
  );
}
