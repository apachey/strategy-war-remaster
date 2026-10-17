import * as THREE from 'three';
import { ball, cyl, dome, group, lathe, mesh, type Vec3 } from '../kit';
import { facing, limb, plate, slump, spitFlash, WALL_ARMS, type Builder } from './parts';

/**
 * The walkers: jointed many-legged creatures of the open sand. Faceted carapace plates in the team colour on thin
 * dark legs, green eyes, and green muzzles that spit gobs of organic acid. Their buildings are grown, not built:
 * hive mounds held in arching spines, sacs on roots, a brood shell.
 */

/**
 * Jointed legs on both sides of a body, knee raised above the hip. `pairs` hips run from z0 to z1; between the two
 * move frames alternate legs swap forward and back, so the walker steps.
 */
function legs(pairs: number, z0: number, z1: number, hipX: number, hipY: number, reach: number, r: number, frame: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const step = frame === 'move1' || frame === 'harvest1' ? 1 : 0;
  for (let i = 0; i < pairs; i++) {
    const z = pairs === 1 ? z0 : z0 + ((z1 - z0) * i) / (pairs - 1);
    for (const sx of [-1, 1]) {
      const swing = ((i + (sx > 0 ? 1 : 0) + step) % 2 ? 1 : -1) * 0.05;
      const hip: Vec3 = [sx * hipX, hipY, z];
      const knee: Vec3 = [sx * (hipX + reach * 0.55), hipY + 0.08, z + swing];
      const foot: Vec3 = [sx * (hipX + reach), 0, z + swing * 1.6 + (z / Math.abs(z || 1)) * 0.03];
      out.push(limb(hip, knee, r, 'teamDark'), limb(knee, foot, r * 0.8, 'teamDark'), ball(r * 1.3, 'teamLight', knee, 4));
    }
  }
  return out;
}

/** A green acid spike pointing north: the walkers' muzzle. */
function fang(r: number, len: number, pos: Vec3, rot: Vec3 = [0, 0, 0]): THREE.Mesh {
  const geo = new THREE.ConeGeometry(r, len, 4);
  geo.rotateX(-Math.PI / 2);
  return mesh(geo, 'bileLight', pos, rot);
}

/**
 * Walker light tank: a skittering tripod. A small arrowhead body on three thin legs, one big green eye in front and
 * a single spike under the chin that spits acid.
 */
const lightTank: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const step = frame === 'move1' ? 0.04 : 0;
  const body = new THREE.ConeGeometry(0.21, 0.58, 3);
  body.rotateX(-Math.PI / 2);
  body.scale(1, 0.55, 1);
  const g = group(
    mesh(body, 'team', [0, 0.26, 0]),
    plate(0.13, 1, 0.6, 1.4, 'teamLight', [0, 0.33, 0.06]),
    ball(0.055, 'signal', [0, 0.31, -0.16], 6),
    cyl(0, 0.035, 0.12, 'teamDark', [0, 0.36, 0.14], 4),
    limb([0, 0.24, -0.12], [0, 0.0, -0.3 - step], 0.034, 'teamDark'),
    limb([-0.08, 0.24, 0.12], [-0.3, 0.0, 0.26 + step], 0.034, 'teamDark'),
    limb([0.08, 0.24, 0.12], [0.3, 0.0, 0.26 - step], 0.034, 'teamDark'),
    ball(0.03, 'teamLight', [0, 0.0, -0.3 - step], 4),
    ball(0.03, 'teamLight', [-0.3, 0.0, 0.26 + step], 4),
    ball(0.03, 'teamLight', [0.3, 0.0, 0.26 - step], 4),
    fang(0.03, 0.3, [0, 0.2, -0.3 + (fire ? 0.04 : 0)]),
    ball(0.03, 'bileGlow', [0, 0.2, -0.45], 4),
  );
  if (fire) g.add(spitFlash([0, 0.2, -0.54], 0.08));
  if (frame === 'wreck') slump(g, -0.04, 0.15);
  return facing(g, view);
};

/**
 * Walker middle tank: a beetle. A segmented carapace on six legs, and on its back a coiled horn whose green tip
 * spits a gob of acid.
 */
