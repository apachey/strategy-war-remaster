import * as THREE from 'three';
import { ball, cyl, dome, group, lathe, mesh, type Vec3 } from '../kit';
import { facing, limb, plate, slump, thornShot, wallPiece, type Builder } from './parts';

/**
 * The walkers: jointed many-legged creatures of the open sand. Faceted carapace plates in the team colour on thin
 * dark legs, eyes glowing neon in the secondary colour, and muzzles of green acid that shoot thorns in the main
 * colour. Their buildings are grown, not built: hive mounds held in arching spines, sacs on roots, a clawed womb.
 */

/**
 * Eye glowing in the side's secondary colour as neon: a white-hot core showing at the top of a ball of saturated
 * light, so it reads as light in any colour.
 */
function eye(r: number, pos: Vec3): THREE.Group {
  const g = group(ball(r * 1.1, 'eye', pos, 6), ball(r * 0.55, 'glowCore', [pos[0], pos[1] + r * 0.55, pos[2] + r * 0.2], 4));
  g.traverse((o) => (o.castShadow = false));
  return g;
}

/**
 * Jointed legs on both sides of a body, knee raised above the hip. `pairs` hips run from z0 to z1; between the two
 * move frames alternate legs swap forward and back, so the walker steps.
 */
function legs(pairs: number, z0: number, z1: number, hipX: number, hipY: number, reach: number, r: number, frame: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const step = frame === 'move1' ? 1 : 0;
  for (let i = 0; i < pairs; i++) {
    const z = pairs === 1 ? z0 : z0 + ((z1 - z0) * i) / (pairs - 1);
    for (const sx of [-1, 1]) {
      const swing = ((i + (sx > 0 ? 1 : 0) + step) % 2 ? 1 : -1) * 0.05;
      const hip: Vec3 = [sx * hipX, hipY, z];
      const knee: Vec3 = [sx * (hipX + reach * 0.55), hipY + 0.08, z + swing];
      const foot: Vec3 = [sx * (hipX + reach), 0, z + swing * 1.6 + (z / Math.abs(z || 1)) * 0.03];
      out.push(limb(hip, knee, r, 'teamDark'), limb(knee, foot, r * 0.8, 'teamDark'), ball(r * 1.3, 'team2Light', knee, 4));
    }
  }
  return out;
}

/** A spike of chitin pointing north: the walkers' muzzle, in the main colour so it never looks like a shot. */
function fang(r: number, len: number, pos: Vec3, rot: Vec3 = [0, 0, 0]): THREE.Mesh {
  const geo = new THREE.ConeGeometry(r, len, 4);
  geo.rotateX(-Math.PI / 2);
  return mesh(geo, 'teamLight', pos, rot);
}

/**
 * Walker light tank: a skittering tripod. A small arrowhead body on three thin legs, one big eye in front and
 * a single spike under the chin, a drop of acid at its root, that shoots thorns.
 */
const lightTank: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const step = frame === 'move1' ? 0.04 : 0;
  const body = new THREE.ConeGeometry(0.21, 0.58, 3);
  body.rotateX(-Math.PI / 2);
  body.scale(1, 0.55, 1);
  // The head, its turret: a pale plate with the eye, and the spike under its chin.
  const head = group(
    plate(0.11, 1, 0.6, 1.3, 'team2Light', [0, 0, 0]),
    eye(0.055, [0, -0.01, -0.12]),
    fang(0.03, 0.26, [0, -0.06, -0.22 + (fire ? 0.04 : 0)]),
    ball(0.02, 'bileGlow', [0, -0.06, -0.1], 4),
  );
  if (fire) head.add(thornShot([0, -0.06, -0.37], 'gun', true));
  head.position.set(0, 0.34, 0);
  head.userData.turret = true;
  const g = group(
    mesh(body, 'team', [0, 0.26, 0]),
    cyl(0, 0.035, 0.12, 'teamDark', [0, 0.36, 0.14], 4),
    limb([0, 0.24, -0.12], [0, 0.0, -0.3 - step], 0.034, 'teamDark'),
    limb([-0.08, 0.24, 0.12], [-0.3, 0.0, 0.26 + step], 0.034, 'teamDark'),
    limb([0.08, 0.24, 0.12], [0.3, 0.0, 0.26 - step], 0.034, 'teamDark'),
    ball(0.03, 'team2Light', [0, 0.0, -0.3 - step], 4),
    ball(0.03, 'team2Light', [-0.3, 0.0, 0.26 + step], 4),
    ball(0.03, 'team2Light', [0.3, 0.0, 0.26 - step], 4),
    head,
  );
  if (frame === 'wreck') slump(g, -0.04, 0.15);
  return facing(g, view);
};

