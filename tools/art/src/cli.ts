import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { PNG } from 'pngjs';
import { pack, type Frame } from './atlas';
import { CAMERA_ELEVATION_DEG, DIRECTION_NAMES, frameLayout, PX_PER_CELL, SPRITES, SUPERSAMPLE, type SpriteDef } from './catalog';
import type { RawRender } from './browser/render';
import { DEFAULT_COLORS, DEFAULT_SECOND_COLORS, defaultChassisColor, glowRamp, RACES, TEAM_COLORS, type TeamColor } from '@sw/data';
import { CHASSIS_RAMP, GLOW_RAMP, PALETTE, RAMPS, SECOND_RAMP, TEAM_RAMP, type Rgb } from './palette';
import { colorize, flipRows, OUTLINE_WIDTH, recolor, reduce, type Reduced } from './pixel';
import { effects } from './effects';
import { forestFringes, forestTiles, FOREST_VARIANTS, PLATE_CELLS, plateEdges, plates, sand, SAND_CELLS } from './terrain';

/**
 * pnpm sprites [--only name,name] [--out dir] [--preview file.png] [--outline px] [--check]
 *
 * Renders every model in the catalog in headless Chromium, turns the renders into palette pixel art (team surfaces in
 * TEAM_RAMP, which the game recolours per side) and writes assets/sprites/sprites.png + sprites.json (a PixiJS spritesheet) and a preview sheet. It also paints
 * the ground (src/terrain.ts) into assets/sprites/terrain.png + terrain.json.
 * --outline sets the outline width (default 2, 0 for none, as the sprite studio wants its frames).
 * --check writes nothing and fails if the committed sprites differ from what the models produce now.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const only = arg('only')?.split(',');
const check = process.argv.includes('--check');
const outline = Number(arg('outline') ?? OUTLINE_WIDTH);
const outDir = resolve(repo, arg('out') ?? 'assets/sprites');
const previewPath = resolve(repo, arg('preview') ?? 'docs/art/sprites-preview.png');

function viewName(def: SpriteDef, view: number): string | null {
  if (def.views === 1) return null;
  if (def.masks) return String(def.masks[view]);
  if (def.views === 8 && !def.variants) return DIRECTION_NAMES[view]!;
  return String(view);
}

function frameName(def: SpriteDef, frame: string, view: number): string {
  return [def.name, frame, viewName(def, view)].filter((p) => p !== null).join('/');
}

/** move0 + move1 play as "move"; single frames such as "fire" stay as they are. */
const animationOf = (frame: string) => frame.replace(/\d+$/, '');

function pngBytes(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  return PNG.sync.write(png);
}

function writePng(path: string, w: number, h: number, rgba: Uint8ClampedArray): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pngBytes(w, h, rgba));
}

