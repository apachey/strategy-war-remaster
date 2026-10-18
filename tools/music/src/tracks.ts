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

/**
 * The original intro tune's opening phrase (D D E F F G A Bb, then down), made Phrygian with Eb and played at half
 * speed: the motif the 1.1 tracks keep returning to. `second` is its answering phrase, high and leaping.
 */
const MOTIF = 'D4:2 D4:1 Eb4:1 F4:2 F4:1.5 G4:.5 A4:2 Bb4:2 A4:1 G4:1 F4:1 Eb4:1';
const SECOND = 'D5:2 F5:1.5 Eb5:.5 A5:2 Bb5:2 D6:1 A5:1 Bb5:1 G5:1 A5:1 F5:1 G5:1 Eb5:1';

/** Tension 2, "Sand veil": 72 bpm, 16 bars. A plucked low D every beat, i-VI-iv-V pads, the motif on the wail. */
export function tension2(): Arrangement {
  const pluck: Note[] = [];
  const kit: Note[] = [];
  for (let b = 0; b < 16; b++) {
    const at = b * 4;
    for (let k = 0; k < 4; k++) pluck.push(...line(k === 3 && b % 4 === 3 ? 'A1:1' : 'D2:1', at + k, k === 0 ? 0.6 : 0.42, 0.3));
    kit.push(hit(at, TAIKO, b % 4 === 0 ? 0.8 : 0.55));
    if (b >= 8) kit.push(...steps('......x.......x.', SHAKER, at).map((n) => ({ ...n, velocity: 0.35 })));
    if (b % 8 === 7) kit.push(hit(at + 2, METAL, 0.55));
  }
  return {
    spb: 60 / 72,
    beats: 64,
    loop: true,
    parts: [
      { instrument: lowStrings({ gain: 0.2 }), notes: pluck, reverb: 0.25 },
      { instrument: darkPad({ gain: 0.05 }), notes: repeat(line('D3+F3+A3:16 Bb2+D3+F3:16 G2+Bb2+D3:16 A2+C#3+E3:16', 0, 0.6, 1), 64, 1), reverb: 0.6 },
      { instrument: drone({ gain: 0.14 }), notes: line('D1:64', 0, 0.9, 1), reverb: 0.2 },
      { instrument: throat({ gain: 0.16, pan: -0.2 }), notes: line('D2:16 C2:8 D2:8', 32, 0.75, 1), reverb: 0.5 },
      { instrument: wail({ gain: 0.28, pan: 0.15 }), notes: [...line(MOTIF, 16, 0.85, 0.96), ...line('A4:4 G4:2 F4:2 E4:8', 48, 0.7, 0.96)], reverb: 0.6, delay: 0.3 },
      { instrument: warDrums({ seed: 21, gain: 0.45 }), notes: kit, reverb: 0.4 },
      { instrument: wind({ gain: 0.16, seed: 22 }), notes: gale(64), reverb: 0.35 },
    ],
  };
}

