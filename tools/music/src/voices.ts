import { add, buffer, finish, hiss, TAU } from './parts';
import type { Sfx } from './sfx';
import { Bandpass, hz, Lowpass, noise, pulse, SAMPLE_RATE } from './synth';

/**
 * Unit acknowledgements, with no voices: each race answers in its own radio language. Humans key a crackling field
 * radio and send a short pulse motif, hovers chirp a digital trill, walkers chitter like insects. Every unit type
 * has its own pitch (the heavier, the lower and slower), every action its own motif (ready rises, move goes up,
 * attack leans on the Phrygian semitone, harvest falls), and three variants of each so repeats do not grate.
 * Files are named voice_<race>_<unit>_<action>_<variant>.
 */

export type VoiceRace = 'human' | 'hover' | 'walker';
export type VoiceUnit = 'harvester' | 'light' | 'middle' | 'heavy';
export type VoiceAction = 'ready' | 'move' | 'attack' | 'harvest';

export const VOICE_RACES: VoiceRace[] = ['human', 'hover', 'walker'];
export const VOICE_UNITS: Record<VoiceUnit, { shift: number; slow: number; soft: boolean; actions: VoiceAction[] }> = {
  harvester: { shift: -3, slow: 1.25, soft: true, actions: ['ready', 'move', 'harvest'] },
  light: { shift: 7, slow: 0.85, soft: false, actions: ['ready', 'move', 'attack'] },
  middle: { shift: 0, slow: 1, soft: false, actions: ['ready', 'move', 'attack'] },
  heavy: { shift: -7, slow: 1.3, soft: false, actions: ['ready', 'move', 'attack'] },
};
export const VARIANTS = 3;

/** [semitones above the unit's root, length in steps], three variants per action. */
const MOTIFS: Record<VoiceAction, [number, number][][]> = {
  ready: [
    [[0, 1], [5, 1], [7, 2]],
    [[0, 1], [3, 1], [7, 2]],
    [[-5, 1], [0, 1], [7, 2]],
  ],
  move: [
    [[7, 1], [12, 2]],
    [[5, 1], [7, 2]],
    [[0, 1], [7, 1], [7, 1]],
  ],
  attack: [
    [[0, 1], [0, 1], [1, 2]],
    [[12, 1], [13, 1], [12, 1]],
    [[0, 0.5], [1, 0.5], [0, 0.5], [1, 1.5]],
  ],
  harvest: [
    [[7, 1], [5, 1], [0, 2]],
    [[3, 1], [0, 2]],
    [[5, 1], [3, 1], [0, 2]],
  ],
};

/**
 * Humans and the non-walker harvesters speak flatly, like a soldier on comms: mostly one pitch, a small step, a fall
 * at the end. (Pavlo found the leaping motifs above too cheerful for them.)
 */
const NEUTRAL: Record<VoiceAction, [number, number][][]> = {
  ready: [
    [[0, 1], [0, 1], [-2, 2]],
    [[0, 1], [-2, 1], [0, 2]],
    [[0, 2], [-5, 2]],
  ],
  move: [
    [[0, 1], [0, 2]],
    [[0, 1], [-2, 2]],
    [[-2, 1], [0, 2]],
  ],
  attack: [
    [[0, 0.5], [0, 0.5], [1, 2]],
    [[1, 1], [0, 2]],
    [[0, 0.5], [1, 0.5], [0, 1.5]],
  ],
  harvest: [
    [[0, 1], [-2, 1], [-5, 2]],
    [[0, 1], [-5, 2]],
    [[-2, 1], [-5, 2]],
  ],
};
const neutral = (race: VoiceRace, unit: VoiceUnit) => race === 'human' || (unit === 'harvester' && race !== 'walker');

/** MIDI root of a middle tank's motif per race. */
const ROOT: Record<VoiceRace, number> = { human: 57, hover: 74, walker: 0 };
const STEP = 0.065;
const TAIL = 0.18;

interface Spec {
  root: number;
  shift: number;
  step: number;
  soft: boolean;
  motif: [number, number][];
  seed: number;
}

/** Calls fn for every note with its start and length in seconds. */
function notes(s: Spec, fn: (at: number, len: number, semis: number, k: number) => void): number {
  let at = 0.02;
  s.motif.forEach(([semis, steps], k) => {
    fn(at, steps * s.step, semis, k);
    at += steps * s.step;
  });
  return at;
}

const lengthOf = (s: Spec) => 0.02 + s.motif.reduce((t, [, steps]) => t + steps * s.step, 0) + TAIL;

