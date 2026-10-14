import * as THREE from 'three';
import type { MaterialName } from '../materials';
import { ball, barrel, box, cyl, dome, group, lathe, mesh, paintAll, seeded, slab, track, type Vec3 } from './kit';

/**
 * Low-poly models of every sprite in the catalog. The layouts come from the original 2004 sprites, the shapes from
 * the director's concept renders, brought to one level of detail: chunky chamfered blocks, olive team armour, dark
 * grey running gear, cyan light slots; buildings in white with dark bands and cyan panoramic glass. The enemy's
 * walkers are a third family. A builder gets the view (direction 0..7, or the wall mask) and the frame name, and
 * returns the model already turned to face that direction. Sizes are in cells (1 = one 15 px cell of the
 * original); a unit must stay inside about 0.9 x 0.9 so neighbours do not overlap.
 */

export type Builder = (view: number, frame: string) => THREE.Object3D;

/** Directions go clockwise from north, matching DIRECTION_NAMES in the catalog. */
function facing(model: THREE.Object3D, view: number): THREE.Object3D {
  const g = group(model);
  g.rotation.y = (-view * Math.PI) / 4;
  return g;
}

function muzzleFlash(pos: [number, number, number], size: number): THREE.Mesh {
  const geo = new THREE.OctahedronGeometry(size, 0);
  geo.scale(1, 0.7, 1.6);
  const m = mesh(geo, 'flash', pos);
  m.castShadow = false;
  return m;
}

/** Barrel(s) pointing north from the turret front, recoiled and flashing when firing. */
function guns(count: 1 | 2, r: number, len: number, y: number, z: number, spread: number, fire: boolean, mat: MaterialName = 'team'): THREE.Group {
  const g = new THREE.Group();
  const recoil = fire ? len * 0.15 : 0;
  const xs = count === 1 ? [0] : [-spread, spread];
  for (const x of xs) {
    g.add(barrel(r, len, mat, [x, y, z + recoil]));
    g.add(barrel(r * 1.6, len * 0.16, 'teamDark', [x, y, z + recoil - len * 0.84]));
    if (fire) g.add(muzzleFlash([x, y, z - len - r * 4], r * 4.5));
  }
  return g;
}

/**
 * Wheel turning about the x axis: a chunky dark tyre with tread blocks that move on between frames and a hub in the
 * body colour.
 */
function wheel(r: number, w: number, pos: Vec3, phase: number): THREE.Group {
  const tyre = new THREE.CylinderGeometry(r, r, w, 10);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.012, 8);
  hub.rotateZ(Math.PI / 2);
  const cap = new THREE.CylinderGeometry(r * 0.18, r * 0.18, w + 0.024, 6);
  cap.rotateZ(Math.PI / 2);
  const g = group(mesh(tyre, 'steelDark'), mesh(hub, 'teamDark'), mesh(cap, 'steel'));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = ((i + phase * 0.5) / n) * Math.PI * 2;
    g.add(mesh(new THREE.BoxGeometry(w + 0.01, r * 0.22, r * 0.36), i % 2 ? 'steel' : 'steelDark', [0, Math.cos(a) * r, Math.sin(a) * r], [-a, 0, 0]));
  }
  g.position.set(...pos);
  return g;
}

interface HullSpec {
  w: number;
  l: number;
  h: number;
  trackW: number;
  trackH: number;
  /** Track link colours; dark grey on the tanks, pale on the harvester. */
  tracks?: [MaterialName, MaterialName];
}

/** Tracked chassis shared by the tanks and the harvester: two track runs and a chamfered hull between them. */
function chassis(spec: HullSpec, phase: number): { g: THREE.Group; top: number; trackX: number } {
  const { w, l, h, trackW, trackH } = spec;
  const trackX = w / 2 + trackW / 2 - 0.02;
  const g = group(
    track(l, trackW, trackH, -trackX, phase, 0, spec.tracks ?? ['steelDark', 'steel']),
    track(l, trackW, trackH, trackX, phase, 0, spec.tracks ?? ['steelDark', 'steel']),
    slab(w, h, l * 0.96, 'team', [0, trackH * 0.45, 0], 0.88),
  );
  return { g, top: trackH * 0.45 + h, trackX };
}

/** Slot of cyan light set into a surface: the shared accent of every player machine. */
function lightSlot(w: number, h: number, d: number, pos: Vec3): THREE.Mesh {
  const m = box(w, h, d, 'lamp', pos);
  m.castShadow = false;
  return m;
}

/** Wreck: the turret knocked askew and everything burnt. */
function wreck(g: THREE.Group, turret?: THREE.Object3D): void {
  if (turret) {
    turret.rotation.y += 0.7;
    turret.rotation.z = 0.12;
    turret.position.x += 0.04;
  }
  paintAll(g, 'burnt', ['steelDark']);
}

/**
 * Light tank: a four-wheeled armoured buggy. Big chunky wheels under pale-capped wheel arches, a short chamfered
 * body with a grille in the nose and a compact faceted turret with one gun.
 */
