import * as THREE from 'three';
import { barrel, box, cyl, dome, group, mesh, paintAll, prism, seeded, track } from './kit';

/**
 * Low-poly models of every sprite in the catalog. A builder gets the view (direction 0..7, or the wall mask) and the
 * frame name, and returns the model already turned to face that direction. Sizes are in cells (1 = one 15 px cell
 * of the original); a unit must stay inside about 0.9 x 0.9 so neighbours do not overlap.
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

interface TankSpec {
  hullW: number;
  hullL: number;
  hullH: number;
  trackW: number;
  trackH: number;
  turret: (fire: boolean) => THREE.Object3D;
  turretZ: number;
}

function tank(spec: TankSpec, frame: string): THREE.Group {
  const phase = frame === 'move1' ? 1 : 0;
  const { hullW, hullL, hullH, trackW, trackH } = spec;
  const trackX = hullW / 2 + trackW / 2 - 0.02;
  const y0 = trackH * 0.45;
  const s = hullL * 0.22;
  const hull = prism(
    [
      [-hullL / 2, y0 + hullH * 0.35],
      [-hullL / 2 + s, y0 + hullH],
      [hullL / 2 - s * 0.4, y0 + hullH],
      [hullL / 2, y0 + hullH * 0.55],
      [hullL / 2, y0],
      [-hullL / 2 + s * 0.6, y0],
    ],
    hullW,
    'team',
  );
  const g = group(
    hull,
    track(hullL * 1.02, trackW, trackH, -trackX, phase),
    track(hullL * 1.02, trackW, trackH, trackX, phase),
    // Engine deck grille at the back.
    box(hullW * 0.6, 0.02, hullL * 0.18, 'steelDark', [0, y0 + hullH, hullL / 2 - s * 0.4 - hullL * 0.1]),
  );
  const turret = spec.turret(frame === 'fire');
  turret.position.set(0, y0 + hullH, spec.turretZ);
  g.add(turret);
  if (frame === 'wreck') {
    turret.rotation.y = 0.7;
    turret.rotation.z = 0.12;
    turret.position.x += 0.04;
    paintAll(g, 'burnt', ['track', 'trackLight', 'teamDark']);
  }
  return g;
}

/** Barrel(s) pointing north from the turret front, recoiled and flashing when firing. */
function guns(count: 1 | 2, r: number, len: number, y: number, z: number, spread: number, fire: boolean): THREE.Group {
  const g = new THREE.Group();
  const recoil = fire ? len * 0.15 : 0;
  const xs = count === 1 ? [0] : [-spread, spread];
  for (const x of xs) {
    g.add(barrel(r, len, 'steel', [x, y, z + recoil]));
    g.add(barrel(r * 1.5, len * 0.14, 'steelDark', [x, y, z + recoil - len * 0.86]));
    if (fire) g.add(muzzleFlash([x, y, z - len - r * 4], r * 4));
  }
  return g;
}

const lightTank: Builder = (view, frame) =>
  facing(
    tank(
      {
        hullW: 0.42,
        hullL: 0.72,
        hullH: 0.13,
        trackW: 0.11,
        trackH: 0.12,
        turretZ: 0.04,
        turret: (fire) =>
          group(
            prism(
              [
                [-0.13, 0],
                [-0.09, 0.09],
                [0.12, 0.09],
                [0.14, 0],
              ],
              0.24,
              'teamLight',
            ),
            box(0.08, 0.02, 0.08, 'steelDark', [0.05, 0.09, 0.04]),
            guns(1, 0.022, 0.3, 0.05, -0.12, 0, fire),
          ),
      },
      frame,
    ),
    view,
  );

const middleTank: Builder = (view, frame) =>
  facing(
    tank(
      {
        hullW: 0.48,
        hullL: 0.82,
        hullH: 0.15,
        trackW: 0.13,
        trackH: 0.14,
        turretZ: 0.05,
        turret: (fire) =>
          group(
            cyl(0.15, 0.18, 0.1, 'teamLight', [0, 0, 0], 8),
            box(0.1, 0.035, 0.12, 'teamDark', [-0.03, 0.1, 0.05]),
            cyl(0.03, 0.03, 0.03, 'glass', [0.07, 0.1, 0.02], 6),
            guns(1, 0.03, 0.4, 0.055, -0.14, 0, fire),
          ),
      },
      frame,
    ),
    view,
  );

