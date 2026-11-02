// Renders the app icon from the game's own 3D models (iconScene in apps/game/src/ui/scene3d.ts) and writes
// apps/desktop/src-tauri/icons/source.png; `pnpm --filter @sw/desktop icon` then makes every size, .icns and .ico from it.
// The picture is drawn at 103 px and blown up 8× with hard pixels into the macOS shape: an 824 px rounded square
// with a dark rim, centred on a 1024 px transparent canvas.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const game = resolve(here, '..');
const server = await createServer({ root: game, configFile: resolve(game, 'vite.config.ts'), server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5199/studio.html');
  const png = await page.evaluate(async () => {
    const { iconScene } = await import('/src/ui/scene3d.ts');
    const art = document.createElement('canvas');
    const scene = await iconScene(art, 103);
    // Let the ground texture arrive, then draw again.
    await new Promise((r) => setTimeout(r, 500));
    scene.render(0);
    const out = document.createElement('canvas');
    out.width = out.height = 1024;
    const g = out.getContext('2d');
    const shape = (inset) => {
      const x = 100 + inset;
      const w = 824 - 2 * inset;
      const r = 185 - inset;
      g.beginPath();
      g.roundRect(x, x, w, w, r);
    };
    shape(0);
    g.fillStyle = '#140a04';
    g.fill();
    g.save();
    shape(16);
    g.clip();
    g.imageSmoothingEnabled = false;
    g.drawImage(art, 100, 100, 824, 824);
    g.restore();
    return out.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(resolve(here, '../../desktop/src-tauri/icons/source.png'), Buffer.from(png, 'base64'));
} finally {
  await browser.close();
  await server.close();
}