const lightTank: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  const turret = group(
    cyl(0.13, 0.13, 0.03, 'steelDark', [0, 0, 0], 10),
    slab(0.28, 0.13, 0.3, 'team', [0, 0.03, 0], 0.72),
    box(0.1, 0.02, 0.09, 'teamLight', [0, 0.15, 0.03]),
    lightSlot(0.03, 0.025, 0.06, [0.125, 0.06, 0.02]),
    guns(1, 0.03, 0.36, 0.09, -0.13, 0, frame === 'fire'),
  );
  turret.position.set(0, 0.25, 0.05);
  const g = group(
    slab(0.36, 0.15, 0.66, 'team', [0, 0.1, 0], 0.84),
    box(0.22, 0.07, 0.02, 'steelDark', [0, 0.13, -0.335]),
    ...[-1, 1].flatMap((sx) => [
      wheel(0.13, 0.1, [sx * 0.25, 0.13, -0.21], phase),
      wheel(0.13, 0.1, [sx * 0.25, 0.13, 0.22], phase),
      // Wheel arches with pale armour caps.
      slab(0.13, 0.06, 0.2, 'team', [sx * 0.25, 0.22, -0.21], 0.8),
      slab(0.13, 0.06, 0.2, 'team', [sx * 0.25, 0.22, 0.22], 0.8),
      box(0.09, 0.015, 0.12, 'teamLight', [sx * 0.25, 0.28, -0.21]),
      box(0.09, 0.015, 0.12, 'teamLight', [sx * 0.25, 0.28, 0.22]),
    ]),
    box(0.16, 0.015, 0.1, 'teamLight', [0, 0.25, -0.22]),
    turret,
  );
  if (frame === 'wreck') wreck(g, turret);
  return facing(g, view);
};

/**
 * Middle tank: tracked, with armoured skirts carrying cyan slots, an angular turret and a coil gun whose glowing
 * core shows between dark rings.
 */
const middleTank: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  const fire = frame === 'fire';
  const { g, top, trackX } = chassis({ w: 0.42, l: 0.8, h: 0.12, trackW: 0.13, trackH: 0.13 }, phase);
  for (const sx of [-1, 1]) {
    g.add(slab(0.11, 0.1, 0.62, 'team', [sx * trackX, 0.09, 0.04], 0.85));
    g.add(lightSlot(0.012, 0.025, 0.07, [sx * (trackX + 0.056), 0.13, -0.06]));
    g.add(lightSlot(0.012, 0.025, 0.07, [sx * (trackX + 0.056), 0.13, 0.16]));
  }
  g.add(box(0.2, 0.02, 0.08, 'steelDark', [0, top, 0.28]));
  const recoil = fire ? 0.05 : 0;
  const turret = group(
    slab(0.3, 0.13, 0.36, 'team', [0, 0, 0.04], 0.72),
    box(0.14, 0.04, 0.12, 'teamLight', [0, 0.13, 0.08]),
    lightSlot(0.012, 0.03, 0.08, [0.15, 0.06, 0.04]),
    lightSlot(0.012, 0.03, 0.08, [-0.15, 0.06, 0.04]),
    box(0.12, 0.1, 0.1, 'teamDark', [0, 0.02, -0.16]),
    barrel(0.03, 0.4, 'lamp', [0, 0.07, -0.18 + recoil]),
    ...[0, 1, 2, 3].map((i) => barrel(0.048, 0.035, 'teamDark', [0, 0.07, -0.22 - i * 0.07 + recoil], 8)),
    barrel(0.04, 0.06, 'steel', [0, 0.07, -0.52 + recoil], 8),
  );
  if (fire) turret.add(muzzleFlash([0, 0.07, -0.66], 0.11));
  turret.position.set(0, top, 0.04);
  g.add(turret);
  if (frame === 'wreck') wreck(g, turret);
  return facing(g, view);
};

/**
 * Heavy tank: the widest machine, brutalist blocks over everything. Segmented armour boxes cover the tracks, the
 * turret is stacked blocks with vented cheeks and a round hatch, and two long guns with dark bands run out of
 * square sleeves.
 */
const heavyTank: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  const fire = frame === 'fire';
  const { g, top, trackX } = chassis({ w: 0.5, l: 0.92, h: 0.15, trackW: 0.15, trackH: 0.15 }, phase);
  for (const sx of [-1, 1]) {
    for (const z of [-0.18, 0.08, 0.32]) g.add(slab(0.15, 0.13, 0.24, 'team', [sx * trackX, 0.1, z], 0.86));
    g.add(slab(0.12, 0.08, 0.2, 'teamDark', [sx * 0.2, top, -0.34], 0.7));
  }
  g.add(box(0.12, 0.03, 0.06, 'steelDark', [-0.06, top - 0.05, -0.47]));
  g.add(box(0.12, 0.03, 0.06, 'steelDark', [0.1, top - 0.05, -0.47]));
  const recoil = fire ? 0.06 : 0;
  const turret = group(
    slab(0.36, 0.16, 0.42, 'team', [0, 0, 0.06], 0.84),
    slab(0.22, 0.07, 0.24, 'team', [0, 0.16, 0.1], 0.8),
    cyl(0.06, 0.065, 0.03, 'teamLight', [0, 0.23, 0.08], 10),
    ...[-1, 1].map((sx) => slab(0.13, 0.17, 0.3, 'team', [sx * 0.23, -0.01, 0.0], 0.82)),
    ...[-1, 1].flatMap((sx) => [box(0.012, 0.07, 0.025, 'steelDark', [sx * 0.23 - 0.02, 0.05, -0.155]), box(0.012, 0.07, 0.025, 'steelDark', [sx * 0.23 + 0.02, 0.05, -0.155])]),
    ...[-1, 1].map((sx) => slab(0.14, 0.1, 0.2, 'team', [sx * 0.15, 0.0, 0.33], 0.8)),
  );
  for (const x of [-0.065, 0.065]) {
    turret.add(box(0.07, 0.07, 0.07, 'steelDark', [x, 0.05, -0.17 + recoil]));
    turret.add(barrel(0.032, 0.42, 'team', [x, 0.085, -0.2 + recoil]));
    for (const z of [-0.33, -0.41]) turret.add(barrel(0.036, 0.025, 'steelDark', [x, 0.085, z + recoil], 8));
    turret.add(barrel(0.04, 0.06, 'steel', [x, 0.085, -0.56 + recoil], 8));
    if (fire) turret.add(muzzleFlash([x, 0.085, -0.7], 0.09));
  }
  turret.position.set(0, top, 0.06);
  g.add(turret);
  if (frame === 'wreck') wreck(g, turret);
  return facing(g, view);
};

