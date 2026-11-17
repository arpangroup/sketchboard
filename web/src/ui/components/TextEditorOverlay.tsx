import { useEffect, useLayoutEffect, useRef } from 'react';
import { LINE_HEIGHT } from '../../core/constants';
import { fontCss } from '../../core/fonts';
import type { TextElement, TextRun } from '../../core/types';
import { styledRuns } from '../../elements/textMetrics';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';

type Format = 'bold' | 'italic' | 'underline';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The editor's starting HTML: the text, with formatted words wrapped in <b> / <i> / <u>. */
function toHtml(el: TextElement): string {
  const bold = el.fontWeight === 'bold';
  const italic = el.fontStyle === 'italic';
  const runs = styledRuns(el) ?? [{ text: el.text, bold, italic, underline: !!el.underline }];
  const html = runs
    .map((r) => {
      let h = escapeHtml(r.text);
      if (r.bold !== bold) h = r.bold ? `<b>${h}</b>` : `<span style="font-weight:normal">${h}</span>`;
      if (r.italic !== italic) h = r.italic ? `<i>${h}</i>` : `<span style="font-style:normal">${h}</span>`;
      if (r.underline && !el.underline) h = `<u>${h}</u>`;
      return h;
    })
    .join('');
  // a final line break only shows when followed by a <br>
  return el.text.endsWith('\n') ? `${html}<br>` : html;
}

/**
 * Reads the editor back: plain text plus its formatted pieces. Each piece's look comes from the
 * browser's computed style, so <b>, <strong>, style="font-weight…" and nesting all read correctly.
 */
function readEditor(root: HTMLElement): { text: string; runs: TextRun[] } {
  const runs: TextRun[] = [];
  let text = '';
  // the browser keeps a trailing <br> so an empty last line shows; it isn't part of the text
  let last: Node | null = root;
  while (last?.lastChild) last = last.lastChild;
  const trailingBr = last?.nodeName === 'BR' ? last : null;

  const styleOf = (el: Element) => {
    const cs = getComputedStyle(el);
    let underline = false;
    for (let a: Element | null = el; a && a !== root.parentElement; a = a.parentElement) {
      if (getComputedStyle(a).textDecorationLine.includes('underline')) underline = true;
    }
    const weight = Number.parseInt(cs.fontWeight, 10);
    return { b: (Number.isFinite(weight) ? weight : 400) >= 600, i: cs.fontStyle !== 'normal', u: underline };
  };
  const push = (t: string, el: Element) => {
    if (!t) return;
    runs.push({ text: t, ...styleOf(el) });
    text += t;
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) push((child.textContent ?? '').replace(/ /g, ' '), child.parentElement ?? root);
      else if (child.nodeName === 'BR') {
        if (child !== trailingBr) push('\n', (child as Element).parentElement ?? root);
      } else if (child instanceof HTMLElement) {
        // a pasted or browser-made block (<div>, <p>) starts a new line
        const block = /^(DIV|P|LI)$/.test(child.nodeName);
        if (block && text && !text.endsWith('\n')) push('\n', root);
        walk(child);
      }
    });
  };
  walk(root);
  return { text, runs };
}

/**
 * In-place text editing in a rich editor (contentEditable) positioned exactly over the element, so
 * selected words can be made bold, italic or underlined (Ctrl+B / I / U or the panel buttons) and
 * show that way while typing. With nothing selected, those commands format the whole box.
 */