const middleTank: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const g = group(
    plate(0.2, 1.05, 0.55, 1.5, 'teamDark', [0, 0.18, 0.05]),
    plate(0.17, 1.05, 0.6, 0.9, 'team', [0, 0.24, 0.16]),
    plate(0.15, 1.1, 0.6, 0.8, 'team', [0, 0.24, -0.06]),
    plate(0.1, 1.2, 0.6, 0.8, 'teamLight', [0, 0.2, -0.25]),
    ball(0.035, 'signal', [-0.06, 0.24, -0.33], 4),
    ball(0.035, 'signal', [0.06, 0.24, -0.33], 4),
    ...legs(3, -0.18, 0.22, 0.14, 0.17, 0.24, 0.022, frame),
  );
  // Horn: a ridge spiralling up and forward from the back, ending in a green tip.
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const k = i / steps;
    const a = k * Math.PI * 2 * 1.25;
    const r = 0.1 - k * 0.07;
    g.add(ball(0.05 - k * 0.025, i % 2 ? 'teamLight' : 'team', [Math.cos(a) * r * 0.6, 0.32 + k * 0.2, 0.12 - k * 0.32 + Math.sin(a) * r], 4));
  }
  g.add(ball(fire ? 0.06 : 0.045, fire ? 'bileGlow' : 'bileLight', [0, 0.53, -0.22], 6));
  if (fire) g.add(spitFlash([0, 0.5, -0.38], 0.09));
  if (frame === 'wreck') slump(g, -0.04, 0.15);
  return facing(g, view);
};

/**
 * Walker heavy tank: a crawling fortress. A broad faceted shell with glowing green seams, carried low on eight stubby
 * legs, a mouth of mandibles in front and two long green prongs with a gob of acid swelling between them.
 */
const heavyTank: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const g = group(
    plate(0.3, 1.0, 0.5, 1.25, 'teamDark', [0, 0.17, 0.05]),
    plate(0.26, 1.0, 0.62, 1.15, 'team', [0, 0.25, 0.08]),
    plate(0.14, 1.2, 0.7, 1.0, 'teamLight', [0, 0.38, 0.12]),
    // Glowing seams across the shell.
    ...[-0.08, 0.08, 0.24].map((z) => {
      const seam = mesh(new THREE.BoxGeometry(0.42, 0.02, 0.025), 'bileGlow', [0, 0.33 - Math.abs(z - 0.08) * 0.3, z]);
      seam.castShadow = false;
      return seam;
    }),
    ...[-0.1, 0.1].map((x) => plate(0.06, 1, 1.4, 1, 'teamDark', [x, 0.16, -0.3])),
    ball(0.04, 'signal', [-0.1, 0.28, -0.27], 4),
    ball(0.04, 'signal', [0.1, 0.28, -0.27], 4),
    ball(0.03, 'signal', [0, 0.32, -0.25], 4),
    fang(0.05, 0.5, [-0.12, 0.24, -0.38], [0.05, -0.12, 0]),
    fang(0.05, 0.5, [0.12, 0.24, -0.38], [0.05, 0.12, 0]),
    ball(fire ? 0.09 : 0.06, fire ? 'bileGlow' : 'bileLight', [0, 0.24, -0.55], 6),
    ...legs(4, -0.22, 0.3, 0.24, 0.13, 0.16, 0.03, frame),
  );
  if (fire) g.add(spitFlash([0, 0.24, -0.68], 0.11));
  if (frame === 'wreck') slump(g, -0.04, 0.15);
  return facing(g, view);
};

/**
 * Walker harvester: a six-legged beetle carrying a big pale sac on its back, with a pair of mandibles to scoop.
 * Harvesting, it dips its head and its mandibles open and snap shut on a crystal.
 */
