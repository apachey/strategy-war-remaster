import { reverb } from './effects';
import { braam, throat, wail, warDrums } from './instruments';
import { LOOPS } from './loops';
import type { Note } from './midi';
import { add, bell, blip, buffer, cents, drive, finish, hiss, PLATE, ring, rumble, TAU, thump, verb } from './parts';
import { Bandpass, hz, Lowpass, noise, pulse, SAMPLE_RATE, saw, Stereo } from './synth';
import { VOICES } from './voices';

/**
 * The game's sound effects, synthesised like the music: the same dark desert palette, low and weighty with a
 * little alien metal. Player tanks fire powder cannons (a crack, a thump and a ring of steel); the enemy's hover
 * vehicles fire energy bolts that fall in pitch and beat against themselves. UI sounds are short, soft and low.
 * Every effect renders a fixed length; `finish` normalises the peak to -1 dBFS and fades the edges.
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

/** Light trike-tank: a snappy dry crack with a small thump and a brief ring of thin steel. */
export function shotLight(): Float32Array[] {
  const out = buffer(0.35);
  hiss(out, 0, 0.1, 11, () => 2000, (t) => Math.exp(-t * 70) * 3, 1.2);
  thump(out, 0, 230, 95, 45, 0.04, 0.7);
  rumble(out, 0, 0.3, 12, (t) => 2600 * Math.exp(-t * 12) + 400, (t) => Math.exp(-t * 24) * 1.6);
  ring(out, 0.002, 740, PLATE, 0.18);
  drive(out, 1.6);
  return [out];
}

/** Middle tank: a fuller cannon, a crack over a round boom, and the spiral turret's barrel ringing low. */
export function shotMiddle(): Float32Array[] {
  const out = buffer(0.6);
  hiss(out, 0, 0.12, 21, () => 1500, (t) => Math.exp(-t * 55) * 2.4, 1.2);
  thump(out, 0, 170, 62, 28, 0.08, 0.9);
  rumble(out, 0, 0.55, 22, (t) => 2200 * Math.exp(-t * 9) + 250, (t) => Math.exp(-t * 12) * 2.6);
  ring(out, 0.003, 410, PLATE, 0.16);
  drive(out, 1.8);
  return [verb(out, 0.25)];
}

/** Heavy tank: a deep, chesty blast with a sub drop, a dark muzzle roar and a long low rumble. */
export function shotHeavy(): Float32Array[] {
  const out = buffer(1.1);
  hiss(out, 0, 0.12, 31, () => 800, (t) => Math.exp(-t * 45) * 2.4, 1.2);
  thump(out, 0, 115, 42, 16, 0.2, 0.9);
  thump(out, 0, 170, 85, 30, 0.07, 0.7);
  rumble(out, 0, 1.1, 32, (t) => 1300 * Math.exp(-t * 6) + 160, (t) => Math.min(1, t * 300) * Math.exp(-t * 4.5) * 4.5);
  ring(out, 0.004, 196, PLATE, 0.14);
  drive(out, 2.2);
  return [verb(out, 0.35)];
}

/** Defender turret: a mechanical double tap, two quick clanking shots from a fixed autocannon. */
export function shotDefender(): Float32Array[] {
  const out = buffer(0.5);
  for (const [k, at] of [0, 0.085].entries()) {
    hiss(out, at, 0.08, 41 + k, () => 1700 - k * 200, (t) => Math.exp(-t * 75) * 2.6, 1.4);
    thump(out, at, 175, 75, 40, 0.04, 0.7);
    ring(out, at + 0.002, 300 - k * 12, PLATE, 0.5);
  }
  rumble(out, 0, 0.5, 43, (t) => 1400 * Math.exp(-t * 8) + 250, (t) => Math.exp(-t * 12) * 1.8);
  drive(out, 1.7);
  return [verb(out, 0.2)];
}

/**
 * Alien hover vehicles' energy weapon: a plasma bolt that falls from a whine to a growl, two detuned voices beating
 * against each other, ring-modulated so it never sounds quite tuned, with a breath of hissing charge.
 */
export function shotAlien(): Float32Array[] {
  const out = buffer(0.7);
  const ph = [0, 0.37];
  const bp = new Bandpass(3);
  const lp = new Lowpass(1.4);
  add(out, 0, 0.7, (t) => {
    const f = 140 + 900 * Math.exp(-t * 9);
    let v = 0;
    for (let k = 0; k < 2; k++) {
      const inc = (f * cents(k ? 31 : -31)) / SAMPLE_RATE;
      ph[k] = (ph[k]! + inc) % 1;
      v += saw(ph[k]!, inc);
    }
    const ringMod = 0.55 + 0.45 * Math.sin(TAU * 43 * t);
    const body = bp.run(v, f * 2.2) * 1.4 + lp.run(v, f * 3) * 0.6;
    return body * ringMod * Math.min(1, t * 600) * Math.exp(-t * 5.5);
  });
  hiss(out, 0, 0.5, 51, (t) => 2600 * Math.exp(-t * 6) + 500, (t) => Math.min(1, t * 200) * Math.exp(-t * 9) * 0.9, 4);
  thump(out, 0, 90, 45, 20, 0.08, 0.5);
  drive(out, 1.5);
  return [verb(out, 0.4, 0.8)];
}

