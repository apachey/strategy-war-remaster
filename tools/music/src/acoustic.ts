import { add, buffer, TAU } from './parts';
import { Bandpass, Highpass, Lowpass, noise, SAMPLE_RATE } from './synth';

/**
 * Acoustic models for the 1.2 sound effects: no oscillator waveforms, only what real things make. A gun is a pressure
 * wave, a crack of hot gas and a body of turbulence; metal is a set of inharmonic modes; an explosion throws grains of
 * debris and sand; an engine is firing pulses exciting an exhaust pipe. Everything is then placed in a space by
 * convolving with a synthesised impulse response (desert with echoes off dunes, or a small room for the interface).
 */

// --- Convolution -----------------------------------------------------------------------------------------------

function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr0 = Math.cos(a);
    const wi0 = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k;
        const q = p + len / 2;
        const xr = re[q]! * wr - im[q]! * wi;
        const xi = re[q]! * wi + im[q]! * wr;
        re[q] = re[p]! - xr;
        im[q] = im[p]! - xi;
        re[p]! += xr;
        im[p]! += xi;
        const t = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i]! /= n), (im[i]! /= n);
}

/** `x` convolved with `ir`, cut to the length of `x`. */
function convolve(x: Float32Array, ir: Float32Array): Float32Array {
  let n = 1;
  while (n < x.length + ir.length) n <<= 1;
  const ar = new Float64Array(n);
  const ai = new Float64Array(n);
  const br = new Float64Array(n);
  const bi = new Float64Array(n);
  ar.set(x);
  br.set(ir);
  fft(ar, ai, false);
  fft(br, bi, false);
  for (let i = 0; i < n; i++) {
    const r = ar[i]! * br[i]! - ai[i]! * bi[i]!;
    ai[i] = ar[i]! * bi[i]! + ai[i]! * br[i]!;
    ar[i] = r;
  }
  fft(ar, ai, true);
  return Float32Array.from(ar.subarray(0, x.length));
}

// --- Spaces ----------------------------------------------------------------------------------------------------

export interface Space {
  /** Seconds for the diffuse tail to fall 60 dB. */
  rt60: number;
  /** Lowpass on the tail at its start and its end: air and sand eat the highs. */
  bright: number;
  dark: number;
  /** Discrete echoes [delay s, gain, cutoff Hz]: dunes, rock walls, a room's walls. */
  echoes: [number, number, number][];
  predelay: number;
  seconds: number;
}

/** Open desert: a short tail and slaps off dunes further and further away. */
export const DESERT: Space = { rt60: 0.9, bright: 5000, dark: 900, echoes: [[0.09, 0.35, 3000], [0.21, 0.22, 1800], [0.47, 0.14, 1000]], predelay: 0.012, seconds: 1.2 };
/** A small hard room: the interface sits in the commander's bunker. */
export const ROOM: Space = { rt60: 0.35, bright: 5500, dark: 2500, echoes: [[0.011, 0.3, 5500], [0.023, 0.2, 4000]], predelay: 0.004, seconds: 0.5 };

function impulse(space: Space, seed: number): Float32Array {
  const ir = buffer(space.seconds);
  const rnd = noise(seed);
  // Cutoffs stay under 6 kHz: the state-variable filter turns unstable near a sixth of the sample rate.
  const lp = new Lowpass(0.9);
  const k = Math.log(1000) / space.rt60;
  add(ir, space.predelay, space.seconds - space.predelay, (t) => {
    const cut = space.dark + (space.bright - space.dark) * Math.exp(-t * 4);
    return lp.run(rnd(), cut) * Math.exp(-t * k) * Math.min(1, t * 200) * 0.25;
  });
  for (const [d, g, c] of space.echoes) {
    const e = new Lowpass(0.9);
    const r = noise(seed + Math.round(d * 1000));
    add(ir, d, 0.04, (t) => e.run(r() * Math.exp(-t * 120), c) * g * 3);
  }
  return ir;
}

/**
 * A mono dry sound placed in `space`: two decorrelated impulse responses make it stereo, `wet` mixes them in. A
 * highpass at 20 Hz first removes the offset a blast wave leaves (its two lobes do not cancel exactly).
 */
