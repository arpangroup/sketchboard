import { type ReactNode, useMemo, useState } from 'react';
import { sceneToMarkdown } from '../../../export/markdownExport';
import { exportToPngBlob } from '../../../export/pngExport';
import { elementsForScope, resolveRegion } from '../../../export/region';
import { downloadBlob, fileNameFor, saveExcalidrawFile, saveSceneToFile } from '../../../persistence/fileService';
import { useAppState, useEditor } from '../../EditorContext';
import { type IconName, Icons } from '../../icons/Icons';
import { ANY_IMPORT_ACCEPT, importFiles } from '../../importFiles';
import { ImageExportPanel } from './ExportDialog';
import { Field, Modal, Segmented } from './Modal';

/** The pages of the Save & export dialog. */
export type SaveTarget = 'sketchboard' | 'image' | 'markdown' | 'excalidraw' | 'pdf' | 'cloud';

const TARGETS: Array<{ id: SaveTarget; icon: IconName; title: string; note: string }> = [
  { id: 'sketchboard', icon: 'download', title: 'SketchBoard file', note: 'Keep editing later' },
  { id: 'image', icon: 'image', title: 'Image', note: 'PNG or SVG' },
  { id: 'markdown', icon: 'page', title: 'Markdown for AI', note: 'Text an LLM can review' },
  { id: 'excalidraw', icon: 'download', title: 'Excalidraw', note: 'Open in excalidraw.com' },
  { id: 'pdf', icon: 'print', title: 'PDF or print', note: 'Pages, B&W, paper size' },
  { id: 'cloud', icon: 'cloud', title: 'Workspace & link', note: 'Save online, share' },
];

const safeName = (v: string) => v.replace(/[\\/:*?"<>|]/g, '');

function FileName({ value, onChange, ext }: { value: string; onChange: (v: string) => void; ext: string }) {
  return (
    <Field label="File name">
      <div className="sb-filename">
        <input className="sb-input" value={value} onChange={(e) => onChange(safeName(e.target.value))} aria-label="File name" />
        <span className="sb-filename__ext">.{ext}</span>
      </div>
    </Field>
  );
}

/** One page of the dialog: a heading line, the options, and the main button(s) at the bottom. */
function Page({ lead, children, actions }: { lead: string; children?: ReactNode; actions: ReactNode }) {
  return (
    <div className="sb-save__page">
      <p className="sb-save__lead">{lead}</p>
      {children}
      <div className="sb-modal__actions">{actions}</div>
    </div>
  );
}

function MarkdownPage({ onClose }: { onClose: () => void }) {
  const { editor } = useEditor();
  const pageSetup = useAppState((s) => s.pageSetup);
  const selectedIds = useAppState((s) => s.selectedIds);
  const hasSelection = Object.keys(selectedIds).length > 0;
  const [scope, setScope] = useState<'content' | 'selection'>(hasSelection ? 'selection' : 'content');
  const [mermaid, setMermaid] = useState(true);
  const [positions, setPositions] = useState(true);
  const [picture, setPicture] = useState(true);
  const [name, setName] = useState(() => fileNameFor(pageSetup));

  const elements = useMemo(() => elementsForScope(scope, editor.scene.getElements(), selectedIds), [scope, editor, selectedIds]);
  const markdown = useMemo(
    () => sceneToMarkdown(elements, { title: pageSetup.title, pageSetup, mermaid, positions, imageFile: picture ? `${name}.png` : undefined }),
    [elements, pageSetup, mermaid, positions, picture, name],
  );

  const download = async () => {
    downloadBlob(new Blob([markdown], { type: 'text/markdown' }), `${name}.md`);
    if (picture && elements.length) {
      // the picture goes alongside, so a reviewer (or a model that reads images) gets both
      const region = resolveRegion('content', elements, pageSetup);
      downloadBlob(await exportToPngBlob(elements, { region, colorMode: 'color', background: true, scale: 2 }), `${name}.png`);
    }
    editor.toast(picture ? `Saved ${name}.md and ${name}.png` : `Saved ${name}.md`);
    onClose();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      editor.toast('Markdown copied — paste it into a chat with an AI assistant');
    } catch {
      editor.toast('Your browser blocked clipboard access — use Download instead');
    }
  };

  return (
    <Page
      lead="The drawing written out as text: a Mermaid diagram of the boxes and arrows, the connections, and every shape, note, table, code block and formula — ready to give to an AI assistant for review."
      actions={
        <>
          <button className="sb-btn" onClick={copy} disabled={!elements.length}>
            <Icons.copy /> Copy Markdown
          </button>
          <button className="sb-btn sb-btn--primary" onClick={download} disabled={!name || !elements.length}>
            Download
          </button>
        </>
      }
    >
      <div className="sb-save__options">
        <Field label="Area">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'content', label: 'Whole drawing' },
              { value: 'selection', label: 'Selection', disabled: !hasSelection },
            ]}
          />
        </Field>
        <div className="sb-save__checks">
          <label className="sb-switch">
            <input type="checkbox" checked={mermaid} onChange={(e) => setMermaid(e.target.checked)} />
            <span>Diagram as Mermaid</span>
          </label>
          <label className="sb-switch">
            <input type="checkbox" checked={positions} onChange={(e) => setPositions(e.target.checked)} />
            <span>Positions and sizes</span>
          </label>
          <label className="sb-switch">
            <input type="checkbox" checked={picture} onChange={(e) => setPicture(e.target.checked)} />
            <span>Also save a PNG picture</span>
          </label>
        </div>
      </div>
      <FileName value={name} onChange={setName} ext="md" />
      <pre className="sb-save__md" aria-label="Markdown preview" tabIndex={0}>
        {markdown}
      </pre>
    </Page>
  );
}