const harvester: Builder = (view, frame) => {
  const harvest = frame.startsWith('harvest');
  const k = frame === 'harvest1' ? 1 : 0;
  const head = group(
    plate(0.14, 1.1, 0.6, 0.9, 'team', [0, 0, 0]),
    ball(0.03, 'signal', [-0.06, 0.02, -0.12], 4),
    ball(0.03, 'signal', [0.06, 0.02, -0.12], 4),
    ...[-1, 1].map((sx) => {
      const open = harvest ? (k ? 0.15 : 0.75) : 0.45;
      const geo = new THREE.ConeGeometry(0.04, 0.22, 4);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, -0.11);
      return mesh(geo, 'teamLight', [sx * 0.07, -0.09, -0.08], [0, -sx * open, 0]);
    }),
  );
  // A crystal caught between the closed mandibles.
  if (harvest && k) head.add(mesh(new THREE.OctahedronGeometry(0.05, 0), 'gold', [0, -0.09, -0.27]));
  head.position.set(0, 0.22, -0.18);
  if (harvest) head.rotation.x = -0.35;
  const g = group(
    plate(0.19, 1.05, 0.55, 1.2, 'teamDark', [0, 0.17, -0.08]),
    plate(0.22, 1.0, 0.85, 1.1, 'teamLight', [0, 0.27, 0.18]),
    head,
    ...legs(3, -0.16, 0.22, 0.14, 0.17, 0.22, 0.022, frame),
  );
  // The sac fills: crystals show through its skin while harvesting.
  if (harvest) g.add(plate(0.08, 1, 0.8, 1, 'crystal', [0.08 - k * 0.12, 0.42, 0.2 + k * 0.05]));
  if (frame === 'wreck') slump(g, -0.04, 0.15);
  return facing(g, view);
};

/** Walker defender: a thorny stalk on spreading roots, topped by a bulb with a green eye and an acid spike. */
const defender: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const head = group(
    plate(0.16, 1, 0.8, 1.15, 'team', [0, 0, 0]),
    plate(0.09, 1.1, 0.6, 1, 'teamLight', [0, 0.06, 0.05]),
    ball(0.045, 'signal', [0, 0.03, -0.15], 6),
    fang(0.035, 0.24, [0, -0.04, -0.2 + (fire ? 0.03 : 0)]),
  );
  if (fire) head.add(spitFlash([0, -0.04, -0.38], 0.08));
  head.rotation.y = (-view * Math.PI) / 4;
  head.position.y = 0.66;
  const g = group(stalk(0.58), head);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    g.add(root(a, 0.08, 0.32, 0.12));
    const thorn = new THREE.ConeGeometry(0.025, 0.12, 4);
    thorn.rotateZ(-Math.PI / 2);
    g.add(mesh(thorn, 'teamLight', [Math.cos(a) * 0.1, 0.25 + i * 0.07, Math.sin(a) * 0.1], [0, -a, 0.3]));
  }
  return g;
};

/** Tapering stalk of chitin, `h` tall. */
function stalk(h: number, r = 0.24): THREE.Mesh {
  return lathe(
    [
      [r, 0],
      [r * 0.58, 0.06],
      [r * 0.33, h * 0.34],
      [r * 0.25, h],
      [0, h],
    ],
    'teamDark',
    [0, 0, 0],
    6,
  );
}

/** Root running from a trunk at radius r0 (height y0) out to the ground at radius r1, in direction a. */
function root(a: number, r0: number, r1: number, y0: number, r = 0.035): THREE.Mesh {
  return limb([Math.cos(a) * r0, y0, Math.sin(a) * r0], [Math.cos(a) * r1, 0, Math.sin(a) * r1], r, 'teamDark');
}

/** Arching spine from the ground at radius r0 up over to radius r1 at height h, in direction a; tipped in green. */
function spine(a: number, r0: number, r1: number, h: number, r: number): THREE.Mesh[] {
  const p = (t: number): Vec3 => {
    const rr = r0 + (r1 - r0) * t;
    return [Math.cos(a) * rr, h * Math.sin((t * Math.PI) / 2) + 0.02, Math.sin(a) * rr];
  };
  const out: THREE.Mesh[] = [];
  const n = 4;
  for (let i = 0; i < n; i++) out.push(limb(p(i / n), p((i + 1) / n), r * (1 - i * 0.18), i % 2 ? 'team' : 'teamDark'));
  out.push(ball(r * 0.9, 'teamLight', p(0.5), 4), ball(r * 0.8, 'bileLight', p(1), 4));
  return out;
}

