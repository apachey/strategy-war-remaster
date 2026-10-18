import { describe, expect, it } from 'vitest';
import { SFX } from '../src/sfx';
import { SAMPLE_RATE } from '../src/synth';

const NAMES = [
  'shot_light', 'shot_middle', 'shot_heavy', 'shot_defender', 'shot_alien', 'impact', 'explosion_small', 'explosion_big',
  'build_start', 'build_done', 'unit_ready', 'select', 'order', 'error', 'click', 'alert',
  'self_destruct', 'victory', 'defeat',
  'harvest_human', 'harvest_hover', 'harvest_walker', 'amb_wind', 'amb_forest', 'amb_crystals', 'amb_base', 'amb_factory',
];

describe('sound effects', () => {
  it('has every effect the game asks for, once', () => {
    expect(SFX.filter((s) => !s.name.startsWith('voice_')).map((s) => s.name).sort()).toEqual([...NAMES].sort());
    // 3 races x 4 units x 3 actions x 3 variants.
    expect(SFX.filter((s) => s.name.startsWith('voice_'))).toHaveLength(108);
    expect(new Set(SFX.map((s) => s.name)).size).toBe(SFX.length);
  });

  for (const s of SFX) {
    it(`${s.name} renders deterministically, within budget, finite and audible`, () => {
      const a = s.render();
      const b = s.render();
      expect(a.length).toBe(b.length);
      a.forEach((c, k) => expect(Buffer.from(c.buffer).equals(Buffer.from(b[k]!.buffer))).toBe(true));
      expect([1, 2]).toContain(a.length);
      const n = a[0]!.length;
      expect(n / SAMPLE_RATE).toBeLessThanOrEqual(s.budget);
      expect(n / SAMPLE_RATE).toBeGreaterThan(0.03);
      let peak = 0;
      let sum = 0;
      let bad = 0;
      for (const c of a) {
        expect(c.length).toBe(n);
        for (const v of c) {
          if (!Number.isFinite(v)) bad++;
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
        }
        expect(bad).toBe(0);
        // The fade leaves nothing to click at the end; a loop's end runs into its start.
        if (s.loop) expect(Math.abs(c[n - 1]! - c[0]!)).toBeLessThan(0.05);
        else expect(Math.abs(c[n - 1]!)).toBeLessThan(1e-3);
      }
      expect(peak).toBeCloseTo(10 ** (-1 / 20), 3);
      // RMS above -30 dBFS: not silent, not a lone spike.
      expect(Math.sqrt(sum / (n * a.length))).toBeGreaterThan(10 ** (-30 / 20));
    }, 20_000);
  }
});
