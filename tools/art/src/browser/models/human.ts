import * as THREE from 'three';
import type { MaterialName } from '../../materials';
import { barrel, box, cyl, dome, group, lathe, mesh, paintAll, slab, track, type Vec3, ball } from '../kit';
import { chips, facing, gaussFlash, lightSlot, tube, WALL_ARMS, wreck, type Builder } from './parts';

/**
 * The humans: the original's player side. Chunky chamfered blocks of armour in the main colour, running gear and
 * fittings in the secondary colour, cyan light slots; buildings with shells in the main colour and glass, bands and
 * fittings in the secondary, on grey platforms. Their guns are human, a little ahead of today: gauss rifles and coil
 * cannons that fire yellow-hot slugs.
 */

/** Barrel(s) pointing north from the turret front, recoiled and flashing when firing. */
function guns(count: 1 | 2, r: number, len: number, y: number, z: number, spread: number, fire: boolean, mat: MaterialName = 'team'): THREE.Group {
  const g = new THREE.Group();
  const recoil = fire ? len * 0.15 : 0;
  const xs = count === 1 ? [0] : [-spread, spread];
  for (const x of xs) {
    g.add(barrel(r, len, mat, [x, y, z + recoil]));
    g.add(barrel(r * 1.6, len * 0.16, 'teamDark', [x, y, z + recoil - len * 0.84]));
    if (fire) g.add(gaussFlash([x, y, z - len - r * 4], r * 4.5));
  }
  return g;
}

/**
 * Wheel turning about the x axis: a chunky tyre in the secondary colour with tread blocks that move on between
 * frames, and a grey hub with a pale cap.
 */
function wheel(r: number, w: number, pos: Vec3, phase: number): THREE.Group {
  const tyre = new THREE.CylinderGeometry(r, r, w, 10);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.012, 8);
  hub.rotateZ(Math.PI / 2);
  const cap = new THREE.CylinderGeometry(r * 0.18, r * 0.18, w + 0.024, 6);
  cap.rotateZ(Math.PI / 2);
  const g = group(mesh(tyre, 'team2'), mesh(hub, 'steel'), mesh(cap, 'steelLight'));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = ((i + phase * 0.5) / n) * Math.PI * 2;
    g.add(mesh(new THREE.BoxGeometry(w + 0.01, r * 0.22, r * 0.36), i % 2 ? 'team2Light' : 'team2', [0, Math.cos(a) * r, Math.sin(a) * r], [-a, 0, 0]));
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
  /** Track link colours; the secondary colour, dark on the tanks and pale on the harvester. */
  tracks?: [MaterialName, MaterialName];
}

/** Tracked chassis shared by the tanks and the harvester: two track runs and a chamfered hull between them. */
function chassis(spec: HullSpec, phase: number): { g: THREE.Group; top: number; trackX: number } {
  const { w, l, h, trackW, trackH } = spec;
  const trackX = w / 2 + trackW / 2 - 0.02;
  const g = group(
    track(l, trackW, trackH, -trackX, phase, 0, spec.tracks ?? ['team2Dark', 'team2']),
    track(l, trackW, trackH, trackX, phase, 0, spec.tracks ?? ['team2Dark', 'team2']),
    slab(w, h, l * 0.96, 'team', [0, trackH * 0.45, 0], 0.88),
  );
  return { g, top: trackH * 0.45 + h, trackX };
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
    // A band of the secondary colour set into the turret armour: round its flanks and back, and a plate on top.
    slab(0.29, 0.04, 0.31, 'team2', [0, 0.06, 0], 0.72),
    box(0.14, 0.02, 0.12, 'team2', [0, 0.15, 0.04]),
    box(0.06, 0.022, 0.05, 'steelDark', [0, 0.155, 0.04]),
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
      // Wheel arches with light armour caps.
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
    box(0.14, 0.04, 0.12, 'team2', [0, 0.13, 0.08]),
    lightSlot(0.012, 0.03, 0.08, [0.15, 0.06, 0.04]),
    lightSlot(0.012, 0.03, 0.08, [-0.15, 0.06, 0.04]),
    box(0.12, 0.1, 0.1, 'steelDark', [0, 0.02, -0.16]),
    barrel(0.03, 0.4, 'lamp', [0, 0.07, -0.18 + recoil]),
    ...[0, 1, 2, 3].map((i) => barrel(0.048, 0.035, 'team2Dark', [0, 0.07, -0.22 - i * 0.07 + recoil], 8)),
    barrel(0.04, 0.06, 'team2Light', [0, 0.07, -0.52 + recoil], 8),
  );
  if (fire) turret.add(gaussFlash([0, 0.07, -0.66], 0.11));
  turret.position.set(0, top, 0.04);
  g.add(turret);
  if (frame === 'wreck') wreck(g, turret);
  return facing(g, view);
};