/**
 * The enemy's tank: a smooth oval shell skimming the ground, split at the front into two lobes with a gun in the
 * channel between them, light strips under the lobes and a raised spine down the back.
 */
const hoverTank: Builder = (view, frame) => {
  const y = frame === 'move1' ? 0.02 : 0;
  const fire = frame === 'fire';
  const shell = new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.scale(0.95, 0.3, 1.12);
  const belly = new THREE.CylinderGeometry(0.38, 0.32, 0.06, 12);
  belly.scale(1, 1, 1.12);
  const recoil = fire ? 0.04 : 0;
  const g = group(
    mesh(belly, 'teamDark', [0, 0.08 + y, 0]),
    mesh(shell, 'team', [0, 0.1 + y, 0]),
    // Spine: two raised plates either side of a dark groove.
    slab(0.09, 0.08, 0.56, 'teamLight', [-0.08, 0.17 + y, 0.08], 0.6),
    slab(0.09, 0.08, 0.56, 'teamLight', [0.08, 0.17 + y, 0.08], 0.6),
    box(0.06, 0.03, 0.6, 'teamDark', [0, 0.215 + y, 0.06]),
    // Front channel splitting the shell into two lobes, the gun inside it.
    box(0.13, 0.13, 0.26, 'teamDark', [0, 0.09 + y, -0.33]),
    barrel(0.03, 0.2, 'steel', [0, 0.15 + y, -0.3 + recoil]),
    barrel(0.04, 0.03, 'steelDark', [0, 0.15 + y, -0.47 + recoil], 8),
    // Light strips on the nose of each lobe and vents on the flanks.
    lightSlot(0.14, 0.025, 0.04, [-0.17, 0.12 + y, -0.39]),
    lightSlot(0.14, 0.025, 0.04, [0.17, 0.12 + y, -0.39]),
    ...[-1, 1].flatMap((sx) => [box(0.05, 0.03, 0.12, 'teamDark', [sx * 0.24, 0.16 + y, -0.02]), box(0.05, 0.03, 0.08, 'teamDark', [sx * 0.22, 0.15 + y, 0.22])]),
  );
  if (fire) g.add(muzzleFlash([0, 0.15 + y, -0.62], 0.1));
  if (frame === 'wreck') {
    g.position.y = -0.05;
    g.rotation.z = 0.18;
    paintAll(g, 'burnt');
  }
  return facing(g, view);
};

/**
 * Harvester: a crew cab with wraparound glass up front, pale tracks, a dark strap over the roof and a raised hopper
 * with vents at the back.
 */
const harvester: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  const { g, top } = chassis({ w: 0.42, l: 0.82, h: 0.1, trackW: 0.13, trackH: 0.13, tracks: ['steelLight', 'steel'] }, phase);
  g.add(
    // Cab: glass walls under an olive roof, pillars in the corners and down the middle.
    box(0.46, 0.19, 0.36, 'glass', [0, top, -0.2]),
    slab(0.48, 0.04, 0.38, 'team', [0, top + 0.19, -0.2], 0.9),
    box(0.04, 0.2, 0.38, 'team', [0, top, -0.2]),
    ...[-1, 1].map((sx) => box(0.03, 0.2, 0.03, 'team', [sx * 0.225, top, -0.38])),
    box(0.5, 0.05, 0.03, 'team', [0, top - 0.02, -0.395]),
    lightSlot(0.07, 0.018, 0.012, [-0.15, top + 0.005, -0.415]),
    lightSlot(0.07, 0.018, 0.012, [0.15, top + 0.005, -0.415]),
    // Hopper.
    slab(0.48, 0.24, 0.42, 'team', [0, top, 0.18], 0.88),
    slab(0.4, 0.06, 0.3, 'teamLight', [0, top + 0.24, 0.2], 0.8),
    ...[0.08, 0.13, 0.18].map((dy) => box(0.012, 0.02, 0.2, 'steelDark', [0.245, top + dy, 0.18])),
    // Strap over the roof.
    box(0.05, 0.03, 0.82, 'steelDark', [0, top + 0.225, 0]),
  );
  if (frame === 'wreck') wreck(g);
  return facing(g, view);
};

/** Defender: a faceted cyan ball with three olive guns in square mounts, on a tapered octagonal plinth. */
const defender: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const ballGeo = new THREE.IcosahedronGeometry(0.19, 1);
  const head = group(mesh(ballGeo, 'glass', [0, 0, 0]));
  for (const [x, y, z, r] of [
    [-0.16, 0.0, -0.06, 0.08],
    [0.16, 0.0, -0.06, 0.08],
  ] as const) head.add(mesh(new THREE.IcosahedronGeometry(r, 0), 'glass', [x, y, z]));
  for (const x of [-0.16, 0, 0.16]) {
    head.add(box(0.07, 0.07, 0.05, 'team', [x, -0.035, -0.16]));
    head.add(barrel(0.022, 0.2, 'team', [x, 0, -0.18 + (fire ? 0.03 : 0)]));
    head.add(barrel(0.026, 0.02, 'steelDark', [x, 0, -0.36 + (fire ? 0.03 : 0)], 8));
    if (fire) head.add(muzzleFlash([x, 0, -0.45], 0.07));
  }
  head.rotation.y = (-view * Math.PI) / 4;
  head.position.y = 0.66;
  return group(
    lathe(
      [
        [0.32, 0],
        [0.32, 0.06],
        [0.26, 0.12],
        [0.15, 0.4],
        [0, 0.4],
      ],
      'steel',
      [0, 0, 0],
      8,
      Math.PI / 8,
    ),
    cyl(0.33, 0.33, 0.04, 'steelDark', [0, 0.02, 0], 8),
    cyl(0.07, 0.08, 0.16, 'steelDark', [0, 0.4, 0], 8),
    head,
  );
};