const heavyTank: Builder = (view, frame) =>
  facing(
    tank(
      {
        hullW: 0.5,
        hullL: 0.9,
        hullH: 0.17,
        trackW: 0.16,
        trackH: 0.16,
        turretZ: 0.08,
        turret: (fire) =>
          group(
            prism(
              [
                [-0.19, 0],
                [-0.13, 0.13],
                [0.17, 0.13],
                [0.21, 0.04],
                [0.21, 0],
              ],
              0.34,
              'teamLight',
            ),
            box(0.12, 0.04, 0.14, 'teamDark', [0, 0.13, 0.05]),
            cyl(0.035, 0.035, 0.035, 'glass', [0.1, 0.13, 0.08], 6),
            guns(2, 0.028, 0.42, 0.07, -0.17, 0.06, fire),
          ),
      },
      frame,
    ),
    view,
  );

/** The enemy's own unit in the original: a hovering saucer with a small gun pod. */
const hoverTank: Builder = (view, frame) => {
  const body = new THREE.SphereGeometry(0.36, 10, 5);
  body.scale(0.95, 0.32, 1.15);
  const lit = frame === 'move0' || frame === 'fire';
  const g = group(
    mesh(body, 'team', [0, 0.18, 0]),
    box(0.62, 0.04, 0.22, 'teamDark', [0, 0.16, 0.08]),
    dome(0.15, 'glass', [0, 0.25, -0.04], 0.8, 8),
    cyl(0.3, 0.26, 0.04, lit ? 'lamp' : 'glass', [0, 0.06, 0], 10),
    guns(2, 0.022, 0.2, 0.2, -0.3, 0.17, frame === 'fire'),
  );
  if (frame === 'wreck') {
    g.position.y = -0.06;
    g.rotation.z = 0.18;
    paintAll(g, 'burnt');
  }
  return facing(g, view);
};

const harvester: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  const L = 0.78;
  const W = 0.42;
  const y0 = 0.07;
  const drum = new THREE.CylinderGeometry(0.075, 0.075, W + 0.12, 6);
  drum.rotateZ(Math.PI / 2);
  const ore = group();
  const rnd = seeded(7);
  for (let i = 0; i < 7; i++) {
    const rock = new THREE.IcosahedronGeometry(0.05 + rnd() * 0.03, 0);
    ore.add(mesh(rock, 'gold', [(rnd() - 0.5) * 0.24, y0 + 0.2, 0.12 + (rnd() - 0.5) * 0.26]));
  }
  const g = group(
    track(L, 0.12, 0.13, -W / 2 - 0.04, phase),
    track(L, 0.12, 0.13, W / 2 + 0.04, phase),
    // Chassis, cab at the front, open hopper behind it.
    box(W, 0.08, L * 0.92, 'teamDark', [0, y0, 0]),
    prism(
      [
        [-0.34, 0],
        [-0.27, 0.17],
        [-0.08, 0.17],
        [-0.08, 0],
      ],
      W * 0.8,
      'team',
      [0, y0 + 0.08, 0],
    ),
    box(W * 0.6, 0.05, 0.08, 'glass', [0, y0 + 0.17, -0.25]),
    box(W, 0.14, 0.04, 'team', [0, y0 + 0.08, -0.06]),
    box(W, 0.14, 0.04, 'team', [0, y0 + 0.08, 0.34]),
    box(0.04, 0.14, 0.4, 'team', [-W / 2 + 0.02, y0 + 0.08, 0.14]),
    box(0.04, 0.14, 0.4, 'team', [W / 2 - 0.02, y0 + 0.08, 0.14]),
    box(W - 0.08, 0.1, 0.36, 'steelDark', [0, y0 + 0.08, 0.14]),
    ore,
    // Scoop drum at the front, turning between move frames.
    mesh(drum, 'steel', [0, 0.09, -L / 2 - 0.04], [phase * (Math.PI / 6), 0, 0]),
    box(W + 0.14, 0.03, 0.05, 'steelDark', [0, 0.16, -L / 2 - 0.02]),
    cyl(0.02, 0.02, 0.07, 'lamp', [0.13, y0 + 0.25, -0.12], 4),
  );
  if (frame === 'wreck') {
    ore.clear();
    paintAll(g, 'burnt', ['track']);
  }
  return facing(g, view);
};

const defender: Builder = (view, frame) => {
  const head = group(
    dome(0.17, 'team', [0, 0, 0], 0.75, 8),
    dome(0.08, 'glass', [0, 0.1, 0.03], 0.9, 6),
    box(0.36, 0.06, 0.1, 'teamDark', [0, 0.02, -0.04]),
    guns(2, 0.022, 0.26, 0.05, -0.1, 0.13, frame === 'fire'),
  );
  head.rotation.y = (-view * Math.PI) / 4;
  head.position.y = 0.38;
  return group(
    cyl(0.36, 0.42, 0.1, 'concrete', [0, 0, 0], 8),
    cyl(0.12, 0.17, 0.28, 'steel', [0, 0.1, 0], 8),
    cyl(0.18, 0.15, 0.04, 'steelDark', [0, 0.34, 0], 8),
    head,
  );
};