async function main(): Promise<void> {
  const bundle = await build({
    entryPoints: [join(here, 'browser/render.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    minify: true,
    logLevel: 'warning',
  });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e));
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });

  const sprites = SPRITES.filter((s) => !only || only.includes(s.name));
  const reduced = new Map<string, { def: SpriteDef; frame: string; view: number; r: Reduced }>();
  const started = Date.now();
  for (const def of sprites) {
    for (const frame of def.frames) {
      for (let view = 0; view < def.views; view++) {
        const raw: RawRender = await page.evaluate(([n, v, f]) => window.renderSprite(n, v, f), [def.name, def.masks?.[view] ?? view, frame] as const);
        const mat = Buffer.from(raw.mat, 'base64');
        const light = Buffer.from(raw.light, 'base64');
        flipRows(mat, raw.w, raw.h, 1);
        flipRows(light, raw.w, raw.h, 1);
        const depthBytes = Buffer.from(raw.depth, 'base64');
        flipRows(depthBytes, raw.w, raw.h, 2);
        const depth = new Uint16Array(raw.w * raw.h);
        for (let i = 0; i < depth.length; i++) depth[i] = (depthBytes[i * 2]! << 8) | depthBytes[i * 2 + 1]!;
        const r = reduce(mat, light, depth, raw.w, raw.h, SUPERSAMPLE);
        reduced.set(`${def.name}|${frame}|${view}`, { def, frame, view, r });
      }
    }
    console.log(`${def.name}: ${def.frames.length * def.views} renders`);
  }
  await browser.close();

  const frames: Frame[] = [];
  const animations: Record<string, string[]> = {};
  for (const { def, frame, view, r } of reduced.values()) {
    const { ax, ay } = frameLayout(def.cells);
    const name = frameName(def, frame, view);
    frames.push({ name, w: r.w, h: r.h, ax, ay, rgba: colorize(r, outline) });
    (animations[frameName(def, animationOf(frame), view)] ??= []).push(name);
  }
  const atlas = pack(frames, 1024, 'sprites.png', {
    pipeline: {
      pxPerCell: PX_PER_CELL,
      cameraElevationDeg: CAMERA_ELEVATION_DEG,
      supersample: SUPERSAMPLE,
      directions: DIRECTION_NAMES,
      teamRamp: RAMPS[TEAM_RAMP],
      secondRamp: RAMPS[SECOND_RAMP],
      glowRamp: RAMPS[GLOW_RAMP],
      chassisRamp: RAMPS[CHASSIS_RAMP],
      teamColors: TEAM_COLORS,
      palette: PALETTE.map((c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`),
    },
  });
  for (const list of Object.values(animations)) list.sort();
  atlas.json.animations = Object.fromEntries(Object.entries(animations).sort(([a], [b]) => a.localeCompare(b)));

  const files: [string, Buffer][] = [
    [join(outDir, 'sprites.png'), pngBytes(atlas.w, atlas.h, atlas.rgba)],
    [join(outDir, 'sprites.json'), Buffer.from(JSON.stringify(atlas.json, null, 1) + '\n')],
  ];
  const ground = pack(
    [sand(), plates(), ...forestTiles(), ...forestFringes(), ...plateEdges()].map((t) => ({ ...t, ax: 0, ay: 0 })),
    1024,
    'terrain.png',
    {
      terrain: {
        pxPerCell: PX_PER_CELL,
        sandCells: SAND_CELLS,
        plateCells: PLATE_CELLS,
        forestVariants: FOREST_VARIANTS,
        mask: 'forest/<mask>/<variant>: N1 E2 S4 W8 = that neighbour is forest; forest-fringe/<mask>: over sand, N1 E2 S4 W8 NE16 SE32 SW64 NW128 = that neighbour is forest; plate-edge/<mask>: over sand, that neighbour is plated',
      },
    },
  );
  const fx = pack(effects(), 512, 'effects.png', { effects: { pxPerCell: PX_PER_CELL } });
  files.push(
    [join(outDir, 'terrain.png'), pngBytes(ground.w, ground.h, ground.rgba)],
    [join(outDir, 'terrain.json'), Buffer.from(JSON.stringify(ground.json, null, 1) + '\n')],
    [join(outDir, 'effects.png'), pngBytes(fx.w, fx.h, fx.rgba)],
    [join(outDir, 'effects.json'), Buffer.from(JSON.stringify(fx.json, null, 1) + '\n')],
  );
  if (check) {
    const stale = files.filter(([path, bytes]) => !existsSync(path) || !readFileSync(path).equals(bytes)).map(([p]) => p);
    if (stale.length) {
      console.error(`Out of date: ${stale.join(', ')}. Run pnpm sprites and commit the result.`);
      process.exitCode = 1;
    } else console.log('Committed sprites match the models.');
    return;
  }
  // A partial render only goes to an explicit --out, never over the committed atlas.
  if (!only || arg('out')) {
    for (const [path, bytes] of files) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    }
  }
  writePreview(previewPath, [...reduced.values()]);
  console.log(`${frames.length} frames, atlas ${atlas.w}x${atlas.h}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

const hexRgb = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * A contact sheet on sand, scaled up 3x: every frame of every sprite in the drawn team colour, then one frame per
 * team-coloured sprite recoloured as the game does, to cyan.
 */
function writePreview(path: string, items: { def: SpriteDef; frame: string; view: number; r: Reduced }[]): void {
  const zoom = 3;
  const gap = 4;
  const maxW = 8 * (48 + gap) + gap;
  const sand = [216, 196, 145] as const;
  type Cell = { r: Reduced; to: readonly [TeamColor, TeamColor, TeamColor] };
  const rows: Cell[][] = [];
  const addRows = (cells: Cell[]) => {
    let row: Cell[] = [];
    let w = gap;
    for (const c of cells) {
      if (row.length && w + c.r.w + gap > maxW) {
        rows.push(row);
        row = [];
        w = gap;
      }
      row.push(c);
      w += c.r.w + gap;
    }
    if (row.length) rows.push(row);
  };
  // The first seat's colours on every sprite, the second seat's on one more row of each teamed sprite.
  const seat = (k: 0 | 1, name: string) => {
    const race = RACES.find((r) => name.startsWith(`${r}_`)) ?? 'human';
    return [DEFAULT_COLORS[k], DEFAULT_SECOND_COLORS[k], defaultChassisColor(race, DEFAULT_COLORS[k], DEFAULT_SECOND_COLORS[k])] as const;
  };
  const player = (list: typeof items) => list.map((i) => ({ r: i.r, to: seat(0, i.def.name) }));
  for (const def of SPRITES.filter((d) => d.views === 8 && !d.variants)) {
    for (const frame of def.frames) addRows(player(items.filter((i) => i.def === def && i.frame === frame)));
  }
  // Buildings and walls share rows.
  addRows(player(items.filter((i) => i.def.views !== 8 || i.def.variants)));
  for (const def of SPRITES.filter((d) => d.teamed)) {
    addRows(items.filter((i) => i.def === def && i.frame === def.frames[0]).map((i) => ({ r: i.r, to: seat(1, i.def.name) })));
  }
  const rowH = rows.map((r) => Math.max(...r.map((c) => c.r.h)));
  const W = maxW * zoom;
  const H = rowH.reduce((s, h) => s + h + gap, gap) * zoom;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) out.set([sand[0], sand[1], sand[2], 255], i * 4);
  let y = gap;
  rows.forEach((row, ri) => {
    let x = gap;
    for (const { r, to } of row) {
      const [c1, c2, c3] = to;
      const rgb = (ramp: readonly string[]) => ramp.map(hexRgb);
      const rgba = recolor(colorize(r, outline), rgb(TEAM_COLORS[c1]), rgb(TEAM_COLORS[c2]), rgb(glowRamp(c2)), rgb(TEAM_COLORS[c3]));
      const top = y + rowH[ri]! - r.h;
      for (let py = 0; py < r.h; py++) {
        for (let px = 0; px < r.w; px++) {
          const s = (py * r.w + px) * 4;
          const a = rgba[s + 3]! / 255;
          if (!a) continue;
          for (let zy = 0; zy < zoom; zy++) {
            for (let zx = 0; zx < zoom; zx++) {
              const d = (((top + py) * zoom + zy) * W + (x + px) * zoom + zx) * 4;
              for (let c = 0; c < 3; c++) out[d + c] = out[d + c]! * (1 - a) + rgba[s + c]! * a;
            }
          }
        }
      }
      x += r.w + gap;
    }
    y += rowH[ri]! + gap;
  });
  writePng(path, W, H, out);
}

declare global {
  interface Window {
    renderSprite(name: string, view: number, frame: string): RawRender;
  }
}

await main();
