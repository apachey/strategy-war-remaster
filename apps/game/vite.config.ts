import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the same build runs inside the Tauri app.
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
});
