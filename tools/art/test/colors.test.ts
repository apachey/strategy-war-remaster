import { describe, expect, it } from 'vitest';
import { glowRamp, spitColor, TEAM_COLOR_GRID, TEAM_COLOR_NAMES, TEAM_COLORS, TEAM_HUES, type TeamColor } from '@sw/data';
import { PALETTE, RAMPS, type Rgb } from '../src/palette';

/**
 * Colours a side can wear against what they may blend into. Distances are CIE76 delta E between the lit steps of a
 * team colour (the middle three, which cover most of a sprite) and the surroundings' colours.
 */

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function lab([r, g, b]: Rgb): [number, number, number] {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a: string, b: string) => {
  const [p, q] = [lab(hex(a)), lab(hex(b))];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const lit = (c: TeamColor) => TEAM_COLORS[c].slice(1, 4);
/** Smallest distance between any lit step of `c` and any colour of `around`. */
const nearest = (c: TeamColor, around: readonly string[]) => Math.min(...lit(c).flatMap((a) => around.map((b) => deltaE(a, b))));

/** What a side's colour sits next to or on top of. */
const SURROUNDINGS: Record<string, readonly string[]> = {
  'unpainted grey parts': RAMPS.steel.slice(1, 4),
  'crystals': RAMPS.gold,
  'forest': RAMPS.pine,
  'sand': RAMPS.sand,
  'plates': RAMPS.plate,
  'cyan lights': [RAMPS.cyan[3], RAMPS.cyan[4]],
};
/** Below this the two read as one colour at sprite size. */
const BLEND = 16;

/**
 * Every colour that comes this close to its surroundings, as agreed with the director: allowed, but known. A change of
 * any colour that adds a pair here, or removes one, shows up in this test.
 */
const MAY_BLEND: Record<string, TeamColor[]> = {
  'unpainted grey parts': ['sky', 'grey', 'white'],
  'crystals': ['yellow', 'sunny'],
  'forest': ['cyan'],
  'sand': ['brown', 'peach'],
  'plates': ['sky', 'white'],
  'cyan lights': ['cyan'],
};

describe('team colours', () => {
  it('are 24: eight hues in rainbow order, each dark, base and light', () => {
    expect(TEAM_COLOR_NAMES).toHaveLength(24);
    expect(TEAM_HUES.flatMap((h) => TEAM_COLOR_GRID[h])).toEqual(TEAM_COLOR_NAMES);
    for (const h of TEAM_HUES) {
      const [dark, base, light] = TEAM_COLOR_GRID[h].map((c) => lab(hex(TEAM_COLORS[c][2]))[0]);
      expect(dark).toBeLessThan(base!);
      expect(base).toBeLessThan(light!);
    }
  });

  it('can always be told apart from each other', () => {
    for (const a of TEAM_COLOR_NAMES)
      for (const b of TEAM_COLOR_NAMES) if (a < b) expect(deltaE(TEAM_COLORS[a][2], TEAM_COLORS[b][2]), `${a} / ${b}`).toBeGreaterThan(10);
  });

  it('never use a colour of the shared palette except the two drawn ramps', () => {
    const palette = new Set(PALETTE.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')));
    const inPalette = TEAM_COLOR_NAMES.filter((c) => TEAM_COLORS[c].some((x) => palette.has(x)));
    expect(inPalette.sort()).toEqual(['cyan', 'olive', 'red']);
  });

  for (const [what, around] of Object.entries(SURROUNDINGS)) {
    it(`that may blend into ${what} are the known ones`, () => {
      const close = TEAM_COLOR_NAMES.filter((c) => nearest(c, around) < BLEND);
      expect(close).toEqual(MAY_BLEND[what]);
    });
  }

  it('keep grey warmer than unpainted steel, so a grey side still looks painted', () => {
    expect(nearest('grey', SURROUNDINGS['unpainted grey parts']!)).toBeGreaterThan(12);
  });
});

const chroma = (h: string) => Math.hypot(lab(hex(h))[1], lab(hex(h))[2]);

describe('glow', () => {
  it('is neon: more saturated than the colour it comes from, also for dark and pale shades', () => {
    for (const c of TEAM_COLOR_NAMES) {
      if (TEAM_COLOR_GRID.grey.includes(c)) continue;
      const lit = glowRamp(c)[3]!;
      expect(chroma(lit), c).toBeGreaterThan(Math.max(45, chroma(TEAM_COLORS[c][2])));
    }
  });

  it('is white for the greys', () => {
    for (const c of TEAM_COLOR_GRID.grey) expect(glowRamp(c)[4]).toBe('#ffffff');
  });

  it('keeps the hue of its colour', () => {
    const hueOf = (h: string) => Math.atan2(lab(hex(h))[2], lab(hex(h))[1]);
    for (const c of ['red', 'orange', 'green', 'azure', 'blue', 'violet'] as const) {
      for (const k of [3, 4]) {
        const d = Math.abs(hueOf(glowRamp(c)[k]!) - hueOf(TEAM_COLORS[c][2]));
        expect(Math.min(d, 2 * Math.PI - d), `${c} step ${k}`).toBeLessThan(0.6);
      }
    }
  });

  it('has a pale core that is tinted, not white', () => {
    for (const c of TEAM_COLOR_NAMES) {
      if (TEAM_COLOR_GRID.grey.includes(c)) continue;
      expect(chroma(glowRamp(c)[4]!), c).toBeGreaterThan(15);
    }
  });

  it('never makes the spit white unless both colours are greys', () => {
    expect(spitColor('red', 'lime')).toBe('lime');
    expect(spitColor('red', 'white')).toBe('red');
    expect(spitColor('black', 'white')).toBe('lime');
  });
});