// --- Hits and explosions ---------------------------------------------------------------------------------------

/** A shell hitting armour: a hard click, a dull thud and a clank of plate that dies quickly. */
export function impact(): Float32Array[] {
  const out = buffer(0.5);
  hiss(out, 0, 0.04, 61, () => 3200, (t) => Math.exp(-t * 120) * 1.6, 1);
  thump(out, 0, 210, 80, 35, 0.04, 0.6);
  ring(out, 0.001, 520, PLATE, 0.8);
  rumble(out, 0, 0.3, 62, () => 1400, (t) => Math.exp(-t * 25) * 0.5);
  drive(out, 1.5);
  return [out];
}

/** A unit destroyed: a boom with a falling dusty roar, crackle and a few bits of metal landing. */
export function explosionSmall(): Float32Array[] {
  const out = buffer(1.6);
  thump(out, 0, 110, 40, 12, 0.22, 0.9);
  rumble(out, 0, 1.6, 71, (t) => 1900 * Math.exp(-t * 4) + 200, (t) => Math.min(1, t * 400) * Math.exp(-t * 3) * 5);
  hiss(out, 0, 1, 73, (t) => 500 - t * 200, (t) => Math.min(1, t * 300) * Math.exp(-t * 4) * 2.5, 1.5);
  // Crackle: rare single impulses rung through a band, thinning out.
  const sparks = noise(72);
  const crackle = new Bandpass(3);
  add(out, 0.02, 0.9, (t) => {
    const r = sparks();
    return crackle.run(Math.abs(r) > 0.996 ? r * 6 : 0, 2200) * Math.exp(-t * 4);
  });
  ring(out, 0.32, 380, PLATE, 0.12);
  ring(out, 0.55, 290, PLATE, 0.09);
  drive(out, 1.8);
  return [verb(out, 0.45, 0.8)];
}

/**
 * A building destroyed: a deep double blast, a long roar of falling debris, girders clanking down and a sub rumble
 * that rolls away for a couple of seconds.
 */
export function explosionBig(): Float32Array[] {
  const out = buffer(3);
  thump(out, 0, 90, 32, 8, 0.45, 1);
  thump(out, 0.19, 75, 28, 9, 0.35, 0.7);
  rumble(out, 0, 3, 81, (t) => 1700 * Math.exp(-t * 2.4) + 160, (t) => Math.min(1, t * 200) * Math.exp(-t * 1.5) * 5);
  rumble(out, 0.19, 2.8, 82, (t) => 1500 * Math.exp(-t * 2.8) + 140, (t) => Math.min(1, t * 200) * Math.exp(-t * 1.6) * 4);
  rumble(out, 0, 3, 83, () => 80, (t) => Math.min(1, t * 10) * Math.exp(-t * 1.3) * 2.5, 1.2);
  hiss(out, 0, 2.5, 84, (t) => 450 - t * 120, (t) => Math.min(1, t * 200) * Math.exp(-t * 2) * 2.5, 1.5);
  const debris: [number, number][] = [
    [0.42, 260],
    [0.61, 340],
    [0.83, 210],
    [1.05, 300],
    [1.37, 180],
  ];
  for (const [at, f] of debris) ring(out, at, f, PLATE, 0.1);
  drive(out, 1.9);
  return [verb(out, 0.55, 0.85)];
}

// --- Economy and production ------------------------------------------------------------------------------------

/** Construction starts: a heavy clamp clunk and a servo whir winding up. */
export function buildStart(): Float32Array[] {
  const out = buffer(0.7);
  thump(out, 0, 160, 60, 30, 0.06, 0.9);
  ring(out, 0.001, 230, PLATE, 0.3);
  const lp = new Lowpass(2.5);
  let ph = 0;
  add(out, 0.06, 0.6, (t) => {
    const f = 70 + 110 * (1 - Math.exp(-t * 5));
    const inc = f / SAMPLE_RATE;
    ph = (ph + inc) % 1;
    const env = Math.min(1, t * 20) * (1 - t / 0.6) ** 1.5;
    return lp.run(saw(ph, inc), f * 5) * env * 0.5;
  });
  hiss(out, 0.06, 0.6, 111, (t) => 900 + t * 900, (t) => Math.min(1, t * 20) * (1 - t / 0.6) * 0.25, 3);
  drive(out, 1.4);
  return [out];
}

