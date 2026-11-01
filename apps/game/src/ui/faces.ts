/**
 * The faces on the selection panel, StarCraft-style talking heads built from low-poly shapes and rendered like every
 * other 3D still, so they share the palette, light and outline. They are drawn for 32 art pixels: big, plain shapes
 * that read at a glance, shown on a comms screen and animated in a short loop (blinks, speech, a turning lens).
 *
 * Humans are colonists in helmets: the harvester driver in a cap and headset, the buggy driver in an open helmet with
 * goggles and a scarf, the medium tank's crew in a combat helmet, the heavy tank's in a sealed one with a lit visor;
 * their bases talk through a robot adjutant. Walkers are beetles, the machines themselves: each kind its own head,
 * mandibles and feelers, and the hive queen over the base. Hovers have no crew: each hull is flown by its own drone
 * mind, and the base is one computer, an eye on a screen.
 */
import * as THREE from 'three';
import type { MaterialName } from '../../../../tools/art/src/materials';
import { paint, still, type Dress } from './scene3d';

/** Who talks for a kind of object: a pilot for each unit, the base's advisor for every building. */
export type Speaker = 'harvester' | 'light_tank' | 'middle_tank' | 'heavy_tank' | 'advisor';

export const speakerOf = (kind: string): Speaker | null =>
  kind === 'resource' ? null : (['harvester', 'light_tank', 'middle_tank', 'heavy_tank'] as const).find((k) => k === kind) ?? 'advisor';

/** Frames in a face's loop and how long each shows. */
export const FACE_FRAMES = 12;
export const FACE_FRAME_MS = 150;

const SKIN = ['#3a2418', '#7a4a34', '#b8805c', '#e8b48c', '#fce0c0'];
const DARK = ['#0a0806', '#1a1410', '#2a2018'];
const WHITE = ['#c8c4b8', '#f4f0e4'];
const VISOR = ['#081018', '#14283a', '#24486a', '#4a80b0', '#a8d8ff'];
const MOUTH = ['#3a1410', '#5a2420'];
/** The beetles' heads, legs and feelers: black chitin with a cold sheen, whatever the shell's colour. */
const CHITIN = ['#0c0b10', '#1e1b26', '#363044', '#585070'];

type Paint = readonly string[] | MaterialName;
type At = [number, number, number];
interface Opts {
  rot?: At;
  scale?: At;
  glow?: boolean;
  to?: THREE.Object3D;
}

/** Where a frame is in the loop: `t` runs 0..1, `blink` closes the eyes, `talk` opens the mouth or jaws 0..1. */
interface Pose {
  t: number;
  blink: boolean;
  talk: number;
}

const TALK = [0, 0.7, 1, 0.4, 0.9, 0.3, 0, 0, 0, 0, 0, 0];
const pose = (i: number): Pose => ({ t: i / FACE_FRAMES, blink: i === 9, talk: TALK[i] ?? 0 });
const wave = (t: number, k = 1, phase = 0) => Math.sin((t * k + phase) * Math.PI * 2);

/** A small kit of shapes in one dress; every call adds a mesh to the bust (or to `to`). */
function kit(dress: Dress) {
  const root = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, p: Paint, at: At, o: Opts = {}) => {
    const m = new THREE.Mesh(geo, paint(p, dress, o.glow));
    m.position.set(...at);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.set(...o.scale);
    (o.to ?? root).add(m);
    return m;
  };
  const group = (at: At, to: THREE.Object3D = root, rot: At = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.set(...at);
    g.rotation.set(...rot);
    to.add(g);
    return g;
  };
  return {
    root,
    group,
    box: (w: number, h: number, d: number, p: Paint, at: At, o?: Opts) => add(new THREE.BoxGeometry(w, h, d), p, at, o),
    ball: (r: number, p: Paint, at: At, o?: Opts, detail = 1) => add(new THREE.IcosahedronGeometry(r, detail), p, at, o),
    dome: (r: number, p: Paint, at: At, o?: Opts, cut = Math.PI / 2) => add(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, cut), p, at, o),
    tube: (r: number, h: number, p: Paint, at: At, o?: Opts, sides = 8, r2 = r) => add(new THREE.CylinderGeometry(r2, r, h, sides), p, at, o),
    cone: (r: number, h: number, p: Paint, at: At, o?: Opts, sides = 5) => add(new THREE.ConeGeometry(r, h, sides), p, at, o),
    ring: (r: number, t: number, p: Paint, at: At, o?: Opts) => add(new THREE.TorusGeometry(r, t, 4, 14), p, at, o),
  };
}

