/**
 * The people (and things) inside the machines: StarCraft-style talking heads for the selection panel, built from
 * low-poly shapes and rendered like every other 3D still, so they share the palette, light and outline.
 *
 * Humans are colonists in helmets: the harvester driver in a cap and headset, the buggy driver in a light helmet with
 * goggles, the medium tank's crew in a standard helmet, the heavy tank's in a sealed one; their bases talk through a
 * robot adjutant. Walkers are a hive: chitin pilots with glowing eyes and mandibles, and an overlord over the base.
 * Hovers are machines with no crew: each hull is flown by its own drone core, and the base is one computer, an eye on
 * a screen.
 */
import * as THREE from 'three';
import type { MaterialName } from '../../../../tools/art/src/materials';
import { paint, still, type Dress } from './scene3d';

/** Who talks for a kind of object: a pilot for each unit, the base's advisor for every building. */
export type Speaker = 'harvester' | 'light_tank' | 'middle_tank' | 'heavy_tank' | 'advisor';

export const speakerOf = (kind: string): Speaker | null =>
  kind === 'resource' ? null : (['harvester', 'light_tank', 'middle_tank', 'heavy_tank'] as const).find((k) => k === kind) ?? 'advisor';

const SKIN = ['#3a2418', '#6a4030', '#a06850', '#d09a78', '#f0c8a4'];
const DARK = ['#0a0806', '#1a1410', '#2a2018'];
const VISOR = ['#081018', '#14283a', '#24486a', '#4a80b0', '#a8d8ff'];
const FLESH = ['#3a1030', '#6a2050', '#a04078', '#d070a0', '#f8b0d0'];

type Paint = readonly string[] | MaterialName;

/** A small kit of shapes in one dress; every call adds a mesh to the bust. */
function kit(dress: Dress) {
  const root = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, p: Paint, at: [number, number, number], o: { rot?: [number, number, number]; scale?: [number, number, number]; glow?: boolean; to?: THREE.Object3D } = {}) => {
    const m = new THREE.Mesh(geo, paint(p, dress, o.glow));
    m.position.set(...at);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.set(...o.scale);
    (o.to ?? root).add(m);
    return m;
  };
  return {
    root,
    box: (w: number, h: number, d: number, p: Paint, at: [number, number, number], o?: Parameters<typeof add>[3]) => add(new THREE.BoxGeometry(w, h, d), p, at, o),
    ball: (r: number, p: Paint, at: [number, number, number], o?: Parameters<typeof add>[3], detail = 1) => add(new THREE.IcosahedronGeometry(r, detail), p, at, o),
    dome: (r: number, p: Paint, at: [number, number, number], o?: Parameters<typeof add>[3], cut = Math.PI / 2) =>
      add(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, cut), p, at, o),
    tube: (r: number, h: number, p: Paint, at: [number, number, number], o?: Parameters<typeof add>[3], sides = 8, r2 = r) =>
      add(new THREE.CylinderGeometry(r2, r, h, sides), p, at, o),
    cone: (r: number, h: number, p: Paint, at: [number, number, number], o?: Parameters<typeof add>[3], sides = 5) => add(new THREE.ConeGeometry(r, h, sides), p, at, o),
    ring: (r: number, t: number, p: Paint, at: [number, number, number], o?: Parameters<typeof add>[3]) => add(new THREE.TorusGeometry(r, t, 4, 12), p, at, o),
  };
}

type Kit = ReturnType<typeof kit>;

/** Shoulders in the side's colour with a collar in its second colour: every crew member and the robot wear them. */
function shoulders(k: Kit, wide = 1): void {
  k.box(1.5 * wide, 0.5, 0.8, 'team', [0, -1.1, -0.05]);
  k.box(0.8, 0.16, 0.66, 'team2', [0, -0.8, 0]);
  k.box(0.3, 0.36, 0.5, 'teamDark', [-0.7 * wide, -0.98, 0]);
  k.box(0.3, 0.36, 0.5, 'teamDark', [0.7 * wide, -0.98, 0]);
}

/** A human head: skin, eyes, brows and a mouth, facing +z. */
function humanHead(k: Kit): void {
  k.tube(0.2, 0.35, SKIN, [0, -0.58, 0]);
  k.ball(0.48, SKIN, [0, 0, 0], { scale: [0.88, 1.05, 0.95] });
  k.box(0.1, 0.12, 0.1, SKIN, [0, -0.02, 0.46]);
  for (const x of [-0.16, 0.16]) {
    k.box(0.13, 0.08, 0.06, ['#f0ece0'], [x, 0.07, 0.44]);
    k.box(0.06, 0.08, 0.06, DARK, [x + 0.02, 0.07, 0.46]);
    k.box(0.17, 0.05, 0.06, ['#2a1a10', '#4a3020'], [x, 0.17, 0.44]);
  }
  k.box(0.2, 0.04, 0.06, ['#5a2a20', '#8a4a3a'], [0, -0.2, 0.43]);
}