/** Spit in flight: a lumpy gob of acid with drops behind it, bigger for the cannon. */
const shot: Builder = (view, frame) => {
  const g = group(spitFlash([0, 0.32, 0], frame === 'cannon' ? 0.1 : 0.065));
  g.traverse((o) => (o.castShadow = true));
  return facing(g, view);
};

/**
 * Walker HQ: a hive mound. A heap of faceted carapace plates held in six spines that arch up from the sand and bend
 * over its top, a glowing green maw in front with three eyes over it, egg sacs at its foot and roots spreading out.
 * The maw breathes and the eyes blink over four frames.
 */
const hq: Builder = (_view, frame) => {
  const k = Number(frame.slice(-1)) || 0;
  const g = group(
    plate(0.62, 1.2, 0.75, 1.15, 'teamDark', [0, 0.28, 0]),
    plate(0.5, 1.1, 0.95, 1.05, 'team', [0, 0.5, -0.02]),
    plate(0.3, 1.1, 1.1, 1.0, 'teamLight', [0.02, 0.86, -0.04]),
    // Maw.
    plate(0.2, 1.4, 1, 0.6, 'teamDark', [0, 0.3, 0.6]),
    plate(k % 2 ? 0.12 : 0.15, 1.4, 0.9, 0.5, 'bileGlow', [0, 0.3, 0.66]),
    ...[-0.12, 0, 0.12].map((x, i) => ball(0.04, k === i + 1 ? 'teamDark' : 'signal', [x, 0.52 + (x ? 0 : 0.04), 0.6], 4)),
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    g.add(...spine(a, 0.86, 0.18, 1.25, 0.06));
    g.add(root(a + Math.PI / 6, 0.5, 0.95, 0.1, 0.04));
  }
  for (const [x, z, r] of [
    [-0.62, 0.55, 0.11],
    [-0.48, 0.7, 0.08],
    [0.66, 0.42, 0.1],
  ] as const) {
    g.add(plate(r, 1, 1.2, 1, 'teamLight', [x, r, z]), ball(r * 0.35, 'bile', [x, r * 1.8, z + r * 0.4], 4));
  }
  return g;
};

/**
 * Walker silo: three bulging sacs on a knot of roots, crystals showing through seams in their skin, with a funnel
 * mouth on the south where harvesters spit in their load.
 */
const silo: Builder = () => {
  const g = group(plate(0.4, 1.3, 0.35, 1.3, 'teamDark', [0, 0.06, 0]));
  for (const [x, z, r] of [
    [-0.38, -0.3, 0.42],
    [0.36, -0.36, 0.34],
    [-0.05, 0.25, 0.3],
  ] as const) {
    g.add(plate(r, 1, 1.15, 1, 'teamLight', [x, r * 1.05, z]), plate(r * 0.8, 1.05, 0.6, 1.05, 'team', [x, r * 0.4, z]));
    g.add(...[0.6, 2.2, 3.8].map((a) => plate(r * 0.22, 0.6, 1.4, 0.6, 'crystal', [x + Math.cos(a) * r * 0.8, r * 1.2, z + Math.sin(a) * r * 0.8])));
    g.add(ball(r * 0.15, 'signal', [x, r * 2.1, z], 4));
  }
  for (let i = 0; i < 6; i++) g.add(root((i / 6) * Math.PI * 2, 0.4, 0.95, 0.12, 0.04));
  // Funnel mouth.
  g.add(
    lathe(
      [
        [0.08, 0],
        [0.12, 0.08],
        [0.22, 0.2],
        [0.18, 0.22],
        [0.04, 0.12],
      ],
      'team',
      [0.42, 0, 0.42],
      6,
    ),
    dome(0.1, 'bile', [0.42, 0.1, 0.42], 0.6, 6),
  );
  return g;
};

/**
 * Walker factory: a brood shell. A huge carapace like half a clam, propped on spines and open to the south; under it
 * a slimy egg glows. Working, the egg splits and a young tripod climbs out between two mandible arms.
 */
