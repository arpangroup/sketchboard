/**
 * Whether this build talks to a SketchBoard server (collaboration relay + workspace API).
 * Static hosting such as GitHub Pages builds with VITE_NO_SERVER=true unless a server URL is given,
 * so server features explain themselves instead of trying to reach a server that isn't there.
 */
export const serverConfigured = (): boolean => import.meta.env.VITE_NO_SERVER !== 'true';

export const NO_SERVER_MESSAGE =
  'This copy of SketchBoard is hosted without a server, so live collaboration, the workspace and share links are turned off. ' +
  'Everything else works and your board is kept in this browser.';
