import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { master, mixInto, pingPong, reverb, wav } from './effects';
import { bass, drums, lead, pad, reed } from './instruments';
import { parseMidi, type Note, type Song } from './midi';
import { SAMPLE_RATE, Stereo } from './synth';
import { battle, tension, type Arrangement, type Part } from './tracks';

/**
 * pnpm music [--midi path/to/intro.mid] [--out dir] [--only name]
 *
 * Renders the remaster's music into assets/music: main-theme (a new arrangement of the original intro tune) and the
 * looping in-game tracks battle and tension written in src/tracks.ts. Output is .m4a (AAC plays everywhere,
 * including the macOS web view) at -16 LUFS. The original MIDI is not in the repo (see CLAUDE.md); by default it is
 * read from the project files.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const midiPath = arg('midi') ?? '/mnt/project-files/strategy-war/original/assets/G_8280/intro.mid';
const outDir = resolve(repo, arg('out') ?? 'assets/music');

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
function mainTheme(song: Song): Arrangement {
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
  return { parts, beats: end + 6, spb, loop: false };
}

function render({ parts, beats, spb, loop }: Arrangement): Stereo {
  const body = Math.round(beats * spb * SAMPLE_RATE);
  const length = body + 4 * SAMPLE_RATE;
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
  if (!loop) return master(dry);
  // Fold everything that rings past the loop point back onto the start, so the loop has no gap or click.
  const looped = new Stereo(body);
  for (let i = 0; i < length; i++) {
    looped.l[i % body]! += dry.l[i]!;
    looped.r[i % body]! += dry.r[i]!;
  }
  return master(looped);
}

function encode(name: string, bus: Stereo, loop: boolean): void {
  const wavPath = join(outDir, `${name}.wav`);
  writeFileSync(wavPath, wav(bus));
  const out = join(outDir, `${name}.m4a`);
  // One fixed gain to -16 LUFS for the whole track (no dynamic levelling), so a loop sounds the same when it repeats.
  const report = spawnSync('ffmpeg', ['-hide_banner', '-i', wavPath, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(report.slice(report.lastIndexOf('Summary')))?.[1]);
  if (!Number.isFinite(lufs)) throw new Error(`could not measure loudness of ${name}`);
  const gainDb = Math.min(-16 - lufs, 0);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-af', `volume=${gainDb.toFixed(2)}dB`, '-c:a', 'aac', '-b:a', '192k', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', out]);
  if (!process.argv.includes('--keep-wav')) unlinkSync(wavPath);
  console.log(`${name}.m4a: ${(bus.length / SAMPLE_RATE).toFixed(1)} s${loop ? ', loops' : ''}`);
}

function main(): void {
  const only = arg('only');
  const jobs: [string, () => Arrangement][] = [
    ['main-theme', () => {
      if (!existsSync(midiPath)) {
        console.error(`Original intro MIDI not found at ${midiPath}. Pass --midi <path>; it lives in the project files, not the repo.`);
        process.exit(1);
      }
      return mainTheme(parseMidi(readFileSync(midiPath)));
    }],
    ['battle', battle],
    ['tension', tension],
  ];
  mkdirSync(outDir, { recursive: true });
  for (const [name, make] of jobs) {
    if (only && only !== name) continue;
    const a = make();
    encode(name, render(a), a.loop);
  }
}

main();