/** A building or unit finished: a pneumatic release and a dark bell chord on D (D3, A3, D4) that rings out. */
export function buildDone(): Float32Array[] {
  const out = buffer(1.3);
  hiss(out, 0, 0.18, 121, () => 2000, (t) => Math.min(1, t * 200) * Math.exp(-t * 18) * 0.6, 1);
  thump(out, 0, 140, 70, 35, 0.05, 0.6);
  bell(out, 0.05, hz(50), 0.5, 0.35);
  bell(out, 0.05, hz(57), 0.45, 0.25);
  bell(out, 0.05, hz(62), 0.4, 0.2);
  return [verb(out, 0.35)];
}

/** A new tank rolls out: the engine revs up from idle, with a short low brass call over it. */
export function unitReady(): Float32Array[] {
  const out = buffer(1.3);
  const lp = new Lowpass(1.2);
  const rnd = noise(131);
  let ph = 0;
  add(out, 0, 1.2, (t) => {
    const f = 38 + 30 * Math.min(1, t * 2.5) - 12 * Math.max(0, t - 0.6);
    const inc = f / SAMPLE_RATE;
    ph = (ph + inc) % 1;
    const chug = pulse(ph, inc, 0.25) + rnd() * 0.3;
    const env = Math.min(1, t * 15) * (t < 0.9 ? 1 : 1 - (t - 0.9) / 0.3);
    return lp.run(chug, 250 + 500 * Math.min(1, t * 2.5)) * env * 0.6;
  });
  // The call: D3 then A3, detuned saws through a filter that opens and closes, like a small braam.
  const call: [number, number, number][] = [
    [0.15, 50, 0.3],
    [0.42, 57, 0.55],
  ];
  for (const [at, pitch, len] of call) {
    const f = hz(pitch);
    const flt = new Lowpass(1.1);
    const p2 = [0, 0.3, 0.6];
    add(out, at, len + 0.15, (t) => {
      let v = 0;
      for (let k = 0; k < 3; k++) {
        const inc = (f * cents((k - 1) * 9)) / SAMPLE_RATE;
        p2[k] = (p2[k]! + inc) % 1;
        v += saw(p2[k]!, inc);
      }
      const env = Math.min(1, t * 25) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.15));
      return Math.tanh(flt.run(v, 200 + 1200 * Math.sin(Math.PI * Math.min(1, t / (len + 0.15)))) * 1.5) * env * 0.35;
    });
  }
  return [verb(out, 0.3)];
}

// --- Interface -------------------------------------------------------------------------------------------------

/** A unit selected: a soft, low two-partial blip with a tiny tick on top. */
export function select(): Float32Array[] {
  const out = buffer(0.14);
  blip(out, 0, 62, 0.14, 0.7, 0.35, 3);
  hiss(out, 0, 0.02, 141, () => 2500, (t) => Math.exp(-t * 300) * 0.4, 2);
  return [out];
}

/** An order acknowledged: two quick low notes rising A3 to D4, muted and short. */
export function order(): Float32Array[] {
  const out = buffer(0.22);
  blip(out, 0, 57, 0.09, 0.6);
  blip(out, 0.07, 62, 0.15, 0.7);
  return [out];
}

/** Can't do that: a buzzy, dull double "bzz" on a clashing semitone (Eb against D). */
export function error(): Float32Array[] {
  const out = buffer(0.36);
  for (const at of [0, 0.17]) {
    const lp = new Lowpass(1.5);
    const ph = [0, 0.5];
    add(out, at, 0.14, (t) => {
      let v = 0;
      for (const [k, p] of [50, 51].entries()) {
        const inc = hz(p) / SAMPLE_RATE;
        ph[k] = (ph[k]! + inc) % 1;
        v += pulse(ph[k]!, inc, 0.5);
      }
      const env = Math.min(1, t * 300) * Math.min(1, (0.14 - t) * 60);
      return lp.run(v, 700) * env * 0.5;
    });
  }
  drive(out, 1.3);
  return [out];
}

/** A UI button: a tiny dark tick, like a heavy switch far away. */
export function click(): Float32Array[] {
  const out = buffer(0.06);
  hiss(out, 0, 0.03, 151, () => 1600, (t) => Math.exp(-t * 350) * 1.2, 1.5);
  thump(out, 0, 420, 260, 80, 0.008, 0.6);
  return [out];
}

// --- Warnings --------------------------------------------------------------------------------------------------

