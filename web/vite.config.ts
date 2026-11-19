import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // the project, plus ../docs: a test checks the in-app maths guide against docs/LATEX.md
    fs: { allow: ['.', '../docs'] },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom'], rough: ['roughjs'] } },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
