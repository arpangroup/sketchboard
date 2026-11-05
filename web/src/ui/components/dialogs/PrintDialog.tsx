import { useMemo, useState } from 'react';
import type { ColorMode, PageSetup } from '../../../core/types';
import { buildPrintSvg, type PrintScope, printScene } from '../../../export/printService';
import { PAGE_SIZE_OPTIONS } from '../../../page/pageSizes';
import { useAppState, useEditor } from '../../EditorContext';
import { Field, Modal, Segmented } from './Modal';

export function PrintDialog({ onClose }: { onClose: () => void }) {
  const { editor } = useEditor();
  const pageSetup = useAppState((s) => s.pageSetup);
  const [setup, setSetup] = useState<PageSetup>(pageSetup.size === 'infinite' ? { ...pageSetup, size: 'A4' } : pageSetup);
  const [scope, setScope] = useState<PrintScope>(pageSetup.size === 'infinite' ? 'fit' : 'page');
  const [colorMode, setColorMode] = useState<ColorMode>('blackwhite');
  const [busy, setBusy] = useState(false);

  // Printing the page frame only makes sense with the board's own page format.
  const pageMatches = setup.size === pageSetup.size && setup.orientation === pageSetup.orientation;
  const effectiveScope: PrintScope = pageMatches ? scope : 'fit';

  const elements = editor.scene.getElements();
  const preview = useMemo(
    () => buildPrintSvg({ elements, pageSetup: setup, colorMode, scope: effectiveScope }),
    [elements, setup, colorMode, effectiveScope],
  );

  const print = async () => {
    setBusy(true);
    try {
      await printScene({ elements, pageSetup: setup, colorMode, scope: effectiveScope });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Print" onClose={onClose} wide>
      <div className="sb-export">
        <div className="sb-print-preview">
          <div className="sb-print-pages">
            {preview.pages.slice(0, 30).map((page, i) => (
              <figure key={i} className="sb-print-page">
                <div
                  className="sb-paper"
                  style={{ aspectRatio: `${preview.widthMm} / ${preview.heightMm}` }}
                  dangerouslySetInnerHTML={{ __html: page.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" height="100%"') }}
                />
                {preview.pages.length > 1 && <figcaption>Page {i + 1}</figcaption>}
              </figure>
            ))}
          </div>
          <span className="sb-print-preview__caption">
            {preview.pages.length > 1 ? `${preview.pages.length} pages · ` : ''}
            {preview.widthMm} × {preview.heightMm} mm
          </span>
        </div>
        <div className="sb-export__form">
          <Field label="Paper">
            <select
              className="sb-input"
              value={setup.size}
              onChange={(e) => setSetup({ ...setup, size: e.target.value as PageSetup['size'] })}
            >
              {PAGE_SIZE_OPTIONS.filter((o) => o.id !== 'infinite').map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Orientation">
            <Segmented
              value={setup.orientation}
              onChange={(orientation) => setSetup({ ...setup, orientation })}
              options={[
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
              ]}
            />
          </Field>
          <Field
            label="What to print"
            hint={pageMatches ? undefined : 'Paper differs from the board page — the drawing will be scaled to fit.'}
          >
            <Segmented
              value={effectiveScope}
              onChange={setScope}
              options={[
                { value: 'page', label: 'Pages as drawn', disabled: !pageMatches },
                { value: 'fit', label: 'Fit drawing to page' },
              ]}
            />
          </Field>
          <Field label="Colours" hint={colorMode === 'blackwhite' ? 'Strokes and text in black, fills become black hatching — ideal for laser printers.' : undefined}>
            <Segmented
              value={colorMode}
              onChange={setColorMode}
              options={[
                { value: 'blackwhite', label: 'Black & white' },
                { value: 'grayscale', label: 'Grayscale' },
                { value: 'color', label: 'Colour' },
              ]}
            />
          </Field>
          <p className="sb-muted">Tip: choose “Save as PDF” in the print dialog to create a PDF.</p>
          <div className="sb-modal__actions">
            <button className="sb-btn" onClick={onClose}>Cancel</button>
            <button className="sb-btn sb-btn--primary" onClick={print} disabled={busy || elements.length === 0}>
              {busy ? 'Preparing…' : 'Print'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