/**
 * Save & export: one place for every way a drawing leaves SketchBoard. A list of destinations on
 * the left, the options for the chosen one on the right.
 */
export function SaveDialog({ onClose, initial = 'sketchboard' }: { onClose: () => void; initial?: SaveTarget }) {
  const { editor, actions } = useEditor();
  const pageSetup = useAppState((s) => s.pageSetup);
  const selectedIds = useAppState((s) => s.selectedIds);
  const hasSelection = Object.keys(selectedIds).length > 0;
  const [target, setTarget] = useState<SaveTarget>(initial);
  const [name, setName] = useState(() => fileNameFor(pageSetup));
  const [exScope, setExScope] = useState<'content' | 'selection'>('content');
  const go = (dialog: 'print' | 'link' | 'workspace') => editor.setState({ openDialog: dialog });

  const page = (() => {
    switch (target) {
      case 'sketchboard':
        return (
          <Page
            lead="Everything stays editable: pages, layers, styles, tables, code and formulas. Open it again with Open…, or drop it on the board."
            actions={
              <button
                className="sb-btn sb-btn--primary"
                disabled={!name}
                onClick={() => {
                  saveSceneToFile(editor.getSceneData(false, true), name);
                  editor.toast(`Saved ${name}.sketchboard`);
                  onClose();
                }}
              >
                Download
              </button>
            }
          >
            <FileName value={name} onChange={setName} ext="sketchboard" />
            <p className="sb-hint">Tip: <kbd>Ctrl+S</kbd> saves this file straight away, without this dialog.</p>
          </Page>
        );
      case 'image':
        return (
          <div className="sb-save__page sb-save__page--image">
            <ImageExportPanel onClose={onClose} formats={['png', 'svg']} />
          </div>
        );
      case 'markdown':
        return <MarkdownPage onClose={onClose} />;
      case 'excalidraw':
        return (
          <Page
            lead="Opens in excalidraw.com. Tables, bold / italic text and highlighter come back intact when the file is opened here again."
            actions={
              <button
                className="sb-btn sb-btn--primary"
                disabled={!name}
                onClick={() => {
                  const data = editor.getSceneData(false, true);
                  if (exScope === 'selection') data.elements = data.elements.filter((e) => selectedIds[e.id]);
                  saveExcalidrawFile(data, name);
                  editor.toast(`Saved ${name}.excalidraw`);
                  onClose();
                }}
              >
                Download
              </button>
            }
          >
            <Field label="Area">
              <Segmented
                value={exScope}
                onChange={setExScope}
                options={[
                  { value: 'content', label: 'Whole drawing' },
                  { value: 'selection', label: 'Selection', disabled: !hasSelection },
                ]}
              />
            </Field>
            <FileName value={name} onChange={setName} ext="excalidraw" />
          </Page>
        );
      case 'pdf':
        return (
          <Page
            lead="Print on paper or choose “Save as PDF” in the print window. Pick the paper size, page as drawn or fit to page, and colour, grayscale or black & white."
            actions={
              <button className="sb-btn sb-btn--primary" onClick={() => go('print')}>
                <Icons.print /> Print or save as PDF…
              </button>
            }
          />
        );
      case 'cloud':
        return (
          <Page
            lead="Keep the drawing on the SketchBoard server, or make a link others can open."
            actions={null}
          >
            <div className="sb-save__cards">
              <button className="sb-save__card" onClick={() => { onClose(); void actions.execute('saveToWorkspace'); }}>
                <Icons.cloud />
                <span>
                  <b>Save to workspace</b>
                  <small>Saves changes to this drawing on the server · Ctrl+Shift+S</small>
                </span>
              </button>
              <button className="sb-save__card" onClick={() => go('workspace')}>
                <Icons.folder />
                <span>
                  <b>Browse workspace…</b>
                  <small>All saved drawings, with previews, share links and downloads</small>
                </span>
              </button>
              <button className="sb-save__card" onClick={() => go('link')}>
                <Icons.link />
                <span>
                  <b>Shareable link…</b>
                  <small>A read-only, end-to-end encrypted copy anyone with the link can open</small>
                </span>
              </button>
            </div>
          </Page>
        );
    }
  })();

  return (
    <Modal title="Save & export" onClose={onClose} wide>
      <div className="sb-save">
        <nav className="sb-save__nav" role="tablist" aria-label="Save as">
          {TARGETS.map((t) => {
            const Icon = Icons[t.icon];
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={target === t.id}
                className={`sb-save__tab ${target === t.id ? 'is-active' : ''}`}
                onClick={() => setTarget(t.id)}
              >
                <Icon />
                <span>
                  <b>{t.title}</b>
                  <small>{t.note}</small>
                </span>
              </button>
            );
          })}
        </nav>
        <section className="sb-save__body" role="tabpanel" aria-label={TARGETS.find((t) => t.id === target)?.title}>
          {page}
        </section>
      </div>
    </Modal>
  );
}

