import { ramp, SHADOW_ALPHA, type Rgb } from './palette';
import { dither, periodicNoise } from './terrain';

/**
 * Effects as frame-by-frame pixel animations in the palette, painted in Node like the terrain: explosions, smoke,
 * sparks, the hovers' plasma and the walkers' acid hitting, dust, fire on burning buildings, scorch marks, the marks
 * tracks, wheels and feet leave on the sand, the glint of a crystal and a wisp of blown sand. The game plays them at
 * the sprites' scale (32 art pixels per cell), so their pixels match the units'.
 *
 * Frame names are `<effect>/<frame>`, or `<effect>/<kind>/<frame>`; marks are `track/<kind>/<direction>`.
 */

export interface EffectFrame {
  name: string;
  w: number;
  h: number;
  /** Where the effect's origin sits inside the frame. */
  ax: number;
  ay: number;
  rgba: Uint8ClampedArray;
}

const OUTLINE: Rgb = ramp('outline')[0]!;
const BLAZE = ramp('blaze');
const STEEL = ramp('steel');
const SAND = ramp('sand');
const CYAN = ramp('cyan');
const ACID = ramp('acid');
const GOLD = ramp('gold');

function frame(name: string, w: number, h: number, paint: (put: (x: number, y: number, c: Rgb, a?: number) => void) => void, ax = w / 2, ay = h / 2): EffectFrame {
  const rgba = new Uint8ClampedArray(w * h * 4);
  paint((x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    rgba.set([c[0], c[1], c[2], a], i);
  });
  return { name, w, h, ax, ay, rgba };
}

/**
 * Explosion: a ragged ball of fire that swells, cools from white heat through orange to embers and breaks up into
 * dark smoke at the edges.
 */
function blast(kind: 'small' | 'big', size: number, frames: number, seed: number): EffectFrame[] {
  const n = periodicNoise(8, seed);
  const ragged = periodicNoise(8, seed + 1);
  const out: EffectFrame[] = [];
  const c = size / 2;
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1);
    const r = (size / 2 - 1) * (0.35 + 0.65 * Math.sqrt(t));
    out.push(
      frame(`blast/${kind}/${f}`, size, size, (put) => {
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            const dx = x + 0.5 - c;
            const dy = y + 0.5 - c;
            const a = Math.atan2(dy, dx);
            const edge = r * (0.8 + 0.35 * ragged(Math.cos(a) * 2 + 4, Math.sin(a) * 2 + 4 + f * 0.3));
            const d = Math.hypot(dx, dy) / edge;
            if (d > 1) continue;
            const grain = n((x / size) * 8, (y / size) * 8 + t * 2);
            // Breaks up from the rim inwards as it burns out.
            if (grain < t * t * 1.1 - (1 - d) * 0.4) continue;
            const heat = (1 - d) * 1.5 * (1 - t) + 0.35 * (1 - t) + (grain - 0.5) * 0.6;
            if (heat > 0.25) put(x, y, BLAZE[dither(heat * 4.2, x, y, BLAZE.length)]!);
            else put(x, y, STEEL[dither(0.4 + d * 0.8 + grain, x, y, 2)]!);
            if (d > 0.88 && t < 0.6) put(x, y, heat > 0.5 ? BLAZE[1]! : OUTLINE);
          }
      }),
    );
  }
  return out;
}

/** A puff of smoke or dust: a lumpy ball lit from the north-west that grows, thins and drifts apart. */
function puff(name: string, size: number, frames: number, colors: readonly Rgb[], seed: number): EffectFrame[] {
  const n = periodicNoise(8, seed);
  const out: EffectFrame[] = [];
  const c = size / 2;
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1);
    const r = (size / 2 - 0.5) * (0.45 + 0.55 * t);
    out.push(
      frame(`${name}/${f}`, size, size, (put) => {
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            const dx = x + 0.5 - c;
            const dy = y + 0.5 - c;
            const grain = n((x / size) * 6 + f * 0.4, (y / size) * 6);
            const d = Math.hypot(dx, dy) / (r * (0.85 + grain * 0.3));
            if (d > 1 || grain < t * 0.75 - 0.05) continue;
            const lit = 1.6 - (dx + dy) / (r * 1.6) - d * 0.6;
            put(x, y, colors[dither(lit, x, y, colors.length)]!);
          }
      }),
    );
  }
  return out;
}