/**
 * Walker middle tank: a beetle. A segmented carapace on six legs, and on its back a coiled horn whose green tip
 * shoots a thorn.
 */
const middleTank: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const g = group(
    plate(0.2, 1.05, 0.55, 1.5, 'teamDark', [0, 0.18, 0.05]),
    plate(0.17, 1.05, 0.6, 0.9, 'team', [0, 0.24, 0.16]),
    plate(0.15, 1.1, 0.6, 0.8, 'team', [0, 0.24, -0.06]),
    plate(0.1, 1.2, 0.6, 0.8, 'team2Light', [0, 0.2, -0.25]),
    eye(0.035, [-0.06, 0.24, -0.33]),
    eye(0.035, [0.06, 0.24, -0.33]),
    ...legs(3, -0.18, 0.22, 0.14, 0.17, 0.24, 0.022, frame),
  );
  // Horn, its turret: a ridge spiralling up and forward from the middle of the back, ending in a green tip.
  const horn = group();
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const k = i / steps;
    const a = k * Math.PI * 2 * 1.25;
    const r = 0.1 - k * 0.07;
    horn.add(ball(0.05 - k * 0.025, i % 2 ? 'team2Light' : 'team', [Math.cos(a) * r * 0.6, k * 0.2, 0.14 - k * 0.32 + Math.sin(a) * r], 4));
  }
  horn.add(ball(fire ? 0.06 : 0.045, fire ? 'bileGlow' : 'bileLight', [0, 0.21, -0.2], 6));
  if (fire) horn.add(thornShot([0, 0.18, -0.26], 'gun', true));
  horn.position.set(0, 0.32, 0);
  horn.userData.turret = true;
  g.add(horn);
  if (frame === 'wreck') slump(g, -0.04, 0.15);
  return facing(g, view);
};

/**
 * Walker heavy tank: a crawling fortress. A broad faceted shell with seams in the secondary colour, carried low on eight
 * stubby legs, a mouth of mandibles with a gland of acid in front and two long prongs with a thorn shooting from
 * between them.
 */
const heavyTank: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const g = group(
    plate(0.3, 1.0, 0.5, 1.25, 'teamDark', [0, 0.17, 0.05]),
    plate(0.26, 1.0, 0.62, 1.15, 'team', [0, 0.25, 0.08]),
    plate(0.14, 1.2, 0.7, 1.0, 'team2Light', [0, 0.38, 0.12]),
    // Seams across the shell, in the secondary colour.
    ...[-0.08, 0.08, 0.24].map((z) => {
      const seam = mesh(new THREE.BoxGeometry(0.42, 0.02, 0.025), 'team2Light', [0, 0.33 - Math.abs(z - 0.08) * 0.3, z]);
      seam.castShadow = false;
      return seam;
    }),
    ...[-0.1, 0.1].map((x) => plate(0.06, 1, 1.4, 1, 'teamDark', [x, 0.16, -0.3])),
    eye(0.04, [-0.1, 0.28, -0.27]),
    eye(0.04, [0.1, 0.28, -0.27]),
    eye(0.03, [0, 0.32, -0.25]),
    ...legs(4, -0.22, 0.3, 0.24, 0.13, 0.16, 0.03, frame),
  );
  // Its turret: a crest on the shell carrying two long prongs with a gland of acid between them.
  const crest = group(
    plate(0.1, 1.2, 0.7, 1.3, 'team2Light', [0, 0, 0.04]),
    fang(0.045, 0.42, [-0.07, 0, -0.22], [0, -0.1, 0]),
    fang(0.045, 0.42, [0.07, 0, -0.22], [0, 0.1, 0]),
    ball(0.04, 'bileGlow', [0, 0, -0.12], 5),
  );
  if (fire) crest.add(thornShot([0, 0, -0.44], 'cannon', true));
  crest.position.set(0, 0.44, 0);
  crest.userData.turret = true;
  g.add(crest);
  if (frame === 'wreck') slump(g, -0.04, 0.15);
  return facing(g, view);
};