/**
 * Heavy tank (the Bastion): the widest machine, brutalist blocks over everything. Segmented armour boxes cover the
 * tracks, each with a cyan slot; the turret is stacked blocks with glowing vents in its cheeks, a cyan visor and a
 * round hatch, and two long guns with glowing coil rings run out of square sleeves.
 */
const heavyTank: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  const fire = frame === 'fire';
  const { g, top, trackX } = chassis({ w: 0.5, l: 0.92, h: 0.15, trackW: 0.15, trackH: 0.15 }, phase);
  for (const sx of [-1, 1]) {
    for (const z of [-0.18, 0.08, 0.32]) {
      g.add(slab(0.15, 0.13, 0.24, 'team', [sx * trackX, 0.1, z], 0.86));
      g.add(lightSlot(0.012, 0.025, 0.12, [sx * (trackX + 0.068), 0.16, z]));
    }
    g.add(slab(0.12, 0.08, 0.2, 'teamDark', [sx * 0.2, top, -0.34], 0.7));
  }
  g.add(box(0.12, 0.03, 0.06, 'steelDark', [-0.06, top - 0.05, -0.47]));
  g.add(box(0.12, 0.03, 0.06, 'steelDark', [0.1, top - 0.05, -0.47]));
  g.add(lightSlot(0.3, 0.018, 0.012, [0, top - 0.02, -0.47]));
  const recoil = fire ? 0.06 : 0;
  const turret = group(
    slab(0.36, 0.16, 0.42, 'team', [0, 0, 0.06], 0.84),
    slab(0.22, 0.07, 0.24, 'team', [0, 0.16, 0.1], 0.8),
    cyl(0.06, 0.065, 0.03, 'team2', [0, 0.23, 0.08], 10),
    // A cyan visor across the front of the upper block.
    lightSlot(0.16, 0.02, 0.012, [0, 0.19, -0.025]),
    ...[-1, 1].map((sx) => slab(0.13, 0.17, 0.3, 'team', [sx * 0.23, -0.01, 0.0], 0.82)),
    // Vents in the cheeks glow cyan between dark fins.
    ...[-1, 1].flatMap((sx) => [
      box(0.05, 0.07, 0.02, 'lamp', [sx * 0.23, 0.05, -0.15]),
      box(0.012, 0.08, 0.025, 'steelDark', [sx * 0.23 - 0.03, 0.045, -0.155]),
      box(0.012, 0.08, 0.025, 'steelDark', [sx * 0.23 + 0.03, 0.045, -0.155]),
      lightSlot(0.012, 0.025, 0.16, [sx * 0.296, 0.09, 0.02]),
    ]),
    ...[-1, 1].map((sx) => slab(0.14, 0.1, 0.2, 'team', [sx * 0.15, 0.0, 0.33], 0.8)),
  );
  for (const x of [-0.065, 0.065]) {
    turret.add(box(0.07, 0.07, 0.07, 'steelDark', [x, 0.05, -0.17 + recoil]));
    turret.add(barrel(0.032, 0.42, 'team', [x, 0.085, -0.2 + recoil]));
    for (const z of [-0.3, -0.36, -0.42]) turret.add(barrel(0.038, 0.022, z === -0.36 ? 'lamp' : 'team2Dark', [x, 0.085, z + recoil], 8));
    turret.add(barrel(0.04, 0.06, 'team2Light', [x, 0.085, -0.56 + recoil], 8));
    if (fire) turret.add(gaussFlash([x, 0.085, -0.7], 0.09));
  }
  turret.position.set(0, top, 0.06);
  g.add(turret);
  if (frame === 'wreck') wreck(g, turret);
  return facing(g, view);
};
/**
 * Harvester: a crew cab with wraparound glass up front, pale tracks, a dark strap over the roof and a raised hopper
 * with vents at the back. Hull, hopper, lid and the cab's roof and pillars wear the main colour; glass and tracks
 * the secondary; strap and vents are dark grey. A grey toothed cutter drum rides on two arms under the nose: raised while driving, lowered to the
 * ground and turning while it harvests, throwing crystal chips back over the cab into the hopper.
 */
