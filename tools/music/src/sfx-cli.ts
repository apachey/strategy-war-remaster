import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pcm16 } from './effects';
import { SFX } from './sfx';
import { SAMPLE_RATE } from './synth';

/**
 * pnpm sfx [--out dir] [--only name]
 *
 * Renders the sound effects of src/sfx.ts into assets/sfx as 16-bit 44.1 kHz WAV (short effects need
 * sample-accurate starts, and the macOS web view plays WAV) and writes sfx.json with each name, length, channel
 * count, suggested gain and description. Prints peak, RMS and spectral centroid so the sounds can be checked
 * without listening.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const outDir = resolve(repo, arg('out') ?? 'assets/sfx');

interface Entry {
  name: string;
  seconds: number;
  channels: number;
  gain: number;
  description: string;
}

/** In-place radix-2 FFT of a real frame; returns magnitudes of the first half. */
function magnitudes(frame: Float32Array): Float64Array {
  const n = frame.length;
  const re = Float64Array.from(frame);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j]!, re[i]!];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k);
        const wi = Math.sin(a * k);
        const xr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi;
        const xi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
        re[i + k + len / 2] = re[i + k]! - xr;
        im[i + k + len / 2] = im[i + k]! - xi;
        re[i + k]! += xr;
        im[i + k]! += xi;
      }
    }
  }
  const m = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) m[k] = Math.hypot(re[k]!, im[k]!);
  return m;
}

/** Energy-weighted spectral centroid in Hz over Hann-windowed 2048-sample frames. */
export function centroid(x: Float32Array): number {
  const n = 2048;
  let num = 0;
  let den = 0;
  for (let s = 0; s + n <= Math.max(x.length, n); s += n / 2) {
    const frame = new Float32Array(n);
    for (let i = 0; i < n && s + i < x.length; i++) frame[i] = x[s + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    const m = magnitudes(frame);
    for (let k = 1; k < m.length; k++) {
      const e = m[k]! * m[k]!;
      num += e * ((k * SAMPLE_RATE) / n);
      den += e;
    }
  }
  return den ? num / den : 0;
}

const db = (x: number) => (20 * Math.log10(x)).toFixed(1);

function main(): void {
  const only = arg('only');
  if (only && !SFX.some((s) => s.name === only)) {
    console.error(`No effect named ${only}. Known: ${SFX.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const indexPath = join(outDir, 'sfx.json');
  // With --only, keep the other entries of an existing index.
  let index: Entry[] = [];
  if (only) {
    try {
      index = JSON.parse(readFileSync(indexPath, 'utf8')) as Entry[];
    } catch {
      index = [];
    }
  }
  for (const s of SFX) {
    if (only && only !== s.name) continue;
    const channels = s.render();
    writeFileSync(join(outDir, `${s.name}.wav`), pcm16(channels));
    const mono = channels.length === 1 ? channels[0]! : channels[0]!.map((v, i) => (v + channels[1]![i]!) / 2);
    let peak = 0;
    let sum = 0;
    for (const c of channels) for (const v of c) (peak = Math.max(peak, Math.abs(v))), (sum += v * v);
    const rms = Math.sqrt(sum / (mono.length * channels.length));
    const seconds = Math.round((mono.length / SAMPLE_RATE) * 1000) / 1000;
    const entry: Entry = { name: s.name, seconds, channels: channels.length, gain: s.gain, description: s.description };
    const at = index.findIndex((e) => e.name === s.name);
    if (at >= 0) index[at] = entry;
    else index.push(entry);
    console.log(
      `${s.name.padEnd(16)} ${seconds.toFixed(3)} s  ${channels.length === 1 ? 'mono  ' : 'stereo'}  peak ${db(peak)} dB  rms ${db(rms)} dB  centroid ${Math.round(centroid(mono))} Hz`,
    );
  }
  const order = SFX.map((s) => s.name);
  index.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

main();
