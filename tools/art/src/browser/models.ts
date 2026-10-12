import * as THREE from 'three';
import type { MaterialName } from '../materials';
import { ball, barrel, box, cyl, dome, group, lathe, mesh, paintAll, prism, seeded, track } from './kit';

/**
 * Low-poly models of every sprite in the catalog, shaped after the original 2004 sprites (units.png and
 * buildings.png of v1.6.3): yellow-olive tanks with dark olive tracks, cyan glass, grey and cyan buildings, the
 * enemy's cyan hover tank. A builder gets the view (direction 0..7, or the wall mask) and the frame name, and
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

interface TankSpec {
  hullW: number;
  hullL: number;
  hullH: number;
  trackW: number;
  trackH: number;
  turret: (fire: boolean) => THREE.Object3D;
  turretZ: number;
  /** Extra parts on the hull (vents, rear ribs), built in hull space with y = 0 at the top of the hull. */
  deck?: () => THREE.Object3D[];
}

/** Tracked hull of the original's tanks: an olive box with sloped front and back, tracks a darker olive. */
function tank(spec: TankSpec, frame: string): THREE.Group {
  const phase = frame === 'move1' ? 1 : 0;
  const { hullW, hullL, hullH, trackW, trackH } = spec;
  const trackX = hullW / 2 + trackW / 2 - 0.03;
  const y0 = trackH * 0.4;
  const s = hullL * 0.16;
  const hull = prism(
    [
      [-hullL / 2, y0 + hullH * 0.45],
      [-hullL / 2 + s, y0 + hullH],
      [hullL / 2 - s * 0.6, y0 + hullH],
      [hullL / 2, y0 + hullH * 0.6],
      [hullL / 2, y0],
      [-hullL / 2 + s * 0.5, y0],
    ],
    hullW,
    'team',
  );
  const top = y0 + hullH;
  const deck = group(...(spec.deck?.() ?? []));
  deck.position.y = top;
  const g = group(
    hull,
    track(hullL * 1.04, trackW, trackH, -trackX, phase),
    track(hullL * 1.04, trackW, trackH, trackX, phase),
    // Mudguards over the tracks, a step lighter, as the original's bright track edges.
    box(trackW + 0.01, 0.025, hullL * 0.9, 'team', [-trackX, trackH, 0]),
    box(trackW + 0.01, 0.025, hullL * 0.9, 'team', [trackX, trackH, 0]),
    deck,
  );
  const turret = spec.turret(frame === 'fire');
  turret.position.set(0, top, spec.turretZ);
  g.add(turret);
  if (frame === 'wreck') {
    turret.rotation.y = 0.7;
    turret.rotation.z = 0.12;
    turret.position.x += 0.04;
    paintAll(g, 'burnt', ['track', 'trackLight']);
  }
  return g;
}

/** Light tank: small and quick, square turret with a long thin gun reaching past the hull. */
const lightTank: Builder = (view, frame) =>
  facing(
    tank(
      {
        hullW: 0.4,
        hullL: 0.66,
        hullH: 0.13,
        trackW: 0.12,
        trackH: 0.13,
        turretZ: 0.06,
        deck: () => [box(0.24, 0.02, 0.1, 'teamDark', [0, 0, 0.24])],
        turret: (fire) =>
          group(
            prism(
              [
                [-0.12, 0],
                [-0.09, 0.1],
                [0.11, 0.1],
                [0.13, 0],
              ],
              0.24,
              'teamLight',
            ),
            box(0.08, 0.025, 0.08, 'teamDark', [0.05, 0.1, 0.04]),
            cyl(0.006, 0.006, 0.22, 'teamDark', [-0.09, 0.1, 0.09], 3),
            guns(1, 0.02, 0.38, 0.05, -0.11, 0, fire),
          ),
      },
      frame,
    ),
    view,
  );

/**
 * Middle tank: the bulky one of the original, a wide rounded hull with ribs on the back deck and a big round
 * turret whose gun is raised.
 */