const harvester: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  const harvest = frame.startsWith('harvest');
  const k = frame === 'harvest1' ? 1 : 0;
  const { g, top } = chassis({ w: 0.42, l: 0.82, h: 0.1, trackW: 0.13, trackH: 0.13, tracks: ['team2Light', 'team2'] }, harvest ? k : phase);
  g.add(
    // Cab: glass walls under a roof, pillars in the corners and down the middle.
    box(0.46, 0.19, 0.36, 'team2Light', [0, top, -0.2]),
    slab(0.48, 0.04, 0.38, 'team', [0, top + 0.19, -0.2], 0.9),
    box(0.04, 0.2, 0.38, 'team', [0, top, -0.2]),
    ...[-1, 1].map((sx) => box(0.03, 0.2, 0.03, 'team', [sx * 0.225, top, -0.38])),
    box(0.5, 0.05, 0.03, 'team', [0, top - 0.02, -0.395]),
    lightSlot(0.07, 0.018, 0.012, [-0.15, top + 0.005, -0.415]),
    lightSlot(0.07, 0.018, 0.012, [0.15, top + 0.005, -0.415]),
    // Hopper, its lid open over a heap of crystals while harvesting.
    slab(0.48, 0.24, 0.42, 'team', [0, top, 0.18], 0.88),
    ...[0.08, 0.13, 0.18].map((dy) => box(0.012, 0.02, 0.2, 'steelDark', [0.245, top + dy, 0.18])),
    // Strap over the roof.
    box(0.05, 0.03, 0.82, 'steelDark', [0, top + 0.225, 0]),
  );
  if (harvest) {
    g.add(dome(0.15, 'gold', [0, top + 0.22, 0.2], 0.5, 6));
    const lid = slab(0.4, 0.04, 0.3, 'teamLight', [0, 0, 0.15], 0.8);
    const hinge = group(lid);
    hinge.position.set(0, top + 0.24, 0.05);
    hinge.rotation.x = -1.0;
    g.add(hinge, ...chips([0, 0.08, -0.52], [0, top + 0.36, 0.1], k, 0.05));
  } else g.add(slab(0.4, 0.06, 0.3, 'teamLight', [0, top + 0.24, 0.2], 0.8));
  // Cutter drum on two arms.
  const drumY = harvest ? 0.075 : 0.15;
  const drum = new THREE.CylinderGeometry(0.075, 0.075, 0.44, 8);
  drum.rotateZ(Math.PI / 2);
  const cutter = group(mesh(drum, 'steelDark'));
  for (let i = 0; i < 6; i++) {
    const a = ((i + (harvest ? k * 0.5 : 0)) / 6) * Math.PI * 2;
    for (const x of [-0.14, 0.02, 0.18]) cutter.add(mesh(new THREE.BoxGeometry(0.05, 0.03, 0.035), 'steelLight', [x + (i % 2) * 0.04 - 0.02, Math.cos(a) * 0.08, Math.sin(a) * 0.08], [-a, 0, 0]));
  }
  cutter.position.set(0, drumY, -0.5);
  // A hood over the drum and the arms holding it.
  g.add(cutter, slab(0.48, 0.04, 0.14, 'steelLight', [0, drumY + 0.07, -0.5], 0.8), ...[-1, 1].map((sx) => box(0.03, 0.05, 0.16, 'steelDark', [sx * 0.235, drumY - 0.02, -0.45])));
  if (frame === 'wreck') wreck(g);
  return facing(g, view);
};