/** Player HQ: command block on a concrete pad with a turning radar dish. */
const hq: Builder = (_view, frame) => {
  const turn = Number(frame.slice(-1)) || 0;
  const dish = new THREE.SphereGeometry(0.3, 10, 3, 0, Math.PI * 2, 0, Math.PI / 3.2);
  dish.rotateX(Math.PI / 2 + 0.6);
  const radar = group(
    cyl(0.03, 0.03, 0.26, 'steel', [0, 0, 0], 6),
    mesh(dish, 'steel', [0, 0.36, 0.1]),
    barrel(0.012, 0.16, 'steelDark', [0, 0.3, 0.02], 4),
  );
  radar.rotation.y = (turn * Math.PI) / 2;
  radar.position.set(0.45, 0.6, 0.12);
  const vents = [-0.62, -0.5].map((x) => box(0.08, 0.05, 0.22, 'steelDark', [x, 0.45, 0.12]));
  return group(
    cyl(0.95, 0.98, 0.08, 'concrete', [0, 0, 0], 8),
    // Main hall with a darker plinth and a lighter roof edge.
    box(1.14, 0.08, 0.84, 'teamDark', [-0.1, 0.08, -0.05]),
    box(1.1, 0.28, 0.8, 'team', [-0.1, 0.16, -0.05]),
    box(1.16, 0.04, 0.86, 'teamLight', [-0.1, 0.44, -0.05]),
    // Command tower.
    box(0.5, 0.26, 0.45, 'team', [-0.28, 0.48, -0.17]),
    box(0.54, 0.03, 0.49, 'teamLight', [-0.28, 0.74, -0.17]),
    box(0.42, 0.06, 0.02, 'lamp', [-0.28, 0.6, 0.06]),
    ...vents,
    // Window band and garage door facing south, where the camera looks from.
    box(0.92, 0.05, 0.02, 'lamp', [-0.1, 0.3, 0.36]),
    box(0.32, 0.14, 0.04, 'steel', [0.24, 0.08, 0.36]),
    cyl(0.1, 0.12, 0.16, 'steel', [0.45, 0.48, 0.12], 6),
    radar,
    cyl(0.012, 0.012, 0.42, 'steel', [-0.45, 0.77, -0.32], 4),
    cyl(0.03, 0.03, 0.04, 'lamp', [-0.45, 1.19, -0.32], 4),
    box(0.3, 0.02, 0.3, 'concreteDark', [0.55, 0.08, -0.6]),
  );
};

/** Enemy HQ: the ribbed dome-spire of the original, with glowing seams. */
const enemyHq: Builder = (_view, frame) => {
  const g = group(cyl(0.95, 0.98, 0.08, 'concreteDark', [0, 0, 0], 8), cyl(0.7, 0.85, 0.14, 'steelDark', [0, 0.08, 0], 8));
  const spire = new THREE.CylinderGeometry(0.0, 0.66, 1.25, 8, 3);
  // Bulge the middle ring outwards so the spire curves like the original.
  const pos = spire.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + 0.35 * Math.sin(((y + 0.625) / 1.25) * Math.PI);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  spire.computeVertexNormals();
  g.add(mesh(spire, 'team', [0, 0.22 + 0.625, 0], [0, Math.PI / 8, 0]));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const rib = box(0.05, 0.85, 0.05, i % 2 ? 'glass' : 'lamp', [Math.sin(a) * 0.55, 0.22, Math.cos(a) * 0.55]);
    rib.rotation.set(Math.cos(a) * -0.42, 0, Math.sin(a) * 0.42);
    g.add(rib);
  }
  g.add(box(0.26, 0.2, 0.08, 'steelDark', [0, 0.22, 0.66]));
  g.add(cyl(0.05, 0.05, 0.08, frame === 'idle0' ? 'lamp' : 'glass', [0, 1.45, 0], 6));
  return g;
};

