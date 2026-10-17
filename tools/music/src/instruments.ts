import type { Note } from './midi';
import { addPanned, adsr, Bandpass, hz, Lowpass, noise, pulse, SAMPLE_RATE, saw, Stereo } from './synth';

/**
 * The instruments of the remastered score: a dark desert palette in the spirit of Dune. Low drones and brass
 * swells, a throat singer, a wailing voice for the tunes, war drums and metal, and the wind. Each renders one note
 * into a stereo bus. `at` is the start in seconds, `dur` the held length in seconds.
 */
export type Instrument = (out: Stereo, note: Note, at: number, dur: number) => void;

const cents = (c: number) => 2 ** (c / 1200);
const TAU = 2 * Math.PI;

function span(out: Stereo, at: number, seconds: number): [number, number] {
  const i0 = Math.max(0, Math.round(at * SAMPLE_RATE));
  return [i0, Math.min(out.length, i0 + Math.ceil(seconds * SAMPLE_RATE))];
}

/** Advances a phase accumulator in place and returns the new phase. */
function step(ph: number[], k: number, inc: number): number {
  let p = ph[k]! + inc;
  if (p >= 1) p -= 1;
  ph[k] = p;
  return p;
}

/**
 * Wailing voice for the melodies (a lament like a duduk or a far-off singer): a buzzy source through the formants
 * of an open "ah", scooping up into each note, with vibrato that grows as the note is held and a little breath.
 */
export function wail(opts: { pan?: number; gain?: number; octave?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 0.35;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch + 12 * (opts.octave ?? 0));
    const formants: [Bandpass, number, number][] = [
      [new Bandpass(5), 750, 1],
      [new Bandpass(7), 1150, 0.55],
      [new Bandpass(9), 2700, 0.18],
    ];
    const breath = noise(note.pitch * 31 + 7);
    const ph = [0, 0.4];
    const g = (opts.gain ?? 0.3) * (0.6 + 0.4 * note.velocity);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const scoop = cents(-90 * Math.exp(-t * 18));
      const vib = cents((t > 0.25 ? 22 * Math.min(1, (t - 0.25) * 1.5) : 0) * Math.sin(TAU * 5.2 * t));
      const inc = (f * scoop * vib) / SAMPLE_RATE;
      const src = saw(step(ph, 0, inc), inc) * 0.7 + pulse(step(ph, 1, inc * cents(4)), inc, 0.18) * 0.3 + breath() * 0.08;
      let v = 0;
      for (const [bp, fc, a] of formants) v += bp.run(src, fc) * a;
      v *= adsr(t, dur, 0.12, 0.3, 0.8, rel) * g * 2.2;
      addPanned(out, i, v, opts.pan ?? 0);
    }
  };
}

/**
 * Throat singer: a very low voice in a dark "o" with a sharp overtone that wanders slowly across the harmonics,
 * the way Tuvan singers whistle over their drone.
 */
export function throat(opts: { pan?: number; gain?: number; seed?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 1.2;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch);
    const f1 = new Bandpass(4);
    const f2 = new Bandpass(5);
    const whistle = new Bandpass(28);
    const air = noise((opts.seed ?? 3) + note.pitch);
    const ph = [0, 0.5];
    const g = (opts.gain ?? 0.3) * (0.6 + 0.4 * note.velocity);
    const drift = (note.start * 1.7) % TAU;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const inc = (f * cents(6 * Math.sin(TAU * 0.3 * t))) / SAMPLE_RATE;
      const src = saw(step(ph, 0, inc), inc) + saw(step(ph, 1, inc * cents(-9)), inc) * 0.6 + air() * 0.05;
      // The overtone moves between the 6th and the 12th harmonic.
      const harmonic = 9 + 3 * Math.sin(TAU * 0.11 * t + drift) * Math.sin(TAU * 0.037 * t + 1);
      let v = f1.run(src, 420) * 1.2 + f2.run(src, 720) * 0.6 + whistle.run(src, f * harmonic) * 0.9;
      v = Math.tanh(v * 1.5) * adsr(t, dur, 0.6, 0.8, 0.85, rel) * g;
      addPanned(out, i, v, opts.pan ?? 0);
    }
  };
}