/**
 * Defender: a faceted ball head in the secondary colour with two pods on its cheeks and three grey gauss guns in
 * square mounts, a cyan sight in the middle, on a tapered octagonal plinth in the main colour.
 */
const defender: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const head = group(mesh(new THREE.IcosahedronGeometry(0.19, 1), 'team2', [0, 0, 0]), box(0.05, 0.03, 0.03, 'lamp', [0, 0.07, -0.17]));
  for (const x of [-0.16, 0.16]) head.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), 'team2Light', [x, 0, -0.06]));
  for (const x of [-0.16, 0, 0.16]) {
    head.add(box(0.07, 0.07, 0.05, 'steelDark', [x, -0.035, -0.16]));
    head.add(barrel(0.022, 0.2, 'steel', [x, 0, -0.18 + (fire ? 0.03 : 0)]));
    head.add(barrel(0.026, 0.02, 'steelDark', [x, 0, -0.36 + (fire ? 0.03 : 0)], 8));
    if (fire) head.add(gaussFlash([x, 0, -0.45], 0.07));
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
      'team',
      [0, 0, 0],
      8,
      Math.PI / 8,
    ),
    cyl(0.33, 0.33, 0.04, 'teamDark', [0, 0.02, 0], 8),
    cyl(0.07, 0.08, 0.16, 'teamDark', [0, 0.4, 0], 8),
    head,
  );
};
/*
 * Human buildings share one scheme: shells in the main colour; glass, bands and fittings in the secondary colour;
 * grey platforms; built from the same few shapes (mushroom towers, drums, domes, chamfered blocks). The HQ paints
 * its thin rings and masts too, the silo and factory leave them grey.
 */
interface Scheme {
  glass: MaterialName;
  ring: MaterialName;
  mast: MaterialName;
}
const CITY: Scheme = { glass: 'team2Light', ring: 'team2Dark', mast: 'team2Dark' };
const WORKS: Scheme = { glass: 'team2Light', ring: 'steelDark', mast: 'steelDark' };

/**
 * Mushroom tower: a wide flared foot narrowing into a stem, under a saucer cap whose rim is a band of panoramic
 * glass between thin rings; a stripe runs up the front of the stem.
 */
function mushroom(x: number, z: number, h: number, r: number, scheme: Scheme, spire = false): THREE.Group {
  const g = group(
    lathe(
      [
        [r * 1.05, 0],
        [r * 1.0, 0.06],
        [r * 0.62, h * 0.4],
        [r * 0.5, h],
        [0, h],
      ],
      'team',
      [x, 0, z],
      10,
    ),
    cyl(r * 1.06, r * 1.08, 0.06, scheme.ring, [x, 0, z], 10),
    box(r * 0.22, h * 0.5, 0.03, 'team2', [x, h * 0.3, z + r * 0.68]),
    // Cap: underside, thin ring, glass band, thin ring, domed top.
    lathe(
      [
        [r * 0.5, 0],
        [r * 1.05, 0.1],
        [r * 1.12, 0.14],
        [0, 0.14],
      ],
      'teamLight',
      [x, h, z],
      12,
    ),
    cyl(r * 1.13, r * 1.13, 0.03, scheme.ring, [x, h + 0.13, z], 12),
    cyl(r * 1.12, r * 1.12, 0.12, scheme.glass, [x, h + 0.16, z], 12),
    cyl(r * 1.13, r * 1.13, 0.03, scheme.ring, [x, h + 0.28, z], 12),
    lathe(
      [
        [r * 1.12, 0],
        [r * 0.95, 0.08],
        [r * 0.6, 0.15],
        [r * 0.25, 0.18],
        [0, 0.18],
      ],
      'teamLight',
      [x, h + 0.31, z],
      12,
    ),
    cyl(r * 0.3, r * 0.32, 0.03, 'team2', [x, h + 0.46, z], 10),
  );
  if (spire) {
    g.add(cyl(0.025, 0.03, 0.3, scheme.mast, [x, h + 0.48, z], 6));
    g.add(cyl(0.032, 0.032, 0.05, scheme.glass, [x, h + 0.66, z], 6));
  }
  return g;
}

