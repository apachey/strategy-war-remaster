import { braam, darkPad, drone, lowStrings, throat, wail, warDrums, wind, type Instrument } from './instruments';
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

/** War drum keys (see warDrums). */
const TAIKO = 36;
const MID_LOW = 41;
const MID = 43;
const MID_HIGH = 45;
const CRACK = 38;
const SHAKER = 42;
const METAL = 54;
const BOOM = 49;

const hit = (start: number, pitch: number, velocity = 0.9): Note => ({ start, length: 1, pitch, velocity, channel: 9 });

/** Drums for one bar of 16 steps. */
function bar(start: number, p: Partial<Record<'taiko' | 'mid' | 'high' | 'crack' | 'shaker', string>>): Note[] {
  return [
    ...(p.taiko ? steps(p.taiko, TAIKO, start) : []),
    ...(p.mid ? steps(p.mid, MID, start) : []),
    ...(p.high ? steps(p.high, MID_HIGH, start) : []),
    ...(p.crack ? steps(p.crack, CRACK, start) : []),
    ...(p.shaker ? steps(p.shaker, SHAKER, start) : []),
  ];
}

/** A stretch of wind, one note for the whole track. */
const gale = (beats: number, velocity = 1): Note[] => [{ start: 0, length: beats, pitch: 0, velocity, channel: 0 }];

/**
 * Battle: D Phrygian (the flat second, Eb, gives the desert its menace) at 116 bpm, 32 bars that loop. Dm, Eb, Dm,
 * C two bars each over a driven low-string ostinato. Bars 1-8 are strings and taiko, 9-16 add brass swells and the
 * throat singer, 17-24 bring the wailing tune over the full war drums, 25-32 drop to drone, wind and a lower
 * answer before the drums climb back into the loop.
 */
export function battle(): Arrangement {
  const ostinato = [
    'D2 D2 D3 D2 Eb2 D2 C3 D2',
    'Eb2 Eb2 Eb3 Eb2 F2 Eb2 D3 Eb2',
    'D2 D2 D3 D2 Eb2 D2 A2 D2',
    'C2 C2 C3 C2 D2 C2 Bb2 C2',
  ];
  const swells = ['D2+A2', 'Eb2+Bb2', 'D2+A2', 'C2+G2'];
  const pads = ['D3+F3+A3', 'Eb3+G3+Bb3', 'D3+F3+A3', 'C3+Eb3+G3'];

  const strings: Note[] = [];
  const brass: Note[] = [];
  const padNotes: Note[] = [];
  const kit: Note[] = [];
  for (let b = 0; b < 32; b++) {
    const c = Math.floor(b / 2) % 4;
    const at = b * 4;
    const breakdown = b >= 24;
    if (!breakdown) {
      strings.push(...line(ostinato[c]!.split(' ').map((p) => `${p}:.5`).join(' '), at, b % 2 ? 0.8 : 0.95, 0.75));
    } else if (b % 2 === 0) {
      strings.push(...line(`${ostinato[c]!.split(' ')[0]}:8`, at, 0.7, 0.95));
    }
    if (b % 2 === 0 && b >= 8) brass.push(...line(`${swells[c]}:6`, at, breakdown ? 0.6 : 0.9, 1));
    if (b % 2 === 0) padNotes.push(...line(`${pads[c]}:8`, at, 0.7, 1));

    const fill = b % 8 === 7;
    if (b < 4) kit.push(...bar(at, { taiko: 'x.....x.........' }));
    else if (breakdown) {
      kit.push(...bar(at, { taiko: b % 2 ? '........x.......' : 'x...............' }));
      if (b === 30) kit.push(...bar(at, { mid: '........x.x.x.xx' }));
      if (b === 31) kit.push(...bar(at, { taiko: 'x.......', mid: '....x.x.x.xxxxxx', high: '............x.xx' }));
    } else {
      kit.push(
        ...bar(at, {
          taiko: 'x..x..x.x.....x.',
          mid: fill ? '....x.x.x.xxx.xx' : '....x.......x.x.',
          high: fill ? '............x.xx' : undefined,
          crack: b >= 8 ? '....x.......x...' : undefined,
          shaker: b >= 16 ? '..x...x...x...x.' : undefined,
        }),
      );
    }
    if (b % 8 === 0) kit.push(hit(at, BOOM, b === 0 ? 0.8 : 1));
    if (b % 4 === 3 && !breakdown) kit.push(hit(at + 3, METAL, 0.7));
  }

  const tune = line(
    `D5:2 Eb5:1 D5:1 C5:1.5 Bb4:.5 A4:2
     Bb4:1 C5:1 D5:1.5 Eb5:.5 G5:2 F5:1 Eb5:1
     D5:3 C5:.5 Bb4:.5 A4:2 F4:1 G4:1
     A4:1 Bb4:1 G4:2 A4:4`,
    0,
    0.9,
    0.97,
  );
  const answer = line('A4:4 Bb4:2 A4:2 G4:4 F4:2 Eb4:2 D4:8 r:8', 96, 0.75, 0.97);
  const throatNotes = [...line('D2:16 Eb2:8 D2:8', 32, 0.8, 1), ...line('D2:24 r:8', 96, 0.7, 1)];
  return {
    spb: 60 / 116,
    beats: 128,
    loop: true,
    parts: [
      { instrument: warDrums({ seed: 11 }), notes: kit, reverb: 0.22 },
      { instrument: lowStrings({ gain: 0.26 }), notes: strings, reverb: 0.12 },
      { instrument: braam({ gain: 0.16 }), notes: brass, reverb: 0.4 },
      { instrument: darkPad({ gain: 0.05 }), notes: padNotes, reverb: 0.5 },
      { instrument: throat({ gain: 0.16, pan: -0.15 }), notes: throatNotes, reverb: 0.45 },
      { instrument: drone({ gain: 0.14 }), notes: line('D1:32', 96, 0.9, 1), reverb: 0.2 },
      { instrument: wail({ gain: 0.34, pan: 0.1 }), notes: shift(tune, 64), reverb: 0.5, delay: 0.18 },
      { instrument: wail({ gain: 0.26, pan: -0.1 }), notes: answer, reverb: 0.6, delay: 0.25 },
      { instrument: wind({ gain: 0.1, seed: 4 }), notes: gale(128), reverb: 0.3 },
    ],
  };
}