/** Tension 3, "Night watch": 60 bpm, 16 bars on A Phrygian. A double heartbeat, A against Bb, the answering phrase. */
export function tension3(): Arrangement {
  const kit: Note[] = [];
  for (let b = 0; b < 16; b++) {
    const at = b * 4;
    kit.push(...steps('x..x............', TAIKO, at).map((n, k) => ({ ...n, velocity: k ? 0.5 : 0.7 })));
    if (b >= 4 && b % 2) kit.push(hit(at + 2.5, MID_LOW, 0.4));
    if (b % 4 === 3) kit.push(hit(at + 3, METAL, 0.5));
  }
  return {
    spb: 1,
    beats: 64,
    loop: true,
    parts: [
      { instrument: drone({ gain: 0.18 }), notes: line('A1:64', 0, 1, 1), reverb: 0.2 },
      { instrument: throat({ gain: 0.18 }), notes: line('A2:12 Bb2:4 A2:16 A2:12 G2:4 A2:16', 0, 0.8, 1), reverb: 0.5 },
      { instrument: darkPad({ gain: 0.045 }), notes: line('A3+C4+E4:12 Bb3+D4+F4:4 A3+C4+E4:16 F3+A3+C4:8 G3+Bb3+D4:8 A3+C4+E4:16', 0, 0.6, 1), reverb: 0.6 },
      { instrument: wail({ gain: 0.24, pan: -0.15 }), notes: [...shift(line(SECOND, 16, 0.8, 0.96), 0, -5), ...shift(line(MOTIF, 44, 0.7, 0.96), 0, -5)], reverb: 0.65, delay: 0.3 },
      { instrument: warDrums({ seed: 31, gain: 0.4 }), notes: kit, reverb: 0.45 },
      { instrument: wind({ gain: 0.2, seed: 32 }), notes: gale(64), reverb: 0.35 },
    ],
  };
}

/** Battle 2, "Raid": 128 bpm, 32 bars. The original bass line driven hard, Dm F C Eb, the whole tune on the wail. */
export function battle2(): Arrangement {
  const ostinato = ['D2 A1 A2 D2 A2 D2 A1 D2', 'F1 F2 C2 F1 C2 F2 C2 F1', 'C2 C3 G2 C2 G2 C3 G2 E2', 'Eb2 Eb3 Bb2 Eb2 Bb2 Eb3 D3 Bb2'];
  const swells = ['D2+A2', 'F2+C3', 'C2+G2', 'Eb2+Bb2'];
  const strings: Note[] = [];
  const brass: Note[] = [];
  const kit: Note[] = [];
  for (let b = 0; b < 32; b++) {
    const c = Math.floor(b / 2) % 4;
    const at = b * 4;
    const breakdown = b >= 24 && b < 30;
    if (!breakdown) strings.push(...line(ostinato[c]!.split(' ').map((p) => `${p}:.5`).join(' '), at, b % 2 ? 0.8 : 0.95, 0.7));
    else if (b % 2 === 0) strings.push(...line(`${ostinato[c]!.split(' ')[0]}:8`, at, 0.7, 0.95));
    if (b % 2 === 0 && b >= 4) brass.push(...line(`${swells[c]}:${breakdown ? 8 : 4}`, at, breakdown ? 0.7 : 0.9, 1));
    const fill = b % 8 === 7;
    if (b < 2) kit.push(...bar(at, { taiko: 'x.......x.......' }));
    else if (breakdown) kit.push(...bar(at, { taiko: 'x.....x.........', mid: b === 29 ? '....x.x.x.x.xxxx' : undefined }));
    else {
      kit.push(
        ...bar(at, {
          taiko: 'x.x...x.x.x...x.',
          mid: fill ? '..x.x.x.x.xxxxxx' : '....x..x....x...',
          high: fill ? '..........x.x.xx' : '..............x.',
          crack: b >= 4 ? '....x.......x...' : undefined,
          shaker: b >= 8 ? 'x.x.x.x.x.x.x.x.' : undefined,
        }),
      );
    }
    if (b % 8 === 0) kit.push(hit(at, BOOM, 1));
    if (b % 2 === 1 && !breakdown) kit.push(hit(at + 3.5, METAL, 0.6));
  }
  return {
    spb: 60 / 128,
    beats: 128,
    loop: true,
    parts: [
      { instrument: warDrums({ seed: 41 }), notes: kit, reverb: 0.2 },
      { instrument: lowStrings({ gain: 0.26 }), notes: strings, reverb: 0.1 },
      { instrument: braam({ gain: 0.15 }), notes: brass, reverb: 0.4 },
      { instrument: wail({ gain: 0.32, pan: 0.1 }), notes: [...line(MOTIF, 32, 0.9, 0.97), ...line(MOTIF, 48, 0.95, 0.97)], reverb: 0.45, delay: 0.15 },
      { instrument: wail({ gain: 0.26, pan: -0.15, octave: -1 }), notes: line(SECOND, 64, 0.85, 0.97), reverb: 0.5, delay: 0.2 },
      { instrument: throat({ gain: 0.15 }), notes: line('D2:16 F2:8 Eb2:8', 64, 0.8, 1), reverb: 0.45 },
      { instrument: drone({ gain: 0.14 }), notes: line('D1:24', 96, 0.9, 1), reverb: 0.2 },
      { instrument: wind({ gain: 0.08, seed: 42 }), notes: gale(128), reverb: 0.3 },
    ],
  };
}

