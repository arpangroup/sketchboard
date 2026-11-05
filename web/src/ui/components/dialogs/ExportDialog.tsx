import { useMemo, useState } from 'react';
import type { ColorMode } from '../../../core/types';
import { exportToPngBlob } from '../../../export/pngExport';
import { elementsForScope, type ExportScope, resolveRegion } from '../../../export/region';
import { exportToSvg } from '../../../export/svgExport';
import { downloadBlob, saveSceneToFile } from '../../../persistence/fileService';
import { COLOR_MODE_OPTIONS } from '../../../renderer/colorModes';
import { useAppState, useEditor } from '../../EditorContext';
import { Field, Modal, Segmented } from './Modal';

type Format = 'png' | 'svg' | 'json';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { editor } = useEditor();
  const pageSetup = useAppState((s) => s.pageSetup);
  const selectedIds = useAppState((s) => s.selectedIds);
  const hasSelection = Object.keys(selectedIds).length > 0;

  const [format, setFormat] = useState<Format>('png');
  const [scope, setScope] = useState<ExportScope>(hasSelection ? 'selection' : pageSetup.size === 'infinite' ? 'content' : 'page');
  const [colorMode, setColorMode] = useState<ColorMode>('color');
  const [background, setBackground] = useState(true);
  const [scale, setScale] = useState(2);
  const [name, setName] = useState('drawing');

  const { elements, region } = useMemo(() => {
    const els = elementsForScope(scope, editor.scene.getElements(), selectedIds);
    return { elements: els, region: resolveRegion(scope, els, pageSetup) };
  }, [scope, editor, selectedIds, pageSetup]);

  // headers / footers / page numbers belong to page exports only
  const decorations = scope === 'page' ? editor.getPageDecorations() : undefined;
  const preview = useMemo(
    () => exportToSvg(elements, { region, colorMode, background, embedFonts: false, decorations }),
    [elements, region, colorMode, background, decorations],
  );

  const run = async () => {
    try {
      if (format === 'json') saveSceneToFile(editor.getSceneData(false, true), name);
      else if (format === 'svg') {
        const svg = exportToSvg(elements, { region, colorMode, background, decorations });
        downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
      } else {
        downloadBlob(await exportToPngBlob(elements, { region, colorMode, background, scale, decorations }), `${name}.png`);
      }
      editor.toast(`Exported ${name}.${format === 'json' ? 'sketchboard' : format}`);
      onClose();
    } catch (e) {
      editor.toast(`Export failed: ${(e as Error).message}`);
    }
  };

  const copyPng = async () => {
    try {
      const blob = await exportToPngBlob(elements, { region, colorMode, background, scale, decorations });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      editor.toast('PNG copied to clipboard');
    } catch {
      editor.toast('Your browser blocked clipboard access — use Download instead');
    }
  };

  return (
    <Modal title="Export" onClose={onClose} wide>
      <div className="sb-export">
        <div className="sb-preview sb-preview--checker" dangerouslySetInnerHTML={{ __html: preview }} />
        <div className="sb-export__form">
          <Field label="Format">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'svg', label: 'SVG' },
                { value: 'json', label: 'SketchBoard file' },
              ]}
            />
          </Field>
          {format !== 'json' && (
            <>
              <Field label="Area">
                <Segmented
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: 'page', label: 'Page', disabled: pageSetup.size === 'infinite' },
                    { value: 'content', label: 'Whole drawing' },
                    { value: 'selection', label: 'Selection', disabled: !hasSelection },
                  ]}
                />
              </Field>
              <Field label="Colours">
                <Segmented value={colorMode} onChange={setColorMode} options={COLOR_MODE_OPTIONS.map((o) => ({ value: o.id, label: o.label }))} />
              </Field>
              <Field label="Background">
                <label className="sb-switch">
                  <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />
                  <span>{background ? 'White background' : 'Transparent'}</span>
                </label>
              </Field>
              {format === 'png' && (
                <Field label="Scale" hint={`${Math.round(region.width * scale)} × ${Math.round(region.height * scale)} px`}>
                  <Segmented value={scale} onChange={setScale} options={[1, 2, 3, 4].map((s) => ({ value: s, label: `${s}×` }))} />
                </Field>
              )}
            </>
          )}
          <Field label="File name">
            <input className="sb-input" value={name} onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]/g, ''))} />
          </Field>
          <div className="sb-modal__actions">
            {format === 'png' && typeof ClipboardItem !== 'undefined' && (
              <button className="sb-btn" onClick={copyPng}>Copy to clipboard</button>
            )}
            <button className="sb-btn sb-btn--primary" onClick={run} disabled={!name}>
              Download
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
