import { add, PLATE, ring, seamless, TAU, thump } from './parts';
import type { Sfx } from './sfx';
import { Bandpass, hz, Lowpass, noise, pulse, SAMPLE_RATE, saw } from './synth';

/**
 * Seamless loops the game keeps running and only turns up or down: the harvesters at work (one loop per race,
 * however many harvesters dig) and the map's ambience (wind, the forest, the crystal fields, the base and a working
 * factory). Every periodic part has a whole number of cycles in the loop, and `seamless` joins the edges.
 */

/** Fills the whole buffer: fn(t) with t in seconds from its start. */
const fill = (out: Float32Array, fn: (t: number) => number) => add(out, 0, out.length / SAMPLE_RATE, fn);

/** Calls `fn` at every multiple of `period` seconds that fits in the buffer. */
function every(out: Float32Array, period: number, fn: (at: number, k: number) => void): void {
  const seconds = out.length / SAMPLE_RATE;
  for (let k = 0; k * period < seconds; k++) fn(k * period, k);
}

// --- Harvesting ------------------------------------------------------------------------------------------------

/** Human harvester: a motor under load and a drill grinding the crystal, chattering, with glassy chips flying. */
export function harvestHuman(): Float32Array[] {
  return [
    seamless(2.4, (out) => {
      const motor = new Lowpass(1.1);
      const grind = new Bandpass(3);
      const rnd = noise(301);
      let ph = 0;
      fill(out, (t) => {
        const inc = (55 + 3 * Math.sin((TAU * t) / 1.2)) / SAMPLE_RATE;
        ph = (ph + inc) % 1;
        const chatter = 0.45 + 0.55 * Math.sin(TAU * 15 * t) ** 2;
        return motor.run(pulse(ph, inc, 0.3), 300) * 0.35 + grind.run(rnd(), 1100 + 250 * Math.sin((TAU * t) / 0.6)) * chatter * 1.1;
      });
      every(out, 0.4, (at, k) => ring(out, at + 0.13, hz(86 + ((k * 5) % 7)), [[1, 0.05, 0.5], [2.32, 0.03, 0.25]], 0.12));
    }),
  ];
}

/** Hover harvester: a suction hum and a rushing intake, swelling twice a loop, crystals popping up the pipe. */
export function harvestHover(): Float32Array[] {
  return [
    seamless(2.4, (out) => {
      const intake = new Lowpass(1.4);
      const rnd = noise(311);
      let whine = 0;
      fill(out, (t) => {
        const swell = 0.6 + 0.4 * Math.sin((TAU * t) / 1.2);
        whine += (660 + 12 * Math.sin(TAU * 5 * t)) / SAMPLE_RATE;
        return (
          intake.run(rnd(), 400 + 500 * swell) * swell * 0.9 +
          (Math.sin(TAU * 74 * t) + 0.3 * Math.sin(TAU * 148 * t)) * 0.25 +
          Math.sin(TAU * whine) * 0.05 * swell
        );
      });
      // A crystal sucked in: a quick rising chirp.
      every(out, 0.3, (at, k) => {
        if (k % 4 === 3) return;
        let p = 0;
        add(out, at + 0.07, 0.05, (t) => {
          p += (900 + 30000 * t + (k % 3) * 200) / SAMPLE_RATE;
          return Math.sin(TAU * p) * Math.sin((Math.PI * t) / 0.05) * 0.1;
        });
      });
    }),
  ];
}

/** Walker harvester: jaws biting the crystal two and a half times a second, a crunch, clicking mandibles, a wet gurgle. */
export function harvestWalker(): Float32Array[] {
  return [
    seamless(2.4, (out) => {
      const gut = new Bandpass(6);
      const rnd = noise(321);
      fill(out, (t) => gut.run(rnd(), 300 + 200 * Math.sin(TAU * 1.25 * t)) * 0.5);
      every(out, 0.4, (at, k) => {
        const crunch = noise(330 + k);
        const bp = new Bandpass(1.5);
        add(out, at, 0.08, (t) => bp.run(crunch(), 2800 - t * 8000) * Math.exp(-t * 45) * 1.6);
        thump(out, at, 140, 60, 40, 0.03, 0.35);
        // Three mandible clicks between the bites.
        for (let c = 0; c < 3; c++) {
          const tick = noise(340 + k * 3 + c);
          const hp = new Bandpass(4);
          add(out, at + 0.2 + c * 0.045, 0.012, (t) => hp.run(tick(), 4200 + c * 700) * Math.exp(-t * 400) * 1.2);
        }
      });
    }),
  ];
}

// --- Ambience --------------------------------------------------------------------------------------------------

/** Wind over the sand: a low rush that rises and falls, gusts hissing over it. */
export function ambWind(): Float32Array[] {
  return [
    seamless(8, (out) => {
      const low = new Lowpass(0.8);
      const gust = new Bandpass(1.5);
      const a = noise(401);
      const b = noise(402);
      fill(out, (t) => {
        const cutoff = 260 + 180 * Math.sin((TAU * t) / 8) + 90 * Math.sin((TAU * t) / 2);
        const g = (0.5 + 0.5 * Math.sin((TAU * t) / 8 + 1.3)) ** 2;
        return low.run(a(), cutoff) * (0.8 + 0.2 * Math.sin((TAU * t) / 4)) + gust.run(b(), 1300 + 500 * Math.sin((TAU * t) / 8 + 1)) * g * 0.5;
      });
    }, 1),
  ];
}

