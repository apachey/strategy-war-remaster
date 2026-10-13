import { describe, expect, it } from 'vitest';
import { pack } from '../src/atlas';
import { GROUND_ID, materialId } from '../src/materials';
import { PALETTE, ramp } from '../src/palette';
import { colorize, flipRows, rampStep, reduce } from '../src/pixel';

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
  it('has 32 colours for objects and 10 for the ground, all different', () => {
    expect(PALETTE).toHaveLength(42);
    expect(new Set(PALETTE.map((c) => c.join())).size).toBe(42);
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
  it('uses only palette colours and outlines the object', () => {
    const rgba = colorize(sample(), 'enemy');
    const allowed = new Set(PALETTE.map((c) => c.join()));
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) expect(allowed.has([rgba[i], rgba[i + 1], rgba[i + 2]].join())).toBe(true);
    // Pixel (0,1) touches the object, so it is outline; corner (0,0) only touches diagonally and stays empty.
    expect([...rgba.subarray(4 * 4, 4 * 4 + 4)]).toEqual([...ramp('outline')[0]!, 255]);
    expect(rgba[3]).toBe(0);
  });

  it('recolours team surfaces per team but leaves steel alone', () => {
    const team = sample();
    expect(colorize(team, 'player').subarray(20, 23)).not.toEqual(colorize(team, 'enemy').subarray(20, 23));
    const steel = sample(materialId('steel'));
    expect(colorize(steel, 'player')).toEqual(colorize(steel, 'enemy'));
  });

  it('lights emissive materials fully whatever the light', () => {
    const rgba = colorize(sample(materialId('lamp'), 0), 'player');
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
