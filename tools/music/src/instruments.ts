import type { Note } from './midi';
import { addPanned, adsr, Highpass, hz, Lowpass, noise, pulse, SAMPLE_RATE, saw, Stereo } from './synth';

/**
 * The instruments of the remastered score. Each renders one note into a stereo bus.
 * `at` is the start in seconds, `dur` the held length in seconds.
 */
export type Instrument = (out: Stereo, note: Note, at: number, dur: number) => void;

const cents = (c: number) => 2 ** (c / 1200);

function span(out: Stereo, at: number, seconds: number): [number, number] {
  const i0 = Math.max(0, Math.round(at * SAMPLE_RATE));
  return [i0, Math.min(out.length, i0 + Math.ceil(seconds * SAMPLE_RATE))];
}

/** Lead: two detuned saws and a square an octave down through a lowpass that opens on each note, with vibrato. */
export function lead(opts: { pan?: number; gain?: number; octave?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 0.18;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch + 12 * (opts.octave ?? 0));
    const lp = new Lowpass(1.2);
    const ph = [0, 0.33, 0.61];
    const g = (opts.gain ?? 0.22) * (0.6 + 0.4 * note.velocity);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const vib = 1 + (t > 0.18 ? 0.006 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, (t - 0.18) * 4) : 0);
      const incs = [(f * vib * cents(-7)) / SAMPLE_RATE, (f * vib * cents(7)) / SAMPLE_RATE, (f * vib * 0.5) / SAMPLE_RATE];
      let v = 0;
      for (let k = 0; k < 3; k++) {
        ph[k]! += incs[k]!;
        if (ph[k]! >= 1) ph[k]! -= 1;
        v += k < 2 ? saw(ph[k]!, incs[k]!) * 0.5 : pulse(ph[k]!, incs[k]!, 0.5) * 0.25;
      }
      const cutoff = 1500 + 3200 * Math.exp(-t * 6) + f * 1.5;
      v = lp.run(v, cutoff) * adsr(t, dur, 0.008, 0.25, 0.7, rel) * g;
      addPanned(out, i, v, opts.pan ?? 0);
    }
  };
}

/** Counter-melody: a soft narrow pulse, a little behind the lead and to the right. */
export function reed(opts: { pan?: number; gain?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 0.15;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch);
    const lp = new Lowpass(0.9);
    let ph = 0;
    const g = (opts.gain ?? 0.16) * (0.6 + 0.4 * note.velocity);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const inc = (f * (1 + 0.004 * Math.sin(2 * Math.PI * 4.8 * t))) / SAMPLE_RATE;
      ph += inc;
      if (ph >= 1) ph -= 1;
      const v = lp.run(pulse(ph, inc, 0.3), 2200) * adsr(t, dur, 0.04, 0.2, 0.8, rel) * g;
      addPanned(out, i, v, opts.pan ?? 0.35);
    }
  };
}

/** Bass: sine body plus a filtered saw for bite, short and punchy. */
export function bass(opts: { gain?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 0.07;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch);
    const lp = new Lowpass(1.4);
    let ph = 0;
    let sph = 0;
    const g = (opts.gain ?? 0.34) * (0.7 + 0.3 * note.velocity);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const inc = f / SAMPLE_RATE;
      ph += inc;
      if (ph >= 1) ph -= 1;
      sph += inc;
      const body = Math.sin(2 * Math.PI * sph);
      const bite = lp.run(saw(ph, inc), 300 + 1400 * Math.exp(-t * 18));
      const v = (body * 0.7 + bite * 0.45) * adsr(t, dur, 0.004, 0.18, 0.65, rel) * g;
      addPanned(out, i, v, 0);
    }
  };
}

/** Strings pad: three detuned saws per note, slow attack and long release, spread in stereo. */
export function pad(opts: { gain?: number } = {}): Instrument {
  return (out, note, at, dur) => {
    const rel = 0.9;
    const [i0, i1] = span(out, at, dur + rel);
    const f = hz(note.pitch);
    const detune = [-11, 0, 9];
    const pans = [-0.6, 0, 0.6];
    const ph = [0.1, 0.5, 0.8];
    const lps = detune.map(() => new Lowpass(0.7));
    const g = (opts.gain ?? 0.07) * (0.6 + 0.4 * note.velocity);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SAMPLE_RATE;
      const env = adsr(t, dur, 0.35, 0.5, 0.85, rel) * g;
      for (let k = 0; k < 3; k++) {
        const inc = (f * cents(detune[k]!)) / SAMPLE_RATE;
        ph[k]! += inc;
        if (ph[k]! >= 1) ph[k]! -= 1;
        addPanned(out, i, lps[k]!.run(saw(ph[k]!, inc), 1300 + 400 * Math.sin(t * 1.3)) * env, pans[k]!);
      }
    }
  };
}

/** General MIDI drum kit as heard in the original: kick 35/36, snare 38/40, hats 42/44/46, cymbals 49/52/57. */
export function drums(opts: { gain?: number; seed?: number } = {}): Instrument {
  const rnd = noise(opts.seed ?? 7);
  return (out, note, at) => {
    const g = (opts.gain ?? 0.5) * (0.5 + 0.5 * note.velocity);
    const p = note.pitch;
    if (p === 35 || p === 36) {
      const [i0, i1] = span(out, at, 0.45);
      let ph = 0;
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SAMPLE_RATE;
        ph += (45 + 110 * Math.exp(-t * 28)) / SAMPLE_RATE;
        const click = t < 0.004 ? rnd() * 0.5 : 0;
        addPanned(out, i, (Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9) + click) * g * 1.1, 0);
      }
    } else if (p === 38 || p === 40) {
      const [i0, i1] = span(out, at, 0.3);
      const lp = new Lowpass(0.8);
      const hp = new Highpass(0.9);
      let ph = 0;
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SAMPLE_RATE;
        ph += (185 + 40 * Math.exp(-t * 40)) / SAMPLE_RATE;
        const tone = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 30) * 0.5;
        const snap = lp.run(hp.run(rnd()), 6500) * Math.exp(-t * 16);
        addPanned(out, i, (tone + snap) * g * 0.75, -0.05);
      }
    } else if (p === 42 || p === 44 || p === 46) {
      const open = p === 46;
      const [i0, i1] = span(out, at, open ? 0.35 : 0.08);
      const hp = new Highpass(0.6);
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SAMPLE_RATE;
        addPanned(out, i, hp.run(rnd()) * Math.exp(-t * (open ? 9 : 60)) * g * 0.28, 0.3);
      }
    } else {
      // Crash / china: long bright noise.
      const [i0, i1] = span(out, at, 1.6);
      const hp = new Highpass(0.75);
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SAMPLE_RATE;
        addPanned(out, i, hp.run(rnd()) * Math.exp(-t * 2.6) * g * 0.22, -0.3);
      }
    }
  };
}