/** Drum building: a foot ring, a wall with a glass band, a roof ring, a low dome and a box on top. */
function drum(x: number, z: number, r: number, h: number, glassY: number, scheme: Scheme): THREE.Group {
  return group(
    cyl(r * 1.04, r * 1.06, 0.05, scheme.ring, [x, 0, z], 10),
    cyl(r, r, h, 'team', [x, 0, z], 10),
    cyl(r * 1.01, r * 1.01, 0.09, scheme.glass, [x, glassY, z], 10),
    cyl(r * 1.03, r * 1.03, 0.03, scheme.ring, [x, h, z], 10),
    dome(r * 0.98, 'teamLight', [x, h + 0.03, z], 0.6, 10),
    box(r * 0.5, 0.03, r * 0.5, 'team2Dark', [x, h + 0.03 + r * 0.56, z]),
  );
}
/**
 * HQ: a small city. A chamfered central block ringed with glass, its stepped roof rising into a slim spire with
 * glass rings and a beacon; a mushroom tower on the west, a domed drum behind on the east and a small drum in front,
 * joined by tubes. The dish on the mushroom turns and the beacon blinks over the four idle frames.
 */
const hq: Builder = (_view, frame) => {
  const k = Number(frame.slice(-1)) || 0;
  const dish = group(box(0.18, 0.03, 0.05, 'team2', [0, 0, 0]), box(0.04, 0.06, 0.04, 'team2Dark', [0.08, 0.02, 0]));
  dish.rotation.y = (k * Math.PI) / 4;
  dish.position.set(-0.55, 1.08, -0.2);
  const tubes: [MaterialName, MaterialName] = ['team2', 'team2Dark'];
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
    tube([-0.55, -0.2], [0.05, 0.05], 0.3, tubes),
    tube([0.05, 0.05], [0.58, -0.3], 0.3, tubes),
    tube([0.05, 0.05], [0.55, 0.45], 0.2, tubes),
    // Central block: plinth, walls with a glass band, a stepped roof.
    lathe(
      [
        [0.4, 0],
        [0.4, 0.07],
        [0, 0.07],
      ],
      'team2Dark',
      [0.05, 0.05, 0.1],
      8,
      Math.PI / 8,
    ),
    cyl(0.38, 0.38, 0.36, 'team', [0.05, 0.12, 0.1], 8),
    cyl(0.385, 0.385, 0.11, 'team2Light', [0.05, 0.27, 0.1], 8),
    box(0.16, 0.03, 0.02, 'team2', [0.05, 0.16, 0.48]),
    cyl(0.25, 0.4, 0.16, 'teamLight', [0.05, 0.48, 0.1], 8),
    cyl(0.16, 0.25, 0.06, 'team2Dark', [0.05, 0.64, 0.1], 8),
    // Spire.
    cyl(0.12, 0.14, 0.5, 'team', [0.05, 0.7, 0.1], 8),
    cyl(0.125, 0.125, 0.06, 'team2Light', [0.05, 0.86, 0.1], 8),
    cyl(0.115, 0.115, 0.05, 'team2Light', [0.05, 1.04, 0.1], 8),
    cyl(0.04, 0.11, 0.18, 'teamLight', [0.05, 1.2, 0.1], 8),
    cyl(0.018, 0.018, 0.18, 'team2Dark', [0.05, 1.38, 0.1], 4),
    ball(0.035, k % 2 ? 'glassDark' : 'lamp', [0.05, 1.57, 0.1], 6),
    // Neighbours.
    mushroom(-0.55, -0.2, 0.62, 0.3, CITY),
    dish,
    drum(0.58, -0.3, 0.27, 0.36, 0.2, CITY),
    drum(0.55, 0.45, 0.17, 0.2, 0.08, CITY),
  );
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
    box(0.4, 0.02, 0.02, 'team2', [-0.2, 0.11, 0.425]),
    mushroom(-0.48, -0.15, 0.62, 0.3, WORKS, true),
    mushroom(0.3, -0.42, 0.72, 0.34, WORKS),
    drum(-0.05, -0.38, 0.2, 0.28, 0.13, WORKS),
    tube([-0.05, -0.38], [0.3, -0.42], 0.3, ['team2', 'team2Dark']),
    // Loading pad with stripes along its edges.
    box(0.6, 0.05, 0.56, 'steelDark', [0.4, 0, 0.38]),
    box(0.52, 0.02, 0.48, 'steel', [0.4, 0.05, 0.38]),
    ...[-1, 1].map((s) => box(0.52, 0.02, 0.05, 'team2', [0.4, 0.06, 0.38 + s * 0.2])),
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
    box(0.12, 0.06, 0.12, 'team2', [0, -clawDrop - 0.05, 0]),
    ...[-1, 1].map((s) => box(0.025, 0.12, 0.03, 'team2Dark', [s * 0.07, -clawDrop - 0.15, 0])),
  );
  if (work) {
    const t = turretOnClaw();
    t.position.set(0, -clawDrop - 0.24, 0.02);
    claw.add(t);
  }
  claw.position.set(padX, armY, padZ - 0.02);
  const armLen = 0.95;
  const arm = group(
    box(0.16, 0.14, armLen, 'team', [0, 0, 0]),
    box(0.165, 0.06, armLen * 0.55, 'team2Light', [0, 0.04, -armLen * 0.08]),
    box(0.17, 0.02, armLen * 0.9, 'team2', [0, 0.01, 0]),
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
    ...[-1, 1].map((s) => box(0.86, 0.02, 0.05, 'team2', [padX, 0.1, padZ + s * 0.33])),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.07, 0.1, 0.07, work ? 'lamp' : 'steelDark', [padX + sx * 0.42, 0.07, padZ + sz * 0.38]))),
    // Tower and the mast holding the arm.
    mushroom(ax, az, 0.62, 0.34, WORKS),
    box(0.16, armY, 0.16, 'steelDark', [ax + 0.24, 0, az + 0.24]),
    box(0.17, 0.05, 0.17, 'team2', [ax + 0.24, 0.35, az + 0.24]),
    arm,
    claw,
  );
  const hull = hullOnPad();
  hull.position.set(padX, 0.12, padZ);
  hull.rotation.y = -Math.PI / 2;
  if (work) g.add(hull);
  return g;
};