/**
 * Walker harvester: a six-legged beetle carrying a big pale sac on its back, with a pair of mandibles to scoop.
 * Harvesting, it stands still, dips its head, and its mandibles open and snap shut on a crystal.
 */
const harvester: Builder = (view, frame) => {
  const harvest = frame.startsWith('harvest');
  // Four frames of harvesting: the mandibles open, close on a crystal, and open again.
  const k = harvest ? Number(frame.slice(-1)) : 0;
  const head = group(
    plate(0.14, 1.1, 0.6, 0.9, 'team', [0, 0, 0]),
    eye(0.03, [-0.06, 0.02, -0.12]),
    eye(0.03, [0.06, 0.02, -0.12]),
    ...[-1, 1].map((sx) => {
      const open = harvest ? [0.75, 0.45, 0.15, 0.4][k]! : 0.45;
      const geo = new THREE.ConeGeometry(0.04, 0.22, 4);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, -0.11);
      return mesh(geo, 'team2Light', [sx * 0.07, -0.09, -0.08], [0, -sx * open, 0]);
    }),
  );
  // A crystal caught between the closed mandibles.
  if (harvest && k === 2) head.add(mesh(new THREE.OctahedronGeometry(0.05, 0), 'gold', [0, -0.09, -0.27]));
  head.position.set(0, 0.22, -0.18);
  if (harvest) head.rotation.x = -0.35;
  const g = group(
    plate(0.19, 1.05, 0.55, 1.2, 'teamDark', [0, 0.17, -0.08]),
    plate(0.22, 1.0, 0.85, 1.1, 'team2Light', [0, 0.27, 0.18]),
    head,
    ...legs(3, -0.16, 0.22, 0.14, 0.17, 0.22, 0.022, frame),
  );
  if (frame === 'wreck') slump(g, -0.04, 0.15);
  return facing(g, view);
};

/** Walker defender: a thorny stalk on spreading roots, topped by a bulb with a green eye and an acid spike. */
const defender: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const head = group(
    plate(0.16, 1, 0.8, 1.15, 'team', [0, 0, 0]),
    plate(0.09, 1.1, 0.6, 1, 'team2Light', [0, 0.06, 0.05]),
    eye(0.045, [0, 0.03, -0.15]),
    fang(0.035, 0.24, [0, -0.04, -0.2 + (fire ? 0.03 : 0)]),
  );
  if (fire) head.add(thornShot([0, -0.04, -0.34], 'gun', true));
  head.rotation.y = (-view * Math.PI) / 4;
  head.position.y = 0.66;
  head.userData.turret = true;
  const g = group(stalk(0.58), head);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    g.add(root(a, 0.08, 0.32, 0.12));
    const thorn = new THREE.ConeGeometry(0.025, 0.12, 4);
    thorn.rotateZ(-Math.PI / 2);
    g.add(mesh(thorn, 'team2Light', [Math.cos(a) * 0.1, 0.25 + i * 0.07, Math.sin(a) * 0.1], [0, -a, 0.3]));
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
  out.push(ball(r * 0.9, 'team2Light', p(0.5), 4), ball(r * 0.8, 'bileLight', p(1), 4));
  return out;
}