/** Human: the radio keys with a click, a pulse motif through a narrow radio band over static, then a hiss as it lets go. */
function human(s: Spec): Float32Array {
  const out = buffer(lengthOf(s));
  const rnd = noise(s.seed);
  const stat = new Bandpass(0.8);
  add(out, 0, out.length / SAMPLE_RATE, (t) => stat.run(rnd(), 2500) * 0.12 + (rnd() > 0.996 ? rnd() * 0.25 : 0) * Math.min(1, t * 50));
  hiss(out, 0, 0.012, s.seed + 1, () => 1800, (t) => Math.exp(-t * 400) * 2.5, 1);
  const end = notes(s, (at, len, semis) => {
    const f = hz(s.root + s.shift + semis);
    const radio = new Bandpass(1.2);
    const lp = new Lowpass(0.8);
    let ph = 0;
    const inc = f / SAMPLE_RATE;
    add(out, at, len * 0.85, (t) => {
      ph = (ph + inc) % 1;
      const env = Math.min(1, t * 300) * Math.min(1, (len * 0.85 - t) * 200);
      const v = s.soft ? lp.run(pulse(ph, inc, 0.4), 900) : radio.run(pulse(ph, inc, 0.5), 900) * 2.5;
      return Math.tanh(v * (s.soft ? 1.2 : 2.5)) * env * 0.6;
    });
  });
  hiss(out, end, 0.08, s.seed + 2, () => 3000, (t) => Math.min(1, t * 200) * Math.exp(-t * 35) * 1.2, 1);
  return out;
}

/** Hover: a quick rising bloop, then each note as a fast FM trill a tone wide, crushed to a few levels. */
function hover(s: Spec): Float32Array {
  const out = buffer(lengthOf(s));
  let bp = 0;
  add(out, 0, 0.03, (t) => {
    bp += (300 + 30000 * t) / SAMPLE_RATE;
    return Math.sin(TAU * bp) * Math.sin((Math.PI * t) / 0.03) * 0.4;
  });
  const end = notes(s, (at, len, semis) => {
    const f = hz(s.root + s.shift + semis);
    let car = 0;
    let mod = 0;
    let held = 0;
    add(out, at, len * 0.9, (t) => {
      const up = Math.floor(t * 28) % 2 === 1;
      const freq = f * (up ? 2 ** (2 / 12) : 1);
      mod += (freq * 2) / SAMPLE_RATE;
      car += freq / SAMPLE_RATE;
      const env = Math.min(1, t * 400) * Math.min(1, (len * 0.9 - t) * 150);
      const v = Math.sin(TAU * car + (s.soft ? 0.5 : 1.6) * Math.sin(TAU * mod)) * env * 0.6;
      if (s.soft) return v;
      // Sample-and-hold every third sample and twelve levels: the digital grain.
      const i = Math.round(t * SAMPLE_RATE);
      if (i % 3 === 0) held = Math.round(v * 6) / 6;
      return held;
    });
  });
  // A short downward echo of the last note.
  const last = s.motif[s.motif.length - 1]!;
  let ph = 0;
  add(out, end, TAIL * 0.8, (t) => {
    ph += (hz(s.root + s.shift + last[0] + 12) * (1 - t)) / SAMPLE_RATE;
    return Math.sin(TAU * ph) * Math.exp(-t * 25) * 0.15;
  });
  return out;
}

/** Walker: a chitter of resonant clicks whose formant follows the motif, faster for small walkers; a body buzz under it. */
function walker(s: Spec): Float32Array {
  const out = buffer(lengthOf(s));
  const rate = 55 / (s.step / STEP);
  notes(s, (at, len, semis, k) => {
    const formant = 1900 * 2 ** ((s.shift + semis) / 12);
    const res = new Bandpass(s.soft ? 6 : 12);
    const body = new Lowpass(1);
    const rnd = noise(s.seed + k * 7);
    let ph = 0;
    add(out, at, len * 0.92, (t) => {
      const syll = Math.sin((Math.PI * t) / (len * 0.92));
      const click = (t * rate) % 1 < 0.08 ? rnd() * 3 : 0;
      const glide = 2 ** ((2 * t) / len / 12);
      const inc = rate / SAMPLE_RATE;
      ph = (ph + inc) % 1;
      const buzz = s.soft ? 0 : body.run(pulse(ph, inc, 0.2), 400) * 0.05;
      return (res.run(click, formant * glide) * 1.5 + buzz) * syll;
    });
  });
  // Clicks are all peak and little body: squeeze them so a walker sounds as present as the other races.
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  return out.map((v) => Math.tanh((v / (peak || 1)) * 6));
}

const RENDER: Record<VoiceRace, (s: Spec) => Float32Array> = { human, hover, walker };

export const VOICES: Sfx[] = VOICE_RACES.flatMap((race, r) =>
  (Object.keys(VOICE_UNITS) as VoiceUnit[]).flatMap((unit, u) => {
    // Walkers kept their first harvester voice, which Pavlo liked; the others' harvesters sit lower now.
    const spec = race === 'walker' && unit === 'harvester' ? { ...VOICE_UNITS[unit], shift: 3, slow: 1.15 } : VOICE_UNITS[unit];
    return spec.actions.flatMap((action) =>
      Array.from({ length: VARIANTS }, (_, v): Sfx => ({
        name: `voice_${race}_${unit}_${action}_${v}`,
        description: `${race} ${unit} acknowledges "${action}" (variant ${v + 1}).`,
        // Walker clicks carry less body than the others' tones, so they play a little louder.
        gain: race === 'walker' ? 0.55 : 0.4,
        budget: 1,
        render: () =>
          finish([
            RENDER[race]({ root: ROOT[race], shift: spec.shift, step: STEP * spec.slow, soft: spec.soft, motif: (neutral(race, unit) ? NEUTRAL : MOTIFS)[action][v]!, seed: 1000 + r * 100 + u * 10 + v }),
          ]),
      })),
    );
  }),
);