/**
 * Open & import: drop (or choose) any file — a drawing, a table, a library or pictures — or pick
 * what to bring in from the cards.
 */
export function OpenDialog({ onClose }: { onClose: () => void }) {
  const { editor, actions, library } = useEditor();
  const [over, setOver] = useState(false);
  const take = (files: File[]) => {
    if (!files.length) return;
    onClose();
    void importFiles(editor, library, files);
  };
  const choose = (accept: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => take([...(input.files ?? [])]);
    input.click();
  };
  const run = (id: string) => {
    onClose();
    void actions.execute(id);
  };
  const cards: Array<{ icon: IconName; title: string; note: string; onClick: () => void }> = [
    { icon: 'folder', title: 'Open a drawing', note: '.sketchboard or .excalidraw · Ctrl+O', onClick: () => run('openFile') },
    { icon: 'cloud', title: 'From workspace', note: 'Drawings saved on the server', onClick: () => editor.setState({ openDialog: 'workspace' }) },
    { icon: 'table', title: 'Import a table', note: 'CSV, TSV or a Markdown table', onClick: () => run('importTable') },
    { icon: 'image', title: 'Insert pictures', note: 'PNG, JPG, SVG, GIF, WebP', onClick: () => run('insertImage') },
    { icon: 'library', title: 'Import a library', note: '.sketchboardlib or .excalidrawlib', onClick: () => choose('.sketchboardlib,.excalidrawlib') },
  ];
  return (
    <Modal title="Open & import" onClose={onClose} wide>
      <div className="sb-open">
        <button
          className={`sb-open__drop ${over ? 'is-over' : ''}`}
          onClick={() => choose(ANY_IMPORT_ACCEPT)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take([...e.dataTransfer.files]);
          }}
        >
          <Icons.download />
          <b>Drop a file here, or click to choose</b>
          <small>Drawings, tables, libraries and pictures — SketchBoard works out what it is</small>
        </button>
        <div className="sb-open__cards">
          {cards.map((c) => {
            const Icon = Icons[c.icon];
            return (
              <button key={c.title} className="sb-save__card" onClick={c.onClick}>
                <Icon />
                <span>
                  <b>{c.title}</b>
                  <small>{c.note}</small>
                </span>
              </button>
            );
          })}
        </div>
        <p className="sb-hint sb-open__tip">
          You can also paste straight onto the board (<kbd>Ctrl+V</kbd>): pictures, cells from Excel or Google Sheets, Markdown tables, LaTeX formulae and shapes copied in Excalidraw.
        </p>
      </div>
    </Modal>
  );
}