type Kit = ReturnType<typeof kit>;

// Humans ----------------------------------------------------------------------------------------------------------------

/** Shoulders in the side's colour with a collar in its second colour and pads; every crew member wears them. */
function shoulders(k: Kit, wide = 1): void {
  k.box(1.6 * wide, 0.55, 0.8, 'team', [0, -1.12, -0.05]);
  k.box(0.7, 0.18, 0.6, 'team2', [0, -0.8, 0]);
  for (const s of [-1, 1]) k.box(0.42, 0.22, 0.7, 'teamDark', [s * 0.62 * wide, -0.82, -0.05], { rot: [0, 0, s * -0.25] });
}

/**
 * A human head drawn for the pixel grid: a plain oval, big eyes with clear whites, heavy brows and a mouth that opens.
 * `top` is how far down a helmet comes (the brows always stay clear of it).
 */
function humanHead(k: Kit, p: Pose): void {
  k.tube(0.2, 0.35, SKIN, [0, -0.6, 0]);
  k.ball(0.46, SKIN, [0, 0, 0], { scale: [0.9, 1.08, 0.95] });
  k.box(0.08, 0.14, 0.1, SKIN, [0, -0.04, 0.45]);
  for (const s of [-1, 1]) {
    if (p.blink) k.box(0.18, 0.04, 0.06, DARK, [s * 0.17, 0.06, 0.43]);
    else {
      k.box(0.18, 0.12, 0.06, WHITE, [s * 0.17, 0.06, 0.42]);
      k.box(0.08, 0.12, 0.06, DARK, [s * 0.17 - 0.03, 0.06, 0.44]);
    }
    k.box(0.22, 0.06, 0.08, DARK, [s * 0.17, 0.17, 0.43], { rot: [0, 0, s * -0.12] });
  }
  const open = 0.035 + p.talk * 0.08;
  k.box(0.22, open, 0.06, MOUTH, [0, -0.24 - open / 2, 0.41]);
}

