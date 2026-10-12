import { bass, drums, lead, pad, reed, type Instrument } from './instruments';
import type { Note } from './midi';
import { line, repeat, shift, steps } from './score';

/** One instrument's notes plus how much of it goes to the reverb and delay. */
export interface Part {
  instrument: Instrument;
  notes: Note[];
  reverb: number;
  delay?: number;
  gain?: number;
}

export interface Arrangement {
  parts: Part[];
  beats: number;
  /** Seconds per beat. */
  spb: number;
  /** Loops seamlessly: the reverb tail past the end is folded back onto the start. */
  loop: boolean;
}

const KICK = 36;
const SNARE = 38;
const HAT = 42;
const OPEN_HAT = 46;
const CRASH = 49;

/** Drums for one bar of 16 steps. */
function bar(start: number, p: { kick?: string; snare?: string; hat?: string; open?: string }): Note[] {
  return [
    ...(p.kick ? steps(p.kick, KICK, start) : []),
    ...(p.snare ? steps(p.snare, SNARE, start) : []),
    ...(p.hat ? steps(p.hat, HAT, start) : []),
    ...(p.open ? steps(p.open, OPEN_HAT, start) : []),
  ];
}

/**
 * Battle: D minor at 144 bpm, 32 bars that loop. Dm, Bb, C, A two bars each. Bars 1-8 build on bass and drums,
 * 9-16 bring the lead tune, 17-24 repeat it over sixteenth-note arpeggios, 25-32 drop to half-time before the loop.
 */
export function battle(): Arrangement {
  const roots = ['D2', 'Bb1', 'C2', 'A1'];
  const fifths = ['A2', 'F2', 'G2', 'E2'];
  const chords = ['D4+F4+A4', 'D4+F4+Bb4', 'C4+E4+G4', 'C#4+E4+A4'];
  const arps = [
    ['D4', 'F4', 'A4', 'D5'],
    ['Bb3', 'D4', 'F4', 'Bb4'],
    ['C4', 'E4', 'G4', 'C5'],
    ['A3', 'C#4', 'E4', 'A4'],
  ];
  const up = (p: string) => p.replace(/\d$/, (d) => String(Number(d) + 1));

  const bassNotes: Note[] = [];
  const padNotes: Note[] = [];
  const arpNotes: Note[] = [];
  const kit: Note[] = [];
  for (let b = 0; b < 32; b++) {
    const c = Math.floor(b / 2) % 4;
    const at = b * 4;
    const r = roots[c]!;
    const half = b >= 24;
    bassNotes.push(...(half ? line(`${r}:2 ${up(r)}:1 ${r}:1`, at, 0.9, 0.8) : line(`${r}:.5 ${r}:.5 ${up(r)}:.5 ${r}:.5 ${r}:.5 ${fifths[c]}:.5 ${up(r)}:.5 ${r}:.5`, at, 0.9, 0.7)));
    if (b % 2 === 0) padNotes.push(...line(`${chords[c]}:8`, at, 0.8, 1));
    if (b >= 16) arpNotes.push(...line(Array.from({ length: 16 }, (_, i) => `${arps[c]![i % 4]}:.25`).join(' '), at, b >= 24 ? 0.75 : 0.6, 0.8));
    const fill = b % 8 === 7;
    if (half) kit.push(...bar(at, { kick: 'x.......x.......', snare: fill ? '........x.x.xxxx' : '........x.......', hat: 'x...x...x...x...' }));
    else
      kit.push(
        ...bar(at, {
          kick: 'x.....x.x.......',
          snare: b < 4 ? undefined : fill ? '....x.......xxxx' : '....x.......x...',
          hat: 'x.x.x.x.x.x.x.x.',
          open: '..............x.',
        }),
      );
    if (b % 8 === 0) kit.push({ start: at, length: 1, pitch: CRASH, velocity: 0.9, channel: 9 });
  }

  const tune = line(
    `D5:1 F5:.5 A5:.5 G5:1 F5:1  E5:.5 F5:.5 E5:.5 D5:.5 C5:2
     D5:1 F5:.5 Bb5:.5 A5:1 G5:1  F5:.5 G5:.5 F5:.5 D5:.5 F5:2
     E5:1 G5:.5 C6:.5 Bb5:1 A5:1  G5:.5 A5:.5 G5:.5 E5:.5 C5:2
     C#5:1 E5:1 A5:1 G5:.5 F5:.5  E5:3 r:1`,
    0,
    0.9,
    0.9,
  );
  return {
    spb: 60 / 144,
    beats: 128,
    loop: true,
    parts: [
      { instrument: drums({ seed: 11 }), notes: kit, reverb: 0.1 },
      { instrument: bass({ gain: 0.3 }), notes: bassNotes, reverb: 0.02 },
      { instrument: pad({ gain: 0.06 }), notes: padNotes, reverb: 0.5 },
      { instrument: lead({ gain: 0.2 }), notes: [...shift(tune, 32), ...shift(tune, 64)], reverb: 0.22, delay: 0.2 },
      { instrument: reed({ gain: 0.09, pan: 0.4 }), notes: arpNotes, reverb: 0.3, delay: 0.15 },
    ],
  };
}

/**
 * Tension: D minor at 96 bpm, 16 bars that loop, for scouting under the fog of war. Dm, Gm, Dm, A two bars each;
 * a lone reed melody first, the lead answers an octave higher in the second half while a rim click joins.
 */
export function tension(): Arrangement {
  const roots = ['D2', 'G1', 'D2', 'A1'];
  const chords = ['D4+F4+A4', 'D4+G4+Bb4', 'D4+F4+A4', 'C#4+E4+A4'];
  const bassNotes: Note[] = [];
  const padNotes: Note[] = [];
  const kit: Note[] = [];
  for (let b = 0; b < 16; b++) {
    const c = Math.floor(b / 2) % 4;
    const at = b * 4;
    bassNotes.push(...line(`${roots[c]}:1 ${roots[c]}:1 ${roots[c]}:1 ${roots[c]}:1`, at, b % 2 ? 0.6 : 0.8, 0.45));
    if (b % 2 === 0) padNotes.push(...line(`${chords[c]}:8`, at, 0.7, 1));
    kit.push(...bar(at, { kick: 'x.......x.......', hat: '..x...x...x...x.', snare: b >= 8 ? '........x.......' : undefined }));
  }
  const melody = line('A4:3 Bb4:1 A4:2 G4:1 F4:1 G4:3 A4:1 Bb4:2 A4:2 F4:3 E4:1 D4:2 F4:2 E4:6 r:2', 0, 0.8, 0.95);
  const answer = line('D5:3 E5:1 F5:2 E5:1 D5:1 D5:3 E5:1 F5:2 G5:2 A5:3 G5:1 F5:2 D5:2 C#5:6 r:2', 32, 0.75, 0.95);
  return {
    spb: 60 / 96,
    beats: 64,
    loop: true,
    parts: [
      { instrument: drums({ seed: 5, gain: 0.32 }), notes: kit, reverb: 0.25 },
      { instrument: bass({ gain: 0.26 }), notes: bassNotes, reverb: 0.05 },
      { instrument: pad({ gain: 0.08 }), notes: padNotes, reverb: 0.6 },
      { instrument: reed({ gain: 0.15, pan: 0.2 }), notes: repeat(melody, 32, 2), reverb: 0.4, delay: 0.25 },
      { instrument: lead({ gain: 0.11, pan: -0.2 }), notes: answer, reverb: 0.45, delay: 0.3 },
    ],
  };
}
