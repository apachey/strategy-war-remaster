import type { Note } from './midi';

/**
 * A tiny notation for writing parts by hand: space-separated `pitch:beats` tokens, `r:beats` for rests and
 * `D4+F4+A4:2` for chords. Pitches use scientific names (C4 = MIDI 60) with # or b.
 */

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitch(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad pitch ${name}`);
  return 12 * (Number(m[3]) + 1) + STEPS[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Parses a line of notation starting at `start` beats; `legato` < 1 shortens each note (0.9 = slightly detached). */
export function line(text: string, start = 0, velocity = 0.85, legato = 0.92): Note[] {
  const notes: Note[] = [];
  let t = start;
  for (const token of text.trim().split(/\s+/)) {
    const [what, len] = token.split(':');
    const beats = Number(len ?? 1);
    if (!Number.isFinite(beats) || beats <= 0) throw new Error(`bad length in ${token}`);
    if (what !== 'r') {
      for (const p of what!.split('+')) notes.push({ start: t, length: beats * legato, pitch: pitch(p), velocity, channel: 0 });
    }
    t += beats;
  }
  return notes;
}

/** Total length in beats of a line of notation. */
export const beatsOf = (text: string) => text.trim().split(/\s+/).reduce((s, tok) => s + Number(tok.split(':')[1] ?? 1), 0);

/** Repeats notes every `period` beats, `times` times. */
export function repeat(notes: Note[], period: number, times: number): Note[] {
  const out: Note[] = [];
  for (let k = 0; k < times; k++) for (const n of notes) out.push({ ...n, start: n.start + k * period });
  return out;
}

export const shift = (notes: Note[], beats: number, semitones = 0): Note[] =>
  notes.map((n) => ({ ...n, start: n.start + beats, pitch: n.pitch + semitones }));

/** Drum hits from a step pattern: one character per step, `x` hit, `X` accent, anything else silence. */
export function steps(pattern: string, drum: number, start = 0, stepBeats = 0.25): Note[] {
  const notes: Note[] = [];
  [...pattern.replace(/\s+/g, '')].forEach((c, i) => {
    if (c === 'x' || c === 'X') notes.push({ start: start + i * stepBeats, length: stepBeats, pitch: drum, velocity: c === 'X' ? 1 : 0.7, channel: 9 });
  });
  return notes;
}