/**
 * Construction site: a pad in the main colour with rims, stripes, inner squares and crane fittings in the secondary,
 * lamp posts on its corners and a crane.
 */
const construction: Builder = () => {
  const jib = group(
    box(0.06, 0.06, 0.9, 'team', [0, 0, 0.45]),
    box(0.065, 0.02, 0.8, 'team2', [0, 0.03, 0.45]),
    box(0.015, 0.36, 0.015, 'team2Dark', [0, -0.36, 0.86]),
    box(0.09, 0.06, 0.09, 'team2Dark', [0, -0.42, 0.86]),
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
      'team2Dark',
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
      'team',
      [0, 0, 0],
      4,
      Math.PI / 4,
    ),
    // Stripes in segments along the south and east edges.
    ...[-0.5, -0.17, 0.17, 0.5].flatMap((t) => [box(0.2, 0.015, 0.05, 'team2', [t, 0.16, 0.66]), box(0.05, 0.015, 0.2, 'team2', [0.66, 0.16, t])]),
    box(0.5, 0.012, 0.5, 'team2Dark', [0, 0.16, 0]),
    box(0.3, 0.014, 0.3, 'team2Light', [0, 0.165, 0]),
    ...[
      [-1, 1],
      [1, 1],
      [1, -1],
    ].flatMap(([sx, sz]) => [box(0.07, 0.24, 0.07, 'team', [sx! * 0.66, 0.16, sz! * 0.66]), box(0.06, 0.05, 0.06, 'lamp', [sx! * 0.66, 0.4, sz! * 0.66])]),
    box(0.12, 1.0, 0.12, 'team2Dark', [-0.6, 0.16, -0.6]),
    box(0.16, 0.05, 0.16, 'team2', [-0.6, 0.5, -0.6]),
    jib,
  );
};

