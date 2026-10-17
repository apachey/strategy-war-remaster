import { PX_PER_CELL } from './catalog';
import { ramp, SHADOW_ALPHA, type Rgb } from './palette';

/**
 * Ground textures, painted pixel by pixel in Node (no 3D needed): a seamless sand texture with low dunes, ripples,
 * colour drift and pebbles, and forest floor tiles with jagged edges towards the sand. Everything is quantised to
 * the palette with ordered dithering and is deterministic.
 *
 * The game tiles `sand` by world position under the whole map, then draws `forest/<mask>` in every forest cell,
 * where the mask says which neighbours are forest too (N1 E2 S4 W8, like walls), and fir sprites on top.
 */

/** The sand texture covers this many cells each way before it repeats. */
export const SAND_CELLS = 8;
const OUTLINE: Rgb = ramp('outline')[0]!;

export interface Tile {
  name: string;
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Picks a ramp step for a continuous value with a 4x4 ordered dither, so smooth gradients become pixel patterns. */
export function dither(value: number, x: number, y: number, steps: number): number {
  const base = Math.floor(value);
  const step = value - base > BAYER[(y & 3) * 4 + (x & 3)]! ? base + 1 : base;
  return Math.min(steps - 1, Math.max(0, step));
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise that repeats every `period` lattice points, so textures built from it tile without seams. */
export function periodicNoise(period: number, seed: number): (x: number, y: number) => number {
  const r = rng(seed);
  const lattice = Array.from({ length: period * period }, () => r());
  const at = (i: number, j: number) => lattice[(((j % period) + period) % period) * period + (((i % period) + period) % period)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = smooth(x - i);
    const fy = smooth(y - j);
    const top = at(i, j) * (1 - fx) + at(i + 1, j) * fx;
    const bottom = at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

function put(rgba: Uint8ClampedArray, i: number, c: Rgb, alpha = 255): void {
  rgba[i * 4] = c[0];
  rgba[i * 4 + 1] = c[1];
  rgba[i * 4 + 2] = c[2];
  rgba[i * 4 + 3] = alpha;
}

/**
 * Sand: low dunes running diagonally (a long lit windward slope, a short dark lee, light from the north-west as on
 * the sprites), fine ripples along them, slow drifts of colour and the odd pebble. Repeats every SAND_CELLS cells.
 */
export function sand(): Tile {
  const S = SAND_CELLS * PX_PER_CELL;
  const colors = ramp('sand');
  const warp = periodicNoise(4, 11);
  const drift = periodicNoise(8, 23);
  const grain = rng(5);
  // Dune height at a pixel: a sawtooth across the dunes, its phase bent by noise; whole numbers of dunes fit the
  // tile both ways, so it repeats.
  const saw = (phase: number, count: number) => {
    const t = phase * count - Math.floor(phase * count);
    return t < 0.78 ? t / 0.78 : (1 - t) / 0.22;
  };
  // Two dune systems crossing at an angle, the second weaker and fading in and out, so the crests bend and
  // break up instead of running in one straight diagonal.
  const fade = periodicNoise(4, 47);
  const dune = (x: number, y: number) => {
    const w = warp((x / S) * 4, (y / S) * 4);
    const main = saw((2 * x + y) / S + 0.5 * w, 2);
    const cross = saw((x - 2 * y) / S + 0.4 * w, 3);
    return main + cross * 0.6 * fade((x / S) * 4, (y / S) * 4);
  };
  const rgba = new Uint8ClampedArray(S * S * 4);
  const pebbles: number[] = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Height rising towards the south-east means the slope faces the light (north-west) and is brighter.
      const facing = dune((x + 1) % S, (y + 1) % S) - dune(x, y);
      const ripple = Math.sin(((2 * x + y) / S) * Math.PI * 2 * 22 + 3 * warp((x / S) * 4 + 2, (y / S) * 4)) * 0.22;
      const v = 2.15 + facing * 6 + ripple + (drift((x / S) * 8, (y / S) * 8) - 0.5) * 1.1;
      let step = dither(v, x, y, colors.length);
      if (grain() < 0.0015) {
        step = 0;
        pebbles.push(x, y);
      }
      put(rgba, y * S + x, colors[step]!);
    }
  }
  // Each pebble gets a lit pixel above-left of its dark one.
  for (let k = 0; k < pebbles.length; k += 2) {
    const x = (pebbles[k]! + S - 1) % S;
    const y = (pebbles[k + 1]! + S - 1) % S;
    put(rgba, y * S + x, colors[4]!);
  }
  return { name: 'sand', w: S, h: S, rgba };
}

/**
 * Forest floor of one cell: needles and shade in the two darkest fir colours, kept dark so the enemy's cyan craft
 * stand out against it; it repeats every cell.
 */
function floorPixel(x: number, y: number, noise: (x: number, y: number) => number): Rgb {
  const colors = ramp('pine');
  const v = 0.1 + noise((x / PX_PER_CELL) * 4, (y / PX_PER_CELL) * 4) * 1.4;
  return colors[dither(v, x, y, 2)]!;
}

/** How far the forest edge sits inside the cell along a side, at position t (0..31): jagged, 3 px at the corners. */
function inset(t: number, side: number): number {
  const wobble = Math.sin((t + side * 7) * 0.9) + Math.sin((t + side * 3) * 2.3) * 0.6;
  return Math.round(3 + Math.sin((Math.PI * t) / (PX_PER_CELL - 1)) ** 2 * (2 + wobble * 1.1));
}

/**
 * Forest floor tiles for each neighbour mask (N1 E2 S4 W8 set = that neighbour is forest). Sides facing open sand get
 * a jagged edge with a dark rim and a soft shadow on the sand just outside it; sides facing forest run to the edge.
 */
export function forestTiles(): Tile[] {
  const C = PX_PER_CELL;
  const noise = periodicNoise(4, 31);
  const tiles: Tile[] = [];
  for (let mask = 0; mask < 16; mask++) {
    const rgba = new Uint8ClampedArray(C * C * 4);
    // Distance inside the forest edge for each pixel: negative means outside (sand).
    const depth = (x: number, y: number) => {
      let d = Infinity;
      if (!(mask & 1)) d = Math.min(d, y - inset(x, 0));
      if (!(mask & 2)) d = Math.min(d, C - 1 - x - inset(y, 1));
      if (!(mask & 4)) d = Math.min(d, C - 1 - y - inset(x, 2));
      if (!(mask & 8)) d = Math.min(d, x - inset(y, 3));
      return d;
    };
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const d = depth(x, y);
        const i = y * C + x;
        if (d >= 1) put(rgba, i, floorPixel(x, y, noise));
        else if (d >= 0) put(rgba, i, OUTLINE);
        else if (d >= -2) put(rgba, i, OUTLINE, Math.round(SHADOW_ALPHA * 255 * (d >= -1 ? 1 : 0.5)));
      }
    }
    tiles.push({ name: `forest/${mask}`, w: C, h: C, rgba });
  }
  return tiles;
}