/** Drone: a sub sine under a slowly breathing low saw, softly saturated. Long fade in and out. */
export function drone(opts: { gain?: number; pan?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 3;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch);
    const lp = new Lowpass(1.6);
    const ph = [0, 0.3, 0.7];
    const g = (opts.gain ?? 0.3) * (0.7 + 0.3 * note.velocity);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const inc = f / SAMPLE_RATE;
      const sub = Math.sin(TAU * step(ph, 0, inc));
      const buzz = saw(step(ph, 1, inc * cents(-5)), inc) + saw(step(ph, 2, inc * 2 * cents(4)), inc * 2) * 0.4;
      const cutoff = 140 + 160 * (0.5 + 0.5 * Math.sin(TAU * 0.07 * t - 1.5));
      const v = Math.tanh(sub * 0.9 + lp.run(buzz, cutoff) * 0.8) * adsr(t, dur, 2.5, 1, 0.9, rel) * g;
      addPanned(out, i, v, opts.pan ?? 0);
    }
  };
}

/** Brass swell ("braam"): detuned saws in two octaves, the filter opening slowly then closing, driven hard. */
export function braam(opts: { gain?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 1.4;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch);
    const detune = [-14, -5, 6, 13];
    const pans = [-0.5, -0.15, 0.2, 0.5];
    const ph = [0.1, 0.35, 0.6, 0.85, 0.2];
    const lps = [new Lowpass(1.1), new Lowpass(1.1)];
    const g = (opts.gain ?? 0.18) * (0.6 + 0.4 * note.velocity);
    const total = dur + rel;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const x = t / total;
      const cutoff = 120 + 1500 * Math.sin(Math.PI * Math.min(1, x * 1.25)) ** 1.6;
      let l = 0;
      let r = 0;
      for (let k = 0; k < 4; k++) {
        const inc = (f * cents(detune[k]!)) / SAMPLE_RATE;
        const v = saw(step(ph, k, inc), inc);
        l += v * Math.cos(((pans[k]! + 1) * Math.PI) / 4);
        r += v * Math.sin(((pans[k]! + 1) * Math.PI) / 4);
      }
      const incLow = f / 2 / SAMPLE_RATE;
      const low = saw(step(ph, 4, incLow), incLow) * 0.8;
      const env = adsr(t, dur, 0.35, 0.6, 0.75, rel) * g;
      out.l[i]! += Math.tanh(lps[0]!.run(l + low, cutoff) * 1.8) * env;
      out.r[i]! += Math.tanh(lps[1]!.run(r + low, cutoff) * 1.8) * env;
    }
  };
}

/** Low strings playing a driven ostinato: two saws, a short bow attack and a dark filter that bites on each note. */
export function lowStrings(opts: { gain?: number; pan?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 0.12;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch);
    const lp = new Lowpass(1.3);
    const ph = [0, 0.5];
    const g = (opts.gain ?? 0.3) * (0.6 + 0.4 * note.velocity);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const inc = f / SAMPLE_RATE;
      const v0 = saw(step(ph, 0, inc * cents(-6)), inc) + saw(step(ph, 1, inc * cents(6)), inc);
      const cutoff = 220 + 1300 * Math.exp(-t * 14) + f * 1.2;
      const v = Math.tanh(lp.run(v0, cutoff) * 1.4) * adsr(t, dur, 0.006, 0.12, 0.55, rel) * g;
      addPanned(out, i, v, opts.pan ?? 0);
    }
  };
}

/** Dark strings pad: three detuned saws per note behind a low filter, slow to swell and slow to fade. */
export function darkPad(opts: { gain?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 1.6;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch);
    const detune = [-12, 0, 10];
    const pans = [-0.6, 0, 0.6];
    const ph = [0.1, 0.5, 0.8];
    const lps = detune.map(() => new Lowpass(0.8));
    const g = (opts.gain ?? 0.07) * (0.6 + 0.4 * note.velocity);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const env = adsr(t, dur, 0.8, 0.8, 0.85, rel) * g;
      for (let k = 0; k < 3; k++) {
        const inc = (f * cents(detune[k]!)) / SAMPLE_RATE;
        addPanned(out, i, lps[k]!.run(saw(step(ph, k, inc), inc), 520 + 180 * Math.sin(t * 0.9 + k)) * env, pans[k]!);
      }
    }
  };
}

/**
 * Desert wind: noise through a band that drifts up and down and a gust envelope, separately on each side.
 * One note is one stretch of wind; its pitch is ignored.
 */