function human(k: Kit, who: Speaker): void {
  if (who === 'advisor') {
    // The adjutant: a robot head with a glowing eye band, an antenna and a grille for a mouth.
    shoulders(k, 1.05);
    k.tube(0.18, 0.4, 'steelDark', [0, -0.6, 0]);
    k.box(0.92, 0.95, 0.85, 'steel', [0, 0.02, 0]);
    k.box(0.96, 0.16, 0.1, 'lamp', [0, 0.12, 0.42], { glow: true });
    k.box(0.5, 0.22, 0.06, 'steelDark', [0, -0.25, 0.43]);
    for (const x of [-0.14, 0, 0.14]) k.box(0.05, 0.18, 0.04, 'steelLight', [x, -0.25, 0.46]);
    k.box(0.12, 0.5, 0.5, 'team', [-0.52, 0, 0]);
    k.box(0.12, 0.5, 0.5, 'team', [0.52, 0, 0]);
    k.tube(0.03, 0.5, 'steelDark', [0.3, 0.7, 0]);
    k.ball(0.07, 'signal', [0.3, 0.97, 0], { glow: true }, 0);
    return;
  }
  shoulders(k);
  humanHead(k);
  if (who === 'harvester') {
    // A cap and a headset with a boom microphone.
    k.dome(0.5, 'team2', [0, 0.12, -0.02], { scale: [0.95, 0.8, 1] });
    k.box(0.62, 0.05, 0.36, 'team2Dark', [0, 0.16, 0.5], { rot: [0.15, 0, 0] });
    for (const x of [-0.46, 0.46]) k.tube(0.14, 0.1, 'steelDark', [x, 0, 0], { rot: [0, 0, Math.PI / 2] });
    k.box(0.04, 0.04, 0.36, 'steelDark', [-0.42, -0.18, 0.24], { rot: [0, -0.5, 0] });
    k.ball(0.05, 'steel', [-0.28, -0.22, 0.42], {}, 0);
  } else if (who === 'light_tank') {
    // A light open helmet with goggles pushed up on it.
    k.dome(0.55, 'team', [0, 0.05, -0.02]);
    k.box(0.9, 0.12, 0.2, 'steelDark', [0, 0.32, 0.38]);
    for (const x of [-0.16, 0.16]) k.tube(0.1, 0.08, 'glass', [x, 0.33, 0.46], { rot: [Math.PI / 2, 0, 0] });
    k.box(0.05, 0.4, 0.05, 'steelDark', [-0.42, -0.15, 0.2]);
    k.box(0.05, 0.4, 0.05, 'steelDark', [0.42, -0.15, 0.2]);
  } else if (who === 'middle_tank') {
    // A standard combat helmet: rounded shell, a rim, ear guards and a visor raised over the brow.
    k.dome(0.6, 'team', [0, 0.02, -0.04], { scale: [1, 1.05, 1] });
    k.ring(0.56, 0.05, 'teamDark', [0, 0.04, -0.04], { rot: [Math.PI / 2, 0, 0] });
    k.box(0.14, 0.42, 0.42, 'teamDark', [-0.5, -0.12, 0]);
    k.box(0.14, 0.42, 0.42, 'teamDark', [0.5, -0.12, 0]);
    k.box(0.8, 0.14, 0.12, VISOR, [0, 0.42, 0.42], { rot: [-0.4, 0, 0] });
    k.box(0.1, 0.1, 0.06, 'team2', [0.36, 0.3, 0.46]);
  } else {
    // A sealed heavy helmet: dark visor, chin guard and breathing hoses.
    k.ball(0.63, 'team', [0, 0.06, -0.02], { scale: [0.95, 1, 1] });
    k.box(0.8, 0.22, 0.2, VISOR, [0, 0.08, 0.5]);
    k.box(0.04, 0.22, 0.04, 'steelLight', [0.2, 0.08, 0.6]);
    k.box(0.62, 0.32, 0.3, 'steelDark', [0, -0.28, 0.42]);
    for (const x of [-0.18, 0.18]) k.tube(0.06, 0.5, 'steel', [x * 1.6, -0.5, 0.36], { rot: [0.3, 0, x * 2] });
    k.box(0.2, 0.08, 0.1, 'team2', [0, 0.45, 0.48]);
  }
}

/** Eyes of the hive: glowing beads in the side's second colour. */
function eyes(k: Kit, list: Array<[number, number, number]>, r = 0.07, to?: THREE.Object3D): void {
  for (const at of list) k.ball(r, 'eye', at, { glow: true, to }, 0);
}