/** The plate texture covers this many cells each way before it repeats. */
export const PLATE_CELLS = 8;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((k) => Math.round(a[k]! * (1 - t) + b[k]! * t)) as unknown as Rgb;

/**
 * The hover race's ground, seen at the same low angle as the sprites: a seamless texture (PLATE_CELLS cells each
 * way) of pale floor plates cut at random into sizes from half a cell to three cells, laid without regard to the
 * cell grid. Each plate stands a little proud of its neighbours by its own height, so its lit north rim, its top and
 * its dark south face (two to five pixels: deeper the higher it stands) all show, and dark seams run between plates.
 * Plates differ in tone and height, some are worn darker, cracked or carry a cyan light. Draw it by world position in
 * every plated cell, then `plate-edge/<mask>` over the sand cells next to the plating.
 */
export function plates(): Tile {
  const S = PLATE_CELLS * PX_PER_CELL;
  const colors = ramp('plate');
  const lamp = ramp('cyan');
  const seam = mix(colors[0]!, OUTLINE, 0.45);
  const face = [mix(colors[0]!, OUTLINE, 0.2), colors[0]!, colors[1]!];
  const rnd = rng(77);
  const list: [number, number, number, number][] = [];
  const split = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const w = x1 - x0;
    const h = y1 - y0;
    const big = Math.max(w, h);
    if (depth > 2 && (big < 22 || (big < 60 && rnd() < 0.4) || (big < 100 && rnd() < 0.12))) {
      list.push([x0, y0, x1, y1]);
      return;
    }
    const t = 0.25 + rnd() * 0.5;
    if (w > h * (0.7 + rnd() * 0.6)) {
      const m = x0 + Math.round(w * t);
      split(x0, y0, m, y1, depth + 1);
      split(m, y0, x1, y1, depth + 1);
    } else {
      const m = y0 + Math.round(h * t);
      split(x0, y0, x1, m, depth + 1);
      split(x0, m, x1, y1, depth + 1);
    }
  };
  split(0, 0, S, S, 0);
  const rgba = new Uint8ClampedArray(S * S * 4);
  for (const [x0, y0, x1, y1] of list) {
    const tall = 2 + Math.floor(rnd() * 4);
    const tone = rnd() < 0.15 ? 1 : 2 + Math.floor(rnd() * 3);
    const top = y1 - 1 - tall;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        let c: Rgb;
        if (x === x1 - 1 || y === y1 - 1) c = seam;
        else if (y >= top) c = face[Math.min(2, Math.floor(((y - top) / tall) * 3) === 0 ? 2 : y === y1 - 2 ? 0 : 1)]!;
        else if (y === y0) c = colors[4]!;
        else if (x === x0) c = colors[Math.min(4, tone + 1)]!;
        else if (x === x1 - 2) c = colors[Math.max(1, tone - 1)]!;
        else c = colors[dither(tone - 0.35 + ((y - y0) / Math.max(1, top - y0)) * 0.7, x, y, colors.length)]!;
        put(rgba, y * S + x, c);
      }
    }
    // Wear: a crack wandering down a big plate, or a cyan light near its corner.
    if (rnd() < 0.3 && x1 - x0 > 10 && top - y0 > 8) {
      let x = x0 + 3 + Math.floor(rnd() * (x1 - x0 - 7));
      for (let y = y0 + 2; y < top - 1; y++) {
        put(rgba, y * S + x, colors[Math.max(0, tone - 2)]!);
        if (rnd() < 0.45) x = Math.min(x1 - 3, Math.max(x0 + 2, x + (rnd() < 0.5 ? -1 : 1)));
      }
    } else if (rnd() < 0.15 && x1 - x0 > 8 && top - y0 > 6) {
      put(rgba, (y0 + 2) * S + x0 + 3, lamp[4]!);
      put(rgba, (y0 + 2) * S + x0 + 4, lamp[3]!);
    }
  }
  return { name: 'plates', w: S, h: S, rgba };
}