function human(k: Kit, who: Speaker, p: Pose): void {
  const bob = wave(p.t) * 0.015;
  k.root.position.y = bob;
  if (who === 'advisor') {
    // The adjutant: a robot head with a lit eye band where a light runs to and fro, an antenna and a grille.
    shoulders(k, 1.05);
    k.tube(0.18, 0.4, 'steelDark', [0, -0.6, 0]);
    k.box(0.92, 0.9, 0.85, 'steel', [0, 0.02, 0]);
    k.box(0.96, 0.14, 0.1, 'teamDark', [0, 0.46, 0]);
    k.box(0.84, 0.2, 0.08, DARK, [0, 0.12, 0.42]);
    k.box(0.22, 0.14, 0.06, 'lamp', [wave(p.t) * 0.28, 0.12, 0.46], { glow: true });
    k.box(0.5, 0.22, 0.06, 'steelDark', [0, -0.24, 0.43]);
    for (const x of [-0.16, 0, 0.16]) k.box(0.06, 0.08 + p.talk * 0.12, 0.04, p.talk > 0.2 ? 'signal' : 'steelLight', [x, -0.24, 0.47], { glow: p.talk > 0.2 });
    for (const s of [-1, 1]) k.box(0.12, 0.5, 0.5, 'team', [s * 0.52, 0, 0]);
    k.tube(0.03, 0.5, 'steelDark', [0.3, 0.7, 0]);
    if (p.t < 0.5) k.ball(0.07, 'signal', [0.3, 0.97, 0], { glow: true }, 0);
    return;
  }
  shoulders(k);
  humanHead(k, p);
  if (who === 'harvester') {
    // A cap with a long brim and a big headset with a boom microphone: the field hand.
    k.dome(0.49, 'team2', [0, 0.2, -0.02], { scale: [1, 0.75, 1] });
    k.box(0.66, 0.06, 0.34, 'team2Dark', [0, 0.24, 0.5], { rot: [0.12, 0, 0] });
    for (const s of [-1, 1]) k.tube(0.17, 0.14, 'steelDark', [s * 0.44, 0, 0], { rot: [0, 0, Math.PI / 2] }, 8);
    k.box(0.92, 0.05, 0.08, 'steelDark', [0, 0.42, 0], { rot: [0, 0, 0] });
    k.box(0.04, 0.04, 0.4, 'steelDark', [-0.42, -0.16, 0.24], { rot: [0, -0.55, 0] });
    k.ball(0.06, 'signal', [-0.26, -0.22, 0.44], { glow: p.talk > 0.2 }, 0);
  } else if (who === 'light_tank') {
    // An open helmet riding high, goggles up on its front, and a scarf over the collar: the buggy driver.
    k.dome(0.53, 'team', [0, 0.24, -0.04], { scale: [1, 0.85, 1] });
    k.box(0.72, 0.07, 0.12, 'teamDark', [0, 0.25, 0.42]);
    k.box(0.62, 0.12, 0.1, 'steelDark', [0, 0.42, 0.42], { rot: [-0.35, 0, 0] });
    for (const s of [-1, 1]) k.tube(0.1, 0.08, 'glass', [s * 0.15, 0.43, 0.48], { rot: [Math.PI / 2 - 0.35, 0, 0] }, 8);
    k.box(0.9, 0.24, 0.7, 'team2', [0, -0.62, 0.05], { rot: [0.1, 0, 0] });
    k.cone(0.12, 0.35, 'team2Dark', [0.42, -0.75, -0.2], { rot: [0, 0, -0.6 + wave(p.t) * 0.15] });
  } else if (who === 'middle_tank') {
    // A combat helmet with a rim, ear guards and a band in the second colour: the tank crew.
    k.dome(0.58, 'team', [0, 0.16, -0.04], { scale: [1, 1, 1.02] });
    k.ring(0.57, 0.05, 'teamDark', [0, 0.18, -0.04], { rot: [Math.PI / 2, 0, 0] });
    k.box(1.0, 0.1, 0.1, 'team2', [0, 0.36, 0.38]);
    for (const s of [-1, 1]) k.box(0.14, 0.4, 0.38, 'teamDark', [s * 0.48, -0.05, -0.05]);
    k.box(0.04, 0.32, 0.04, 'steelDark', [-0.46, -0.3, 0.2]);
  } else {
    // A sealed helmet with a lit visor slit and a breathing mask: nothing human shows but the light.
    k.ball(0.62, 'team', [0, 0.06, -0.02], { scale: [0.95, 1, 1] });
    k.box(0.86, 0.22, 0.2, DARK, [0, 0.08, 0.48]);
    k.box(0.7, 0.07, 0.08, 'eye', [0, 0.08, 0.58], { glow: true });
    k.box(0.12, 0.08, 0.08, 'flash', [wave(p.t) * 0.28, 0.08, 0.6], { glow: true });
    k.box(0.6, 0.34, 0.32, 'steelDark', [0, -0.3, 0.4]);
    for (const x of [-0.14, 0, 0.14]) k.box(0.05, 0.2, 0.04, p.talk > 0.2 ? 'signal' : 'steel', [x, -0.3, 0.57], { glow: p.talk > 0.2 });
    for (const s of [-1, 1]) k.tube(0.07, 0.5, 'steel', [s * 0.3, -0.56, 0.3], { rot: [0.3, 0, s * 0.4] });
    k.box(0.14, 0.5, 0.14, 'team2', [0, 0.5, 0.3], { rot: [0.5, 0, 0] });
  }
}

// Walkers: the beetles themselves ---------------------------------------------------------------------------------------

/** A feeler: beads along a curve from `at` forward and out, swaying with the loop; `club` ends it in flat plates. */
function feeler(k: Kit, at: At, side: number, len: number, lift: number, sway: number, club = false): void {
  const n = 6;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const x = at[0] + side * (f * len * 0.55 + sway * f * f);
    const y = at[1] + Math.sin(f * 2.2) * len * lift;
    const z = at[2] + f * len * 0.7;
    if (club && i === n) for (let j = 0; j < 3; j++) k.box(0.16, 0.05, 0.1, 'team2Light', [x + side * 0.04, y + j * 0.06, z]);
    else k.ball(0.055 - f * 0.012, CHITIN, [x, y, z], {}, 0);
  }
}