function walker(k: Kit, who: Speaker): void {
  if (who === 'advisor') {
    // The overlord: a swollen brain over a ring of eyes, tentacles hanging below.
    k.ball(0.75, FLESH, [0, 0.35, -0.1], { scale: [1.1, 0.85, 1] }, 2);
    for (const [y, r] of [[0.55, 0.55], [0.3, 0.7]] as const) k.ring(r, 0.05, ['#2a0820', '#4a1038', '#702050'], [0, y, -0.1], { rot: [Math.PI / 2, 0, 0] });
    k.ball(0.5, 'team', [0, -0.25, 0.1], { scale: [1.1, 0.8, 1] });
    eyes(k, [[-0.28, -0.15, 0.48], [0.28, -0.15, 0.48], [0, -0.05, 0.55], [-0.14, -0.32, 0.5], [0.14, -0.32, 0.5]], 0.08);
    for (const x of [-0.45, -0.15, 0.15, 0.45]) k.cone(0.09, 0.8, 'team2', [x, -0.85, 0.15], { rot: [Math.PI, 0, x * 0.4] });
    return;
  }
  // A chitin head leaning forward from a ridged thorax.
  k.ball(0.62, 'teamDark', [0, -1.0, -0.1], { scale: [1.5, 0.7, 1] });
  k.tube(0.18, 0.5, 'team2', [0, -0.55, 0], { rot: [0.3, 0, 0] });
  const head = new THREE.Group();
  head.rotation.x = 0.15;
  k.root.add(head);
  const on = { to: head };
  k.ball(0.5, 'team', [0, 0, 0], { ...on, scale: [0.85, 0.9, 1.25] });
  // Every hive face: a heavy brow over the eyes, cheek plates and a dark maw between the mandibles.
  for (const sx of [-1, 1]) k.box(0.3, 0.07, 0.12, 'teamDark', [sx * 0.17, 0.24, 0.52], { ...on, rot: [0, 0, sx * -0.35] });
  for (const sx of [-1, 1]) k.box(0.12, 0.28, 0.18, 'team2Dark', [sx * 0.32, -0.16, 0.44], { ...on, rot: [0, sx * 0.5, sx * 0.25] });
  k.box(0.26, 0.12, 0.1, DARK, [0, -0.3, 0.55], on);
  if (who === 'harvester') {
    // Wide crushing jaws for crystal.
    for (const s of [-1, 1]) k.cone(0.12, 0.55, 'team2Light', [s * 0.26, -0.3, 0.5], { ...on, rot: [Math.PI / 2 + 0.4, 0, s * 0.6] });
    eyes(k, [[-0.2, 0.12, 0.52], [0.2, 0.12, 0.52]], 0.08, head);
  } else if (who === 'light_tank') {
    // Slim and quick: two big eyes, two feelers.
    eyes(k, [[-0.18, 0.08, 0.55], [0.18, 0.08, 0.55]], 0.1, head);
    for (const s of [-1, 1]) k.tube(0.02, 0.7, 'team2', [s * 0.2, 0.55, 0.2], { ...on, rot: [-0.5, 0, s * -0.4] });
    for (const s of [-1, 1]) k.cone(0.06, 0.25, 'team2', [s * 0.1, -0.33, 0.52], { ...on, rot: [Math.PI, 0, 0] });
  } else if (who === 'middle_tank') {
    // A crest of spines and four eyes.
    for (const z of [-0.3, 0, 0.3]) k.cone(0.1, 0.35, 'team2', [0, 0.45, z], on);
    eyes(k, [[-0.22, 0.12, 0.5], [0.22, 0.12, 0.5], [-0.12, -0.02, 0.58], [0.12, -0.02, 0.58]], 0.07, head);
    for (const s of [-1, 1]) k.cone(0.07, 0.3, 'team2Light', [s * 0.14, -0.33, 0.5], { ...on, rot: [Math.PI, 0, s * 0.3] });
  } else {
    // Armoured plates and six eyes.
    k.box(0.9, 0.18, 0.9, 'team2Dark', [0, 0.35, 0], { ...on, rot: [0.1, 0, 0] });
    for (const s of [-1, 1]) k.box(0.18, 0.5, 0.8, 'team2Dark', [s * 0.42, 0.05, 0], on);
    eyes(k, [[-0.24, 0.14, 0.5], [0, 0.18, 0.56], [0.24, 0.14, 0.5], [-0.14, 0, 0.58], [0.14, 0, 0.58], [0, -0.08, 0.6]], 0.06, head);
    for (const s of [-1, 1]) k.cone(0.1, 0.4, 'team2', [s * 0.18, -0.36, 0.48], { ...on, rot: [Math.PI, 0, s * 0.4] });
  }
}

