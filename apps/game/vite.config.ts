import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative asset paths so the same build runs inside the Tauri app.
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  define: { __APP_VERSION__: JSON.stringify(version) },
});