/** Spark where a shot strikes: a white-hot star that flares and throws a few glowing chips. */
function sparks(): EffectFrame[] {
  const S = 11;
  const c = 5;
  return [0, 1, 2, 3].map((f) =>
    frame(`spark/${f}`, S, S, (put) => {
      if (f < 2) {
        const arm = f === 0 ? 2 : 4;
        for (let k = -arm; k <= arm; k++) {
          const col = Math.abs(k) <= 1 ? BLAZE[4]! : BLAZE[3]!;
          put(c + k, c, col);
          put(c, c + k, col);
        }
        if (f === 1) for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) put(c + dx!, c + dy!, BLAZE[2]!);
      } else {
        const d = f === 2 ? 3 : 5;
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 0.5]]) put(Math.round(c + dx! * d), Math.round(c + dy! * d), f === 2 ? BLAZE[3]! : BLAZE[1]!);
      }
    }),
  );
}

/** The hovers' plasma bursting: a cyan ring spreading round a white core that fades. */
function plasma(): EffectFrame[] {
  const S = 17;
  const c = 8;
  return [0, 1, 2, 3, 4].map((f) =>
    frame(`plasma/${f}`, S, S, (put) => {
      const r = 1.5 + f * 1.6;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const d = Math.hypot(x - c, y - c);
          if (Math.abs(d - r) < 0.9) put(x, y, CYAN[f < 2 ? 4 : f < 4 ? 3 : 2]!);
          else if (d < r - 0.9 && f < 3) put(x, y, f === 0 || d < 1.5 ? STEEL[4]! : CYAN[dither(3.6 - f, x, y, CYAN.length)]!);
        }
    }),
  );
}

/** The walkers' acid splashing: drops thrown out from a green splat that sinks into the ground. */
function acid(): EffectFrame[] {
  const S = 17;
  const c = 8;
  const dirs = [0.3, 1.4, 2.3, 3.4, 4.4, 5.4];
  return [0, 1, 2, 3, 4].map((f) =>
    frame(`acid/${f}`, S, S, (put) => {
      const core = 3.5 - f * 0.7;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const d = Math.hypot(x - c, (y - c) * 1.3);
          if (d < core) put(x, y, ACID[dither(4 - d - f * 0.5, x, y, ACID.length)]!);
        }
      for (const a of dirs) {
        const d = 2 + f * 1.5;
        const x = Math.round(c + Math.cos(a) * d);
        const y = Math.round(c + Math.sin(a) * d * 0.75 - (f < 3 ? 1 : 0));
        put(x, y, ACID[f < 2 ? 4 : 3]!);
        if (f < 3) put(x, y + 1, ACID[1]!);
      }
    }),
  );
}

/**
 * Fire licking out of a burning building: tongues rising from a hot base, four frames that loop (the noise scrolls
 * up by exactly one period). Origin at the bottom middle.
 */
function fire(): EffectFrame[] {
  const W = 12;
  const H = 18;
  const n = periodicNoise(4, 71);
  return [0, 1, 2, 3].map((f) =>
    frame(
      `fire/${f}`,
      W,
      H,
      (put) => {
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const up = H - 1 - y;
            const across = 1 - Math.abs(x + 0.5 - W / 2) / (W / 2);
            const flicker = n(x / 3, (up + f * 4) / 4);
            const heat = across * 1.7 * (1 - up / H) - flicker * 0.9 + 0.15;
            if (heat <= 0.12) continue;
            put(x, y, BLAZE[dither(heat * 4.4, x, y, BLAZE.length)]!);
          }
      },
      W / 2,
      H - 1,
    ),
  );
}