export function TextEditorOverlay() {
  const { editor } = useEditor();
  const editingId = useAppState((s) => s.editingTextId);
  const viewport = useAppState((s) => s.viewport);
  useSceneRevision();
  const ref = useRef<HTMLDivElement>(null);
  const baseLook = useRef('');

  const el = editingId ? (editor.scene.getElement(editingId) as TextElement | undefined) : undefined;

  // load the text when editing starts, select it all, and focus
  useEffect(() => {
    if (!editingId || !ref.current) return;
    const root = ref.current;
    const current = editor.scene.getElement(editingId) as TextElement | undefined;
    root.innerHTML = current ? toHtml(current) : '';
    requestAnimationFrame(() => {
      if (!root.isConnected) return;
      root.focus();
      const range = document.createRange();
      range.selectNodeContents(root);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  }, [editingId, editor]);

  // Bold / Italic / Underline on the words selected here (from the keyboard or the panel)
  useEffect(() => {
    if (!editingId) return;
    editor.setSelectionFormatter((kind: Format) => {
      const root = ref.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.isCollapsed || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return false;
      document.execCommand('styleWithCSS', false, 'false');
      document.execCommand(kind); // fires "input", which saves the change
      return true;
    });
    return () => editor.setSelectionFormatter(null);
  }, [editingId, editor]);

  // the whole box was made bold / italic / underlined: redraw the editor's words to match.
  // (Not when editing starts: placing a caret in an editable element focuses it, and doing that
  // during the click that starts editing would lose focus again straight away.)
  const lookFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!el || !ref.current) return;
    const look = `${el.fontWeight}|${el.fontStyle}|${el.underline}`;
    if (lookFor.current !== el.id) {
      lookFor.current = el.id;
      baseLook.current = look;
      return;
    }
    if (look === baseLook.current) return;
    baseLook.current = look;
    ref.current.innerHTML = toHtml(el);
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });

  if (!el) return null;

  const z = viewport.zoom;
  const left = (el.x + viewport.scrollX) * z;
  const top = (el.y + viewport.scrollY) * z;
  // shape labels and fixed-width boxes wrap at their width: edit them at exactly that width
  const wraps = !!el.containerId || !!el.fixedWidth;
  const shift = wraps ? 0 : el.textAlign === 'center' ? -(el.fontSize * z) / 2 : el.textAlign === 'right' ? -el.fontSize * z : 0;

  const save = () => {
    if (!ref.current) return;
    const { text, runs } = readEditor(ref.current);
    editor.updateEditingText(text, runs);
  };

  return (
    <div
      ref={ref}
      className="sb-text-editor"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Text"
      spellCheck
      style={{
        left,
        top,
        width: wraps ? el.width * z : Math.max(el.width + el.fontSize, 40) * z,
        minHeight: el.height * z + 4,
        font: `${el.fontStyle ?? 'normal'} ${el.fontWeight ?? 'normal'} ${el.fontSize * z}px ${fontCss(el.fontFamily)}`,
        textDecoration: el.underline ? 'underline' : 'none',
        lineHeight: LINE_HEIGHT,
        color: el.strokeColor,
        textAlign: el.textAlign,
        opacity: el.opacity / 100,
        marginLeft: shift,
        whiteSpace: wraps ? 'pre-wrap' : 'pre',
        overflowWrap: wraps ? 'anywhere' : 'normal',
        cursor: 'text',
        // rotated text is edited in place, turned around the element's centre
        transform: el.angle ? `rotate(${el.angle}rad)` : undefined,
        transformOrigin: el.angle ? `${(el.width / 2) * z - shift}px ${(el.height / 2) * z}px` : 'top left',
      }}
      onInput={save}
      onBlur={() => editor.finishTextEditing()}
      onPaste={(e) => {
        // paste words, not someone else's styling
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        const mod = e.ctrlKey || e.metaKey;
        const fmt = { b: 'bold', i: 'italic', u: 'underline' } as const;
        const k = e.key.toLowerCase() as keyof typeof fmt;
        if (mod && fmt[k]) {
          e.preventDefault();
          editor.toggleTextFormat(fmt[k]); // selected words, or the whole box
          return;
        }
        if (e.key === 'Escape' || (e.key === 'Enter' && mod)) {
          e.preventDefault();
          e.currentTarget.blur();
          return;
        }
        if (e.key === 'Enter') {
          // a plain line break (not a new <div>)
          e.preventDefault();
          document.execCommand('insertLineBreak');
        }
      }}
    />
  );
}
