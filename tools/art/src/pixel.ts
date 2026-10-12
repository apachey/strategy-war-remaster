import { GROUND_ID, materialById } from './materials';
import { ramp, SHADOW_ALPHA, TEAMS, type Rgb, type Team } from './palette';

/**
 * Pure pixel steps of the pipeline, kept free of three.js and the browser so they run (and are tested) in Node.
 *
 * A render arrives as two big buffers at SUPERSAMPLE resolution: the material id of every pixel and its light level.
 * `reduce` shrinks them to the art grid, `colorize` turns the result into palette colours for one team.
 */

/** A frame at art resolution, before colouring. */
export interface Reduced {
  w: number;
  h: number;
  /** 0 empty, GROUND_ID shadow on the floor, otherwise a material id. */
  mat: Uint8Array;
  /** Average light 0..255 of the winning material inside the block. */
  light: Uint8Array;
  /** Nearest depth (0 = camera near plane, 65535 = far plane) of the winning material inside the block. */
  depth: Uint16Array;
}

/** Share of a block an object must cover to become a pixel. Lower keeps thin barrels, higher gives cleaner edges. */
export const COVERAGE = 0.4;
/** Floor pixels darker than this (0..255) count as being in shadow. */
export const SHADOW_LIGHT = 140;
/** A pixel this much farther than a neighbour gets an inner line (depth units; 650 is about 0.08 cell). */
export const INNER_LINE_DEPTH = 650;
/** How many ramp steps darker an inner line is; the original draws them nearly black. */
export const INNER_LINE_STEPS = 2;

export function reduce(mat: Uint8Array, light: Uint8Array, depth: Uint16Array, bigW: number, bigH: number, scale: number): Reduced {
  const w = Math.floor(bigW / scale);
  const h = Math.floor(bigH / scale);
  const outMat = new Uint8Array(w * h);
  const outLight = new Uint8Array(w * h);
  const outDepth = new Uint16Array(w * h).fill(65535);
  const counts = new Uint32Array(256);
  const sums = new Uint32Array(256);
  const block = scale * scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      counts.fill(0);
      sums.fill(0);
      let shadowed = 0;
      for (let dy = 0; dy < scale; dy++) {
        const row = (y * scale + dy) * bigW + x * scale;
        for (let dx = 0; dx < scale; dx++) {
          const id = mat[row + dx]!;
          const l = light[row + dx]!;
          counts[id]!++;
          sums[id]! += l;
          if (id === GROUND_ID && l < SHADOW_LIGHT) shadowed++;
        }
      }
      let best = 0;
      let bestCount = 0;
      let objects = 0;
      for (let id = 1; id < GROUND_ID; id++) {
        const c = counts[id]!;
        objects += c;
        if (c > bestCount) {
          best = id;
          bestCount = c;
        }
      }
      const i = y * w + x;
      if (objects >= block * COVERAGE) {
        outMat[i] = best;
        outLight[i] = Math.round(sums[best]! / bestCount);
        let near = 65535;
        for (let dy = 0; dy < scale; dy++) {
          const row = (y * scale + dy) * bigW + x * scale;
          for (let dx = 0; dx < scale; dx++) if (mat[row + dx] === best) near = Math.min(near, depth[row + dx]!);
        }
        outDepth[i] = near;
      } else if (shadowed >= block * 0.5) {
        outMat[i] = GROUND_ID;
      }
    }
  }
  return { w, h, mat: outMat, light: outLight, depth: outDepth };
}

/** Picks a ramp step for a light level; `shift` nudges it, the ends clamp. */
export function rampStep(light: number, length: number, shift = 0): number {
  // Light from the renderer sits in about 0.35 (shade) .. 0.75 (sunlit top); stretch 0.25..1.05 across the ramp, so
  // sunlit tops land mid-ramp and the brightest steps stay for highlights, as in the original's darker sprites.
  const t = Math.min(1, Math.max(0, (light / 255 - 0.25) / 0.8));
  return Math.min(length - 1, Math.max(0, Math.floor(t * length) + shift));
}

const OUTLINE: Rgb = ramp('outline')[0]!;

/**
 * Turns a reduced frame into RGBA for one team: palette shading, a 1 px outline around the object, inner lines two
 * steps darker where a surface disappears behind a nearer one, and a soft floor shadow.
 */
export function colorize(frame: Reduced, team: Team): Uint8ClampedArray {
  const { w, h, mat, light, depth } = frame;
  const out = new Uint8ClampedArray(w * h * 4);
  const teamRamp = ramp(TEAMS[team]);
  const isObjectAt = (i: number) => mat[i]! !== 0 && mat[i]! !== GROUND_ID;
  const isObject = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && isObjectAt(y * w + x);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const id = mat[i]!;
      let rgb: Rgb | null = null;
      let alpha = 255;
      if (id !== 0 && id !== GROUND_ID) {
        const def = materialById(id);
        if (!def) throw new Error(`unknown material id ${id}`);
        const colors = def.ramp === 'team' ? teamRamp : ramp(def.ramp);
        const behind = (j: number) => j >= 0 && j < w * h && isObjectAt(j) && depth[j]! + INNER_LINE_DEPTH < depth[i]!;
        const edge = behind(i - w) || behind(i + w) || (x > 0 && behind(i - 1)) || (x < w - 1 && behind(i + 1));
        const step = def.emissive ? colors.length - 1 : rampStep(light[i]!, colors.length, (def.shift ?? 0) - (edge ? INNER_LINE_STEPS : 0));
        rgb = colors[step]!;
      } else if (isObject(x - 1, y) || isObject(x + 1, y) || isObject(x, y - 1) || isObject(x, y + 1)) {
        rgb = OUTLINE;
      } else if (id === GROUND_ID) {
        rgb = OUTLINE;
        alpha = Math.round(SHADOW_ALPHA * 255);
      }
      if (!rgb) continue;
      out[i * 4] = rgb[0];
      out[i * 4 + 1] = rgb[1];
      out[i * 4 + 2] = rgb[2];
      out[i * 4 + 3] = alpha;
    }
  }
  return out;
}

/** Flips rows in place; WebGL reads pixels bottom-up. */
export function flipRows(data: Uint8Array, w: number, h: number, channels: number): void {
  const stride = w * channels;
  const tmp = new Uint8Array(stride);
  for (let y = 0; y < h >> 1; y++) {
    const a = y * stride;
    const b = (h - 1 - y) * stride;
    tmp.set(data.subarray(a, a + stride));
    data.copyWithin(a, b, b + stride);
    data.set(tmp, b);
  }
}