/** A jaw: a curved sickle lying flat, from `at` forward and in, opened by `open` (0..1). */
function jaw(k: Kit, at: At, side: number, len: number, open: number, teeth = false): void {
  const g = k.group(at, k.root, [0, side * (0.15 + open * 0.5), 0]);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const w = 0.11 - f * 0.06;
    const x = side * -(f * f) * len * 0.45;
    k.box(w, 0.07, len / (n - 1) + 0.03, 'team2Light', [x, 0, f * len], { to: g, rot: [0, side * -f * 1.1, 0] });
  }
  if (teeth) for (const f of [0.35, 0.6]) k.cone(0.045, 0.16, 'team2', [side * (-f * f * len * 0.45 - 0.07), 0, f * len], { to: g, rot: [0, 0, side * Math.PI / 2] }, 4);
}

/** Compound eyes: faceted beads in the secondary glow, a dark ring round each. */
function compound(k: Kit, list: Array<[number, number, number, number]>, blink: boolean): void {
  for (const [x, y, z, r] of list) {
    k.ball(r * 1.18, DARK, [x, y, z - 0.03], {}, 1);
    k.ball(r, blink ? 'team2Dark' : 'eye', [x, y, z], { glow: !blink }, 1);
  }
}

/** A leg: three segments out from the body to the ground, stepping a little with the loop. */
function leg(k: Kit, at: At, side: number, reach: number, step: number): void {
  const knee: At = [at[0] + side * reach * 0.55, at[1] + 0.22, at[2] + step];
  const foot: At = [at[0] + side * reach, at[1] - 0.35, at[2] + step * 1.6];
  for (const [a, b, r] of [[at, knee, 0.07], [knee, foot, 0.05]] as const) {
    const mid: At = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const m = k.box(r * 2, len, r * 2, CHITIN, mid);
    m.lookAt(new THREE.Vector3(...b).add(k.root.position));
    m.rotateX(Math.PI / 2);
  }
}

/**
 * A beetle seen from above and in front: wing cases with their seam, the shield over the thorax, the head with its
 * eyes, jaws and feelers, and the front legs. `wide` widens the body, `dome` raises it.
 */
function beetle(k: Kit, p: Pose, wide: number, dome: number): void {
  for (const s of [-1, 1]) {
    k.ball(0.62, 'team', [s * 0.33 * wide, 0, -1.15], { scale: [0.55 * wide, 0.5 * dome, 1.15] });
    k.box(0.08, 0.06, 1.0, 'teamLight', [s * 0.42 * wide, 0.3 * dome, -0.95], { rot: [-0.12, 0, s * -0.3] });
  }
  k.box(0.05, 0.36 * dome, 1.3, DARK, [0, 0.06, -1.1]);
  k.ball(0.58, 'team', [0, 0.02, -0.18], { scale: [1.15 * wide, 0.55 * dome, 0.75] });
  k.ring(0.5, 0.04, 'team2', [0, 0.05, -0.18], { rot: [Math.PI / 2, 0, 0], scale: [1.32 * wide, 0.85, 1] });
  for (const s of [-1, 1]) {
    leg(k, [s * 0.45 * wide, -0.1, 0.05], s, 0.75, wave(p.t, 1, s * 0.25) * 0.08);
    leg(k, [s * 0.5 * wide, -0.1, -0.5], s, 0.9, wave(p.t, 1, s * 0.25 + 0.5) * 0.08);
  }
}