/**
 * Tension: scouting under the fog of war. D Phrygian at 66 bpm, 16 bars that loop: a drone and the wind, the throat
 * singer leaning on Eb against the D, a far-off taiko like a heartbeat, struck metal, and two fragments of the wail.
 */
export function tension(): Arrangement {
  const kit: Note[] = [];
  for (let b = 0; b < 16; b++) {
    const at = b * 4;
    if (b % 2 === 0) kit.push(hit(at, TAIKO, 0.75));
    if (b >= 4) kit.push(...steps(b % 2 ? '........x..x....' : 'x..x............', MID_LOW, at).map((n) => ({ ...n, velocity: 0.45 })));
    if (b % 4 === 2) kit.push(hit(at + 1, METAL, 0.6));
    if (b === 15) kit.push(hit(at + 2, BOOM, 0.7));
  }
  const fragments = [...line('Eb5:3 D5:5 A4:2 Bb4:1 A4:3 G4:2', 16, 0.8, 0.97), ...line('F4:2 G4:1 A4:5 Bb4:3 A4:1 D4:4', 48, 0.75, 0.97)];
  return {
    spb: 60 / 66,
    beats: 64,
    loop: true,
    parts: [
      { instrument: drone({ gain: 0.18 }), notes: line('D1:64', 0, 1, 1), reverb: 0.2 },
      { instrument: wind({ gain: 0.18, seed: 2 }), notes: gale(64), reverb: 0.35 },
      { instrument: throat({ gain: 0.2 }), notes: line('D2:16 Eb2:8 D2:8 D2:16 C2:8 D2:8', 0, 0.85, 1), reverb: 0.5 },
      { instrument: darkPad({ gain: 0.045 }), notes: repeat(line('D3+F3+A3:16 Eb3+G3+Bb3:8 D3+F3+A3:8', 0, 0.6, 1), 32, 2), reverb: 0.6 },
      { instrument: warDrums({ seed: 5, gain: 0.42 }), notes: kit, reverb: 0.45 },
      { instrument: wail({ gain: 0.26, pan: 0.15 }), notes: fragments, reverb: 0.65, delay: 0.3 },
    ],
  };
}