const middleTank: Builder = (view, frame) =>
  facing(
    tank(
      {
        hullW: 0.5,
        hullL: 0.8,
        hullH: 0.17,
        trackW: 0.13,
        trackH: 0.14,
        turretZ: 0.02,
        deck: () => [0.2, 0.26, 0.32].map((z) => box(0.42, 0.03, 0.03, 'teamDark', [0, 0, z])),
        turret: (fire) => {
          const gun = guns(1, 0.032, 0.36, 0, -0.16, 0, fire);
          gun.position.y = 0.09;
          gun.rotation.x = 0.28;
          return group(
            lathe(
              [
                [0.21, 0],
                [0.21, 0.07],
                [0.16, 0.14],
                [0.0, 0.16],
              ],
              'teamLight',
              [0, 0, 0],
              8,
              Math.PI / 8,
            ),
            box(0.1, 0.03, 0.1, 'teamDark', [0.06, 0.14, 0.06]),
            box(0.1, 0.07, 0.1, 'teamDark', [0, 0.05, -0.18]),
            gun,
          );
        },
      },
      frame,
    ),
    view,
  );

/** Heavy tank: long low hull, the turret set back, one long thick gun. */
const heavyTank: Builder = (view, frame) =>
  facing(
    tank(
      {
        hullW: 0.48,
        hullL: 0.9,
        hullH: 0.15,
        trackW: 0.15,
        trackH: 0.15,
        turretZ: 0.1,
        deck: () => [box(0.36, 0.02, 0.14, 'teamDark', [0, 0, 0.32]), box(0.3, 0.02, 0.06, 'teamDark', [0, 0, -0.3])],
        turret: (fire) =>
          group(
            prism(
              [
                [-0.2, 0],
                [-0.14, 0.13],
                [0.18, 0.13],
                [0.22, 0.03],
                [0.22, 0],
              ],
              0.32,
              'teamLight',
            ),
            box(0.11, 0.03, 0.12, 'teamDark', [0.06, 0.13, 0.05]),
            guns(1, 0.034, 0.5, 0.07, -0.18, 0, fire),
          ),
      },
      frame,
    ),
    view,
  );

/** The enemy's own unit in the original: a flat cyan hover pod, rounded like a pebble, with a gun slot in front. */
const hoverTank: Builder = (view, frame) => {
  const body = new THREE.SphereGeometry(0.4, 10, 6);
  body.scale(1.1, 0.34, 0.72);
  const skirt = new THREE.CylinderGeometry(0.4, 0.34, 0.06, 10);
  skirt.scale(1.1, 1, 0.72);
  const hover = frame === 'move1' ? 0.02 : 0;
  const g = group(
    mesh(body, 'team', [0, 0.18 + hover, 0]),
    mesh(skirt, 'teamDark', [0, 0.1 + hover, 0]),
    // Raised hatch and the dark slot the gun fires from.
    dome(0.16, 'teamLight', [0.05, 0.27 + hover, 0.05], 0.45, 8),
    box(0.22, 0.06, 0.12, 'teamDark', [0, 0.14 + hover, -0.24]),
    guns(1, 0.026, 0.12, 0.17 + hover, -0.26, 0, frame === 'fire', 'teamDark'),
  );
  if (frame === 'wreck') {
    g.position.y = -0.08;
    g.rotation.z = 0.15;
    paintAll(g, 'burnt');
  }
  return facing(g, view);
};

/** Harvester: a tall olive box truck, cyan glass across the front of the roof and a seam between the hopper doors. */
const harvester: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  const L = 0.8;
  const W = 0.5;
  const y0 = 0.07;
  const g = group(
    track(L * 0.96, 0.1, 0.11, -W / 2 + 0.02, phase),
    track(L * 0.96, 0.1, 0.11, W / 2 - 0.02, phase),
    box(W - 0.06, 0.06, L * 0.9, 'teamDark', [0, y0, 0]),
    // Body with a sloped windscreen at the front.
    prism(
      [
        [-L / 2, 0],
        [-L / 2, 0.14],
        [-L / 2 + 0.16, 0.28],
        [L / 2, 0.28],
        [L / 2, 0],
      ],
      W,
      'team',
      [0, y0 + 0.04, 0],
    ),
    prism(
      [
        [-L / 2 - 0.005, 0.135],
        [-L / 2 + 0.155, 0.285],
        [-L / 2 + 0.3, 0.285],
        [-L / 2 + 0.3, 0.27],
        [-L / 2 + 0.15, 0.27],
        [-L / 2 + 0.01, 0.13],
      ],
      W - 0.06,
      'glass',
      [0, y0 + 0.04, 0],
    ),
    box(W - 0.04, 0.02, 0.02, 'teamDark', [0, y0 + 0.32, 0.12]),
    box(0.02, 0.02, 0.44, 'teamDark', [0, y0 + 0.32, 0.17]),
    box(W + 0.02, 0.05, 0.05, 'teamDark', [0, y0 + 0.02, -L / 2 - 0.02]),
    cyl(0.025, 0.025, 0.05, 'lamp', [W / 2 - 0.08, y0 + 0.32, 0.33], 4),
  );
  if (frame === 'wreck') paintAll(g, 'burnt', ['track', 'trackLight']);
  return facing(g, view);
};

