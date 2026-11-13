/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL of the collaboration relay, e.g. wss://collab.example.com */
  readonly VITE_COLLAB_SERVER_URL?: string;
  /** HTTP URL of the workspace API (defaults to the collaboration server's host), e.g. https://api.example.com */
  readonly VITE_API_URL?: string;
  /** 'true' for static hosting with no server (GitHub Pages): server features show an explanation instead. */
  readonly VITE_NO_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
