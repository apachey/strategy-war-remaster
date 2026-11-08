import { reverb } from './effects';
import { braam, throat, wail, warDrums } from './instruments';
import { LOOPS } from './loops';
import type { Note } from './midi';
import { air, blast, debris, DESERT, engine, metal, place, plasma, roar, ROOM, thud } from './acoustic';
import { buffer, drive, finish } from './parts';
import { SAMPLE_RATE, Stereo } from './synth';
import { VOICES } from './voices';

/**
 * The game's sound effects, built from acoustic models (src/acoustic.ts) rather than oscillators, so they sound like
 * things and not like a game console: guns are blast waves and hot gas, metal rings with inharmonic modes, explosions
 * throw debris and sand, engines fire into an exhaust. Battle sounds are placed in the open desert with echoes off
 * dunes; the interface is relays and switches in a small bunker. Only the victory and defeat stingers use the music's
 * instruments. Every effect renders a fixed length; `finish` normalises the peak to -1 dBFS and fades the edges.
 */

export interface Sfx {
  name: string;
  /** One line for sfx.json: what it is and how it should sound. */
  description: string;
  /** The longest it may render, in seconds; the tests hold every effect to it. */
  budget: number;
  /** Suggested playback gain, so a UI click does not play as loud as an explosion (every file peaks at -1 dBFS). */
  gain: number;
  /** One channel, or two for the stingers, which want the width of the music. */
  render: () => Float32Array[];
  /** Plays as a seamless loop (harvesting, map ambience): no fades, the end runs straight into the start. */
  loop?: boolean;
}

// --- Weapons ---------------------------------------------------------------------------------------------------
// Each gun has three variants (`v`): other seeds and a slightly different size, so a volley is never one sound.

const VARIANTS = 3;
/** -3 %, 0, +4 %: variant 1 is the reference, the others a touch smaller and larger. */
const nudge = (v: number) => [0.97, 1, 1.04][v]!;

/** Light trike-tank: a small sharp blast, a ring of thin steel and the autoloader clacking behind it. */
export function shotLight(v = 1): Float32Array[] {
  const out = buffer(0.9);
  blast(out, 0, 0.9 * nudge(v), 101 + v * 50, 1);
  metal(out, 0.004, 1150 * nudge(v), 102 + v * 50, 0.12, 0.05);
  metal(out, 0.11, 2300, 103 + v * 50, 0.05, 0.02, 6);
  drive(out, 1.4);
  return place(out, DESERT, 0.4, 110 + v);
}

/** Middle tank: a fuller blast with a rolling body, the spiral barrel ringing low, the breech after. */
export function shotMiddle(v = 1): Float32Array[] {
  const out = buffer(1.3);
  blast(out, 0, 1.5 * nudge(v), 151 + v * 50, 1);
  roar(out, 0.004, 0.7, 152 + v * 50, (t) => 1800 * Math.exp(-t * 7) + 140, (t) => Math.exp(-t * 6) * Math.min(1, t * 200) * 1.4);
  metal(out, 0.005, 520 * nudge(v), 153 + v * 50, 0.14, 0.1);
  metal(out, 0.22, 900, 154 + v * 50, 0.07, 0.04, 6);
  drive(out, 1.5);
  return place(out, DESERT, 0.42, 160 + v);
}

/** Heavy tank: a deep blast with a long turbulent roar, the barrel booming and a heavy breech clank. */
export function shotHeavy(v = 1): Float32Array[] {
  const out = buffer(1.8);
  blast(out, 0, 2.4 * nudge(v), 201 + v * 50, 1);
  roar(out, 0.005, 1.2, 202 + v * 50, (t) => 1400 * Math.exp(-t * 5) + 90, (t) => Math.exp(-t * 3.5) * Math.min(1, t * 200) * 2.4);
  metal(out, 0.006, 260 * nudge(v), 203 + v * 50, 0.18, 0.18);
  metal(out, 0.32, 410, 204 + v * 50, 0.1, 0.07);
  drive(out, 1.6);
  return place(out, DESERT, 0.45, 210 + v);
}

/** Defender turret: an autocannon's double tap, two quick blasts on a fixed mount that clanks with each. */
export function shotDefender(v = 1): Float32Array[] {
  const out = buffer(1);
  for (const [k, at] of [0, 0.09].entries()) {
    blast(out, at, 1.1 * nudge(v), 251 + v * 50 + k, 0.9);
    metal(out, at + 0.003, 640 - k * 30, 253 + v * 50 + k, 0.2, 0.05, 8);
  }
  thud(out, 0, 180, 0.05, 255 + v, 1.2);
  drive(out, 1.5);
  return place(out, DESERT, 0.4, 260 + v);
}