export function place(dry: Float32Array, space: Space, wet: number, seed: number): Float32Array[] {
  const hp = new Highpass(0.997);
  dry = dry.map((v) => hp.run(v));
  const l = convolve(dry, impulse(space, seed));
  const r = convolve(dry, impulse(space, seed + 7));
  return [dry.map((v, i) => v + l[i]! * wet), dry.map((v, i) => v + r[i]! * wet)];
}

// --- Sources ---------------------------------------------------------------------------------------------------

/** A muzzle blast `size` times a small gun: an N-shaped pressure wave, a crack of hot gas and a body of turbulence. */
export function blast(out: Float32Array, at: number, size: number, seed: number, gain = 1): void {
  const d = 0.0012 * size;
  add(out, at, 2 * d, (t) => (t < d ? Math.sin((Math.PI * t) / d) : -0.6 * Math.sin((Math.PI * (t - d)) / d)) * gain * 1.2);
  const rnd = noise(seed);
  const hp = new Highpass(0.8);
  const lp = new Lowpass(0.9);
  add(out, at, 0.08 * size, (t) => lp.run(hp.run(rnd()), Math.max(1500, 5500 - (t * 40000) / size)) * Math.exp(-t / (0.009 * size)) * gain * 1.6);
  const r2 = noise(seed + 1);
  const r3 = noise(seed + 2);
  const body = new Lowpass(0.9);
  const drift = new Lowpass(0.5);
  add(out, at, 0.5 * size, (t) => {
    const turbulence = 0.7 + 0.6 * drift.run(r3(), 30);
    return body.run(r2(), (900 / size) * Math.exp(-t * 6) + 120) * Math.exp(-t / (0.06 * size)) * turbulence * gain * 3.2;
  });
}

/** Struck metal: `modes` modes at random inharmonic ratios over `base` Hz, each living about `life` seconds. */
export function metal(out: Float32Array, at: number, base: number, seed: number, gain: number, life = 0.08, modes = 9): void {
  const rnd = noise(seed);
  const m: [number, number, number, number][] = [];
  for (let k = 0; k < modes; k++) {
    const ratio = k === 0 ? 1 : 1 + k * (1.3 + rnd() * 0.6) + rnd() * 0.4;
    m.push([base * ratio, (life * (0.4 + 0.6 * Math.abs(rnd()))) / Math.sqrt(1 + k * 0.6), (0.4 + 0.6 * Math.abs(rnd())) / (1 + k * 0.4), Math.abs(rnd()) * TAU]);
  }
  const click = noise(seed + 9);
  const longest = Math.max(...m.map((x) => x[1]));
  add(out, at, longest * 6, (t) => {
    let v = t < 0.0015 ? click() * 0.8 : 0;
    for (const [f, l, a, p] of m) if (f < SAMPLE_RATE / 2.2) v += Math.sin(TAU * f * t + p) * Math.exp(-t / l) * a;
    return v * gain;
  });
}

/** Turbulent roar: noise through a falling two-pole-pair lowpass, swelling with slow random gusts. */
export function roar(out: Float32Array, at: number, seconds: number, seed: number, cutoff: (t: number) => number, env: (t: number) => number): void {
  const rnd = noise(seed);
  const g = noise(seed + 3);
  const lp = new Lowpass(0.8);
  const lp2 = new Lowpass(0.8);
  const gust = new Lowpass(0.5);
  add(out, at, seconds, (t) => lp2.run(lp.run(rnd(), cutoff(t)), cutoff(t)) * env(t) * (0.7 + 0.8 * gust.run(g(), 8)));
}

