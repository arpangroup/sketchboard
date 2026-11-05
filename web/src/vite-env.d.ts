/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL of the collaboration relay, e.g. wss://collab.example.com */
  readonly VITE_COLLAB_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