/** Battle 3, "Siege": 100 bpm, 32 bars on G Phrygian. A half-time grind, Ab leaning on G, the motif up a fourth. */
export function battle3(): Arrangement {
  const strings: Note[] = [];
  const brass: Note[] = [];
  const pads: Note[] = [];
  const kit: Note[] = [];
  for (let b = 0; b < 32; b++) {
    const at = b * 4;
    const calm = b >= 24;
    strings.push(...line(b % 4 === 3 ? 'G1:1 G1:1 Ab1:1 Ab1:1' : 'G1:1.5 G1:.5 G1:1 Ab1:.5 G1:.5', at, calm ? 0.6 : 0.9, 0.8));
    if (b % 4 === 0) brass.push(...line(b % 8 === 0 ? 'G2+D3:6 r:2 Ab2+Eb3:8' : 'Ab2+Eb3:6 r:2 G2+D3:8', at, calm ? 0.95 : 0.8, 1));
    if (b % 4 === 0) pads.push(...line('G3+Bb3+D4:8 Ab3+C4+Eb4:8', at, 0.6, 1));
    kit.push(
      ...bar(at, {
        taiko: calm ? 'x...............' : 'x.....x...x.....',
        crack: calm ? undefined : '........x.......',
        mid: b % 8 === 7 ? '........x.x.xxxx' : undefined,
        shaker: b >= 16 && !calm ? '..x...x...x...x.' : undefined,
      }),
    );
    if (b % 8 === 0) kit.push(hit(at, BOOM, 1));
    if (b >= 16 && b % 2 === 0 && !calm) kit.push(hit(at + 3, METAL, 0.65));
  }
  return {
    spb: 60 / 100,
    beats: 128,
    loop: true,
    parts: [
      { instrument: warDrums({ seed: 51 }), notes: kit, reverb: 0.25 },
      { instrument: lowStrings({ gain: 0.26 }), notes: strings, reverb: 0.12 },
      { instrument: braam({ gain: 0.17 }), notes: brass, reverb: 0.45 },
      { instrument: darkPad({ gain: 0.045 }), notes: pads, reverb: 0.55 },
      { instrument: wail({ gain: 0.32, pan: 0.1 }), notes: [...shift(line(MOTIF, 32, 0.9, 0.97), 0, 5), ...shift(line(SECOND, 48, 0.85, 0.97), 0, -7)], reverb: 0.5, delay: 0.2 },
      { instrument: throat({ gain: 0.17, pan: -0.15 }), notes: line('G2:16 Ab2:8 G2:8', 64, 0.8, 1), reverb: 0.45 },
      { instrument: drone({ gain: 0.15 }), notes: line('G1:32', 96, 0.9, 1), reverb: 0.2 },
      { instrument: wind({ gain: 0.1, seed: 52 }), notes: gale(128), reverb: 0.3 },
    ],
  };
}

/**
 * Victory: 84 bpm, 16 bars that loop under the victory screen. The motif turned major (E and F# instead of Eb and
 * F) over D, Bm, G, A brass chords, a processional taiko, and the answering phrase rising to a high D.
 */
