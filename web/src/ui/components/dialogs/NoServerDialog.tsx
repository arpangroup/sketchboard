import { NO_SERVER_MESSAGE } from '../../../cloud/serverConfig';
import { Icons } from '../../icons/Icons';
import { Modal } from './Modal';

/** Shown instead of a server-backed dialog when the build has no server configured. */
export function NoServerDialog({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="sb-empty">
        <div className="sb-empty__art"><Icons.cloud /></div>
        <p className="sb-empty__title">Needs a SketchBoard server</p>
        <p className="sb-muted">{NO_SERVER_MESSAGE}</p>
        <p className="sb-muted">
          To keep a copy, use <strong>Save to file</strong> or export to Excalidraw. To turn these features on, run the server from the{' '}
          <code>collab-server</code> folder and set its URL in the <code>SKETCHBOARD_SERVER_URL</code> repository variable.
        </p>
      </div>
      <div className="sb-modal__actions">
        <button className="sb-btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
