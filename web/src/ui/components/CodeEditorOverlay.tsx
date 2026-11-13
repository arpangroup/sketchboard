import { useEffect, useRef } from 'react';
import { fontCss } from '../../core/fonts';
import type { CodeElement } from '../../core/types';
import { CODE_FONT, codeLayout } from '../../elements/code/codeLayout';
import { CODE_THEMES } from '../../elements/code/codeLayout';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';

const INDENT = '  ';

/**
 * Edits a code block in place: a textarea with transparent text laid exactly over the block's code
 * area, so the canvas underneath shows live syntax highlighting while the textarea provides the
 * caret, selection, IME and clipboard. Tab indents, Shift+Tab outdents, Enter keeps indentation.
 */
export function CodeEditorOverlay() {
  const { editor } = useEditor();
  const editingId = useAppState((s) => s.editingCodeId);
  const viewport = useAppState((s) => s.viewport);
  useSceneRevision();
  const ref = useRef<HTMLTextAreaElement>(null);
  const el = editingId ? (editor.scene.getElement(editingId) as CodeElement | undefined) : undefined;

  useEffect(() => {
    if (!editingId || !ref.current) return;
    const ta = ref.current;
    ta.value = (editor.scene.getElement(editingId) as CodeElement | undefined)?.code ?? '';
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }, [editingId, editor]);

  if (!el || el.type !== 'code') return null;
  const l = codeLayout(el);
  const z = viewport.zoom;
  const theme = CODE_THEMES[el.theme] ?? CODE_THEMES.dark;

  const edit = (ta: HTMLTextAreaElement, value: string, selStart: number, selEnd = selStart) => {
    ta.value = value;
    ta.setSelectionRange(selStart, selEnd);
    editor.updateEditingCode(value);
  };

  return (
    <textarea
      ref={ref}
      className="sb-code-editor"
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      wrap="off"
      aria-label="Code"
      style={{
        left: (el.x + l.codeX + viewport.scrollX) * z,
        top: (el.y + l.codeY + viewport.scrollY) * z,
        width: (el.width - l.codeX - l.padX / 2) * z,
        height: (l.lines.length * l.lineH + l.padY * 0.5) * z,
        font: `${el.fontSize * z}px ${fontCss(CODE_FONT)}`,
        lineHeight: `${l.lineH * z}px`,
        caretColor: theme.tokens.plain,
        transform: el.angle ? `rotate(${el.angle}rad)` : undefined,
        transformOrigin: el.angle ? `${(el.width / 2 - l.codeX) * z}px ${(el.height / 2 - l.codeY) * z}px` : undefined,
        // selection stays visible even though the text itself is transparent
        ['--sb-code-selection' as string]: el.theme === 'dark' ? 'rgba(97, 175, 239, 0.35)' : 'rgba(9, 105, 218, 0.25)',
      }}
      onChange={(e) => editor.updateEditingCode(e.target.value)}
      onBlur={() => editor.finishCodeEditing()}
      onKeyDown={(e) => {
        e.stopPropagation();
        const ta = e.currentTarget;
        const { selectionStart: s, selectionEnd: t, value } = ta;
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          ta.blur();
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const lineStart = value.lastIndexOf('\n', s - 1) + 1;
          if (e.shiftKey || s !== t) {
            // (out)dent every selected line
            const end = t;
            const block = value.slice(lineStart, end);
            const lines = block.split('\n');
            const next = lines.map((ln) => (e.shiftKey ? ln.replace(/^ {1,2}|^\t/, '') : INDENT + ln)).join('\n');
            const delta = next.length - block.length;
            const firstDelta = e.shiftKey ? lines[0].length - lines[0].replace(/^ {1,2}|^\t/, '').length : INDENT.length;
            edit(ta, value.slice(0, lineStart) + next + value.slice(end), Math.max(lineStart, s + (e.shiftKey ? -firstDelta : firstDelta)), end + delta);
          } else {
            edit(ta, value.slice(0, s) + INDENT + value.slice(t), s + INDENT.length);
          }
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          // keep the current line's indentation (one more level after an opening bracket / colon)
          e.preventDefault();
          const lineStart = value.lastIndexOf('\n', s - 1) + 1;
          const current = value.slice(lineStart, s);
          let indent = current.match(/^\s*/)![0];
          if (/[{[(:]\s*$/.test(current)) indent += INDENT;
          edit(ta, value.slice(0, s) + '\n' + indent + value.slice(t), s + 1 + indent.length);
        }
      }}
    />
  );
}