/** Thin limb from `a` to `b`, for the alien walkers' legs. */
function limb(a: Vec3, b: Vec3, r: number, mat: MaterialName): THREE.Mesh {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const len = from.distanceTo(to);
  const geo = new THREE.CylinderGeometry(r * 0.7, r, len, 4);
  const m = mesh(geo, mat);
  m.position.copy(from.clone().add(to).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return m;
}

/** Faceted plate (a squashed icosahedron), the alien craft's armour. */
function plate(r: number, sx: number, sy: number, sz: number, mat: MaterialName, pos: Vec3, rot: Vec3 = [0, 0, 0]): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(r, 0);
  geo.scale(sx, sy, sz);
  return mesh(geo, mat, pos, rot);
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
      out.push(limb(hip, knee, r, 'teamDark'), limb(knee, foot, r * 0.8, 'teamDark'), ball(r * 1.3, 'teamLight', knee, 4));
    }
  }
  return out;
}

/** Wreck of an alien walker: legs folded flat, everything burnt. */
function alienWreck(g: THREE.Group): void {
  g.position.y = -0.04;
  g.rotation.z = 0.15;
  paintAll(g, 'burnt');
}

/**
 * Enemy light tank: a skittering tripod. A small arrowhead body on three thin legs, one big green eye in front and
 * a single spike gun under the chin that spits a bolt.
 */
const alienLightTank: Builder = (view, frame) => {
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
  );
  const spike = new THREE.ConeGeometry(0.03, 0.3, 4);
  spike.rotateX(-Math.PI / 2);
  g.add(mesh(spike, 'teamLight', [0, 0.2, -0.3 + (fire ? 0.04 : 0)]));
  g.add(ball(0.03, 'lamp', [0, 0.2, -0.45], 4));
  if (fire) g.add(muzzleFlash([0, 0.2, -0.56], 0.07));
  if (frame === 'wreck') alienWreck(g);
  return facing(g, view);
};

/**
 * Enemy middle tank: a beetle. A segmented carapace on six legs, and on its back a coiled horn (the alien answer to
 * the player's spiral turret) whose tip hurls an energy orb.
 */
const alienMiddleTank: Builder = (view, frame) => {
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
  // Horn: a ridge spiralling up and forward from the back, ending in a glowing tip.
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const k = i / steps;
    const a = k * Math.PI * 2 * 1.25;
    const r = 0.1 - k * 0.07;
    g.add(ball(0.05 - k * 0.025, i % 2 ? 'teamLight' : 'team', [Math.cos(a) * r * 0.6, 0.32 + k * 0.2, 0.12 - k * 0.32 + Math.sin(a) * r], 4));
  }
  g.add(ball(fire ? 0.07 : 0.045, 'lamp', [0, 0.53, -0.22], 6));
  if (fire) g.add(muzzleFlash([0, 0.5, -0.4], 0.09));
  if (frame === 'wreck') alienWreck(g);
  return facing(g, view);
};

/**
 * Enemy heavy tank: a crawling fortress. A broad faceted shell with glowing seams, carried low on eight stubby legs,
 * a mouth of mandibles in front and two long prongs with a big charge of light between them.
 */
const alienHeavyTank: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const prong = (x: number) => {
    const geo = new THREE.ConeGeometry(0.05, 0.5, 4);
    geo.rotateX(-Math.PI / 2);
    return mesh(geo, 'teamLight', [x, 0.24, -0.38], [0.05, x > 0 ? 0.12 : -0.12, 0]);
  };
  const g = group(
    plate(0.3, 1.0, 0.5, 1.25, 'teamDark', [0, 0.17, 0.05]),
    plate(0.26, 1.0, 0.62, 1.15, 'team', [0, 0.25, 0.08]),
    plate(0.14, 1.2, 0.7, 1.0, 'teamLight', [0, 0.38, 0.12]),
    // Glowing seams across the shell.
    ...[-0.08, 0.08, 0.24].map((z) => box(0.42, 0.02, 0.025, 'lamp', [0, 0.32 - Math.abs(z - 0.08) * 0.3, z])),
    ...[-0.1, 0.1].map((x) => box(0.05, 0.12, 0.07, 'teamDark', [x, 0.12, -0.32])),
    ball(0.04, 'signal', [-0.1, 0.28, -0.27], 4),
    ball(0.04, 'signal', [0.1, 0.28, -0.27], 4),
    ball(0.03, 'signal', [0, 0.32, -0.25], 4),
    prong(-0.12),
    prong(0.12),
    ball(fire ? 0.1 : 0.06, 'lamp', [0, 0.24, -0.55], 6),
    ...legs(4, -0.22, 0.3, 0.24, 0.13, 0.16, 0.03, frame),
  );
  if (fire) g.add(muzzleFlash([0, 0.24, -0.7], 0.11));
  if (frame === 'wreck') alienWreck(g);
  return facing(g, view);
};

