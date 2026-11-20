import { useEffect, useRef, useState } from 'react';
import { useAppState, useEditor } from '../EditorContext';

const MAX_TITLE = 120;

/**
 * The drawing's title, top left beside the menu. Click to rename (Enter saves, Esc cancels).
 * It is the same title as Page setup → Document title: used for {title} in headers and footers
 * and for the saved file's name. The browser tab shows it too.
 */
export function DocTitle() {
  const { editor } = useEditor();
  const title = useAppState((s) => s.pageSetup.title ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = title.trim() ? `${title.trim()} — SketchBoard` : 'SketchBoard';
  }, [title]);

  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const save = () => {
    setEditing(false);
    const next = draft.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
    if (next !== title) editor.setState((s) => ({ pageSetup: { ...s.pageSetup, title: next || undefined } }));
  };

  if (editing) {
    return (
      <input
        ref={input}
        className="sb-island sb-doc-title sb-doc-title--edit"
        value={draft}
        maxLength={MAX_TITLE}
        placeholder="Untitled"
        aria-label="Drawing title"
        size={Math.max(8, Math.min(40, draft.length + 2))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          e.stopPropagation(); // typing a title isn't a tool shortcut
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setDraft(title);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      className={`sb-island sb-doc-title ${title.trim() ? '' : 'is-empty'}`}
      title={title.trim() ? `${title} — click to rename` : 'Click to name this drawing'}
      aria-label={title.trim() ? `Drawing title: ${title}. Click to rename` : 'Name this drawing'}
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
    >
      {title.trim() || 'Untitled'}
    </button>
  );
}