function walker(k: Kit, who: Speaker, p: Pose): void {
  const sway = wave(p.t) * 0.12;
  const open = p.talk;
  if (who === 'advisor') {
    // The hive queen: a broad beetle with a crown of horns, rows of eyes and a swollen glowing brood sac behind.
    k.ball(0.75, 'bileGlow', [0, 0.1, -1.4], { glow: true, scale: [1.1 + wave(p.t) * 0.06, 0.6, 1.0] });
    beetle(k, p, 1.35, 1.1);
    k.ball(0.42, CHITIN, [0, 0.05, 0.42], { scale: [1.3, 0.6, 0.8] });
    for (let i = -2; i <= 2; i++) k.cone(0.08, 0.35 + (2 - Math.abs(i)) * 0.15, 'team2', [i * 0.2, 0.32, 0.25], { rot: [-0.5, 0, i * -0.3] }, 4);
    compound(k, [[-0.4, 0.1, 0.55, 0.11], [0.4, 0.1, 0.55, 0.11], [-0.18, 0.2, 0.68, 0.07], [0.18, 0.2, 0.68, 0.07]], p.blink);
    for (const s of [-1, 1]) jaw(k, [s * 0.16, -0.02, 0.75], s, 0.3, open);
    return;
  }
  if (who === 'harvester') {
    // The scarab: round and domed, a toothed scoop of a face, clubbed feelers and short jaws.
    beetle(k, p, 1.15, 1.3);
    k.ball(0.4, CHITIN, [0, 0.02, 0.42], { scale: [1.3, 0.55, 0.8] });
    k.box(0.85, 0.06, 0.3, 'team2', [0, 0.04, 0.72], { rot: [0.2, 0, 0] });
    for (const x of [-0.3, -0.1, 0.1, 0.3]) k.cone(0.06, 0.16, 'team2Light', [x, 0.02, 0.92], { rot: [Math.PI / 2, 0, 0] }, 4);
    compound(k, [[-0.44, 0.08, 0.48, 0.14], [0.44, 0.08, 0.48, 0.14]], p.blink);
    for (const s of [-1, 1]) {
      jaw(k, [s * 0.2, -0.06, 0.7], s, 0.28, open);
      feeler(k, [s * 0.36, 0.08, 0.6], s, 0.5, 0.25, sway * s, true);
    }
  } else if (who === 'light_tank') {
    // The runner: slim and long-legged, huge eyes, thin sickle jaws and long feelers.
    beetle(k, p, 0.8, 0.8);
    k.ball(0.34, CHITIN, [0, 0.02, 0.4], { scale: [1.1, 0.6, 1.1] });
    compound(k, [[-0.3, 0.1, 0.52, 0.16], [0.3, 0.1, 0.52, 0.16]], p.blink);
    for (const s of [-1, 1]) {
      jaw(k, [s * 0.1, -0.04, 0.72], s, 0.4, open);
      feeler(k, [s * 0.18, 0.12, 0.66], s, 1.2, 0.35, sway * s);
    }
  } else if (who === 'middle_tank') {
    // The stag: spines along the shield and long toothed jaws reaching forward.
    beetle(k, p, 1, 1);
    for (const x of [-0.3, 0, 0.3]) k.cone(0.07, 0.28, 'team2', [x, 0.32, -0.25], { rot: [-0.2, 0, x * -0.8] }, 4);
    k.box(0.75, 0.3, 0.45, CHITIN, [0, 0.02, 0.42]);
    compound(k, [[-0.4, 0.1, 0.48, 0.13], [0.4, 0.1, 0.48, 0.13]], p.blink);
    for (const s of [-1, 1]) {
      jaw(k, [s * 0.24, -0.02, 0.62], s, 0.85, open, true);
      feeler(k, [s * 0.36, 0.1, 0.58], s, 0.55, 0.3, sway * s);
    }
  } else {
    // The rhinoceros beetle: bulky, a great horn curving up from the head and a short one on the shield.
    beetle(k, p, 1.25, 1.25);
    k.ball(0.4, CHITIN, [0, 0.02, 0.45], { scale: [1.25, 0.6, 0.85] });
    const horn = k.group([0, 0.12, 0.62], k.root, [-0.15 - open * 0.25, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const f = i / 5;
      k.box(0.26 - f * 0.18, 0.2, 0.24 - f * 0.16, 'team2Light', [0, Math.sin(f * 1.3) * 0.75, f * 0.45], { to: horn, rot: [-f * 1.1, 0, 0] });
    }
    k.cone(0.12, 0.4, 'team2', [0, 0.45, -0.25], { rot: [0.5, 0, 0] }, 4);
    compound(k, [[-0.4, 0.06, 0.52, 0.11], [0.4, 0.06, 0.52, 0.11]], p.blink);
    for (const s of [-1, 1]) {
      jaw(k, [s * 0.16, -0.08, 0.72], s, 0.22, open);
      feeler(k, [s * 0.4, 0.0, 0.55], s, 0.35, 0.2, sway * s, true);
    }
  }
}

// Hovers: drone minds -------------------------------------------------------------------------------------------------

/** A lens: housing, glass, an iris ring and a lit pupil that looks about (`look` shifts it, -1..1 sideways). */
function lens(k: Kit, r: number, at: At, look: number, to?: THREE.Object3D): void {
  k.tube(r * 1.15, 0.12, 'steelDark', at, { rot: [Math.PI / 2, 0, 0], to }, 10);
  k.tube(r * 0.9, 0.14, 'glassDark', [at[0], at[1], at[2] + 0.02], { rot: [Math.PI / 2, 0, 0], to }, 10);
  k.ring(r * 0.62, r * 0.12, 'team2', [at[0], at[1], at[2] + 0.08], { to });
  k.ball(r * 0.34, 'eye', [at[0] + look * r * 0.35, at[1], at[2] + 0.1], { glow: true, to }, 0);
}

/** The glow a hover rides on, under the bust. */
function lift(k: Kit, p: Pose): void {
  k.box(0.9, 0.06, 0.5, 'eye', [0, -0.78, 0], { glow: true, scale: [1 + wave(p.t, 2) * 0.1, 1, 1] });
  k.box(0.6, 0.05, 0.35, 'eye', [0, -0.95 - (p.t % 0.5) * 0.3, 0], { glow: true, scale: [1 - (p.t % 0.5), 1, 1] });
}

function hover(k: Kit, who: Speaker, p: Pose): void {
  const look = wave(p.t);
  k.root.position.y = wave(p.t, 1, 0.25) * 0.04;
  if (who === 'advisor') {
    // The base's mind: a framed screen, one great ring eye with rings turning round it, a voice trace under it.
    k.box(1.6, 1.75, 0.45, 'teamDark', [0, -0.15, -0.25]);
    k.box(1.7, 0.14, 0.55, 'team2', [0, 0.76, -0.25]);
    k.box(1.4, 1.25, 0.06, VISOR, [0, 0.05, 0.0]);
    const rings = k.group([0, 0.22, 0.06], k.root, [0, 0, p.t * Math.PI]);
    k.ring(0.4, 0.035, 'team2', [0, 0, 0], { to: rings });
    for (let i = 0; i < 4; i++) k.box(0.1, 0.04, 0.04, 'eye', [Math.cos((i * Math.PI) / 2) * 0.48, Math.sin((i * Math.PI) / 2) * 0.48, 0], { glow: true, to: rings });
    k.ring(0.24, 0.05, 'eye', [0, 0.22, 0.08], { glow: true });
    k.ball(0.11, 'flash', [look * 0.08, 0.22, 0.12], { glow: true }, 0);
    for (let i = 0; i < 9; i++) {
      const h = 0.04 + Math.abs(Math.sin(i * 1.7 + p.t * 20)) * p.talk * 0.24;
      k.box(0.07, h, 0.04, 'eye', [-0.4 + i * 0.1, -0.38, 0.06], { glow: true });
    }
    k.box(0.5, 0.4, 0.4, 'steelDark', [0, -1.2, -0.25]);
    return;
  }
  lift(k, p);
  if (who === 'harvester') {
    // The service mind: a chamfered box with a brow over two lenses, an intake grille and hoses at the sides.
    k.box(1.1, 0.8, 0.85, 'team', [0, -0.08, 0]);
    k.box(1.16, 0.16, 0.95, 'team2', [0, 0.36, 0.02]);
    k.box(1.0, 0.1, 0.2, 'teamDark', [0, 0.24, 0.45], { rot: [0.5, 0, 0] });
    lens(k, 0.16, [-0.24, 0.02, 0.43], look);
    lens(k, 0.16, [0.24, 0.02, 0.43], look);
    for (const y of [-0.24, -0.32, -0.4]) k.box(0.5, 0.04, 0.04, p.talk > 0.2 && y === -0.32 ? 'eye' : 'steelDark', [0, y, 0.44], { glow: p.talk > 0.2 && y === -0.32 });
    for (const s of [-1, 1]) k.tube(0.08, 0.7, 'steel', [s * 0.62, -0.35, 0.1], { rot: [0.4, 0, s * 0.2] });
  } else if (who === 'light_tank') {
    // The scout: a sleek teardrop, one big lens, swept fins and sensor whiskers.
    k.ball(0.5, 'team', [0, 0, -0.1], { scale: [0.95, 0.85, 1.3] });
    k.box(0.2, 0.06, 0.9, 'team2', [0, 0.42, -0.15], { rot: [0.15, 0, 0] });
    lens(k, 0.27, [0, 0.0, 0.5], look);
    for (const s of [-1, 1]) {
      k.box(0.7, 0.05, 0.4, 'team2', [s * 0.6, 0.02, -0.25], { rot: [0, s * 0.35, s * 0.35] });
      k.box(0.03, 0.03, 0.5, 'steelLight', [s * 0.3, -0.28, 0.5], { rot: [0.2, s * 0.4, 0] });
    }
  } else if (who === 'middle_tank') {
    // The gunner mind: a broad capsule with three lenses in a triangle and pods on its shoulders.
    k.tube(0.48, 1.0, 'team', [0, 0, 0], { rot: [0, 0, Math.PI / 2] }, 8);
    for (const s of [-1, 1]) k.ball(0.48, 'team', [s * 0.5, 0, 0], {}, 1);
    k.box(0.12, 1.0, 1.0, 'team2', [0, 0, 0]);
    lens(k, 0.14, [-0.3, 0.12, 0.42], look);
    lens(k, 0.14, [0.3, 0.12, 0.42], look);
    lens(k, 0.1, [0, -0.2, 0.46], look);
    for (const s of [-1, 1]) k.box(0.3, 0.26, 0.6, 'teamDark', [s * 0.85, 0.35, -0.1]);
  } else {
    // The siege mind: an armoured block with a slit where a light sweeps, collar plates and cannon roots.
    k.box(1.25, 0.85, 0.95, 'teamDark', [0, 0, 0]);
    k.box(1.05, 0.38, 0.5, 'team', [0, 0.4, 0.2], { rot: [-0.45, 0, 0] });
    k.box(0.92, 0.12, 0.1, DARK, [0, 0.04, 0.48]);
    k.box(0.2, 0.08, 0.06, 'eye', [look * 0.34, 0.04, 0.53], { glow: true });
    k.box(0.4, 0.24, 0.1, 'team2', [0, -0.26, 0.48]);
    for (const s of [-1, 1]) {
      k.box(0.18, 0.7, 0.75, 'steelDark', [s * 0.7, 0, 0]);
      k.tube(0.09, 0.5, 'steel', [s * 0.82, -0.1, 0.35], { rot: [Math.PI / 2, 0, 0] });
    }
  }
}

// Rendering -----------------------------------------------------------------------------------------------------------

const strips = new Map<string, string>();

/** One frame of a face: the bust in a pose, from a little right of straight ahead, as on a comms screen. */
function frame(dress: Dress, who: Speaker, size: number, p: Pose, into?: { g: CanvasRenderingContext2D; x: number }): string {
  const k = kit(dress);
  ({ human, walker, hover })[dress.race](k, who, p);
  // Beetles are seen from higher up, so their jaws and feelers spread out on the screen instead of pointing at it.
  const [from, at] = dress.race === 'walker' ? [new THREE.Vector3(0.4, 1.55, 2.9), new THREE.Vector3(0, -0.12, -0.05)] : [new THREE.Vector3(0.7, 0.2, 3.2), new THREE.Vector3(0, -0.2, 0)];
  return still(k.root, size, from, at, 34, into);
}

/** The face that speaks for a kind of object of a side, `size` art pixels square, still: a PNG data URL. */
export function face(dress: Dress, who: Speaker, size = 32): string {
  return frame(dress, who, size, pose(0));
}

/** The face's loop as a strip of FACE_FRAMES frames side by side: a PNG data URL, cached. */
export function faceStrip(dress: Dress, who: Speaker, size = 32): string {
  const id = `${dress.race}/${dress.color}/${dress.color2}/${dress.color3}/${who}/${size}`;
  const hit = strips.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size * FACE_FRAMES;
  c.height = size;
  const g = c.getContext('2d')!;
  for (let i = 0; i < FACE_FRAMES; i++) frame(dress, who, size, pose(i), { g, x: i * size });
  const url = c.toDataURL('image/png');
  strips.set(id, url);
  return url;
}

/**
 * An element showing a face's loop, played by CSS (`.face` with steps). The delay keeps the loop running on from where
 * it was when the panel is drawn again.
 */
export function faceHtml(dress: Dress, who: Speaker, size = 32, cls = 'portrait'): string {
  const loop = FACE_FRAMES * FACE_FRAME_MS;
  return `<i class="${cls} face" style="background-image: url(${faceStrip(dress, who, size)}); --frames: ${FACE_FRAMES}; --loop: ${loop}ms; animation-delay: -${Math.round(performance.now() % loop)}ms"></i>`;
}