export function wind(opts: { gain?: number; seed?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 2.5;
    const [i0, i1] = span(out, at, dur + rel);
    const sides = [0, 1].map((k) => ({ rnd: noise((opts.seed ?? 9) * 7 + k), bp: new Bandpass(2.2), hp: new Bandpass(6), off: k * 2.1 }));
    const g = (opts.gain ?? 0.2) * note.velocity;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const tt = at + t;
      const env = adsr(t, dur, 2.5, 0.1, 1, rel) * g;
      for (const s of sides) {
        const gust = 0.55 + 0.45 * Math.sin(TAU * tt * 0.13 + s.off) * Math.sin(TAU * tt * 0.051 + 1 + s.off);
        const centre = 380 + 520 * gust + 160 * Math.sin(TAU * tt * 0.37 + s.off);
        const x = s.rnd();
        const v = (s.bp.run(x, centre) * 1.6 + s.hp.run(x, centre * 3.1) * 0.5) * gust * env;
        if (s.off) out.r[i]! += v;
        else out.l[i]! += v;
      }
    }
  };
}

/**
 * War drums, keyed like a General MIDI kit so the original's drum track maps onto them: 35/36 big taiko,
 * 41/43/45/47 mid taiko, 38/40 a dry wooden crack, 42/44 a shaker, 46/54/56 a metal clank, anything else
 * (cymbals) a deep boom with a long rumble.
 */
export function warDrums(opts: { gain?: number; seed?: number } = {}): Instrument {
  const rnd = noise(opts.seed ?? 7);
  const taiko = (out: Stereo, at: number, g: number, from: number, to: number, decay: number, pan: number) => {
    const [i0, i1] = span(out, at, decay * 5);
    const skin = new Lowpass(0.7);
    let ph = 0;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      ph += (to + (from - to) * Math.exp(-t * 22)) / SAMPLE_RATE;
      const body = Math.sin(TAU * ph) * Math.exp(-t / decay);
      const hit = skin.run(rnd(), 900) * Math.exp(-t * 35) * 1.4;
      addPanned(out, i, Math.tanh((body + hit) * 1.6) * g, pan);
    }
  };
  return (out, note, at) => {
    const g = (opts.gain ?? 0.5) * (0.45 + 0.55 * note.velocity);
    const p = note.pitch;
    if (p === 35 || p === 36) taiko(out, at, g * 0.85, 95, 46, 0.3, 0);
    else if (p === 41 || p === 43 || p === 45 || p === 47) taiko(out, at, g * 0.8, 170 + (p - 41) * 12, 95 + (p - 41) * 8, 0.16, (p - 44) / 8);
    else if (p === 38 || p === 40) {
      const [i0, i1] = span(out, at, 0.25);
      const bp = new Bandpass(3);
      let ph = 0;
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SAMPLE_RATE;
        ph += 260 / SAMPLE_RATE;
        const v = Math.sin(TAU * ph) * Math.exp(-t * 40) * 0.6 + bp.run(rnd(), 1800) * Math.exp(-t * 28) * 2.2;
        addPanned(out, i, v * g * 0.7, -0.1);
      }
    } else if (p === 42 || p === 44) {
      const [i0, i1] = span(out, at, 0.12);
      const bp = new Bandpass(2);
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SAMPLE_RATE;
        const a = Math.min(1, t * 120) * Math.exp(-t * 35);
        addPanned(out, i, bp.run(rnd(), 5200) * a * g * 0.5, 0.35);
      }
    } else if (p === 46 || p === 54 || p === 56) {
      // Struck metal: inharmonic partials of a plate, each dying away at its own rate.
      const partials: [number, number, number][] = [
        [1, 1.6, 0.5],
        [2.76, 1.0, 0.35],
        [5.4, 0.6, 0.25],
        [8.93, 0.35, 0.15],
      ];
      const base = p === 46 ? 330 : p === 54 ? 196 : 247;
      const [i0, i1] = span(out, at, 2.5);
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SAMPLE_RATE;
        let v = 0;
        for (const [ratio, life, amp] of partials) v += Math.sin(TAU * base * ratio * t) * Math.exp(-t / (life * 0.6)) * amp;
        addPanned(out, i, v * g * 0.35 * Math.min(1, t * 2000), -0.35);
      }
    } else {
      taiko(out, at, g * 0.9, 80, 38, 0.55, 0);
      const [i0, i1] = span(out, at, 3.5);
      const lp = new Lowpass(0.7);
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SAMPLE_RATE;
        addPanned(out, i, lp.run(rnd(), 260) * Math.exp(-t * 1.3) * g * 1.4, 0.1);
      }
    }
  };
}
