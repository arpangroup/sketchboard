import { pwa } from '../../pwa/pwa';
import { usePwa } from '../EditorContext';
import { Modal } from './dialogs/Modal';

/** Update-available and offline notices. */
export function PwaBanners() {
  const { updateReady, online } = usePwa();
  return (
    <div className="sb-banners" aria-live="polite">
      {!online && (
        <div className="sb-island sb-banner sb-banner--muted">
          <span className="sb-dot" /> Offline — your drawing keeps saving on this device
        </div>
      )}
      {updateReady && (
        <div className="sb-island sb-banner">
          A new version of SketchBoard is ready
          <button className="sb-btn sb-btn--primary sb-btn--sm" onClick={() => pwa.applyUpdate()}>
            Reload
          </button>
        </div>
      )}
    </div>
  );
}

/** Instructions for platforms without a programmatic install prompt (iOS Safari). */
export function InstallDialog({ onClose }: { onClose: () => void }) {
  const { canInstall, installed } = usePwa();
  return (
    <Modal title="Install SketchBoard" onClose={onClose}>
      {installed ? (
        <p className="sb-muted">SketchBoard is already installed on this device. 🎉</p>
      ) : canInstall ? (
        <>
          <p className="sb-muted">Install SketchBoard as an app: it opens in its own window, works offline and starts from your home screen or dock.</p>
          <div className="sb-modal__actions">
            <button className="sb-btn sb-btn--primary" onClick={async () => { await pwa.promptInstall(); onClose(); }}>
              Install
            </button>
          </div>
        </>
      ) : (
        <ol className="sb-install-steps">
          <li>
            Tap the <strong>Share</strong> button <span className="sb-ios-share" aria-hidden="true">⬆︎</span> in Safari’s toolbar.
          </li>
          <li>
            Scroll down and choose <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong>Add</strong>. SketchBoard now opens full-screen and works offline.
          </li>
        </ol>
      )}
    </Modal>
  );
}

