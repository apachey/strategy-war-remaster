/**
 * Small offline synthesiser: every voice is computed sample by sample into stereo float buffers. No randomness
 * except a seeded noise generator, so a render is byte-identical every time.
 */

export const SAMPLE_RATE = 44100;

export class Stereo {
  readonly l: Float32Array;
  readonly r: Float32Array;
  constructor(readonly length: number) {
    this.l = new Float32Array(length);
    this.r = new Float32Array(length);
  }
}

export const hz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);

export function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Attack, decay, sustain level, release, in seconds. Returns gain at time t for a note held `held` seconds. */
export function adsr(t: number, held: number, a: number, d: number, s: number, r: number): number {
  const on = (x: number) => (x < a ? x / a : x < a + d ? 1 - ((x - a) / d) * (1 - s) : s);
  if (t < held) return on(t);
  const rel = t - held;
  return rel >= r ? 0 : on(held) * (1 - rel / r);
}

/** Chamberlin state-variable filter, lowpass output; cutoff in Hz, q about 0.5..4. */
export class Lowpass {
  private low = 0;
  private band = 0;
  constructor(private q = 0.8) {}
  run(x: number, cutoff: number): number {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff, SAMPLE_RATE / 6)) / SAMPLE_RATE);
    this.low += f * this.band;
    const high = x - this.low - this.band / this.q;
    this.band += f * high;
    return this.low;
  }
}

/** One-pole highpass for hats and clicks. */
export class Highpass {
  private prevIn = 0;
  private prevOut = 0;
  constructor(private readonly k = 0.95) {}
  run(x: number): number {
    this.prevOut = this.k * (this.prevOut + x - this.prevIn);
    this.prevIn = x;
    return this.prevOut;
  }
}

/** Band-limited enough saw for our purposes: naive saw with a 2-sample polyBLEP. */
export function saw(phase: number, inc: number): number {
  let v = 2 * phase - 1;
  if (phase < inc) {
    const t = phase / inc;
    v -= t + t - t * t - 1;
  } else if (phase > 1 - inc) {
    const t = (phase - 1) / inc;
    v -= t * t + t + t + 1;
  }
  return v;
}

export function pulse(phase: number, inc: number, width: number): number {
  let p2 = phase + (1 - width);
  if (p2 >= 1) p2 -= 1;
  return saw(phase, inc) - saw(p2, inc);
}

/** Adds a mono signal into a stereo buffer with constant-power panning (-1 left .. 1 right). */
export function addPanned(out: Stereo, i: number, v: number, pan: number): void {
  const a = ((pan + 1) * Math.PI) / 4;
  out.l[i]! += v * Math.cos(a);
  out.r[i]! += v * Math.sin(a);
}
