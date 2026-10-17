import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

/** The studio: every interface piece of 1.1 with its switches, built on its own next to the game (dist-studio). */
export default mergeConfig(
  base,
  defineConfig({
    server: { port: 5174 },
    build: { outDir: 'dist-studio', rollupOptions: { input: { studio: 'studio.html', index: 'index.html' } } },
  }),
);
