import { useEffect, useLayoutEffect, useRef } from 'react';
import { LINE_HEIGHT } from '../../core/constants';
import { fontCss } from '../../core/fonts';
import type { TextElement, TextRun } from '../../core/types';
import { styledRuns } from '../../elements/textMetrics';
import type { SelectionFormat } from '../../editor/Editor';
import { continueList, renumber, type TextEdit, toggleList } from '../../elements/textLists';
import { useAppState, useEditor, useSceneRevision } from '../EditorContext';


const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The editor's starting HTML: the text, with formatted words wrapped in <b> / <i> / <u>. */
function toHtml(source: TextElement, content?: { text: string; runs?: TextRun[] }): string {
  const el = content ? { ...source, text: content.text, runs: content.runs } : source;
  const bold = el.fontWeight === 'bold';
  const italic = el.fontStyle === 'italic';
  const runs = styledRuns(el) ?? [{ text: el.text, bold, italic, underline: !!el.underline }];
  const html = runs
    .map((r) => {
      let h = escapeHtml(r.text);
      if (r.bold !== bold) h = r.bold ? `<b>${h}</b>` : `<span style="font-weight:normal">${h}</span>`;
      if (r.italic !== italic) h = r.italic ? `<i>${h}</i>` : `<span style="font-style:normal">${h}</span>`;
      if (r.underline && !el.underline) h = `<u>${h}</u>`;
      if (r.color) h = `<span style="color:${escapeHtml(r.color)}">${h}</span>`;
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
/** "rgb(224, 49, 49)" → "#e03131" (keeps an alpha as #rrggbbaa). */
function cssToHex(css: string): string {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/);
  if (!m) return css;
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number.parseFloat(m[4]);
  return `#${h(+m[1])}${h(+m[2])}${h(+m[3])}${alpha < 1 ? h(alpha * 255) : ''}`;
}

function readEditor(root: HTMLElement): { text: string; runs: TextRun[] } {
  const runs: TextRun[] = [];
  let text = '';
  // the browser keeps a trailing <br> so an empty last line shows; it isn't part of the text
  let last: Node | null = root;
  while (last?.lastChild) last = last.lastChild;
  const trailingBr = last?.nodeName === 'BR' ? last : null;

  const rootColor = getComputedStyle(root).color;
  const styleOf = (el: Element) => {
    const cs = getComputedStyle(el);
    // a colour different from the box's own is these words' colour
    const color = cs.color !== rootColor ? cssToHex(cs.color) : undefined;
    let underline = false;
    for (let a: Element | null = el; a && a !== root.parentElement; a = a.parentElement) {
      if (getComputedStyle(a).textDecorationLine.includes('underline')) underline = true;
    }
    const weight = Number.parseInt(cs.fontWeight, 10);
    return { b: (Number.isFinite(weight) ? weight : 400) >= 600, i: cs.fontStyle !== 'normal', u: underline, ...(color ? { c: color } : {}) };
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
  // with pre-formatted white space the browser ends the text with an extra "\n" so that an empty
  // last line shows; like a trailing <br>, it isn't part of the text
  if (last?.nodeType === Node.TEXT_NODE && last.textContent?.endsWith('\n') && text.endsWith('\n')) {
    text = text.slice(0, -1);
    const r = runs[runs.length - 1];
    r.text = r.text.slice(0, -1);
    if (!r.text) runs.pop();
  }
  return { text, runs };
}

const MARK = '\uE000';

/**
 * Edits the editor's text as plain text + formatting (for lists): reads it with the selection as
 * character offsets, lets `fn` change it, then redraws the words and puts the selection back.
 * Returns false (and changes nothing) when `fn` returns null.
 */
function applyTextEdit(root: HTMLElement, el: TextElement, fn: (e: TextEdit) => TextEdit | null): TextEdit | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  const range = sel.getRangeAt(0);
  // mark the selection's ends with characters nobody types, then read the words back
  const end = document.createTextNode(MARK);
  const start = document.createTextNode(MARK);
  const r2 = range.cloneRange();
  r2.collapse(false);
  r2.insertNode(end);
  const r1 = range.cloneRange();
  r1.collapse(true);
  r1.insertNode(start);
  const read = readEditor(root);
  start.remove();
  end.remove();
  root.normalize();
  const from = read.text.indexOf(MARK);
  const to = read.text.indexOf(MARK, from + 1) - 1;
  const text = read.text.split(MARK).join('');
  const runs = read.runs.map((r) => ({ ...r, text: r.text.split(MARK).join('') })).filter((r) => r.text);
  const out = fn({ text, runs, from, to });
  if (!out) {
    placeSelection(root, from, to);
    return null;
  }
  root.innerHTML = toHtml(el, out);
  placeSelection(root, out.from, out.to);
  return out;
}

/** Puts the selection at plain-text offsets (counting a line break as one character). */
function placeSelection(root: HTMLElement, from: number, to: number) {
  const find = (target: number): [Node, number] => {
    let left = target;
    let found: [Node, number] | null = null;
    const walk = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        if (found) return;
        if (child.nodeType === Node.TEXT_NODE) {
          const len = child.textContent?.length ?? 0;
          if (left <= len) found = [child, left];
          else left -= len;
        } else if (child.nodeName === 'BR') {
          if (left === 0) found = [node, Array.from(node.childNodes).indexOf(child)];
          else left -= 1;
        } else walk(child);
      }
    };
    walk(root);
    return found ?? [root, root.childNodes.length];
  };
  const range = document.createRange();
  range.setStart(...find(from));
  range.setEnd(...find(to));
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
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
    editor.setSelectionFormatter((f: SelectionFormat) => {
      const root = ref.current;
      const sel = window.getSelection();
      if (f.kind === 'list') {
        const current = root && (editor.scene.getElement(editingId) as TextElement | undefined);
        if (!root || !current) return false;
        const out = applyTextEdit(root, current, (e) => toggleList(e, f.list));
        if (out) editor.updateEditingText(out.text, out.runs);
        return !!out;
      }
      if (!root || !sel || sel.isCollapsed || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return false;
      // these fire "input", which saves the change
      if (f.kind === 'color') {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('foreColor', false, f.value);
      } else {
        document.execCommand('styleWithCSS', false, 'false');
        document.execCommand(f.kind);
      }
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
      onBlur={() => {
        // numbers stay in order after items were deleted or moved
        if (ref.current) {
          const { text, runs } = readEditor(ref.current);
          const fixed = renumber({ text, runs, from: 0, to: 0 });
          if (fixed.text !== text) editor.updateEditingText(fixed.text, fixed.runs);
        }
        editor.finishTextEditing();
      }}
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
        // Ctrl+Shift+8: bullets, Ctrl+Shift+7: numbers (as in Google Docs)
        if (mod && e.shiftKey && (e.code === 'Digit8' || e.code === 'Digit7')) {
          e.preventDefault();
          editor.toggleList(e.code === 'Digit8' ? 'bullet' : 'number');
          return;
        }
        if (e.key === 'Escape' || (e.key === 'Enter' && mod)) {
          e.preventDefault();
          e.currentTarget.blur();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          // in a list: the next item (or, on an empty item, the end of the list). Shift+Enter: a plain line.
          if (!e.shiftKey && el && ref.current) {
            const out = applyTextEdit(ref.current, el, continueList);
            if (out) {
              editor.updateEditingText(out.text, out.runs);
              return;
            }
          }
          // a plain line break (not a new <div>)
          document.execCommand('insertLineBreak');
        }
      }}
    />
  );
}