/**
 * Hover vehicles' energy weapon: an electric discharge, a zap falling in pitch over a coil that rings with it,
 * crackle and a push of displaced air.
 */
export function shotAlien(v = 1): Float32Array[] {
  const out = buffer(1);
  plasma(out, 0, nudge(v), 301 + v * 50, 0.9);
  drive(out, 1.3);
  return place(out, DESERT, 0.35, 310 + v);
}

// --- Hits and explosions ---------------------------------------------------------------------------------------

/** A shell hitting armour: a hard clang of thick plate, the thud of the mass, a few chips of metal. */
export function impact(v = 1): Float32Array[] {
  const out = buffer(0.8);
  blast(out, 0, 0.5, 351 + v * 50, 0.6);
  metal(out, 0.001, 420 * nudge(v), 352 + v * 50, 0.4, 0.07);
  thud(out, 0, 260, 0.04, 353 + v * 50, 1.6);
  debris(out, 0.03, 0.3, 5, 354 + v * 50, 0.12, 'metal');
  drive(out, 1.4);
  return place(out, DESERT, 0.35, 360 + v);
}

/** A unit destroyed: a blast, a short roar, the hull's metal flying and landing, sand pattering down. */
export function explosionSmall(): Float32Array[] {
  const out = buffer(2);
  blast(out, 0, 2.8, 371, 1);
  roar(out, 0, 1.8, 372, (t) => 2000 * Math.exp(-t * 3) + 120, (t) => Math.min(1, t * 150) * Math.exp(-t * 2.2) * 3);
  debris(out, 0.15, 1.1, 18, 373, 0.16, 'metal');
  debris(out, 0.05, 1.5, 70, 374, 0.09, 'sand');
  drive(out, 1.6);
  return place(out, DESERT, 0.45, 380);
}

/** A building destroyed: a double blast, a long roar with a low rumble under it, girders and sand coming down. */
export function explosionBig(): Float32Array[] {
  const out = buffer(3);
  blast(out, 0, 4, 401, 1);
  blast(out, 0.17, 3, 402, 0.7);
  roar(out, 0, 2.9, 403, (t) => 2200 * Math.exp(-t * 2.2) + 110, (t) => Math.min(1, t * 150) * Math.exp(-t * 1.4) * 4);
  roar(out, 0, 2.9, 404, () => 90, (t) => Math.min(1, t * 20) * Math.exp(-t * 1.1) * 3);
  debris(out, 0.25, 1.9, 34, 405, 0.18, 'metal');
  debris(out, 0.1, 2.4, 120, 406, 0.1, 'sand');
  drive(out, 1.7);
  return place(out, DESERT, 0.45, 410);
}

// --- Economy and production ------------------------------------------------------------------------------------

/** Construction starts: a heavy clamp locking, a hydraulic hiss and a ratchet winding. */
export function buildStart(): Float32Array[] {
  const out = buffer(0.9);
  metal(out, 0, 230, 451, 0.4, 0.09);
  thud(out, 0, 200, 0.05, 452, 1.6);
  air(out, 0.05, 0.4, 453, (t) => 1200 + t * 2500, (t) => Math.min(1, t * 40) * Math.exp(-t * 6) * 0.6, 2);
  for (let k = 0; k < 7; k++) metal(out, 0.12 + k * 0.055, 1700 + k * 40, 454 + k, 0.08, 0.008, 5);
  return place(out, DESERT, 0.3, 460);
}

/** A building or unit finished: the clamps let go with a pneumatic sigh, a deep hull settles and rings once. */
export function buildDone(): Float32Array[] {
  const out = buffer(1.3);
  air(out, 0, 0.35, 501, (t) => 3800 - t * 4000, (t) => Math.min(1, t * 200) * Math.exp(-t * 9) * 0.8, 1);
  metal(out, 0.02, 1500, 502, 0.12, 0.01, 6);
  metal(out, 0.05, 1600, 503, 0.1, 0.01, 6);
  thud(out, 0.12, 160, 0.08, 504, 1.4);
  metal(out, 0.12, 180, 505, 0.25, 0.35, 7);
  return place(out, DESERT, 0.35, 510);
}

/** A new tank rolls out: the hatch clanks shut, the engine catches and revs, the air brake lets go. */
export function unitReady(): Float32Array[] {
  const out = buffer(1.5);
  metal(out, 0, 330, 801, 0.35, 0.09);
  engine(out, 0.08, 1.35, 802, (t) => 9 + 22 * Math.min(1, t * 1.8) - 8 * Math.max(0, t - 0.9), (t) => Math.min(1, t * 8) * (t < 1 ? 1 : Math.max(0, 1 - (t - 1) / 0.35)), 0.9);
  air(out, 0.95, 0.45, 803, (t) => 4200 - t * 2000, (t) => Math.min(1, t * 80) * Math.exp(-t * 7) * 0.7, 1.2);
  drive(out, 1.3);
  return place(out, DESERT, 0.3, 810);
}

