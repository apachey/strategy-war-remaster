import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { master, mixInto, pingPong, reverb, wav } from './effects';
import { bass, drums, lead, pad, reed, type Instrument } from './instruments';
import { parseMidi, type Note, type Song } from './midi';
import { SAMPLE_RATE, Stereo } from './synth';

/**
 * pnpm music [--midi path/to/intro.mid] [--out dir]
 *
 * Re-arranges the original intro tune for the remaster and writes assets/music/main-theme.m4a (AAC plays everywhere,
 * including the macOS web view), loudness-normalised to -16 LUFS. The original MIDI is not in the repo (see CLAUDE.md); by default it is read from
 * the project files.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const midiPath = arg('midi') ?? '/mnt/project-files/strategy-war/original/assets/G_8280/intro.mid';
const outDir = resolve(repo, arg('out') ?? 'assets/music');

interface Part {
  instrument: Instrument;
  notes: Note[];
  reverb: number;
  delay?: number;
  gain?: number;
}

/** Picks our instrument for an original track by its General MIDI program (channel 10 is drums). */
function partsFor(song: Song): Part[] {
  const parts: Part[] = [];
  for (const t of song.tracks) {
    if (!t.notes.length) continue;
    const prog = t.program ?? 0;
    if (t.notes[0]!.channel === 9) parts.push({ instrument: drums(), notes: t.notes, reverb: 0.12 });
    else if (prog >= 32 && prog < 40) parts.push({ instrument: bass(), notes: t.notes, reverb: 0.03 });
    else if (prog >= 40 && prog < 56) parts.push({ instrument: pad(), notes: t.notes, reverb: 0.5 });
    else if (prog === 68 || prog === 69) parts.push({ instrument: reed(), notes: t.notes, reverb: 0.3, delay: 0.12 });
    else parts.push({ instrument: lead(), notes: t.notes, reverb: 0.25, delay: 0.22 });
  }
  return parts;
}

/**
 * Main theme: the tune twice (second time with the lead doubled an octave up and a crash on the downbeat), then
 * a held D minor chord to close.
 */
function arrange(song: Song): { parts: Part[]; beats: number; spb: number } {
  const spb = song.tempo / 1e6;
  const base = partsFor(song);
  const len = Math.ceil(Math.max(...song.tracks.flatMap((t) => t.notes.map((n) => n.start + n.length))) / 4) * 4;
  const shift = (notes: Note[], by: number) => notes.map((n) => ({ ...n, start: n.start + by }));
  const parts: Part[] = base.map((p) => ({ ...p, notes: [...p.notes, ...shift(p.notes, len)] }));
  const leadPart = base.find((p) => p.delay === 0.22);
  if (leadPart) parts.push({ instrument: lead({ octave: 1, gain: 0.07, pan: -0.25 }), notes: shift(leadPart.notes, len), reverb: 0.35, delay: 0.2 });
  const end = len * 2;
  const v = 0.9;
  parts.push({ instrument: drums({ seed: 3 }), notes: [{ start: len, length: 1, pitch: 49, velocity: v, channel: 9 }, { start: end, length: 1, pitch: 36, velocity: 1, channel: 9 }, { start: end, length: 1, pitch: 49, velocity: 1, channel: 9 }], reverb: 0.2 });
  parts.push({ instrument: pad({ gain: 0.09 }), notes: [50, 53, 57, 62, 69].map((pitch) => ({ start: end, length: 6, pitch, velocity: v, channel: 0 })), reverb: 0.6 });
  parts.push({ instrument: bass(), notes: [{ start: end, length: 3, pitch: 38, velocity: 1, channel: 0 }], reverb: 0.05 });
  return { parts, beats: end + 6, spb };
}

function render(song: Song): Stereo {
  const { parts, beats, spb } = arrange(song);
  const length = Math.ceil((beats * spb + 3) * SAMPLE_RATE);
  const dry = new Stereo(length);
  const verbSend = new Stereo(length);
  const delaySend = new Stereo(length);
  for (const p of parts) {
    const bus = new Stereo(length);
    for (const n of p.notes) p.instrument(bus, n, n.start * spb, n.length * spb);
    mixInto(dry, bus, p.gain ?? 1);
    mixInto(verbSend, bus, p.reverb);
    if (p.delay) mixInto(delaySend, bus, p.delay);
  }
  const echoes = pingPong(delaySend, spb * 0.75);
  mixInto(dry, echoes, 1);
  mixInto(verbSend, echoes, 0.4);
  mixInto(dry, reverb(verbSend), 1);
  return master(dry);
}

function main(): void {
  if (!existsSync(midiPath)) {
    console.error(`Original intro MIDI not found at ${midiPath}. Pass --midi <path>; it lives in the project files, not the repo.`);
    process.exit(1);
  }
  const song = parseMidi(readFileSync(midiPath));
  const started = Date.now();
  const bus = render(song);
  mkdirSync(outDir, { recursive: true });
  const wavPath = join(outDir, 'main-theme.wav');
  writeFileSync(wavPath, wav(bus));
  const m4a = join(outDir, 'main-theme.m4a');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-c:a', 'aac', '-b:a', '192k', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', m4a]);
  if (!process.argv.includes('--keep-wav')) execFileSync('rm', [wavPath]);
  console.log(`main-theme.m4a: ${(bus.length / SAMPLE_RATE).toFixed(1)} s, rendered in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main();