/*
 * Player buildings share one scheme: white shells, dark grey bands and bases, cyan panoramic glass and a team
 * coloured stripe, built from the same few shapes (mushroom towers, drums, domes, chamfered blocks).
 */

/**
 * Mushroom tower: a wide flared foot narrowing into a stem, under a saucer cap whose rim is a band of panoramic
 * glass between dark rings; a team stripe runs up the front of the stem.
 */
function mushroom(x: number, z: number, h: number, r: number, spire = false): THREE.Group {
  const g = group(
    lathe(
      [
        [r * 1.05, 0],
        [r * 1.0, 0.06],
        [r * 0.62, h * 0.4],
        [r * 0.5, h],
        [0, h],
      ],
      'steelLight',
      [x, 0, z],
      10,
    ),
    cyl(r * 1.06, r * 1.08, 0.06, 'steelDark', [x, 0, z], 10),
    box(r * 0.22, h * 0.5, 0.03, 'team', [x, h * 0.3, z + r * 0.68]),
    // Cap: pale underside, dark ring, glass band, dark ring, domed top.
    lathe(
      [
        [r * 0.5, 0],
        [r * 1.05, 0.1],
        [r * 1.12, 0.14],
        [0, 0.14],
      ],
      'steelLight',
      [x, h, z],
      12,
    ),
    cyl(r * 1.13, r * 1.13, 0.03, 'steelDark', [x, h + 0.13, z], 12),
    cyl(r * 1.12, r * 1.12, 0.12, 'glass', [x, h + 0.16, z], 12),
    cyl(r * 1.13, r * 1.13, 0.03, 'steelDark', [x, h + 0.28, z], 12),
    lathe(
      [
        [r * 1.12, 0],
        [r * 0.95, 0.08],
        [r * 0.6, 0.15],
        [r * 0.25, 0.18],
        [0, 0.18],
      ],
      'steelLight',
      [x, h + 0.31, z],
      12,
    ),
    cyl(r * 0.3, r * 0.32, 0.03, 'steelDark', [x, h + 0.46, z], 10),
  );
  if (spire) {
    g.add(cyl(0.025, 0.03, 0.3, 'steelDark', [x, h + 0.48, z], 6));
    g.add(cyl(0.032, 0.032, 0.05, 'glass', [x, h + 0.66, z], 6));
  }
  return g;
}

/** Drum building: dark foot, white wall with a glass band, dark roof ring and a low dome. */
function drum(x: number, z: number, r: number, h: number, glassY: number): THREE.Group {
  return group(
    cyl(r * 1.04, r * 1.06, 0.05, 'steelDark', [x, 0, z], 10),
    cyl(r, r, h, 'steelLight', [x, 0, z], 10),
    cyl(r * 1.01, r * 1.01, 0.09, 'glass', [x, glassY, z], 10),
    cyl(r * 1.03, r * 1.03, 0.03, 'steelDark', [x, h, z], 10),
    dome(r * 0.98, 'steelLight', [x, h + 0.03, z], 0.6, 10),
    box(r * 0.5, 0.03, r * 0.5, 'steelDark', [x, h + 0.03 + r * 0.56, z]),
  );
}

/** Tube between two points on the ground plane at height y: the walkways that join the buildings. */
function tube(a: [number, number], b: [number, number], y: number): THREE.Group {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const g = group(box(0.1, 0.08, len, 'steel', [0, 0, 0]), box(0.11, 0.025, len * 0.8, 'steelDark', [0, 0.08, 0]));
  g.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
  g.rotation.y = Math.atan2(dx, dz);
  return g;
}

/**
 * Player HQ: a small city. A chamfered central block ringed with glass, its stepped roof rising into a slim spire
 * with glass rings and a beacon; a mushroom tower on the west, a domed drum behind on the east and a small drum in
 * front, joined by tubes. The dish on the mushroom turns and the beacon blinks over the four idle frames.
 */
const hq: Builder = (_view, frame) => {
  const k = Number(frame.slice(-1)) || 0;
  const dish = group(box(0.18, 0.03, 0.05, 'steelDark', [0, 0, 0]), box(0.04, 0.06, 0.04, 'steel', [0.08, 0.02, 0]));
  dish.rotation.y = (k * Math.PI) / 4;
  dish.position.set(-0.55, 1.08, -0.2);
  return group(
    lathe(
      [
        [0.97, 0],
        [0.97, 0.05],
        [0, 0.05],
      ],
      'steelDark',
      [0, 0, 0],
      8,
      Math.PI / 8,
    ),
    tube([-0.55, -0.2], [0.05, 0.05], 0.3),
    tube([0.05, 0.05], [0.58, -0.3], 0.3),
    tube([0.05, 0.05], [0.55, 0.45], 0.2),
    // Central block: dark plinth, white walls with a glass band, a stepped roof.
    lathe(
      [
        [0.4, 0],
        [0.4, 0.07],
        [0, 0.07],
      ],
      'steelDark',
      [0.05, 0.05, 0.1],
      8,
      Math.PI / 8,
    ),
    cyl(0.38, 0.38, 0.36, 'steelLight', [0.05, 0.12, 0.1], 8),
    cyl(0.385, 0.385, 0.11, 'glass', [0.05, 0.27, 0.1], 8),
    box(0.16, 0.03, 0.02, 'team', [0.05, 0.16, 0.48]),
    cyl(0.25, 0.4, 0.16, 'steelLight', [0.05, 0.48, 0.1], 8),
    cyl(0.16, 0.25, 0.06, 'steelDark', [0.05, 0.64, 0.1], 8),
    // Spire.
    cyl(0.12, 0.14, 0.5, 'steelLight', [0.05, 0.7, 0.1], 8),
    cyl(0.125, 0.125, 0.06, 'glass', [0.05, 0.86, 0.1], 8),
    cyl(0.115, 0.115, 0.05, 'glass', [0.05, 1.04, 0.1], 8),
    cyl(0.04, 0.11, 0.18, 'steelLight', [0.05, 1.2, 0.1], 8),
    cyl(0.018, 0.018, 0.18, 'steelDark', [0.05, 1.38, 0.1], 4),
    ball(0.035, k % 2 ? 'glassDark' : 'lamp', [0.05, 1.57, 0.1], 6),
    // Neighbours.
    mushroom(-0.55, -0.2, 0.62, 0.3),
    dish,
    drum(0.58, -0.3, 0.27, 0.36, 0.2),
    drum(0.55, 0.45, 0.17, 0.2, 0.08),
  );
};