// --- Interface -------------------------------------------------------------------------------------------------
// The interface is the commander's bunker: relays, switches and levers in a small hard room.

/** A unit selected: a relay closing, its contact bouncing once, the armature's tiny thunk. */
export function select(): Float32Array[] {
  const out = buffer(0.3);
  metal(out, 0, 2400, 551, 0.35, 0.006, 6);
  metal(out, 0.006, 3100, 552, 0.15, 0.004, 5);
  thud(out, 0, 260, 0.006, 553, 2.5);
  return place(out, ROOM, 0.25, 560);
}

/** An order acknowledged: a toggle switch thrown and a short pneumatic puff. */
export function order(): Float32Array[] {
  const out = buffer(0.45);
  metal(out, 0, 1800, 601, 0.3, 0.008, 6);
  metal(out, 0.012, 1300, 602, 0.25, 0.01, 6);
  air(out, 0.03, 0.18, 603, (t) => 3500 - t * 6000, (t) => Math.min(1, t * 150) * Math.exp(-t * 22) * 0.6, 1);
  return place(out, ROOM, 0.25, 610);
}

/** Can't do that: a locked lever, two dull clunks against its stop, the second one harder. */
export function error(): Float32Array[] {
  const out = buffer(0.6);
  for (const [k, at] of [0, 0.13].entries()) {
    metal(out, at, 170 + k * 15, 701 + k, 0.35 + k * 0.15, 0.03, 7);
    thud(out, at, 400, 0.014, 703 + k, 2.5);
  }
  return place(out, ROOM, 0.3, 710);
}

/** A UI button: a small push switch, click and release. */
export function click(): Float32Array[] {
  const out = buffer(0.15);
  metal(out, 0, 2900, 751, 0.3, 0.004, 6);
  metal(out, 0.035, 3400, 752, 0.12, 0.003, 5);
  return place(out, ROOM, 0.2, 760);
}

// --- Warnings --------------------------------------------------------------------------------------------------

/** Base under attack: three strokes of a struck alarm bell in the bunker, each over a blast far outside. */
export function alert(): Float32Array[] {
  const out = buffer(1.45);
  for (let k = 0; k < 3; k++) {
    for (let h = 0; h < 4; h++) metal(out, k * 0.38 + h * 0.045, 880, 851 + k, 0.22, 0.12, 6);
    thud(out, k * 0.38, 120, 0.12, 855 + k, 1.8);
  }
  drive(out, 1.4);
  return place(out, ROOM, 0.35, 860);
}

/** Autodestruct armed: a relay ticking faster and faster over a charging capacitor's rising whine, then a snap. */
export function selfDestruct(): Float32Array[] {
  const out = buffer(1.5);
  let t = 0;
  for (let k = 0; t < 1.35; k++) {
    metal(out, t, 2200, 901 + k, 0.25 + 0.2 * (t / 1.35), 0.006, 5);
    t += 0.2 * Math.exp(-k * 0.16) + 0.03;
  }
  air(out, 0, 1.4, 960, (u) => 400 * 6 ** (u / 1.4), (u) => (u / 1.4) ** 2 * 0.9, 12);
  metal(out, 1.38, 600, 961, 0.6, 0.04, 9);
  return place(out, ROOM, 0.3, 970);
}

// --- Stingers --------------------------------------------------------------------------------------------------

const note = (start: number, length: number, pitch: number, velocity = 0.9): Note => ({ start, length, pitch, velocity, channel: 0 });

function stereoVerb(dry: Stereo, wet: number): Float32Array[] {
  const w = reverb(dry, 0.84, 0.35);
  return [dry.l.map((v, i) => v + w.l[i]! * wet), dry.r.map((v, i) => v + w.r[i]! * wet)];
}

/** Victory: taiko and brass climbing Bb, C to an open D major chord (a Picardy turn out of D minor), with a boom. */
export function victory(): Float32Array[] {
  const out = new Stereo(Math.round(3.6 * SAMPLE_RATE));
  const brass = braam({ gain: 0.2 });
  const chords: [number, number, number[]][] = [
    [0, 0.45, [46, 53, 58]],
    [0.5, 0.45, [48, 55, 60]],
    [1, 1.3, [50, 57, 62, 66]],
  ];
  for (const [at, len, pitches] of chords) for (const p of pitches) brass(out, note(0, len, p), at, len);
  const drums = warDrums({ seed: 5, gain: 0.6 });
  for (const [at, p, v] of [[0, 43, 0.8], [0.5, 45, 0.9], [1, 49, 1], [1, 36, 1]] as const) drums(out, note(0, 1, p, v), at, 0.3);
  wail({ gain: 0.18, pan: -0.1 })(out, note(0, 1, 74), 1.05, 1.1);
  return stereoVerb(out, 0.8);
}

