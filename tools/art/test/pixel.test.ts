import { describe, expect, it } from 'vitest';
import { pack } from '../src/atlas';
import { GROUND_ID, materialId } from '../src/materials';
import { SPRITE_SECOND_COLOR, SPRITE_TEAM_COLOR, TEAM_COLORS, TEAM_COLOR_NAMES } from '@sw/data';
import { PALETTE, ramp, RAMPS, SECOND_RAMP, TEAM_RAMP } from '../src/palette';
import { colorize, flipRows, rampStep, recolor, reduce } from '../src/pixel';

/** A 4x4 art frame rendered at 2x: one 2x2 art-pixel block of material in the middle on a lit floor. */
function sample(mat = materialId('team'), light = 180) {
  const big = 8;
  const m = new Uint8Array(big * big).fill(GROUND_ID);
  const l = new Uint8Array(big * big).fill(200);
  const d = new Uint16Array(big * big).fill(60000);
  for (let y = 2; y < 6; y++) {
    for (let x = 2; x < 6; x++) {
      m[y * big + x] = mat;
      l[y * big + x] = light;
      d[y * big + x] = 30000;
    }
  }
  return reduce(m, l, d, big, big, 2);
}

describe('palette', () => {
  it('has 43 colours for objects and 19 for the ground, all different', () => {
    expect(PALETTE).toHaveLength(62);
    expect(new Set(PALETTE.map((c) => c.join())).size).toBe(62);
  });

  it('draws team surfaces in team colours of the game', () => {
    expect(TEAM_COLORS[SPRITE_TEAM_COLOR]).toEqual(RAMPS[TEAM_RAMP]);
    expect(TEAM_COLORS[SPRITE_SECOND_COLOR]).toEqual(RAMPS[SECOND_RAMP]);
    for (const name of TEAM_COLOR_NAMES) expect(TEAM_COLORS[name]).toHaveLength(5);
  });
});

describe('reduce', () => {
  it('shrinks blocks by majority and keeps the light of the winner', () => {
    const r = sample();
    expect([r.w, r.h]).toEqual([4, 4]);
    expect(r.mat[1 * 4 + 1]).toBe(materialId('team'));
    expect(r.light[1 * 4 + 1]).toBe(180);
    expect(r.mat[0]).toBe(0); // lit floor is empty, not shadow
  });

  it('marks floor in shadow', () => {
    const big = 4;
    const r = reduce(new Uint8Array(big * big).fill(GROUND_ID), new Uint8Array(big * big).fill(40), new Uint16Array(big * big), big, big, 2);
    expect([...r.mat]).toEqual([GROUND_ID, GROUND_ID, GROUND_ID, GROUND_ID]);
  });
});

describe('colorize', () => {
  it('uses only palette colours and draws a 2 px outline darker than the body', () => {
    const rgba = colorize(sample());
    const allowed = new Set(PALETTE.map((c) => c.join()));
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) expect(allowed.has([rgba[i], rgba[i + 1], rgba[i + 2]].join())).toBe(true);
    const team = ramp(TEAM_RAMP).map((c) => c.join());
    const body = team.indexOf([...rgba.subarray(5 * 4, 5 * 4 + 3)].join());
    // Pixel (0,1) touches the object: first ring, two steps darker than the body (black under the darkest step).
    const first = [...rgba.subarray(4 * 4, 4 * 4 + 3)].join();
    expect(first).toBe(body >= 2 ? team[body - 2] : ramp('outline')[0]!.join());
    expect(rgba[4 * 4 + 3]).toBe(255);
    // Corner (0,0) touches the first ring diagonally: second ring, the same colour.
    expect([...rgba.subarray(0, 3)].join()).toBe(first);
  });

  it('can leave the outline off', () => {
    const rgba = colorize(sample(), 0);
    expect(rgba[4 * 4 + 3]).toBe(0);
    expect(rgba[3]).toBe(0);
  });

  it('recolours team surfaces and their outline to another team colour but leaves steel alone', () => {
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const blue = TEAM_COLORS.blue.map(hex) as unknown as [number, number, number][];
    const rgba = colorize(sample());
    const olive = ramp(TEAM_RAMP).map((c) => c.join());
    const blueRgba = recolor(rgba, blue);
    for (const i of [0, 4, 5]) {
      const k = olive.indexOf([...rgba.subarray(i * 4, i * 4 + 3)].join());
      if (k >= 0) expect([...blueRgba.subarray(i * 4, i * 4 + 3)]).toEqual(blue[k]);
    }
    expect(blueRgba.subarray(20, 23)).not.toEqual(rgba.subarray(20, 23));
    const steel = colorize(sample(materialId('steel')));
    expect(recolor(steel, blue)).toEqual(steel);
  });

  it('recolours the secondary colour on its own', () => {
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as [number, number, number];
    const rgba = colorize(sample(materialId('team2')));
    const second = ramp(SECOND_RAMP).map((c) => c.join());
    const k = second.indexOf([...rgba.subarray(20, 23)].join());
    expect(k).toBeGreaterThanOrEqual(0);
    const out = recolor(rgba, TEAM_COLORS.olive.map(hex), TEAM_COLORS.black.map(hex));
    expect([...out.subarray(20, 23)]).toEqual(hex(TEAM_COLORS.black[k]!));
  });

  it('gives thin materials a one-pixel outline', () => {
    const rgba = colorize(sample(materialId('thorn')));
    expect(rgba[4 * 4 + 3]).toBe(255);
    expect(rgba[3]).toBe(0);
  });

  it('leaves bare materials without an outline', () => {
    const rgba = colorize(sample(materialId('drop')));
    expect(rgba[5 * 4 + 3]).toBe(255);
    expect(rgba[4 * 4 + 3]).toBe(0);
  });

  it('lights emissive materials fully whatever the light', () => {
    const rgba = colorize(sample(materialId('lamp'), 0));
    expect([...rgba.subarray(20, 23)]).toEqual([...ramp('cyan').at(-1)!]);
  });
});

describe('rampStep', () => {
  it('goes from dark to light and clamps with shifts', () => {
    expect(rampStep(0, 5)).toBe(0);
    expect(rampStep(255, 5)).toBe(4);
    expect(rampStep(180, 5)).toBeGreaterThan(rampStep(100, 5));
    expect(rampStep(255, 5, 3)).toBe(4);
    expect(rampStep(0, 5, -2)).toBe(0);
  });
});

describe('flipRows', () => {
  it('reverses row order', () => {
    const d = new Uint8Array([1, 2, 3, 4, 5, 6]);
    flipRows(d, 1, 3, 2);
    expect([...d]).toEqual([5, 6, 3, 4, 1, 2]);
  });
});

describe('pack', () => {
  it('trims frames and records where the footprint centre is', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    rgba.set([255, 0, 0, 255], (2 * 4 + 1) * 4);
    const atlas = pack([{ name: 'a', w: 4, h: 4, ax: 2, ay: 2, rgba }], 16, 'x.png');
    const f = atlas.json.frames.a!;
    expect(f.frame.w).toBe(1);
    expect(f.spriteSourceSize).toEqual({ x: 1, y: 2, w: 1, h: 1 });
    expect(f.anchor).toEqual({ x: 0.5, y: 0.5 });
    expect([...atlas.rgba.subarray((f.frame.y * 16 + f.frame.x) * 4, (f.frame.y * 16 + f.frame.x) * 4 + 4)]).toEqual([255, 0, 0, 255]);
  });
});