/** Scorched ground where something blew up: ragged soot, darker in the middle, dithered out at the rim. */
function scorch(name: string, w: number, h: number, seed: number): EffectFrame {
  const n = periodicNoise(8, seed);
  return frame(name, w, h, (put) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
        const v = 1.25 - d * 1.2 + (n((x / w) * 6, (y / h) * 6) - 0.5) * 0.7;
        if (v <= 0.15) continue;
        const k = dither(v * 2.2, x, y, 3);
        if (k === 0) continue;
        put(x, y, OUTLINE, Math.round(255 * (k === 2 ? 0.55 : 0.3)));
      }
  });
}

const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

/**
 * Marks on the sand, one step's worth, for each direction: two runs of tread links (tracks), two plain ruts (wheels)
 * or two rows of pointed feet (walkers). The game stamps them as a unit drives and lets them fade.
 */
function marks(): EffectFrame[] {
  const S = 21;
  const c = 10;
  const out: EffectFrame[] = [];
  for (const kind of ['tread', 'wheel', 'foot'] as const) {
    DIRS.forEach((dir, k) => {
      const a = (k * Math.PI) / 4;
      const fx = Math.sin(a);
      const fy = -Math.cos(a);
      out.push(
        frame(`track/${kind}/${dir}`, S, S, (put) => {
          for (let y = 0; y < S; y++)
            for (let x = 0; x < S; x++) {
              const px = x + 0.5 - c - 0.5;
              const py = y + 0.5 - c - 0.5;
              const u = px * fx + py * fy;
              const v = px * -fy + py * fx;
              let on = false;
              if (kind === 'tread') on = Math.abs(u) <= 6.5 && Math.abs(Math.abs(v) - 7) <= 1.6 && Math.floor(u + 7) % 3 !== 0;
              else if (kind === 'wheel') on = Math.abs(u) <= 6.5 && Math.abs(Math.abs(v) - 7) <= 1.1;
              else for (const [fu, fv] of [[-4, -6], [3, 6]]) if (Math.hypot(u - fu!, v - fv!) <= 1.3) on = true;
              if (on) put(x, y, OUTLINE, Math.round(255 * SHADOW_ALPHA * 0.6));
            }
        }),
      );
    });
  }
  return out;
}

/** A crystal catching the light: a four-pointed star that flares and dies over four frames. */
function glint(): EffectFrame[] {
  const S = 9;
  const c = 4;
  return [1, 3, 4, 2].map((arm, f) =>
    frame(`glint/${f}`, S, S, (put) => {
      for (let k = -arm; k <= arm; k++) {
        const col = k === 0 ? STEEL[4]! : Math.abs(k) < arm ? GOLD[3]! : GOLD[2]!;
        put(c + k, c, col);
        put(c, c + k, col);
      }
    }),
  );
}

/** A wisp of sand blown along the ground, thin and pale, fading at both ends. */
function wisp(): EffectFrame {
  const W = 26;
  return frame('wisp', W, 3, (put) => {
    for (let x = 0; x < W; x++) {
      const k = 1 - Math.abs(x + 0.5 - W / 2) / (W / 2);
      if (dither(k * 2.2, x, 0, 3) === 0) continue;
      put(x, x < W / 2 ? 1 : 0, SAND[4]!, 200);
      if (k > 0.6 && x % 3 === 0) put(x, 2, SAND[3]!, 140);
    }
  });
}

export function effects(): EffectFrame[] {
  return [
    ...blast('small', 24, 6, 5),
    ...blast('big', 48, 8, 9),
    ...puff('smoke', 18, 6, [STEEL[0]!, STEEL[1]!, STEEL[2]!], 13),
    ...puff('dust', 12, 5, [SAND[1]!, SAND[2]!, SAND[3]!, SAND[4]!], 17),
    ...sparks(),
    ...plasma(),
    ...acid(),
    ...fire(),
    scorch('scorch/small', 30, 22, 21),
    scorch('scorch/big', 64, 46, 23),
    ...marks(),
    ...glint(),
    wisp(),
  ];
}