/** Defender: a cyan ball turret with twin olive guns on a pale grey pillar. */
const defender: Builder = (view, frame) => {
  const head = group(
    ball(0.2, 'glass', [0, 0, 0], 8),
    box(0.44, 0.08, 0.12, 'team', [0, -0.05, -0.02]),
    guns(2, 0.026, 0.24, 0, -0.08, 0.18, frame === 'fire'),
  );
  head.rotation.y = (-view * Math.PI) / 4;
  head.position.y = 0.6;
  return group(
    lathe(
      [
        [0.3, 0],
        [0.29, 0.06],
        [0.17, 0.14],
        [0.13, 0.42],
        [0.0, 0.42],
      ],
      'steel',
      [0, 0, 0],
      8,
      Math.PI / 8,
    ),
    cyl(0.16, 0.14, 0.05, 'team', [0, 0.4, 0], 8),
    head,
  );
};

/**
 * Player HQ: the original's round grey base, stepped up to a tower with cyan window bands, a cyan cap and a spike
 * antenna, a smaller dome on the left with the green signal light. The team colours one band of the tower.
 */
const hq: Builder = (_view, frame) => {
  const turn = Number(frame.slice(-1)) || 0;
  const radar = group(box(0.34, 0.03, 0.05, 'steel', [0, 0, 0]), box(0.05, 0.06, 0.05, 'steelDark', [0.15, 0.02, 0]));
  radar.rotation.y = (turn * Math.PI) / 4;
  radar.position.set(0, 1.3, 0);
  return group(
    lathe(
      [
        [0.92, 0],
        [0.92, 0.1],
        [0.84, 0.16],
        [0.72, 0.34],
        [0.6, 0.4],
        [0.0, 0.4],
      ],
      'steelLight',
      [0, 0, 0],
      12,
    ),
    cyl(0.88, 0.88, 0.05, 'glassDark', [0, 0.1, 0], 12),
    cyl(0.62, 0.62, 0.06, 'glass', [0, 0.36, 0], 12),
    cyl(0.34, 0.4, 0.72, 'steel', [0, 0.4, 0], 8),
    cyl(0.4, 0.4, 0.07, 'team', [0, 0.5, 0], 8),
    cyl(0.365, 0.365, 0.09, 'glass', [0, 0.84, 0], 8),
    dome(0.35, 'glassDark', [0, 1.12, 0], 0.45, 8),
    cyl(0.0, 0.035, 0.45, 'steelLight', [0, 1.2, 0], 4),
    radar,
    // Side dome with the signal light, and a hangar door to the south.
    cyl(0.22, 0.25, 0.4, 'steel', [-0.55, 0.12, -0.35], 8),
    dome(0.22, 'glass', [-0.55, 0.52, -0.35], 0.7, 8),
    ball(0.06, turn % 2 ? 'glassDark' : 'signal', [-0.55, 0.7, -0.35], 6),
    box(0.3, 0.2, 0.06, 'steelDark', [0.1, 0.14, 0.66]),
    box(0.34, 0.03, 0.08, 'glass', [0.1, 0.34, 0.65]),
  );
};

/**
 * Enemy HQ: the original's tall pointed shell, pale ribs over dark cyan panels, with a green orb on a cyan spike in
 * front. The team colours the plinth.
 */