/** Firs in the wind: needles rustling in fluttering waves and one slow creak of a trunk. */
export function ambForest(): Float32Array[] {
  return [
    seamless(6, (out) => {
      const leaves = new Bandpass(2.5);
      const grain = new Lowpass(0.7);
      const a = noise(411);
      const b = noise(412);
      fill(out, (t) => {
        const wave = (0.5 + 0.5 * Math.sin((TAU * t) / 3)) * (0.6 + 0.4 * Math.sin((TAU * 11 * t) / 6) ** 2);
        const flutter = Math.abs(grain.run(b(), 18)) * 6;
        return leaves.run(a(), 2200) * (0.25 + 0.75 * wave) * (0.4 + flutter);
      });
      const body = new Bandpass(5);
      let ph = 0;
      add(out, 2.3, 0.5, (t) => {
        const inc = (88 - 30 * t) / SAMPLE_RATE;
        ph = (ph + inc) % 1;
        return body.run(saw(ph, inc), 620) * Math.sin((Math.PI * t) / 0.5) ** 2 * 0.5;
      });
    }, 0.5),
  ];
}

/** A crystal field: high glassy partials on D and A beating slowly against each other, an odd glint, a low hum. */
export function ambCrystals(): Float32Array[] {
  return [
    seamless(6, (out) => {
      const tones = [86, 93, 98].map(hz);
      fill(out, (t) => {
        let v = Math.sin(TAU * hz(38) * t) * 0.15;
        tones.forEach((f, k) => {
          const beat = 0.5 + 0.5 * Math.sin((TAU * (k + 1) * t) / 6 + k);
          v += (Math.sin(TAU * f * t) + Math.sin(TAU * (f + (k + 1) / 6) * t)) * 0.12 * beat;
        });
        return v;
      });
      for (const [at, p] of [[0.9, 93], [2.6, 98], [3.4, 86], [5.1, 100]] as const) ring(out, at, hz(p), [[1, 0.25, 0.5], [2.32, 0.12, 0.2], [4.1, 0.06, 0.1]], 0.15);
    }, 0.5),
  ];
}

/** Your base: a mains hum, a vent hissing, a servo whirring every two seconds. */
export function ambBase(): Float32Array[] {
  return [
    seamless(4, (out) => {
      const hum = new Lowpass(1);
      const vent = new Lowpass(0.7);
      const rnd = noise(421);
      let ph = 0;
      const inc = 50 / SAMPLE_RATE;
      fill(out, (t) => {
        ph = (ph + inc) % 1;
        return hum.run(saw(ph, inc), 220) * 0.4 + Math.sin(TAU * 100 * t) * 0.15 + vent.run(rnd(), 1500) * 0.25;
      });
      every(out, 2, (at) => {
        const lp = new Lowpass(1.5);
        let p = 0;
        add(out, at + 0.5, 0.35, (t) => {
          const i = (300 + 500 * t) / SAMPLE_RATE;
          p = (p + i) % 1;
          return lp.run(pulse(p, i, 0.4), 900) * Math.sin((Math.PI * t) / 0.35) * 0.25;
        });
      });
    }),
  ];
}

/** A factory at work: a press stamping once a second on steel, a pneumatic hiss after each stroke. */
export function ambFactory(): Float32Array[] {
  return [
    seamless(2, (out) => {
      every(out, 1, (at, k) => {
        thump(out, at, 120, 50, 35, 0.05, 0.8);
        ring(out, at + 0.002, 180 + (k % 2) * 25, PLATE, 0.4);
        const air = noise(431 + k);
        const bp = new Bandpass(1.2);
        add(out, at + 0.35, 0.3, (t) => bp.run(air(), 3000) * Math.sin((Math.PI * t) / 0.3) * 0.35);
      });
    }),
  ];
}

const table: [string, () => Float32Array[], number, string][] = [
  ['harvest_human', harvestHuman, 0.2, 'Human harvester at work (loop): a motor and a chattering drill on crystal.'],
  ['harvest_hover', harvestHover, 0.2, 'Hover harvester at work (loop): a suction hum and intake rush, crystals popping up.'],
  ['harvest_walker', harvestWalker, 0.3, 'Walker harvester at work (loop): biting jaws, crunching, clicking mandibles.'],
  ['amb_wind', ambWind, 0.2, 'Map ambience (loop): wind over the sand, rising and falling.'],
  ['amb_forest', ambForest, 0.16, 'Map ambience near firs (loop): rustling needles, a creaking trunk.'],
  ['amb_crystals', ambCrystals, 0.12, 'Map ambience near crystal fields (loop): a slow glassy beating shimmer.'],
  ['amb_base', ambBase, 0.14, 'Map ambience over your base (loop): hum, vents, a servo.'],
  ['amb_factory', ambFactory, 0.2, 'A working factory (loop): a press stamping on steel, pneumatic hiss.'],
];

export const LOOPS: Sfx[] = table.map(([name, make, gain, description]) => ({
  name,
  description,
  gain,
  budget: 8,
  loop: true,
  render: () => normalise(make()),
}));

/** Peak to -1 dBFS, edges untouched (the loop is already joined). */
function normalise(channels: Float32Array[]): Float32Array[] {
  let peak = 0;
  for (const c of channels) for (const v of c) peak = Math.max(peak, Math.abs(v));
  const g = peak ? 10 ** (-1 / 20) / peak : 1;
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i]! *= g;
  return channels;
}
