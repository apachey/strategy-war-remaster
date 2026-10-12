import { SAMPLE_RATE, Stereo } from './synth';

/** Freeverb-style stereo reverb: 8 damped combs and 4 allpasses per side. Returns the wet signal only. */
export function reverb(input: Stereo, room = 0.82, damp = 0.35): Stereo {
  const scale = SAMPLE_RATE / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => Math.round(n * scale));
  const alls = [556, 441, 341, 225].map((n) => Math.round(n * scale));
  const out = new Stereo(input.length);
  const side = (src: Float32Array, dst: Float32Array, spread: number) => {
    const cb = combs.map((n) => ({ buf: new Float32Array(n + spread), i: 0, store: 0 }));
    const ab = alls.map((n) => ({ buf: new Float32Array(n + spread), i: 0 }));
    for (let s = 0; s < src.length; s++) {
      const x = src[s]! * 0.015;
      let y = 0;
      for (const c of cb) {
        const o = c.buf[c.i]!;
        c.store = o * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      for (const a of ab) {
        const o = a.buf[a.i]!;
        a.buf[a.i] = y + o * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = o - y;
      }
      dst[s] = y;
    }
  };
  side(input.l, out.l, 0);
  side(input.r, out.r, 23);
  return out;
}

/** Ping-pong delay, wet only. */
export function pingPong(input: Stereo, seconds: number, feedback = 0.38, tone = 0.6): Stereo {
  const n = Math.round(seconds * SAMPLE_RATE);
  const out = new Stereo(input.length);
  const bl = new Float32Array(n);
  const br = new Float32Array(n);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < input.length; i++) {
    const j = i % n;
    const dl = bl[j]!;
    const dr = br[j]!;
    lpL += (dl - lpL) * tone;
    lpR += (dr - lpR) * tone;
    bl[j] = (input.l[i]! + input.r[i]!) * 0.5 + lpR * feedback;
    br[j] = lpL * feedback;
    out.l[i] = lpL;
    out.r[i] = lpR;
  }
  return out;
}

export function mixInto(dst: Stereo, src: Stereo, gain: number): void {
  for (let i = 0; i < dst.length; i++) {
    dst.l[i]! += src.l[i]! * gain;
    dst.r[i]! += src.r[i]! * gain;
  }
}

/** Gentle saturation, then normalise the peak to `peakDb` dBFS. */
export function master(bus: Stereo, peakDb = -1): Stereo {
  let peak = 0;
  for (let i = 0; i < bus.length; i++) {
    bus.l[i] = Math.tanh(bus.l[i]! * 1.2);
    bus.r[i] = Math.tanh(bus.r[i]! * 1.2);
    peak = Math.max(peak, Math.abs(bus.l[i]!), Math.abs(bus.r[i]!));
  }
  const g = peak ? 10 ** (peakDb / 20) / peak : 1;
  for (let i = 0; i < bus.length; i++) {
    bus.l[i]! *= g;
    bus.r[i]! *= g;
  }
  return bus;
}

/** 16-bit PCM stereo WAV. */
export function wav(bus: Stereo): Buffer {
  const data = Buffer.alloc(bus.length * 4);
  for (let i = 0; i < bus.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.l[i]!)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.r[i]!)) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