const enemyHq: Builder = (_view, frame) => {
  const shell: [number, number][] = [
    [0.86, 0],
    [0.84, 0.12],
    [0.76, 0.42],
    [0.6, 0.78],
    [0.4, 1.08],
    [0.18, 1.34],
    [0.0, 1.5],
  ];
  const g = group(
    cyl(0.92, 0.95, 0.08, 'teamDark', [0, 0, 0], 8),
    lathe(
      shell.map(([r, y]) => [r * 0.95, y * 0.98]),
      'glass',
      [0, 0.08, 0],
      8,
    ),
  );
  for (let i = 0; i < 4; i++) {
    // Ribs down the front, back and both sides, so the outline of the shell is pale as in the original.
    g.add(lathe(shell, 'steelLight', [0, 0.08, 0], 2, (i * Math.PI) / 2 - (i % 2 ? 0.45 : 0.22), i % 2 ? 0.9 : 0.44));
  }
  g.add(box(0.3, 0.32, 0.12, 'steelDark', [0, 0.08, 0.76]));
  g.add(cyl(0.0, 0.05, 0.36, 'glass', [0.62, 0.08, 0.6], 4));
  g.add(ball(0.09, frame === 'idle0' ? 'signal' : 'glass', [0.62, 0.5, 0.6], 6));
  return g;
};

/** One mushroom tower of the silo: a flared grey pedestal under a wide disc with rings on top and a cyan rim. */
function mushroom(x: number, z: number, h: number): THREE.Group {
  return group(
    lathe(
      [
        [0.34, 0],
        [0.24, 0.08],
        [0.15, h * 0.5],
        [0.12, h],
        [0.0, h],
      ],
      'steel',
      [x, 0, z],
      8,
      Math.PI / 8,
    ),
    cyl(0.21, 0.24, 0.05, 'team', [x, 0.05, z], 8),
    cyl(0.5, 0.42, 0.06, 'glassDark', [x, h, z], 12),
    cyl(0.54, 0.54, 0.08, 'steelLight', [x, h + 0.06, z], 12),
    cyl(0.4, 0.4, 0.02, 'steel', [x, h + 0.14, z], 12),
    cyl(0.24, 0.24, 0.02, 'steelLight', [x, h + 0.16, z], 12),
    cyl(0.1, 0.1, 0.02, 'steel', [x, h + 0.18, z], 8),
  );
}

/** Silo: two mushroom towers, the back one taller, and a small hatch plate beside them. */
const silo: Builder = () =>
  group(mushroom(-0.32, -0.3, 0.95), mushroom(0.3, 0.28, 0.6), box(0.42, 0.05, 0.34, 'steel', [0.56, 0, 0.72]), box(0.3, 0.02, 0.22, 'steelDark', [0.56, 0.05, 0.72]));

/**
 * Tank factory: a grey vat with a cyan rim, a mast beside it and two crane arms over parts plates. While it builds
 * ('work') the plates carry glowing gold parts, as in the original's second factory sprite.
 */
const factory: Builder = (_view, frame) => {
  const work = frame === 'work';
  const plate = (x: number, z: number) =>
    group(
      box(0.56, 0.05, 0.5, 'steel', [x, 0, z]),
      box(0.42, 0.02, 0.06, work ? 'gold' : 'steelDark', [x, 0.05, z]),
      box(0.06, 0.02, 0.36, work ? 'gold' : 'steelDark', [x, 0.05, z]),
      ...(work ? [box(0.16, 0.08, 0.16, 'gold', [x + 0.12, 0.05, z - 0.1])] : []),
    );
  const arm = (tx: number, tz: number) => {
    const mx = 0.3;
    const mz = 0.1;
    const dx = tx - mx;
    const dz = tz - mz;
    const len = Math.hypot(dx, dz);
    const a = group(box(0.035, 0.035, len, 'steelDark', [0, 0, -len / 2]), box(0.012, 0.3, 0.012, 'steelDark', [0, -0.3, -len]), box(0.07, 0.04, 0.07, 'steelDark', [0, -0.34, -len]));
    a.position.set(mx, 1.06, mz);
    a.rotation.y = Math.atan2(-dx, -dz);
    return a;
  };
  return group(
    plate(-0.58, -0.32),
    plate(0.52, -0.6),
    // Vat.
    cyl(0.32, 0.34, 0.55, 'steel', [-0.1, 0, 0.45], 10),
    cyl(0.35, 0.35, 0.06, 'team', [-0.1, 0.1, 0.45], 10),
    cyl(0.33, 0.33, 0.08, 'glass', [-0.1, 0.55, 0.45], 10),
    cyl(0.25, 0.25, 0.02, 'steelDark', [-0.1, 0.63, 0.45], 10),
    // Mast with a lamp, crane arms out to the plates.
    box(0.1, 1.1, 0.1, 'steel', [0.3, 0, 0.1]),
    box(0.06, 0.1, 0.11, 'glass', [0.3, 0.6, 0.1]),
    cyl(0.03, 0.03, 0.04, work ? 'lamp' : 'glassDark', [0.3, 1.1, 0.1], 4),
    arm(-0.58, -0.32),
    arm(0.52, -0.6),
  );
};