/**
 * Enemy HQ: a shrine of pale curved ribs closing into a point over a team coloured crystal, with smaller crystals
 * at its corners and a beacon spike beside it. The crystal glows and the beacon's orb pulses over four frames.
 */
const enemyHq: Builder = (_view, frame) => {
  const k = Number(frame.slice(-1)) || 0;
  const rib: [number, number][] = [
    [0.82, 0],
    [0.8, 0.25],
    [0.68, 0.6],
    [0.48, 0.92],
    [0.22, 1.18],
    [0.0, 1.32],
  ];
  const g = group(
    slab(1.62, 0.07, 1.62, 'steelLight', [0, 0, 0], 0.97),
    // Crystal core: a four-sided spike in the middle, glowing brighter on alternate frames.
    mesh(new THREE.ConeGeometry(0.62, 1.2, 4).translate(0, 0.6, 0), k % 2 ? 'teamLight' : 'team', [0, 0.07, 0], [0, Math.PI / 4, 0]),
  );
  // Four ribs on the corners, each a slice of a pointed dome with a lamp slit in it.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    g.add(lathe(rib, 'steelLight', [0, 0.07, 0], 6, a - 0.3, 0.6));
    g.add(lathe(rib.map(([r, y]) => [r * 0.97, y * 0.99] as [number, number]), 'steel', [0, 0.07, 0], 2, a - 0.33, 0.66));
    const slit = box(0.035, 0.32, 0.035, 'lamp', [Math.sin(a) * 0.74, 0.25, Math.cos(a) * 0.74]);
    slit.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
    g.add(slit);
    // Small crystals in the gaps between the ribs.
    const b = a + Math.PI / 4;
    g.add(mesh(new THREE.ConeGeometry(0.13, 0.36, 4).translate(0, 0.18, 0), 'team', [Math.sin(b) * 0.66, 0.07, Math.cos(b) * 0.66], [0, Math.PI / 4, 0]));
  }
  // Beacon.
  g.add(
    lathe(
      [
        [0.12, 0],
        [0.06, 0.14],
        [0.04, 0.75],
        [0, 0.75],
      ],
      'steelLight',
      [0.74, 0.07, 0.62],
      6,
    ),
    mesh(new THREE.ConeGeometry(0.07, 0.16, 4).translate(0, 0.08, 0), 'team', [0.74, 0.07, 0.62]),
    ball(k % 2 ? 0.06 : 0.075, k % 2 ? 'team' : 'lamp', [0.74, 0.88, 0.62], 6),
  );
  return g;
};

/** Silo: two mushroom towers and a small dome on a round base, with a loading pad on the south-east. */
const silo: Builder = () =>
  group(
    lathe(
      [
        [0.62, 0],
        [0.62, 0.1],
        [0.56, 0.14],
        [0, 0.14],
      ],
      'steelLight',
      [-0.2, 0, -0.2],
      12,
    ),
    cyl(0.63, 0.64, 0.05, 'steelDark', [-0.2, 0, -0.2], 12),
    ...[-0.25, 0.05].map((dx) => box(0.14, 0.04, 0.02, 'steelDark', [-0.2 + dx, 0.05, 0.415])),
    box(0.4, 0.02, 0.02, 'team', [-0.2, 0.11, 0.425]),
    mushroom(-0.48, -0.15, 0.62, 0.3, true),
    mushroom(0.3, -0.42, 0.72, 0.34),
    drum(-0.05, -0.38, 0.2, 0.28, 0.13),
    tube([-0.05, -0.38], [0.3, -0.42], 0.3),
    // Loading pad with team stripes along its edges.
    box(0.6, 0.05, 0.56, 'steelDark', [0.4, 0, 0.38]),
    box(0.52, 0.02, 0.48, 'steel', [0.4, 0.05, 0.38]),
    ...[-1, 1].map((s) => box(0.52, 0.02, 0.05, 'team', [0.4, 0.06, 0.38 + s * 0.2])),
    ...[-1, 1].map((s) => slab(0.12, 0.1, 0.14, 'steelLight', [0.4 + s * 0.27, 0.0, 0.6], 0.8)),
  );

/** Unpainted hull of our middle tank without its turret, as it sits on the factory's assembly pad. */
function hullOnPad(): THREE.Object3D {
  const inner = middleTank(0, 'move0').children[0]!;
  inner.remove(inner.children[inner.children.length - 1]!);
  paintAll(inner, 'steel', ['steelDark', 'lamp']);
  return inner;
}

/** Turret of our middle tank, hanging from the factory's claw. */
function turretOnClaw(): THREE.Object3D {
  const inner = middleTank(0, 'move0').children[0]!;
  const turret = inner.children[inner.children.length - 1]!;
  paintAll(turret, 'steel', ['steelDark', 'lamp']);
  turret.position.set(0, 0, 0);
  return turret;
}