/**
 * Wall piece in the buildings' style: a chamfered body in the main colour on a plinth, with a band and a cap in the
 * secondary colour and a cyan light slot; arms reach towards neighbouring walls (bits N1 E2 S4 W8).
 */
const wall: Builder = (mask) => {
  const h = 0.26;
  const t = 0.26;
  const g = group(
    box(t + 0.06, 0.05, t + 0.06, 'team2Dark', [0, 0, 0]),
    slab(t + 0.02, h + 0.06, t + 0.02, 'team', [0, 0.04, 0], 0.8),
    box(t * 0.5, 0.03, t * 0.5, 'team2', [0, h + 0.1, 0]),
  );
  for (const [bit, dx, dz] of WALL_ARMS) {
    if (!(mask & bit)) continue;
    const len = 0.5;
    const w = dx ? len : t;
    const d = dz ? len : t;
    const cx = dx * 0.25;
    const cz = dz * 0.25;
    g.add(box(dx ? len : t + 0.04, 0.05, dz ? len : t + 0.04, 'team2Dark', [cx, 0, cz]));
    g.add(slab(w, h, d, 'team', [cx, 0.04, cz], dx ? 0.9 : 0.75));
    g.add(box(dx ? len : t + 0.005, 0.035, dz ? len : t + 0.005, 'team2Dark', [cx, 0.13, cz]));
    // Light slot on the faces that look south or east, where the camera sees them.
    if (dx) g.add(lightSlot(len * 0.5, 0.02, 0.01, [cx, 0.135, cz + t / 2 + 0.005]));
    else g.add(lightSlot(0.01, 0.02, len * 0.5, [cx + t / 2 + 0.005, 0.135, cz]));
  }
  return g;
};

/**
 * Gauss slug in flight: a grey steel dart with a yellow-hot tail of fire through an orange ring, longer with a
 * second ring for the cannon.
 */
const shot: Builder = (view, frame) => {
  const big = frame === 'cannon';
  const r = big ? 0.035 : 0.025;
  const slug = new THREE.OctahedronGeometry(r, 0);
  slug.scale(1, 1, 4);
  const tail = new THREE.ConeGeometry(r * 0.9, r * (big ? 8 : 6.5), 5);
  tail.rotateX(Math.PI / 2);
  const g = group(
    mesh(slug, 'steelLight', [0, 0.32, -r * 2.5]),
    mesh(tail, 'flash', [0, 0.32, r * (big ? 5.2 : 4.4)]),
    mesh(new THREE.TorusGeometry(r * 1.5, r * 0.3, 4, 8), 'flash', [0, 0.32, r * 2]),
  );
  if (big) g.add(mesh(new THREE.TorusGeometry(r * 1.2, r * 0.25, 4, 8), 'flash', [0, 0.32, r * 4.4]));
  return facing(g, view);
};

export const HUMAN: Record<string, Builder> = {
  human_harvester: harvester,
  human_light_tank: lightTank,
  human_middle_tank: middleTank,
  human_heavy_tank: heavyTank,
  human_defender: defender,
  human_shot: shot,
  human_hq: hq,
  human_silo: silo,
  human_factory: factory,
  human_construction: construction,
  human_wall: wall,
};