/** Thorn in flight with its drops of acid: a sharp bullet for the gun, a thicker shell for the cannon. */
const shot: Builder = (view, frame) => {
  const g = group(thornShot([0, 0.32, 0.12], frame === 'cannon' ? 'cannon' : 'gun'));
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
    plate(0.3, 1.1, 1.1, 1.0, 'team2Light', [0.02, 0.86, -0.04]),
    // Maw.
    plate(0.2, 1.4, 1, 0.6, 'teamDark', [0, 0.3, 0.6]),
    plate(k % 2 ? 0.12 : 0.15, 1.4, 0.9, 0.5, 'bileGlow', [0, 0.3, 0.66]),
    ...[-0.12, 0, 0.12].map((x, i) => (k === i + 1 ? ball(0.04, 'teamDark', [x, 0.52 + (x ? 0 : 0.04), 0.6], 4) : eye(0.04, [x, 0.52 + (x ? 0 : 0.04), 0.6]))),
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
    g.add(plate(r, 1, 1.2, 1, 'team2Light', [x, r, z]), ball(r * 0.35, 'bile', [x, r * 1.8, z + r * 0.4], 4));
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
    g.add(plate(r, 1, 1.15, 1, 'team2Light', [x, r * 1.05, z]), plate(r * 0.8, 1.05, 0.6, 1.05, 'team', [x, r * 0.4, z]));
    g.add(...[0.6, 2.2, 3.8].map((a) => plate(r * 0.22, 0.6, 1.4, 0.6, 'crystal', [x + Math.cos(a) * r * 0.8, r * 1.2, z + Math.sin(a) * r * 0.8])));
    g.add(eye(r * 0.15, [x, r * 2.1, z]));
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
 * Walker factory, the incubator: a womb. A big soft sac in the main colour with two smaller lobes grown onto its
 * back, gripped by claws of chitin curling up from the sand, veins in the secondary colour running over its skin and
 * a slit on the south glowing from the egg inside. Eggs lie in a heap at its foot and roots spread into the sand. Working, the slit gapes
 * and a young tripod climbs out in a puddle of slime.
 */
const factory: Builder = (_view, frame) => {
  const work = frame === 'work';
  // Womb: centre, radii.
  const [cx, cy, cz] = [0, 0.4, -0.12];
  const [rx, ry, rz] = [0.6, 0.48, 0.56];
  const sac = new THREE.SphereGeometry(1, 14, 10);
  sac.scale(rx, ry, rz);
  const lobe = (r: number, pos: Vec3, mat: 'team' | 'teamDark') => {
    const geo = new THREE.SphereGeometry(r, 10, 7);
    geo.scale(1, 0.8, 1);
    return mesh(geo, mat, pos);
  };
  // A point on the womb's skin at azimuth a (0 = east, pi/2 = south) and elevation e.
  const skin = (a: number, e: number, k = 1.02): Vec3 => [
    cx + Math.cos(a) * Math.cos(e) * rx * k,
    cy + Math.sin(e) * ry * k,
    cz + Math.sin(a) * Math.cos(e) * rz * k,
  ];
  const g = group(mesh(sac, 'team', [cx, cy, cz]), lobe(0.34, [-0.42, 0.3, -0.44], 'team'), lobe(0.28, [0.46, 0.24, -0.46], 'teamDark'));
  // Swellings on the skin.
  for (const [a, e, r] of [
    [0.9, 0.5, 0.1],
    [2.6, 0.7, 0.08],
    [4.2, 0.3, 0.11],
    [1.9, 1.0, 0.07],
  ] as const) {
    g.add(lobe(r, skin(a, e, 0.93), 'team'));
  }
  // Claws of chitin gripping the womb from the sand, curling over towards its top; none over the slit.
  for (const a of [-0.35, 1.0, 2.15, 3.3, 4.45]) g.add(...spine(a, 0.9, 0.3, 0.88, 0.05));
  // Veins: wandering lines over the skin from the top down to the ground.
  for (const [a0, wob] of [
    [0.6, 0.35],
    [2.3, -0.3],
    [3.9, 0.25],
    [5.3, -0.35],
  ] as const) {
    let prev = skin(a0, 1.2);
    for (let i = 1; i <= 4; i++) {
      const next = skin(a0 + wob * Math.sin(i * 1.7), 1.2 - i * 0.32);
      g.add(limb(prev, next, 0.018, 'team2'));
      prev = next;
    }
  }
  // Slit on the south with swollen lips and the egg glowing inside.
  const open = work ? 1.6 : 1;
  const sz = cz + rz * 0.93;
  g.add(
    plate(0.27, 0.4 * open, 1.3, 0.5, 'teamDark', [0, 0.38, sz]),
    plate(0.24, 0.26 * open, 1.15, 0.45, 'bileGlow', [0, 0.38, sz + 0.04]),
    ...[-1, 1].map((sx) => plate(0.24, 0.26, 1.35, 0.5, 'team2Light', [sx * 0.11 * open, 0.38, sz + 0.02], [0, 0, sx * 0.22])),
  );
  // Eggs at its foot, and roots.
  for (const [x, z, r] of [
    [-0.5, 0.4, 0.09],
    [-0.38, 0.52, 0.07],
    [-0.6, 0.55, 0.06],
    [0.52, 0.42, 0.08],
  ] as const) {
    g.add(lobe(r, [x, r * 0.8, z], 'team'), ball(r * 0.45, 'team2Light', [x - r * 0.25, r * 1.25, z + r * 0.4], 5));
  }
  for (let i = 0; i < 7; i++) g.add(root((i / 7) * Math.PI * 2 + 0.3, 0.55, 0.98, 0.1, 0.035));
  if (work) {
    const young = lightTank(4, 'move1');
    young.scale.setScalar(0.8);
    young.position.set(0.02, 0.04, sz + 0.12);
    g.add(young, plate(0.16, 1.4, 0.25, 1, 'bile', [0, 0.02, sz + 0.1]));
  }
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
 * Walker wall: a ridge of chitin plates bristling with thorns, meeting at a knot with a cluster of thorns on it;
 * runs join the neighbours (wallPiece), a plate and a thorn every so often along them.
 */
const wall: Builder = (mask) => {
  const thorn = (x: number, z: number, h: number, lean: Vec3, mat: 'team' | 'team2Light') => {
    const m = mesh(new THREE.ConeGeometry(0.05, h, 4).translate(0, h / 2, 0), mat, [x, 0.1, z]);
    m.rotation.set(...lean);
    return m;
  };
  return wallPiece(
    mask,
    () =>
      group(
        plate(0.17, 1.1, 0.75, 1.1, 'teamDark', [0, 0.1, 0]),
        thorn(0, 0, 0.36, [0, 0, 0], 'team2Light'),
        thorn(-0.06, 0.04, 0.24, [0.2, 0, 0.4], 'team'),
        thorn(0.06, 0.04, 0.24, [0.2, 0, -0.4], 'team'),
      ),
    (len) => {
      // Plates overlap along the run; the last one sits on the cell edge, half of it the neighbour's.
      const n = Math.max(2, Math.round(len / 0.18));
      const g = group();
      for (let i = 1; i <= n; i++) {
        const x = (len * i) / n;
        g.add(plate(0.12, 1.3, 0.7, 1, i % 2 ? 'team' : 'teamDark', [x, 0.08, 0]));
      }
      g.add(thorn(len * 0.55, 0, 0.2, [0.25, 0, 0], 'team2Light'));
      return g;
    },
  );
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
