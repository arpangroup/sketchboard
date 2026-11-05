import { useEffect, useRef, useState } from 'react';
import type { ToolType } from '../../core/types';
import { useAppState, useEditor } from '../EditorContext';
import { type IconName, Icons } from '../icons/Icons';

const TOOLS: Array<{ type: ToolType; label: string; key: string }> = [
  { type: 'hand', label: 'Hand — pan the canvas', key: 'H' },
  { type: 'selection', label: 'Select', key: '1' },
  { type: 'rectangle', label: 'Rectangle', key: '2' },
  { type: 'diamond', label: 'Diamond', key: '3' },
  { type: 'ellipse', label: 'Ellipse', key: '4' },
  { type: 'arrow', label: 'Arrow', key: '5' },
  { type: 'line', label: 'Line', key: '6' },
  { type: 'freedraw', label: 'Pen (pressure-sensitive, works with Apple Pencil & styluses)', key: '7' },
  { type: 'text', label: 'Text', key: '8' },
  { type: 'table', label: 'Table', key: 'G' },
  { type: 'eraser', label: 'Stroke eraser', key: '0' },
];

/** Tools that live in the "More tools" popover (the ⋯ button shows the active one). */
const MORE_TOOLS: Array<{ type: ToolType; label: string; hint: string; key: string; icon: IconName }> = [
  { type: 'freedraw', label: 'Pen', hint: 'Pressure-sensitive ink', key: 'P', icon: 'freedraw' },
  { type: 'highlighter', label: 'Highlighter', hint: 'Translucent marker', key: 'M', icon: 'highlighter' },
  { type: 'eraser', label: 'Stroke eraser', hint: 'Removes whole strokes', key: 'E', icon: 'eraser' },
  { type: 'laser', label: 'Laser pointer', hint: 'Point things out, fades away', key: 'K', icon: 'laser' },
];

export function Toolbar() {
  const { editor } = useEditor();
  const active = useAppState((s) => s.activeTool);
  const locked = useAppState((s) => s.toolLocked);

  return (
    <div className="sb-island sb-toolbar" role="toolbar" aria-label="Drawing tools">
      <button
        className={`sb-tool sb-tool--lock ${locked ? 'is-active' : ''}`}
        title="Keep selected tool active after drawing (Q)"
        aria-pressed={locked}
        onClick={() => editor.setState({ toolLocked: !locked })}
      >
        {locked ? <Icons.lock /> : <Icons.unlock />}
      </button>
      <span className="sb-divider" />
      {TOOLS.map((t) => {
        const Icon = Icons[t.type as IconName];
        return (
          <button
            key={t.type}
            className={`sb-tool ${active === t.type ? 'is-active' : ''}`}
            title={`${t.label} — ${t.key}`}
            aria-label={t.label.split(' (')[0]}
            aria-pressed={active === t.type}
            onClick={() => editor.setTool(t.type)}
          >
            <Icon />
            <span className="sb-tool__key">{t.key}</span>
          </button>
        );
      })}
      <span className="sb-divider" />
      <MoreTools />
    </div>
  );
}

function MoreTools() {
  const { editor, actions } = useEditor();
  const active = useAppState((s) => s.activeTool);
  const shapeRecognition = useAppState((s) => s.shapeRecognition);
  const penMode = useAppState((s) => s.penMode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  // When a popover-only tool is active, the ⋯ button turns into that tool's icon.
  const featured = active === 'highlighter' || active === 'laser' ? MORE_TOOLS.find((t) => t.type === active) : undefined;
  const ButtonIcon = featured ? Icons[featured.icon] : Icons.more;
  const pick = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="sb-more" ref={ref}>
      <button
        className={`sb-tool ${featured ? 'is-active' : ''} ${open ? 'is-open' : ''}`}
        aria-label="More tools"
        aria-expanded={open}
        title="More tools — pen, highlighter, laser pointer, image, draw to shape"
        onClick={() => setOpen(!open)}
      >
        <ButtonIcon />
      </button>
      {open && (
        <div className="sb-island sb-more__menu" role="menu">
          <p className="sb-more__heading">Draw</p>
          {MORE_TOOLS.map((t) => {
            const Icon = Icons[t.icon];
            return (
              <button
                key={t.type}
                role="menuitemradio"
                aria-checked={active === t.type}
                className={`sb-more__item ${active === t.type ? 'is-active' : ''}`}
                onClick={pick(() => editor.setTool(t.type))}
              >
                <Icon />
                <span>
                  {t.label}
                  <small>{t.hint}</small>
                </span>
                <kbd>{t.key}</kbd>
              </button>
            );
          })}
          <hr />
          <p className="sb-more__heading">Insert</p>
          <button role="menuitem" className="sb-more__item" onClick={pick(() => actions.execute('insertImage'))}>
            <Icons.image />
            <span>
              Image
              <small>Or paste / drop one onto the board</small>
            </span>
            <kbd>9</kbd>
          </button>
          <hr />
          <p className="sb-more__heading">Options</p>
          <label className="sb-more__toggle">
            <Icons.shapes />
            <span>
              Draw to shape
              <small>Pen strokes snap to clean shapes</small>
            </span>
            <input type="checkbox" role="switch" checked={shapeRecognition} onChange={() => actions.execute('toggleShapeRecognition')} />
          </label>
          <label className="sb-more__toggle">
            <Icons.stylus />
            <span>
              Pen mode
              <small>Stylus draws · fingers pan &amp; zoom</small>
            </span>
            <input type="checkbox" role="switch" checked={penMode} onChange={() => actions.execute('togglePenMode')} />
          </label>
        </div>
      )}
    </div>
  );
}
