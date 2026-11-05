import { useEffect, useRef } from 'react';
import { LINE_HEIGHT } from '../../core/constants';
import { fontCss } from '../../core/fonts';
import type { TextElement } from '../../core/types';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';

/**
 * In-place text editing via a transparent <textarea> positioned exactly over the element.
 * Using a real textarea gives IME, spell-check, selection and accessibility for free.
 */
export function TextEditorOverlay() {
  const { editor } = useEditor();
  const editingId = useAppState((s) => s.editingTextId);
  const viewport = useAppState((s) => s.viewport);
  useSceneRevision();
  const ref = useRef<HTMLTextAreaElement>(null);

  const el = editingId ? (editor.scene.getElement(editingId) as TextElement | undefined) : undefined;

  useEffect(() => {
    if (!editingId || !ref.current) return;
    const ta = ref.current;
    ta.value = (editor.scene.getElement(editingId) as TextElement | undefined)?.text ?? '';
    // focus after the pointer-up that created the element has been processed
    requestAnimationFrame(() => {
      ta.focus();
      ta.select();
    });
  }, [editingId, editor]);

  if (!el) return null;

  const z = viewport.zoom;
  const left = (el.x + viewport.scrollX) * z;
  const top = (el.y + viewport.scrollY) * z;

  return (
    <textarea
      ref={ref}
      className="sb-text-editor"
      spellCheck
      wrap="off"
      style={{
        left,
        top,
        width: Math.max(el.width + el.fontSize, 40) * z,
        height: el.height * z + 4,
        font: `${el.fontStyle ?? 'normal'} ${el.fontWeight ?? 'normal'} ${el.fontSize * z}px ${fontCss(el.fontFamily)}`,
        textDecoration: el.underline ? 'underline' : 'none',
        lineHeight: LINE_HEIGHT,
        color: el.strokeColor,
        textAlign: el.textAlign,
        opacity: el.opacity / 100,
        transformOrigin: 'top left',
        marginLeft: el.textAlign === 'center' ? -(el.fontSize * z) / 2 : el.textAlign === 'right' ? -el.fontSize * z : 0,
      }}
      onChange={(e) => editor.updateEditingText(e.target.value)}
      onBlur={() => editor.finishTextEditing()}
      onKeyDown={(e) => {
        e.stopPropagation();
        const mod = e.ctrlKey || e.metaKey;
        const fmt = { b: 'bold', i: 'italic', u: 'underline' } as const;
        const k = e.key.toLowerCase() as keyof typeof fmt;
        if (mod && fmt[k]) {
          e.preventDefault();
          editor.toggleTextFormat(fmt[k]);
          return;
        }
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