/** Defeat: a brass fall from Eb to D minor (the Phrygian cadence of the music), a sinking throat voice and a last boom. */
export function defeat(): Float32Array[] {
  const out = new Stereo(Math.round(3.8 * SAMPLE_RATE));
  const brass = braam({ gain: 0.2 });
  for (const p of [39, 46, 51]) brass(out, note(0, 0.8, p), 0, 0.8);
  for (const p of [38, 45, 50, 53]) brass(out, note(0, 1.6, p), 0.85, 1.6);
  throat({ gain: 0.22, seed: 4 })(out, note(0, 1, 38), 0.85, 1.6);
  const w = wail({ gain: 0.16, pan: 0.15, octave: -1 });
  w(out, note(0, 1, 75), 0.1, 0.6);
  w(out, note(0, 1, 74), 0.85, 1.4);
  warDrums({ seed: 6, gain: 0.6 })(out, note(0, 1, 49, 1), 0.85, 0.3);
  return stereoVerb(out, 0.8);
}

// --- Catalogue and mastering -----------------------------------------------------------------------------------

type Make = (v?: number) => Float32Array[];

const table: [string, Make, number, string, boolean?][] = [
  ['shot_light', shotLight, 0.55, 'Light trike-tank cannon: a small sharp blast, thin steel ringing, the autoloader.', true],
  ['shot_middle', shotMiddle, 0.65, 'Middle tank cannon: a fuller blast with a rolling body and the breech after.', true],
  ['shot_heavy', shotHeavy, 0.75, 'Heavy tank cannon: a deep blast, a long roar, the barrel booming.', true],
  ['shot_defender', shotDefender, 0.6, 'Defender turret: an autocannon double tap on a clanking mount.', true],
  ['shot_alien', shotAlien, 0.6, 'Hover energy weapon: an electric zap over a ringing coil, crackle and air.', true],
  ['impact', impact, 0.55, 'Shell hitting armour: a clang of thick plate, a thud and chips of metal.', true],
  ['explosion_small', explosionSmall, 0.8, 'Unit destroyed: a blast, a short roar, metal and sand coming down.'],
  ['explosion_big', explosionBig, 0.9, 'Building destroyed: a double blast, a long roar, girders and sand falling.'],
  ['build_start', buildStart, 0.5, 'Construction starts: a clamp locking, a hydraulic hiss, a ratchet.'],
  ['build_done', buildDone, 0.6, 'Building or unit finished: clamps letting go with a sigh, a hull settling.'],
  ['unit_ready', unitReady, 0.6, 'New tank out of the factory: a hatch, the engine catching and revving, an air brake.'],
  ['select', select, 0.35, 'Unit selected: a relay closing.'],
  ['order', order, 0.35, 'Order acknowledged: a toggle switch and a pneumatic puff.'],
  ['error', error, 0.3, "Can't do that: a locked lever clunking against its stop twice."],
  ['click', click, 0.3, 'UI button: a small push switch.'],
  ['alert', alert, 0.5, 'Base under attack: three strokes of an alarm bell over distant blasts.'],
  ['self_destruct', selfDestruct, 0.6, 'Autodestruct armed: a relay ticking faster over a charging whine, then a snap.'],
  ['victory', victory, 0.8, 'Victory stinger: taiko and brass climbing Bb, C to an open D major chord.'],
  ['defeat', defeat, 0.8, 'Defeat stinger: brass falling Eb to D minor, a throat voice and a last boom.'],
];

/** Most effects stay under 1.5 s; the heavy gun rings to 1.8 s, explosions to 2 and 3 s, the stingers to 4 s. */
const BUDGET: Record<string, number> = { shot_heavy: 1.8, explosion_small: 2, explosion_big: 3, victory: 4, defeat: 4 };

/** Guns and hits render as `<name>_0` .. `<name>_2`; the game picks one each time. */
export const SFX: Sfx[] = table.flatMap(([name, make, gain, description, varied]) =>
  (varied ? Array.from({ length: VARIANTS }, (_, v) => [`${name}_${v}`, () => make(v)] as const) : [[name, () => make()] as const]).map(([n, render]) => ({
    name: n,
    description,
    gain,
    budget: BUDGET[name] ?? 1.5,
    render: () => finish(render()),
  })),
).concat(LOOPS, VOICES);
