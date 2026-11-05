import { Emitter } from '../core/Store';

/**
 * PWA integration: service-worker registration, update detection, install prompt and
 * platform detection. Framework-agnostic; React binds through `usePwa()`.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState {
  /** Browser offered a native install prompt (Chromium/Android/desktop). */
  canInstall: boolean;
  /** Already running as an installed app. */
  installed: boolean;
  /** iOS Safari: no prompt API - users install via Share → Add to Home Screen. */
  needsIosInstructions: boolean;
  /** A new version has been downloaded and is waiting. */
  updateReady: boolean;
  online: boolean;
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

class PwaManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private waitingWorker: ServiceWorker | null = null;
  /** Only reload on controller change when the user asked for the update (not on first install). */
  private updateRequested = false;
  private emitter = new Emitter<{ change: PwaState }>();
  private state: PwaState = {
    canInstall: false,
    installed: isStandalone(),
    needsIosInstructions: isIos() && !isStandalone(),
    updateReady: false,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
  };

  init(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // we show our own, less intrusive install entry
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.set({ canInstall: true });
    });
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.set({ canInstall: false, installed: true, needsIosInstructions: false });
    });
    window.addEventListener('online', () => this.set({ online: true }));
    window.addEventListener('offline', () => this.set({ online: false }));
    this.registerServiceWorker();
  }

  getState = (): PwaState => this.state;

  subscribe = (fn: () => void): (() => void) => this.emitter.on('change', fn);

  async promptInstall(): Promise<boolean> {
    const p = this.deferredPrompt;
    if (!p) return false;
    await p.prompt();
    const { outcome } = await p.userChoice;
    this.deferredPrompt = null;
    this.set({ canInstall: false });
    return outcome === 'accepted';
  }

  /** Activates the waiting service worker; the page reloads once it takes control. */
  applyUpdate(): void {
    if (!this.waitingWorker) return location.reload();
    this.updateRequested = true;
    this.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }

  private registerServiceWorker(): void {
    // Only in production builds - a caching SW makes development confusing.
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // clients.claim() on the very first install also fires this - never reload then.
      if (reloading || !this.updateRequested) return;
      reloading = true;
      location.reload();
    });
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const track = (w: ServiceWorker | null) => {
          if (!w) return;
          w.addEventListener('statechange', () => {
            // "installed" + an existing controller = an update, not the first install.
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              this.waitingWorker = w;
              this.set({ updateReady: true });
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          this.waitingWorker = reg.waiting;
          this.set({ updateReady: true });
        }
        reg.addEventListener('updatefound', () => track(reg.installing));
        // check for new versions periodically (installed apps can stay open for days)
        setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
      } catch (err) {
        console.warn('[SketchBoard] Service worker registration failed', err);
      }
    });
  }

  private set(patch: Partial<PwaState>): void {
    this.state = { ...this.state, ...patch };
    this.emitter.emit('change', this.state);
  }
}

export const pwa = new PwaManager();

/**
 * File Handling API: when installed on desktop Chromium, double-clicking a .sketchboard file
 * opens it in SketchBoard. The consumer receives the file handles.
 */
export function onLaunchFiles(handler: (file: File) => void): void {
  const lq = (window as Window & { launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void } })
    .launchQueue;
  lq?.setConsumer(async (params) => {
    const handle = params.files?.[0];
    if (handle) handler(await handle.getFile());
  });
}
