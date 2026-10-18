import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { master, mixInto, pingPong, reverb, wav } from './effects';
import { braam, darkPad, drone, lowStrings, throat, wail, warDrums, wind } from './instruments';
import { parseMidi, type Note, type Song } from './midi';
import { SAMPLE_RATE, Stereo } from './synth';
import { battle, battle2, battle3, defeatTrack, tension, tension2, tension3, victoryTrack, type Arrangement, type Part } from './tracks';

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

/** The original plays at 150 bpm; the dark arrangement takes it this much slower (about 100 bpm). */
const SLOWER = 1.5;
/** Beats of desert before the tune starts. */
const INTRO = 16;
/** Beats of the original tune the theme keeps: its opening phrase, before it leaves D minor. */
const PHRASE = 16;

const later = (notes: Note[], by: number) => notes.map((n) => ({ ...n, start: n.start + by }));

/** Maps the original's General MIDI tracks onto the dark palette (channel 10 is drums). */
function partsFor(song: Song): Part[] {
  const parts: Part[] = [];
  for (const t of song.tracks) {
    if (!t.notes.length) continue;
    const prog = t.program ?? 0;
    // The original doubles some notes with zero-length copies; they only click.
    const notes = later(
      t.notes.filter((n) => n.length > 0.01),
      INTRO,
    );
    if (notes[0]!.channel === 9) parts.push({ instrument: warDrums({ seed: 3 }), notes, reverb: 0.25 });
    else if (prog >= 32 && prog < 40) parts.push({ instrument: lowStrings({ gain: 0.24 }), notes, reverb: 0.1 });
    else if (prog >= 40 && prog < 56) parts.push({ instrument: darkPad({ gain: 0.06 }), notes: notes.map((n) => ({ ...n, pitch: n.pitch - 12 })), reverb: 0.5 });
    // The oboe's counter-line becomes a second, lower voice.
    else if (prog === 68 || prog === 69) parts.push({ instrument: wail({ gain: 0.13, pan: 0.35, octave: -1 }), notes, reverb: 0.5, delay: 0.15 });
    else parts.push({ instrument: wail({ gain: 0.32, pan: -0.1 }), notes, reverb: 0.45, delay: 0.2 });
  }
  return parts;
}

/**
 * Main theme: the wind and a drone on D with the throat singer and a slow brass swell, taiko calling in the dark;
 * then the original tune's opening phrase four times, building up, sung by the wailing voice over war drums and low strings, about
 * two thirds of its old speed; it closes with an Eb to D brass cadence (Phrygian, the sound of the desert) and a last boom.
 */
function mainTheme(original: Song): Arrangement {
  const spb = (original.tempo / 1e6) * SLOWER;
  // Only the tune's opening D minor phrase (16 beats), four times, building up: the original modulates after it (to F
  // minor at beat 20, C major at 32), which Pavlo found off-mood. Bass joins on the second pass, drums on the third.
  const song: Song = {
    ...original,
    tracks: original.tracks.map((t) => {
      const bass = (t.program ?? 0) >= 32 && (t.program ?? 0) < 40;
      const notes = t.notes.filter((n) => n.start < PHRASE - 0.01);
      const from = notes[0]?.channel === 9 ? 2 : bass ? 1 : 0;
      return { ...t, notes: [0, 1, 2, 3].filter((k) => k >= from).flatMap((k) => notes.map((n) => ({ ...n, start: n.start + k * PHRASE }))) };
    }),
  };

  const len = Math.ceil(Math.max(...song.tracks.flatMap((t) => t.notes.map((n) => n.start + n.length))) / 4) * 4;
  const end = INTRO + len;
  const hit = (start: number, pitch: number, velocity = 0.9): Note => ({ start, length: 1, pitch, velocity, channel: 9 });
  const note = (start: number, length: number, pitch: number, velocity = 0.9): Note => ({ start, length, pitch, velocity, channel: 0 });
  const parts: Part[] = [
    { instrument: wind({ gain: 0.16, seed: 6 }), notes: [note(0, end + 12, 0, 1)], reverb: 0.3 },
    { instrument: drone({ gain: 0.18 }), notes: [note(0, INTRO + 2, 26), note(end, 12, 26)], reverb: 0.2 },
    { instrument: throat({ gain: 0.2 }), notes: [note(2, 6, 38), note(8, 4, 39, 0.8), note(12, 5, 38), note(end + 2, 8, 38, 0.8)], reverb: 0.5 },
    { instrument: braam({ gain: 0.17 }), notes: [note(8, 7, 38), note(8, 7, 45), note(end, 4, 39), note(end, 4, 46), note(end + 4, 8, 38), note(end + 4, 8, 45)], reverb: 0.45 },
    { instrument: warDrums({ seed: 8 }), notes: [hit(0, 49, 0.7), hit(6, 36, 0.8), hit(8, 49), hit(12, 36, 0.8), hit(13.5, 36, 0.7), hit(14, 43, 0.7), hit(14.5, 43, 0.8), hit(15, 45, 0.9), hit(15.5, 45, 1), hit(end + 4, 49, 1), hit(end + 4, 36, 1)], reverb: 0.3 },
    ...partsFor(song),
  ];
  return { parts, beats: end + 12, spb, loop: false };
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
    ['tension-2', tension2],
    ['tension-3', tension3],
    ['battle-2', battle2],
    ['battle-3', battle3],
    ['victory', victoryTrack],
    ['defeat', defeatTrack],
  ];
  mkdirSync(outDir, { recursive: true });
  for (const [name, make] of jobs) {
    if (only && only !== name) continue;
    const a = make();
    encode(name, render(a), a.loop);
  }
}

main();