/**
 * Tank factory: a mushroom tower on the west carries a long gantry arm, glazed along its side, out over an assembly
 * pad. Idle, the claw hangs empty and raised; working, it lowers a turret onto the hull of one of our middle tanks
 * and the pad's lamps light up.
 */
const factory: Builder = (_view, frame) => {
  const work = frame === 'work';
  const padX = 0.32;
  const padZ = 0.22;
  const armY = 0.98;
  const clawDrop = work ? 0.5 : 0.28;
  const claw = group(
    cyl(0.03, 0.03, clawDrop, 'steelDark', [0, -clawDrop, 0], 6),
    box(0.12, 0.06, 0.12, 'team', [0, -clawDrop - 0.05, 0]),
    ...[-1, 1].map((s) => box(0.025, 0.12, 0.03, 'teamDark', [s * 0.07, -clawDrop - 0.15, 0])),
  );
  if (work) {
    const t = turretOnClaw();
    t.position.set(0, -clawDrop - 0.24, 0.02);
    claw.add(t);
  }
  claw.position.set(padX, armY, padZ - 0.02);
  const armLen = 0.95;
  const arm = group(
    box(0.16, 0.14, armLen, 'steelLight', [0, 0, 0]),
    box(0.165, 0.06, armLen * 0.55, 'glass', [0, 0.04, -armLen * 0.08]),
    box(0.17, 0.02, armLen * 0.9, 'team', [0, 0.01, 0]),
    box(0.18, 0.18, 0.12, 'steelDark', [0, -0.02, armLen / 2]),
  );
  // The arm runs from the tower out over the pad.
  const ax = -0.42;
  const az = -0.42;
  arm.position.set((ax + padX) / 2 + 0.05, armY, (az + padZ) / 2 + 0.05);
  arm.rotation.y = Math.atan2(padX - ax, padZ - az) + Math.PI;
  const g = group(
    // Pad.
    box(0.94, 0.07, 0.86, 'steelDark', [padX, 0, padZ]),
    box(0.86, 0.03, 0.78, 'steelLight', [padX, 0.07, padZ]),
    box(0.62, 0.02, 0.54, 'steelDark', [padX, 0.1, padZ]),
    ...[-1, 1].map((s) => box(0.86, 0.02, 0.05, 'team', [padX, 0.1, padZ + s * 0.33])),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.07, 0.1, 0.07, work ? 'lamp' : 'steelDark', [padX + sx * 0.42, 0.07, padZ + sz * 0.38]))),
    // Tower and the mast holding the arm.
    mushroom(ax, az, 0.62, 0.34),
    box(0.16, armY, 0.16, 'steelDark', [ax + 0.24, 0, az + 0.24]),
    box(0.17, 0.05, 0.17, 'team', [ax + 0.24, 0.35, az + 0.24]),
    arm,
    claw,
  );
  const hull = hullOnPad();
  hull.position.set(padX, 0.12, padZ);
  hull.rotation.y = -Math.PI / 2;
  if (work) g.add(hull);
  return g;
};

/** Construction site: a white pad with dark rims, team stripes on its edges, lamp posts on its corners and a crane. */
const construction: Builder = () => {
  const jib = group(
    box(0.06, 0.06, 0.9, 'steelLight', [0, 0, 0.45]),
    box(0.065, 0.02, 0.8, 'team', [0, 0.03, 0.45]),
    box(0.015, 0.36, 0.015, 'steelDark', [0, -0.36, 0.86]),
    box(0.09, 0.06, 0.09, 'steelDark', [0, -0.42, 0.86]),
  );
  jib.position.set(-0.6, 1.14, -0.6);
  jib.rotation.y = Math.PI / 4;
  return group(
    lathe(
      [
        [1.12, 0],
        [1.1, 0.12],
        [0.0, 0.12],
      ],
      'steelDark',
      [0, 0, 0],
      4,
      Math.PI / 4,
    ),
    lathe(
      [
        [1.04, 0.12],
        [1.0, 0.16],
        [0.0, 0.16],
      ],
      'steelLight',
      [0, 0, 0],
      4,
      Math.PI / 4,
    ),
    // Team stripes in segments along the south and east edges.
    ...[-0.5, -0.17, 0.17, 0.5].flatMap((t) => [box(0.2, 0.015, 0.05, 'team', [t, 0.16, 0.66]), box(0.05, 0.015, 0.2, 'team', [0.66, 0.16, t])]),
    box(0.5, 0.012, 0.5, 'steel', [0, 0.16, 0]),
    box(0.3, 0.014, 0.3, 'glass', [0, 0.165, 0]),
    ...[
      [-1, 1],
      [1, 1],
      [1, -1],
    ].flatMap(([sx, sz]) => [box(0.07, 0.24, 0.07, 'steelLight', [sx! * 0.66, 0.16, sz! * 0.66]), box(0.06, 0.05, 0.06, 'lamp', [sx! * 0.66, 0.4, sz! * 0.66])]),
    box(0.12, 1.0, 0.12, 'steelDark', [-0.6, 0.16, -0.6]),
    box(0.16, 0.05, 0.16, 'team', [-0.6, 0.5, -0.6]),
    jib,
  );
};

/**
 * Resource field: big yellow crystals growing out of the sand. A few clusters of long faceted shards, a tall one in
 * the middle of each and shorter ones leaning out, tallest in the middle of the field.
 */