/** A lens: a dark housing ring, glass, and a lit core in the side's second colour. */
function lens(k: Kit, r: number, at: [number, number, number], to?: THREE.Object3D): void {
  k.tube(r, 0.1, 'steelDark', at, { rot: [Math.PI / 2, 0, 0], to }, 10);
  k.tube(r * 0.75, 0.12, 'glassDark', [at[0], at[1], at[2] + 0.02], { rot: [Math.PI / 2, 0, 0], to }, 10);
  k.ball(r * 0.35, 'eye', [at[0], at[1], at[2] + 0.08], { glow: true, to }, 0);
}

function hover(k: Kit, who: Speaker): void {
  if (who === 'advisor') {
    // The base's mind: a slab of a computer with one ring eye on its screen and status lights under it.
    k.box(1.5, 1.7, 0.5, 'teamDark', [0, -0.2, -0.2]);
    k.box(1.3, 1.1, 0.06, VISOR, [0, 0.05, 0.08]);
    k.ring(0.32, 0.06, 'eye', [0, 0.1, 0.12], { glow: true });
    k.ball(0.1, 'eye', [0, 0.1, 0.13], { glow: true }, 0);
    for (const x of [-0.45, -0.3, -0.15]) k.box(0.08, 0.06, 0.04, 'signal', [x, -0.62, 0.08], { glow: true });
    k.box(1.5, 0.12, 0.6, 'team2', [0, 0.72, -0.2]);
    k.box(0.4, 0.5, 0.4, 'steelDark', [0, -1.2, -0.2]);
    return;
  }
  // A drone core on a mount: no one aboard.
  k.box(1.2, 0.3, 0.7, 'plateDark', [0, -1.1, -0.1]);
  k.tube(0.12, 0.6, 'steelDark', [0, -0.75, 0]);
  if (who === 'harvester') {
    // A boxy service unit: two lenses, a grille and a scoop of an antenna.
    k.box(1, 0.75, 0.8, 'team', [0, -0.05, 0]);
    k.box(1.04, 0.14, 0.84, 'team2', [0, 0.3, 0]);
    lens(k, 0.15, [-0.22, 0, 0.42]);
    lens(k, 0.15, [0.22, 0, 0.42]);
    for (const x of [-0.2, 0, 0.2]) k.box(0.1, 0.04, 0.04, 'steelDark', [x, -0.26, 0.42]);
    k.tube(0.02, 0.45, 'steel', [0.38, 0.55, -0.1]);
  } else if (who === 'light_tank') {
    // A small round scout: one big eye and two fins.
    k.ball(0.5, 'team', [0, 0, 0], {}, 1);
    lens(k, 0.24, [0, 0.02, 0.44]);
    for (const s of [-1, 1]) k.box(0.5, 0.06, 0.3, 'team2', [s * 0.55, 0.05, -0.05], { rot: [0, 0, s * 0.3] });
  } else if (who === 'middle_tank') {
    // A capsule with twin lenses and a stripe.
    k.tube(0.45, 0.9, 'team', [0, 0, 0], { rot: [0, 0, Math.PI / 2] }, 8);
    k.ball(0.45, 'team', [-0.45, 0, 0], {}, 1);
    k.ball(0.45, 'team', [0.45, 0, 0], {}, 1);
    k.box(0.12, 0.92, 0.92, 'team2', [0, 0, 0]);
    lens(k, 0.15, [-0.3, 0.05, 0.42]);
    lens(k, 0.15, [0.3, 0.05, 0.42]);
  } else {
    // An armoured wedge with a lit slit for an eye.
    k.box(1.2, 0.8, 0.9, 'teamDark', [0, 0, 0]);
    k.box(1.0, 0.4, 0.4, 'team', [0, 0.35, 0.25], { rot: [-0.5, 0, 0] });
    k.box(0.8, 0.08, 0.06, 'eye', [0, 0.05, 0.46], { glow: true });
    k.box(0.3, 0.3, 0.1, 'team2', [0, -0.25, 0.46]);
    for (const s of [-1, 1]) k.box(0.15, 0.6, 0.6, 'steelDark', [s * 0.65, 0, 0]);
  }
}

const faces = new Map<string, string>();

/** The face that speaks for a kind of object of a side, `size` art pixels square: a PNG data URL, cached. */
export function face(dress: Dress, who: Speaker, size = 64): string {
  const id = `${dress.race}/${dress.color}/${dress.color2}/${who}/${size}`;
  const hit = faces.get(id);
  if (hit) return hit;
  const k = kit(dress);
  ({ human, walker, hover })[dress.race](k, who);
  // Head and shoulders, a little from the right and above, as on a comms screen.
  const url = still(k.root, size, new THREE.Vector3(0.85, 0.3, 2.7), new THREE.Vector3(0, -0.2, 0), 34);
  faces.set(id, url);
  return url;
}