/** Base under attack: a dark alarm alternating D and Eb three times through a vocal-ish formant, over a low pulse. */
export function alert(): Float32Array[] {
  const out = buffer(1.45);
  const f1 = new Bandpass(4);
  const f2 = new Bandpass(6);
  const ph = [0, 0.5];
  add(out, 0, 1.4, (t) => {
    const slot = Math.floor(t / 0.22);
    const pitch = slot % 2 ? 63 : 62;
    const inc = hz(pitch) / SAMPLE_RATE;
    ph[0] = (ph[0]! + inc) % 1;
    ph[1] = (ph[1]! + inc * 0.5) % 1;
    const src = saw(ph[0]!, inc) + pulse(ph[1]!, inc * 0.5, 0.3) * 0.6;
    const local = t - slot * 0.22;
    const gate = slot < 6 ? Math.min(1, local * 80) * Math.min(1, (0.2 - local) * 60) : 0;
    return (f1.run(src, 650) * 1.3 + f2.run(src, 1100) * 0.6) * Math.max(0, gate) * 1.4;
  });
  for (let k = 0; k < 3; k++) thump(out, k * 0.44, 90, 45, 25, 0.1, 0.5);
  drive(out, 1.5);
  return [verb(out, 0.3)];
}

/** Autodestruct armed: a saw tone climbing two octaves, beeping faster and faster, cut off at the top. */
export function selfDestruct(): Float32Array[] {
  const out = buffer(1.5);
  const lp = new Lowpass(2);
  let ph = 0;
  let gatePh = 0;
  add(out, 0, 1.45, (t) => {
    const x = t / 1.45;
    const f = 98 * 4 ** x;
    const inc = f / SAMPLE_RATE;
    ph = (ph + inc) % 1;
    gatePh = (gatePh + (5 + 17 * x * x) / SAMPLE_RATE) % 1;
    const gate = gatePh < 0.55 ? Math.min(1, gatePh * 60) : Math.max(0, 1 - (gatePh - 0.55) * 60);
    const end = Math.min(1, (1.45 - t) * 200);
    return lp.run(saw(ph, inc) + pulse(ph, inc, 0.2) * 0.4, f * 4) * gate * end * 0.6;
  });
  drive(out, 1.4);
  return [verb(out, 0.2)];
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

const table: [string, () => Float32Array[], number, string][] = [
  ['shot_light', shotLight, 0.55, 'Light trike-tank cannon: a snappy dry crack with a small thump.'],
  ['shot_middle', shotMiddle, 0.65, 'Middle tank cannon: a crack over a round boom, the barrel ringing low.'],
  ['shot_heavy', shotHeavy, 0.75, 'Heavy tank cannon: a deep chesty blast with a sub drop and a long rumble.'],
  ['shot_defender', shotDefender, 0.6, 'Defender turret: a clanking mechanical double tap.'],
  ['shot_alien', shotAlien, 0.6, 'Alien energy weapon: a falling, beating, ring-modulated plasma bolt.'],
  ['impact', impact, 0.55, 'Shell hitting armour: a hard click, a thud and a clank of plate.'],
  ['explosion_small', explosionSmall, 0.8, 'Unit destroyed: a boom with a falling dusty roar and bits of metal.'],
  ['explosion_big', explosionBig, 0.9, 'Building destroyed: a deep double blast, debris and a rolling sub rumble.'],
  ['build_start', buildStart, 0.5, 'Construction starts: a clamp clunk and a servo winding up.'],
  ['build_done', buildDone, 0.6, 'Building or unit finished: a pneumatic release and a dark D bell chord.'],
  ['unit_ready', unitReady, 0.6, 'New tank out of the factory: an engine rev under a short low brass call.'],
  ['select', select, 0.35, 'Unit selected: a soft low blip.'],
  ['order', order, 0.35, 'Order acknowledged: two quick muted notes rising A to D.'],
  ['error', error, 0.25, "Can't do that: a dull buzzy double bzz on a clashing semitone."],
  ['click', click, 0.3, 'UI button: a tiny dark tick.'],
  ['alert', alert, 0.5, 'Base under attack: a dark D/Eb alarm over a low pulse.'],
  ['self_destruct', selfDestruct, 0.6, 'Autodestruct armed: a rising saw beeping faster, cut off at the top.'],
  ['victory', victory, 0.8, 'Victory stinger: taiko and brass climbing Bb, C to an open D major chord.'],
  ['defeat', defeat, 0.8, 'Defeat stinger: brass falling Eb to D minor, a throat voice and a last boom.'],
];

/** Most effects stay under 1.5 s; explosions may ring for 2 to 3 s and the stingers run to 4 s. */
const BUDGET: Record<string, number> = { explosion_small: 2, explosion_big: 3, victory: 4, defeat: 4 };

export const SFX: Sfx[] = table.map(([name, make, gain, description]) => ({
  name,
  description,
  gain,
  budget: BUDGET[name] ?? 1.5,
  render: () => finish(make()),
})).concat(LOOPS, VOICES);