/** Construction site: a grey platform with a cyan marker in the middle and a crane on its corner. */
const construction: Builder = () => {
  const marker = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 4);
  const jib = group(box(0.04, 0.04, 0.9, 'steelDark', [0, 0, 0.45]), box(0.012, 0.36, 0.012, 'steelDark', [0, -0.36, 0.86]), box(0.08, 0.05, 0.08, 'steelDark', [0, -0.41, 0.86]));
  jib.position.set(-0.55, 1.16, -0.55);
  jib.rotation.y = Math.PI / 4;
  return group(
    lathe(
      [
        [1.12, 0],
        [1.08, 0.24],
        [0.0, 0.24],
      ],
      'steel',
      [0, 0, 0],
      4,
      Math.PI / 4,
    ),
    lathe(
      [
        [0.92, 0.24],
        [0.9, 0.27],
        [0.0, 0.27],
      ],
      'steel',
      [0, 0, 0],
      4,
      Math.PI / 4,
    ),
    mesh(marker, 'glass', [0, 0.28, 0]),
    box(0.1, 0.92, 0.1, 'steelDark', [-0.55, 0.27, -0.55]),
    box(0.14, 0.04, 0.14, 'steelDark', [-0.55, 1.16, -0.55]),
    jib,
  );
};

/** Resource field: the original's yellow plate of gold tiles, every other tile a little higher. */
const resource: Builder = () => {
  const g = group();
  const n = 6;
  const size = 1.6 / n;
  const rnd = seeded(42);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const h = (i + j) % 2 ? 0.05 : 0.08 + rnd() * 0.02;
      g.add(box(size * 0.94, h, size * 0.94, 'gold', [-0.8 + size * (i + 0.5), 0, -0.8 + size * (j + 0.5)]));
    }
  }
  return g;
};

/** Wall piece: a low grey bar with a pale top, arms reaching towards neighbouring walls (bits N1 E2 S4 W8). */
const wall: Builder = (mask) => {
  const h = 0.22;
  const t = 0.3;
  const g = group(box(t, h, t, 'steel', [0, 0, 0]), box(t + 0.02, 0.04, t + 0.02, 'steelLight', [0, h, 0]));
  const arms: [number, number, number][] = [
    [1, 0, -1],
    [2, 1, 0],
    [4, 0, 1],
    [8, -1, 0],
  ];
  for (const [bit, dx, dz] of arms) {
    if (!(mask & bit)) continue;
    const w = dx ? 0.5 : t;
    const d = dz ? 0.5 : t;
    g.add(box(w, h, d, 'steel', [dx * 0.25, 0, dz * 0.25]));
    g.add(box(dx ? 0.5 : t + 0.02, 0.04, dz ? 0.5 : t + 0.02, 'steelLight', [dx * 0.25, h, dz * 0.25]));
  }
  return g;
};

export const MODELS: Record<string, Builder> = {
  harvester,
  light_tank: lightTank,
  middle_tank: middleTank,
  heavy_tank: heavyTank,
  hover_tank: hoverTank,
  defender,
  hq,
  enemy_hq: enemyHq,
  silo,
  factory,
  construction,
  resource,
  wall,
};