const resource: Builder = () => {
  const g = group();
  const rnd = seeded(42);
  const spots: [number, number][] = [
    [0, 0],
    [-0.5, -0.38],
    [0.48, -0.42],
    [-0.52, 0.42],
    [0.5, 0.4],
    [0.02, -0.66],
    [0.0, 0.64],
    [-0.7, 0.0],
    [0.7, 0.02],
  ];
  for (const [cx0, cz0] of spots) {
    const cx = cx0 + (rnd() - 0.5) * 0.12;
    const cz = cz0 + (rnd() - 0.5) * 0.12;
    const big = 1.15 - Math.hypot(cx, cz) * 0.45;
    const count = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < count; i++) {
      const h = (i === 0 ? 0.6 + rnd() * 0.25 : 0.28 + rnd() * 0.3) * big;
      const r = (i === 0 ? 0.1 : 0.065 + rnd() * 0.03) * big;
      const sides = 6;
      const tip = new THREE.CylinderGeometry(0, r, h * 0.3, sides);
      tip.translate(0, h * 0.85, 0);
      const body = new THREE.CylinderGeometry(r, r * 0.85, h * 0.7, sides);
      body.translate(0, h * 0.35, 0);
      const dir = (i / count) * Math.PI * 2 + rnd();
      const lean = i === 0 ? 0.06 : 0.4 + rnd() * 0.3;
      const off = i ? 0.07 + rnd() * 0.04 : 0;
      const pos: Vec3 = [cx + Math.cos(dir) * off, -0.02, cz + Math.sin(dir) * off];
      const rot: Vec3 = [Math.sin(dir) * lean, rnd() * 3, -Math.cos(dir) * lean];
      g.add(mesh(body, 'crystal', pos, rot), mesh(tip, 'gold', pos, rot));
    }
  }
  return g;
};

/**
 * Wall piece in the buildings' style: a dark plinth, a white chamfered body with a dark band and a cyan light slot,
 * and a post with a team cap where pieces meet; arms reach towards neighbouring walls (bits N1 E2 S4 W8).
 */
const wall: Builder = (mask) => {
  const h = 0.26;
  const t = 0.26;
  const g = group(
    box(t + 0.06, 0.05, t + 0.06, 'steelDark', [0, 0, 0]),
    slab(t + 0.02, h + 0.06, t + 0.02, 'steelLight', [0, 0.04, 0], 0.8),
    box(t * 0.5, 0.03, t * 0.5, 'team', [0, h + 0.1, 0]),
  );
  const arms: [number, number, number][] = [
    [1, 0, -1],
    [2, 1, 0],
    [4, 0, 1],
    [8, -1, 0],
  ];
  for (const [bit, dx, dz] of arms) {
    if (!(mask & bit)) continue;
    const len = 0.5;
    const w = dx ? len : t;
    const d = dz ? len : t;
    const cx = dx * 0.25;
    const cz = dz * 0.25;
    g.add(box(dx ? len : t + 0.04, 0.05, dz ? len : t + 0.04, 'steelDark', [cx, 0, cz]));
    g.add(slab(w, h, d, 'steelLight', [cx, 0.04, cz], dx ? 0.9 : 0.75));
    g.add(box(dx ? len : t + 0.005, 0.035, dz ? len : t + 0.005, 'steelDark', [cx, 0.13, cz]));
    // Light slot on the faces that look south or east, where the camera sees them.
    if (dx) g.add(lightSlot(len * 0.5, 0.02, 0.01, [cx, 0.135, cz + t / 2 + 0.005]));
    else g.add(lightSlot(0.01, 0.02, len * 0.5, [cx + t / 2 + 0.005, 0.135, cz]));
  }
  return g;
};

/**
 * Fir tree: a short trunk under stacked turquoise tiers, each tier a wide flat cone that steps in from the one
 * below so the outline is jagged; `variant` 0..3 changes height, width, tier count and tone.
 */
const fir: Builder = (variant) => {
  const rnd = seeded(100 + variant * 17);
  // Variant 0 is a young short tree, 3 an old tall one; 1 is wide and dark, 2 slim and light.
  const height = [0.62, 0.86, 0.95, 1.12][variant % 4]!;
  const width = [0.3, 0.42, 0.3, 0.38][variant % 4]!;
  const tiers = [3, 4, 4, 5][variant % 4]!;
  const mats: MaterialName[] = variant === 1 ? ['pineDark', 'pineDark'] : variant === 2 ? ['pine', 'pine'] : ['pine', 'pineDark'];
  const g = group(cyl(0.045, 0.055, 0.16, 'bark', [0, 0, 0], 5));
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers;
    const r = width * (1 - k * 0.62) + (rnd() - 0.5) * 0.03;
    const cone = cyl(0, r, height * (i === tiers - 1 ? 1.4 : 1) * (1.05 / tiers), mats[i % 2]!, [(rnd() - 0.5) * 0.03, 0.12 + k * height * 0.72, (rnd() - 0.5) * 0.03], 7);
    cone.rotation.set((rnd() - 0.5) * 0.12, rnd() * 3, (rnd() - 0.5) * 0.12);
    g.add(cone);
  }
  return g;
};

export const MODELS: Record<string, Builder> = {
  harvester,
  light_tank: lightTank,
  middle_tank: middleTank,
  heavy_tank: heavyTank,
  hover_tank: hoverTank,
  alien_light_tank: alienLightTank,
  alien_middle_tank: alienMiddleTank,
  alien_heavy_tank: alienHeavyTank,
  defender,
  hq,
  enemy_hq: enemyHq,
  silo,
  factory,
  construction,
  resource,
  wall,
  fir,
};