/** Matter landing: `count` small hits of metal or sand, thinning out over `seconds`. */
export function debris(out: Float32Array, at: number, seconds: number, count: number, seed: number, gain: number, kind: 'metal' | 'sand'): void {
  const rnd = noise(seed);
  for (let k = 0; k < count; k++) {
    const x = Math.abs(rnd());
    const t = at + seconds * x * x;
    const g = gain * (0.3 + 0.7 * Math.abs(rnd())) * (1 - x * 0.7);
    if (kind === 'metal') metal(out, t, 700 + 2600 * Math.abs(rnd()), seed + k * 13, g, 0.012 + 0.03 * Math.abs(rnd()), 5);
    else {
      const r = noise(seed + k * 31);
      const bp = new Bandpass(1.5);
      const c = 2500 + 3000 * Math.abs(rnd());
      add(out, t, 0.02, (u) => bp.run(r(), c) * Math.exp(-u * 300) * g);
    }
  }
}

/**
 * An electric discharge `size` times a small one: a resonant noise zap falling in pitch, a comb that rings like a
 * charged coil, sparse crackle and a push of air.
 */
export function plasma(out: Float32Array, at: number, size: number, seed: number, gain: number): void {
  const len = 0.45 * size;
  const rnd = noise(seed);
  const zap = new Bandpass(9);
  const zap2 = new Bandpass(6);
  const delay = new Float32Array(4096);
  let w = 0;
  add(out, at, len, (t) => {
    const f = 180 + 2600 * Math.exp((-t * 11) / size);
    const n = rnd();
    const z = zap.run(n, f) * 2.2 + zap2.run(n, f * 1.51) * 1.2;
    const period = Math.min(4000, Math.max(2, Math.round(SAMPLE_RATE / (f * 0.5))));
    const y = n * 0.25 + delay[(w - period + 4096) % 4096]! * 0.86;
    delay[w] = y;
    w = (w + 1) % 4096;
    return (z + y * 0.35) * Math.min(1, t * 900) * Math.exp((-t * 6) / size) * gain;
  });
  const sparks = noise(seed + 5);
  const crackle = new Bandpass(2);
  add(out, at, len * 1.4, (t) => {
    const s = sparks();
    return crackle.run(Math.abs(s) > 0.992 - t * 0.01 ? s * 5 : 0, 5000) * Math.exp((-t * 5) / size) * gain;
  });
  const air = new Lowpass(0.8);
  const ar = noise(seed + 6);
  add(out, at, len, (t) => air.run(ar(), 220) * Math.min(1, t * 400) * Math.exp((-t * 9) / size) * gain * 3);
}

/** A combustion engine: firing pulses at `rate(t)` Hz, jittered, ringing an exhaust pipe and the hull. */
export function engine(out: Float32Array, at: number, seconds: number, seed: number, rate: (t: number) => number, env: (t: number) => number, gain: number): void {
  const rnd = noise(seed);
  const jitter = noise(seed + 1);
  const pipe = new Bandpass(3);
  const pipe2 = new Bandpass(2);
  const body = new Lowpass(0.9);
  let ph = 0;
  let kick = 0;
  add(out, at, seconds, (t) => {
    ph += (rate(t) * (1 + 0.08 * jitter())) / SAMPLE_RATE;
    if (ph >= 1) {
      ph -= 1;
      kick = 1;
    }
    kick *= 0.996;
    const x = kick * (0.6 + 0.4 * rnd()) + rnd() * 0.04;
    return (pipe.run(x, 95 + rate(t) * 2) * 3 + pipe2.run(x, 420) * 0.8 + body.run(x, 160) * 1.5) * env(t) * gain;
  });
}

/** Filtered noise: a hiss of air or sand with a moving centre. */
export function air(out: Float32Array, at: number, seconds: number, seed: number, centre: (t: number) => number, env: (t: number) => number, q = 1.5): void {
  const rnd = noise(seed);
  const bp = new Bandpass(q);
  add(out, at, seconds, (t) => bp.run(rnd(), Math.min(6000, centre(t))) * env(t));
}

/** A dull thud of mass: low noise through a lowpass, dying fast. */
export function thud(out: Float32Array, at: number, cutoff: number, decay: number, seed: number, gain: number): void {
  const lp = new Lowpass(0.8);
  const r = noise(seed);
  add(out, at, decay * 6, (t) => lp.run(r(), cutoff) * Math.exp(-t / decay) * gain);
}