const factory: Builder = (_view, frame) => {
  const work = frame === 'work';
  const shell = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.scale(0.82, 0.8, 0.7);
  shell.rotateX(-1.05);
  const g = group(
    mesh(shell, 'team', [0, 0.3, -0.2]),
    plate(0.35, 1.6, 0.4, 1, 'teamLight', [0, 0.92, -0.3]),
    ...[-0.5, 0, 0.5].flatMap((x) => spine(Math.PI / 2, x === 0 ? -0.75 : -0.6, -0.1, 0.9, 0.05).map((m) => {
      m.position.x += x;
      return m;
    })),
    plate(0.34, 1.6, 0.25, 1.4, 'teamDark', [0, 0.04, 0.12]),
  );
  for (const sx of [-1, 1]) {
    g.add(limb([sx * 0.62, 0.1, 0.3], [sx * 0.5, 0.42, 0.5], 0.045, 'teamDark'), limb([sx * 0.5, 0.42, 0.5], [sx * 0.24, 0.3, 0.66], 0.035, 'teamDark'));
    g.add(ball(0.04, 'teamLight', [sx * 0.5, 0.42, 0.5], 4));
  }
  if (work) {
    const young = lightTank(4, 'move1');
    young.scale.setScalar(0.85);
    young.position.set(0.05, 0.06, 0.42);
    g.add(young, plate(0.12, 1, 0.8, 1, 'bile', [-0.08, 0.1, 0.12]), plate(0.1, 1, 0.6, 1, 'bileLight', [0.2, 0.08, 0.16], [0, 0, 0.8]));
  } else g.add(plate(0.17, 0.9, 1.3, 0.9, 'bileLight', [0, 0.22, 0.14]), ball(0.05, 'bileGlow', [0.04, 0.3, 0.28], 4));
  return g;
};

/**
 * Walker building site: a dark pool of acid in the sand with roots creeping in from all round it and curling up at
 * its edge, a single egg in the middle.
 */
const construction: Builder = () => {
  const pool = new THREE.CylinderGeometry(0.62, 0.7, 0.04, 9);
  const g = group(mesh(pool, 'bile', [0, 0.02, 0]), plate(0.14, 1, 1.2, 1, 'bileLight', [0, 0.12, 0]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    g.add(root(a, 0.62, 1.02, 0.18, 0.04));
    g.add(...spine(a, 0.66, 0.5, 0.36 + (i % 3) * 0.08, 0.035));
  }
  return g;
};

/**
 * Walker wall: a ridge of chitin plates bristling with thorns, meeting at a knot with a cluster of thorns on it
 * (bits N1 E2 S4 W8).
 */
const wall: Builder = (mask) => {
  const thorn = (x: number, z: number, h: number, lean: Vec3, mat: 'team' | 'teamLight') => {
    const m = mesh(new THREE.ConeGeometry(0.05, h, 4).translate(0, h / 2, 0), mat, [x, 0.1, z]);
    m.rotation.set(...lean);
    return m;
  };
  const g = group(
    plate(0.17, 1.1, 0.75, 1.1, 'teamDark', [0, 0.1, 0]),
    thorn(0, 0, 0.36, [0, 0, 0], 'teamLight'),
    thorn(-0.06, 0.04, 0.24, [0.2, 0, 0.4], 'team'),
    thorn(0.06, 0.04, 0.24, [0.2, 0, -0.4], 'team'),
  );
  for (const [bit, dx, dz] of WALL_ARMS) {
    if (!(mask & bit)) continue;
    for (const t of [0.22, 0.4]) {
      g.add(plate(0.12, dx ? 1.3 : 1, 0.7, dz ? 1.3 : 1, t < 0.3 ? 'team' : 'teamDark', [dx * t, 0.08, dz * t]));
    }
    g.add(thorn(dx * 0.31, dz * 0.31, 0.2, [dz * 0.25, 0, -dx * 0.25], 'teamLight'));
  }
  return g;
};

export const WALKER: Record<string, Builder> = {
  walker_harvester: harvester,
  walker_light_tank: lightTank,
  walker_middle_tank: middleTank,
  walker_heavy_tank: heavyTank,
  walker_defender: defender,
  walker_shot: shot,
  walker_hq: hq,
  walker_silo: silo,
  walker_factory: factory,
  walker_construction: construction,
  walker_wall: wall,
};