/**
 * Edges of the plating, drawn over a sand cell next to plated cells (mask N1 E2 S4 W8 set = that neighbour is
 * plated): under a plated north neighbour hangs the front face of the raised floor and its shadow; a plated west
 * neighbour throws a shadow on the sand; plated east and south neighbours get a lit rim along this cell's border.
 */
export function plateEdges(): Tile[] {
  const C = PX_PER_CELL;
  const colors = ramp('plate');
  const tiles: Tile[] = [];
  for (let mask = 0; mask < 16; mask++) {
    const rgba = new Uint8ClampedArray(C * C * 4);
    const shade = (i: number, k: number) => put(rgba, i, OUTLINE, Math.round(SHADOW_ALPHA * 255 * k));
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const i = y * C + x;
        if (mask & 1 && y < 4) put(rgba, i, y === 3 ? mix(colors[0]!, OUTLINE, 0.45) : y === 0 ? colors[1]! : colors[0]!);
        else if (mask & 1 && y < 7) shade(i, y < 6 ? 1 : 0.5);
        else if (mask & 8 && x < 3) shade(i, x < 2 ? 1 : 0.5);
        else if (mask & 2 && x === C - 1) put(rgba, i, colors[3]!);
        else if (mask & 4 && y === C - 1) put(rgba, i, colors[4]!);
      }
    }
    tiles.push({ name: `plate-edge/${mask}`, w: C, h: C, rgba });
  }
  return tiles;
}
