import { reverb } from './effects';
import { Bandpass, hz, Lowpass, noise, pulse, SAMPLE_RATE, Stereo } from './synth';

/** Building blocks of the sound effects: thumps, struck metal, filtered noise, blips, a mono reverb. */

export const TAU = 2 * Math.PI;
export const cents = (c: number) => 2 ** (c / 1200);


/** Adds fn(t) into `out` from `at` seconds for `seconds`; t is the time since `at`. */
export function add(out: Float32Array, at: number, seconds: number, fn: (t: number) => number): void {
  const i0 = Math.round(at * SAMPLE_RATE);
  const i1 = Math.min(out.length, i0 + Math.ceil(seconds * SAMPLE_RATE));
  for (let i = i0; i < i1; i++) out[i]! += fn((i - i0) / SAMPLE_RATE);
}

export const buffer = (seconds: number) => new Float32Array(Math.round(seconds * SAMPLE_RATE));

/** A sine whose pitch falls from `from` to `to` Hz at rate `drop`, dying away with time constant `decay`. */
export function thump(out: Float32Array, at: number, from: number, to: number, drop: number, decay: number, gain: number): void {
  let ph = 0;
  add(out, at, decay * 7, (t) => {
    ph += (to + (from - to) * Math.exp(-t * drop)) / SAMPLE_RATE;
    return Math.sin(TAU * ph) * Math.exp(-t / decay) * Math.min(1, t * 4000) * gain;
  });
}

/** Struck metal: inharmonic partials [ratio, life in seconds, amplitude] over `base` Hz. */
export function ring(out: Float32Array, at: number, base: number, partials: [number, number, number][], gain: number): void {
  const life = Math.max(...partials.map((p) => p[1]));
  add(out, at, life * 6, (t) => {
    let v = 0;
    for (const [ratio, l, a] of partials) v += Math.sin(TAU * base * ratio * t) * Math.exp(-t / l) * a;
    return v * Math.min(1, t * 3000) * gain;
  });
}

/** Plate partials, as in the war drums' metal clank. */
export const PLATE: [number, number, number][] = [
  [1, 0.16, 0.5],
  [2.76, 0.1, 0.35],
  [5.4, 0.06, 0.25],
  [8.93, 0.035, 0.15],
];

/** A dark bell: hum, prime, minor-third tierce, quint and nominal, so it sits in D minor. */
export function bell(out: Float32Array, at: number, f: number, life: number, gain: number): void {
  ring(
    out,
    at,
    f,
    [
      [0.5, life * 1.4, 0.5],
      [1, life, 0.6],
      [1.19, life * 0.8, 0.35],
      [1.5, life * 0.6, 0.2],
      [2, life * 0.5, 0.25],
      [2.74, life * 0.3, 0.1],
    ],
    gain,
  );
}

/** Noise through a lowpass whose cutoff follows `cutoff(t)`, shaped by `env(t)`. */
export function rumble(out: Float32Array, at: number, seconds: number, seed: number, cutoff: (t: number) => number, env: (t: number) => number, q = 0.7): void {
  const rnd = noise(seed);
  const lp = new Lowpass(q);
  add(out, at, seconds, (t) => lp.run(rnd(), cutoff(t)) * env(t));
}

/** Noise through a bandpass at `centre(t)`, shaped by `env(t)`: cracks, hisses, scrapes. */
export function hiss(out: Float32Array, at: number, seconds: number, seed: number, centre: (t: number) => number, env: (t: number) => number, q = 2): void {
  const rnd = noise(seed);
  const bp = new Bandpass(q);
  add(out, at, seconds, (t) => bp.run(rnd(), centre(t)) * env(t));
}

export const drive = (buf: Float32Array, k: number) => buf.forEach((v, i) => (buf[i] = Math.tanh(v * k)));

/** A mono reverb tail: the signal through the music's reverb, `wet` mixed back in. */
export function verb(buf: Float32Array, wet: number, room = 0.75, damp = 0.45): Float32Array {
  const s = new Stereo(buf.length);
  s.l.set(buf);
  s.r.set(buf);
  const w = reverb(s, room, damp);
  return buf.map((v, i) => v + ((w.l[i]! + w.r[i]!) / 2) * wet);
}

/** A short tone: pulse through a lowpass, for UI blips. Pitch is MIDI. */
export function blip(out: Float32Array, at: number, pitch: number, seconds: number, gain: number, width = 0.3, bright = 4): void {
  const f = hz(pitch);
  const lp = new Lowpass(0.9);
  let ph = 0;
  const inc = f / SAMPLE_RATE;
  add(out, at, seconds, (t) => {
    ph = (ph + inc) % 1;
    const env = Math.min(1, t * 400) * Math.exp(-t / (seconds * 0.3));
    return (lp.run(pulse(ph, inc, width), f * bright) * 0.6 + Math.sin(TAU * ph) * 0.5) * env * gain;
  });
}

/**
 * A loop `seconds` long without a seam: `make` fills `overlap` more on each side, the first stretch (where filters
 * settle) is dropped and the last is crossfaded at equal power onto the start, so the end runs into the beginning.
 */
export function seamless(seconds: number, make: (out: Float32Array) => void, overlap = 0.25): Float32Array {
  const n = Math.round(seconds * SAMPLE_RATE);
  const m = Math.round(overlap * SAMPLE_RATE);
  const raw = new Float32Array(n + 2 * m);
  make(raw);
  const out = raw.slice(m, m + n);
  for (let i = 0; i < m; i++) {
    const a = (Math.PI / 2) * (i / m);
    out[i] = raw[m + i]! * Math.sin(a) + raw[m + n + i]! * Math.cos(a);
  }
  return out;
}

/** Fades the edges (1 ms in, 25 ms out) and normalises the peak across channels to `peakDb` dBFS. */
export function finish(channels: Float32Array[], peakDb = -1): Float32Array[] {
  const n = channels[0]!.length;
  const fadeIn = Math.round(0.001 * SAMPLE_RATE);
  const fadeOut = Math.round(0.025 * SAMPLE_RATE);
  let peak = 0;
  for (const c of channels) {
    for (let i = 0; i < n; i++) {
      const g = Math.min(1, i / fadeIn, (n - 1 - i) / fadeOut);
      c[i]! *= g;
      peak = Math.max(peak, Math.abs(c[i]!));
    }
  }
  const g = peak ? 10 ** (peakDb / 20) / peak : 1;
  for (const c of channels) for (let i = 0; i < n; i++) c[i]! *= g;
  return channels;
}
