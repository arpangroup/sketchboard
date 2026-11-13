import { useEffect, useState } from 'react';
import { workspaceErrorMessage } from '../../../actions/serviceActions';
import { useEditor } from '../../EditorContext';
import { Icons } from '../../icons/Icons';
import { Modal } from './Modal';
import { NoServerDialog } from './NoServerDialog';
import { serverConfigured } from '../../../cloud/serverConfig';

/** "Export to link": uploads an encrypted, read-only snapshot of the board and shows the link. */
export function LinkDialog({ onClose }: { onClose: () => void }) {
  return serverConfigured() ? <LinkView onClose={onClose} /> : <NoServerDialog title="Export to link" onClose={onClose} />;
}

function LinkView({ onClose }: { onClose: () => void }) {
  const { editor, workspace } = useEditor();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    workspace
      .shareCurrent()
      .then((u) => alive && setUrl(u))
      .catch((e) => alive && setError(workspaceErrorMessage(e)));
    return () => {
      alive = false;
    };
  }, [workspace]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      editor.toast('Link copied to clipboard');
    } catch {
      editor.toast('Select the link and copy it (Ctrl+C)');
    }
  };

  return (
    <Modal title="Export to link" onClose={onClose}>
      <div className="sb-link">
        <p className="sb-muted">
          Anyone with this link can open a <strong>copy</strong> of your drawing as it is now. Later changes aren’t included — export a new
          link to share them. It’s end-to-end encrypted: the key is only in the link, so the server can’t see the drawing.
        </p>
        {error ? (
          <p className="sb-link__error">{error}</p>
        ) : !url ? (
          <p className="sb-muted">Creating link…</p>
        ) : (
          <div className="sb-link__row">
            <input className="sb-input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Shareable link" />
            <button className="sb-btn sb-btn--primary" onClick={copy}>
              <Icons.link />
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}
        <div className="sb-modal__actions">
          <button className="sb-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