export function victoryTrack(): Arrangement {
  const kit: Note[] = [];
  for (let b = 0; b < 16; b++) {
    const at = b * 4;
    kit.push(...bar(at, { taiko: 'x.......x...x...', mid: b % 4 === 3 ? '........x.x.x.x.' : undefined, shaker: b >= 4 ? '..x...x...x...x.' : undefined }));
    if (b % 4 === 0) kit.push(hit(at, BOOM, b === 0 ? 1 : 0.8));
  }
  const major = 'D4:2 D4:1 E4:1 F#4:2 F#4:1.5 G4:.5 A4:2 B4:2 A4:1 G4:1 F#4:1 E4:1';
  return {
    spb: 60 / 84,
    beats: 64,
    loop: true,
    parts: [
      { instrument: braam({ gain: 0.15 }), notes: repeat(line('D2+A2+D3:4 B1+F#2+D3:4 G1+D2+B2:4 A1+E2+C#3:4', 0, 0.85, 1), 16, 4), reverb: 0.45 },
      { instrument: darkPad({ gain: 0.05 }), notes: repeat(line('D3+F#3+A3:4 B2+D3+F#3:4 G2+B2+D3:4 A2+C#3+E3:4', 0, 0.6, 1), 16, 4), reverb: 0.6 },
      { instrument: lowStrings({ gain: 0.2 }), notes: repeat(line('D2:2 D2:2 B1:2 B1:2 G1:2 G1:2 A1:2 A1:2', 0, 0.75, 0.6), 16, 4), reverb: 0.2 },
      { instrument: wail({ gain: 0.3, pan: 0.1 }), notes: [...line(major, 16, 0.9, 0.97), ...line('A4:2 B4:2 C#5:2 D5:6 r:4', 32, 0.9, 0.97), ...line(major, 48, 0.8, 0.97)], reverb: 0.55, delay: 0.2 },
      { instrument: throat({ gain: 0.13 }), notes: line('D2:16 D2:16', 0, 0.7, 1), reverb: 0.5 },
      { instrument: warDrums({ seed: 61, gain: 0.8 }), notes: kit, reverb: 0.3 },
      { instrument: wind({ gain: 0.08, seed: 62 }), notes: gale(64), reverb: 0.3 },
    ],
  };
}

/** Defeat: 54 bpm, 12 bars that loop under the defeat screen. Wind, a drone, the wail falling to D, one boom a line. */
export function defeatTrack(): Arrangement {
  const kit: Note[] = [];
  for (let b = 0; b < 12; b++) {
    if (b % 4 === 0) kit.push(hit(b * 4, BOOM, 0.75), hit(b * 4, TAIKO, 0.7));
    if (b % 4 === 2) kit.push(hit(b * 4 + 2, METAL, 0.4));
  }
  return {
    spb: 60 / 54,
    beats: 48,
    loop: true,
    parts: [
      { instrument: wind({ gain: 0.22, seed: 71 }), notes: gale(48), reverb: 0.35 },
      { instrument: drone({ gain: 0.18 }), notes: line('D1:48', 0, 1, 1), reverb: 0.2 },
      { instrument: throat({ gain: 0.17 }), notes: line('D2:16 C2:8 D2:24', 0, 0.75, 1), reverb: 0.55 },
      { instrument: darkPad({ gain: 0.05 }), notes: line('D3+F3+A3:12 Bb2+D3+F3:12 G2+Bb2+D3:12 D3+F3+A3:12', 0, 0.6, 1), reverb: 0.65 },
      { instrument: wail({ gain: 0.26, pan: -0.1 }), notes: [...line('A4:3 G4:1 F4:2 Eb4:2 D4:8', 4, 0.8, 0.96), ...line('F4:2 Eb4:2 D4:4 C4:2 D4:6', 28, 0.7, 0.96)], reverb: 0.7, delay: 0.3 },
      { instrument: warDrums({ seed: 72, gain: 0.5 }), notes: kit, reverb: 0.5 },
    ],
  };
}