/** Silo: two storage tanks with domed tops joined by a pipe, resource level window in front. */
const silo: Builder = () =>
  group(
    box(1.7, 0.06, 1.5, 'concrete', [0, 0, 0]),
    ...[-0.4, 0.42].flatMap((x, i) => {
      const z = i ? 0.15 : -0.2;
      return [
        cyl(0.36, 0.38, 0.62, 'steel', [x, 0.06, z], 10),
        cyl(0.385, 0.385, 0.09, 'team', [x, 0.42, z], 10),
        dome(0.36, 'steel', [x, 0.68, z], 0.45, 10),
        box(0.08, 0.3, 0.02, 'gold', [x, 0.12, z + 0.37]),
      ];
    }),
    barrel(0.05, 0.55, 'steelDark', [0.28, 0.5, 0.1], 6).rotateY(Math.PI / 2 + 0.6) as THREE.Mesh,
    box(0.36, 0.14, 0.3, 'teamDark', [-0.05, 0.06, 0.52]),
  );

/** Tank factory: arched hangar with a striped door to the south and a gantry crane beside it. */
const factory: Builder = () => {
  const roof = new THREE.CylinderGeometry(0.55, 0.55, 1.3, 8, 1, false, 0, Math.PI);
  roof.rotateZ(Math.PI / 2);
  roof.rotateX(Math.PI / 2);
  const door = group(box(0.64, 0.44, 0.04, 'steelDark', [0, 0, 0]));
  for (let i = 0; i < 4; i++) door.add(box(0.64, 0.035, 0.05, i % 2 ? 'steel' : 'gold', [0, 0.06 + i * 0.1, 0]));
  door.position.set(0, 0.06, 0.56);
  const ribs = [-0.35, 0, 0.35].map((z) => box(1.14, 0.3, 0.05, 'teamDark', [0, 0.06, z - 0.1]));
  return group(
    box(1.8, 0.06, 1.8, 'concrete', [0, 0, 0]),
    box(1.1, 0.3, 1.3, 'team', [0, 0.06, -0.1]),
    ...ribs,
    mesh(roof, 'team', [0, 0.36, -0.1]),
    door,
    // Gantry crane.
    box(0.06, 0.6, 0.06, 'steel', [0.72, 0.06, -0.55]),
    box(0.06, 0.6, 0.06, 'steel', [0.72, 0.06, 0.4]),
    box(0.08, 0.06, 1.05, 'steel', [0.72, 0.66, -0.07]),
    box(0.5, 0.05, 0.08, 'steel', [0.5, 0.72, 0.1]),
    box(0.01, 0.2, 0.01, 'steelDark', [0.3, 0.52, 0.1]),
    box(0.08, 0.05, 0.08, 'gold', [0.3, 0.48, 0.1]),
    cyl(0.06, 0.07, 0.4, 'steelDark', [-0.45, 0.6, -0.5], 6),
    cyl(0.03, 0.03, 0.03, 'lamp', [0, 0.92, -0.4], 4),
    box(0.2, 0.1, 0.12, 'steel', [-0.6, 0.06, 0.6]),
    box(0.4, 0.02, 0.5, 'concreteDark', [0, 0.06, 0.82]),
  );
};

/** Resource field: a low mound of gold crystals. */
const resource: Builder = () => {
  const g = group();
  const rnd = seeded(42);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 0.82;
    const s = 0.08 + rnd() * 0.1 * (1 - d * 0.6);
    const crystal = new THREE.OctahedronGeometry(s, 0);
    crystal.scale(0.7, 1.6, 0.7);
    const m = mesh(crystal, 'gold', [Math.cos(a) * d, s * 0.9, Math.sin(a) * d * 0.9], [rnd() * 0.6 - 0.3, rnd() * 3, rnd() * 0.6 - 0.3]);
    g.add(m);
  }
  const base = new THREE.CylinderGeometry(0.75, 0.9, 0.06, 8);
  g.add(mesh(base, 'concreteDark', [0, 0.03, 0]));
  return g;
};

/** Wall piece: a concrete post with arms towards neighbouring walls (bits N1 E2 S4 W8). */
const wall: Builder = (mask) => {
  const h = 0.36;
  const g = group(box(0.46, h + 0.06, 0.46, 'concrete', [0, 0, 0]), box(0.5, 0.04, 0.5, 'concreteDark', [0, h + 0.06, 0]));
  const arms: [number, number, number][] = [
    [1, 0, -1],
    [2, 1, 0],
    [4, 0, 1],
    [8, -1, 0],
  ];
  for (const [bit, dx, dz] of arms) {
    if (!(mask & bit)) continue;
    const w = dx ? 0.5 : 0.38;
    const d = dz ? 0.5 : 0.38;
    g.add(box(w, h, d, 'concrete', [dx * 0.25, 0, dz * 0.25]));
    g.add(box(dx ? 0.5 : 0.08, 0.03, dz ? 0.5 : 0.08, 'steelDark', [dx * 0.25, h, dz * 0.25]));
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
  resource,
  wall,
};
