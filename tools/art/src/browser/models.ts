import * as THREE from 'three';
import type { MaterialName } from '../materials';
import { ball, barrel, box, cyl, dome, group, lathe, mesh, paintAll, prism, seeded, track, type Vec3 } from './kit';

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

/** Wheel turning about the x axis: a dark tyre with tread blocks that move on between frames, a pale hub. */
function wheel(r: number, w: number, pos: Vec3, phase: number): THREE.Group {
  const tyre = new THREE.CylinderGeometry(r, r, w, 10);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.012, 6);
  hub.rotateZ(Math.PI / 2);
  const g = group(mesh(tyre, 'track'), mesh(hub, 'teamLight'));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = ((i + phase * 0.5) / n) * Math.PI * 2;
    const block = mesh(new THREE.BoxGeometry(w + 0.008, r * 0.2, r * 0.34), i % 2 ? 'trackLight' : 'track', [0, Math.cos(a) * r, Math.sin(a) * r], [-a, 0, 0]);
    g.add(block);
  }
  g.position.set(...pos);
  return g;
}

/**
 * Light tank: a trike. One wheel up front in a fork, two big wheels at the back, a glass canopy over the driver and a
 * small turret on the tail whose long thin gun reaches over the canopy.
 */
const lightTank: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  // Turret pod raised on a neck, so it reads as a separate gun mount above the body.
  const turret = group(
    cyl(0.05, 0.06, 0.07, 'teamDark', [0, 0, 0], 6),
    cyl(0.12, 0.14, 0.11, 'teamLight', [0, 0.07, 0], 6),
    cyl(0.08, 0.12, 0.04, 'team', [0, 0.18, 0], 6),
    box(0.05, 0.035, 0.05, 'glass', [0.05, 0.13, -0.08]),
    guns(1, 0.022, 0.52, 0.12, -0.1, 0, frame === 'fire'),
  );
  turret.position.set(0, 0.24, 0.17);
  const canopy = dome(0.085, 'glass', [0, 0.2, -0.1], 0.75, 8);
  canopy.scale.z = 1.6;
  const g = group(
    // Spine of the body, low at the nose and high at the tail.
    prism(
      [
        [-0.36, 0.13],
        [-0.22, 0.2],
        [0.12, 0.26],
        [0.3, 0.24],
        [0.33, 0.12],
        [-0.3, 0.09],
      ],
      0.2,
      'team',
    ),
    box(0.44, 0.07, 0.14, 'teamDark', [0, 0.1, 0.2]),
    box(0.34, 0.025, 0.12, 'team', [0, 0.17, 0.2]),
    canopy,
    // Front fork.
    box(0.025, 0.12, 0.03, 'teamDark', [-0.05, 0.06, -0.31]),
    box(0.025, 0.12, 0.03, 'teamDark', [0.05, 0.06, -0.31]),
    wheel(0.1, 0.06, [0, 0.1, -0.32], phase),
    wheel(0.14, 0.09, [-0.27, 0.14, 0.2], phase),
    wheel(0.14, 0.09, [0.27, 0.14, 0.2], phase),
    // Tail fins.
    box(0.02, 0.09, 0.08, 'teamDark', [-0.08, 0.25, 0.3]),
    box(0.02, 0.09, 0.08, 'teamDark', [0.08, 0.25, 0.3]),
    turret,
  );
  if (frame === 'wreck') {
    turret.rotation.y = 0.9;
    turret.position.x += 0.05;
    g.rotation.z = 0.08;
    paintAll(g, 'burnt', ['track', 'trackLight']);
  }
  return facing(g, view);
};

/**
 * Middle tank: a tracked hull under a spiral turret, hexagonal rings that twist and narrow as they rise with a ridge
 * winding round them, and a coil gun wrapped in rings.
 */
const middleTank: Builder = (view, frame) =>
  facing(
    tank(
      {
        hullW: 0.46,
        hullL: 0.76,
        hullH: 0.12,
        trackW: 0.13,
        trackH: 0.13,
        turretZ: 0.06,
        deck: () => [0.26, 0.31].map((z) => box(0.36, 0.025, 0.03, 'teamDark', [0, 0, z])),
        turret: (fire) => {
          const t = group();
          // A shell coiled like a snail's: a thick ridge winds up a dark cone in steep turns, light on the side
          // facing up, and the whole coil leans back off the turret's centre.
          const coilShell = group();
          const H = 0.38;
          coilShell.add(cyl(0.03, 0.17, H, 'teamDark', [0, 0, 0], 6));
          const steps = 36;
          for (let i = 0; i < steps; i++) {
            const k = i / steps;
            const a = k * Math.PI * 2 * 2.5;
            const rr = 0.19 - k * 0.15;
            const seg = box(0.12 - k * 0.07, 0.06 - k * 0.02, 0.07, 'teamLight', [Math.cos(a) * rr, k * (H - 0.06), Math.sin(a) * rr]);
            seg.rotation.set(0, -a, 0.45);
            coilShell.add(seg);
          }
          coilShell.add(cyl(0.0, 0.035, 0.1, 'glass', [0, H, 0], 6));
          coilShell.rotation.x = 0.35;
          coilShell.position.set(0.04, 0, 0.06);
          t.add(cyl(0.2, 0.2, 0.04, 'team', [0, 0, 0], 8), coilShell);
          const gun = guns(1, 0.026, 0.36, 0.1, -0.14, 0, fire);
          const recoil = fire ? 0.05 : 0;
          for (const z of [-0.2, -0.27, -0.34]) {
            const coil = new THREE.TorusGeometry(0.042, 0.014, 4, 8);
            gun.add(mesh(coil, 'teamDark', [0, 0.1, z + recoil]));
          }
          t.add(gun);
          return t;
        },
      },
      frame,
    ),
    view,
  );

/**
 * Heavy tank: brutalist. Slab skirts hide the tracks, the turret is one sloped monolith with a glowing slit and a
 * flat roof slab, and both guns run out of a square sleeve.
 */
const heavyTank: Builder = (view, frame) =>
  facing(
    tank(
      {
        hullW: 0.5,
        hullL: 0.9,
        hullH: 0.16,
        trackW: 0.15,
        trackH: 0.15,
        turretZ: 0.1,
        deck: () => [
          // Radiator fins at the back and slab skirts over the tracks.
          ...[0.28, 0.33, 0.38].map((z) => box(0.34, 0.05, 0.02, 'teamDark', [0, 0, z])),
          // Wedge prow: two slabs meeting in a point ahead of the hull.
          ...[-1, 1].map((sx) => {
            const slab = box(0.36, 0.16, 0.05, 'teamLight', [sx * 0.12, -0.2, -0.5]);
            slab.rotation.y = sx * 0.55;
            return slab;
          }),
          box(0.36, 0.02, 0.025, 'lamp', [0, -0.06, -0.455]),
          box(0.05, 0.13, 0.86, 'teamDark', [-0.33, -0.17, 0]),
          box(0.05, 0.13, 0.86, 'teamDark', [0.33, -0.17, 0]),
          box(0.07, 0.025, 0.86, 'team', [-0.33, -0.04, 0]),
          box(0.07, 0.025, 0.86, 'team', [0.33, -0.04, 0]),
        ],
        turret: (fire) =>
          group(
            prism(
              [
                [-0.24, 0],
                [-0.17, 0.17],
                [0.2, 0.17],
                [0.23, 0],
              ],
              0.38,
              'team',
            ),
            // Overhanging roof slab and a smaller stepped block on it, cheek slabs on both sides.
            box(0.44, 0.035, 0.42, 'team', [0, 0.17, 0.02]),
            box(0.26, 0.07, 0.24, 'teamDark', [0.0, 0.205, 0.07]),
            box(0.28, 0.02, 0.26, 'team', [0.0, 0.275, 0.07]),
            box(0.05, 0.13, 0.3, 'teamDark', [-0.22, 0.02, 0.03]),
            box(0.05, 0.13, 0.3, 'teamDark', [0.22, 0.02, 0.03]),
            box(0.34, 0.035, 0.02, 'glass', [0, 0.1, -0.215]),
            box(0.22, 0.025, 0.022, 'lamp', [0, 0.105, -0.216]),
            box(0.18, 0.09, 0.18, 'teamDark', [0, 0.035, -0.29]),
            guns(2, 0.03, 0.44, 0.08, -0.36, 0.05, fire),
          ),
      },
      frame,
    ),
    view,
  );

/** Crescent lying flat, horns pointing north: the alien craft's wing. Bottom at y, `t` thick. */
function crescent(span: number, depth: number, inner: number, t: number, mat: MaterialName, y: number): THREE.Mesh {
  const shape = new THREE.Shape();
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (i / n);
    const p = new THREE.Vector2(-Math.cos(a) * span, Math.sin(a) * depth - depth * 0.35);
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  }
  for (let i = n; i >= 0; i--) {
    const a = Math.PI * (i / n);
    shape.lineTo(-Math.cos(a) * span * 0.62, Math.sin(a) * inner - depth * 0.35);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  return mesh(geo, mat, [0, y + t, 0]);
}

/**
 * The enemy: an alien ground craft rather than a tank. A crescent wing skimming the ground on a glowing ring, a
 * faceted hump with green eyes and a crest of spines, and two prongs in front holding an energy orb (its gun).
 */
const hoverTank: Builder = (view, frame) => {
  const y = frame === 'move1' ? 0.025 : 0;
  const fire = frame === 'fire';
  const plate = (r: number, sx: number, sy: number, sz: number, mat: MaterialName, pos: Vec3, rot: Vec3 = [0, 0, 0]) => {
    const geo = new THREE.IcosahedronGeometry(r, 0);
    geo.scale(sx, sy, sz);
    return mesh(geo, mat, pos, rot);
  };
  const ring = new THREE.TorusGeometry(0.2, 0.03, 4, 12);
  ring.rotateX(Math.PI / 2);
  const prong = (x: number) => {
    const geo = new THREE.ConeGeometry(0.06, 0.42, 4);
    geo.rotateX(-Math.PI / 2);
    return mesh(geo, 'teamLight', [x, 0.15 + y, -0.36], [0.1, x > 0 ? 0.42 : -0.42, 0]);
  };
  const g = group(
    mesh(ring, frame === 'move1' ? 'glass' : 'lamp', [0, 0.05 + y, 0.06]),
    crescent(0.46, 0.42, 0.2, 0.05, 'teamDark', 0.08 + y),
    crescent(0.4, 0.36, 0.2, 0.025, 'team', 0.13 + y),
    plate(0.2, 1, 0.75, 1.4, 'team', [0, 0.19 + y, 0.05]),
    plate(0.11, 1.2, 0.6, 1, 'teamLight', [0, 0.25 + y, -0.13]),
    ...[-0.02, 0.1, 0.21].map((z, i) => {
      const spine = cyl(0, 0.035 - i * 0.007, 0.16 - i * 0.03, 'teamDark', [0, 0.3 + y - i * 0.03, z], 4);
      spine.rotation.x = 0.6;
      return spine;
    }),
    ball(0.06, 'signal', [0, 0.28 + y, -0.22], 6),
    ball(0.025, 'signal', [-0.09, 0.26 + y, -0.17], 4),
    ball(0.025, 'signal', [0.09, 0.26 + y, -0.17], 4),
    prong(-0.13),
    prong(0.13),
    mesh(new THREE.ConeGeometry(0.035, 0.26, 4).rotateX(Math.PI / 2), 'teamDark', [0, 0.2 + y, 0.4], [0.25, 0, 0]),
    ball(fire ? 0.08 : 0.05, 'lamp', [0, 0.15 + y, -0.42], 6),
  );
  if (fire) g.add(muzzleFlash([0, 0.15 + y, -0.6], 0.09));
  if (frame === 'wreck') {
    g.position.y = -0.06;
    g.rotation.z = 0.2;
    paintAll(g, 'burnt');
  }
  return facing(g, view);
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

/** Harvester: a tall olive box truck on pale tracks, cyan glass across the front of the roof, a seam between the hopper doors. */
const harvester: Builder = (view, frame) => {
  const phase = frame === 'move1' ? 1 : 0;
  const L = 0.8;
  const W = 0.5;
  const y0 = 0.07;
  const g = group(
    track(L * 0.96, 0.12, 0.12, -W / 2 + 0.01, phase, 0, ['steelLight', 'teamLight']),
    track(L * 0.96, 0.12, 0.12, W / 2 - 0.01, phase, 0, ['steelLight', 'teamLight']),
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
    // Scoop: a sloped intake lip across the front with teeth that dig into the crystals.
    prism(
      [
        [-L / 2 - 0.14, 0],
        [-L / 2 - 0.02, 0.19],
        [-L / 2 + 0.02, 0.19],
        [-L / 2 + 0.02, 0.0],
      ],
      W + 0.04,
      'steelLight',
    ),
    ...[-0.18, -0.06, 0.06, 0.18].map((x) => box(0.045, 0.04, 0.08, 'steelDark', [x, 0, -L / 2 - 0.16])),
    cyl(0.025, 0.025, 0.05, 'lamp', [W / 2 - 0.08, y0 + 0.32, 0.33], 4),
  );
  if (frame === 'wreck') paintAll(g, 'burnt');
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

/** Round tower with panoramic window bands: a grey drum, `bands` glass rings, a team ring and a flat roof. */
function tower(x: number, z: number, r: number, h: number, bands: number[], seg = 8): THREE.Group {
  return group(
    cyl(r, r * 1.08, h, 'steel', [x, 0, z], seg),
    ...bands.map((y) => cyl(r + 0.008, r + 0.008, 0.1, 'glass', [x, y, z], seg)),
    cyl(r * 1.12, r * 1.12, 0.035, 'team', [x, 0.04, z], seg),
    cyl(r * 1.1, r * 1.05, 0.05, 'team', [x, h, z], seg),
  );
}

/** Block with a panoramic glass strip on its south and east faces and a team-coloured roof edge. */
function block(x: number, z: number, w: number, d: number, h: number, stripY: number): THREE.Group {
  return group(
    box(w, h, d, 'steel', [x, 0, z]),
    box(w + 0.01, 0.1, 0.01, 'glass', [x, stripY, z + d / 2]),
    box(0.01, 0.1, d + 0.01, 'glass', [x + w / 2, stripY, z]),
    box(w + 0.02, 0.03, d + 0.02, 'team', [x, h, z]),
    box(w * 0.7, 0.02, d * 0.7, 'steelLight', [x, h + 0.03, z]),
  );
}

/**
 * Player HQ: a small city on a round platform. A tall central tower ringed with panoramic windows and an
 * observation deck, a domed hall with a glass skirt, two slim towers, low blocks with window strips and a skybridge.
 * The radar on top turns through the four idle frames, the signal light blinks.
 */
const hq: Builder = (_view, frame) => {
  const turn = Number(frame.slice(-1)) || 0;
  const radar = group(box(0.3, 0.025, 0.05, 'steel', [0, 0, 0]), box(0.05, 0.06, 0.05, 'steelDark', [0.13, 0.02, 0]));
  radar.rotation.y = (turn * Math.PI) / 4;
  radar.position.set(0, 1.69, -0.05);
  const hallDome = dome(0.32, 'steelLight', [-0.42, 0.24, 0.32], 0.75, 10);
  return group(
    lathe(
      [
        [0.95, 0],
        [0.95, 0.06],
        [0.9, 0.09],
        [0.0, 0.09],
      ],
      'steelDark',
      [0, 0, 0],
      8,
      Math.PI / 8,
    ),
    cyl(0.955, 0.955, 0.025, 'team', [0, 0.03, 0], 8),
    // Central tower with an observation deck.
    tower(0, -0.05, 0.2, 1.3, [0.3, 0.55, 0.8, 1.05]),
    cyl(0.32, 0.26, 0.12, 'steel', [0, 1.3, -0.05], 10),
    cyl(0.325, 0.325, 0.08, 'glass', [0, 1.33, -0.05], 10),
    cyl(0.28, 0.32, 0.03, 'team', [0, 1.42, -0.05], 10),
    cyl(0, 0.03, 0.26, 'steelLight', [0, 1.43, -0.05], 4),
    radar,
    ball(0.035, turn % 2 ? 'glassDark' : 'signal', [0, 1.71, -0.05], 4),
    // Domed hall with a glass skirt.
    cyl(0.33, 0.35, 0.24, 'steel', [-0.42, 0.09, 0.32], 10),
    cyl(0.335, 0.335, 0.12, 'glass', [-0.42, 0.14, 0.32], 10),
    hallDome,
    // Slim towers and blocks.
    tower(0.52, -0.5, 0.11, 1.0, [0.4, 0.62, 0.84], 6),
    cyl(0, 0.04, 0.22, 'steelLight', [0.52, 1.05, -0.5], 4),
    tower(-0.55, -0.45, 0.13, 0.75, [0.32, 0.56], 6),
    block(0.45, 0.32, 0.42, 0.34, 0.3, 0.17),
    block(0.48, -0.08, 0.28, 0.24, 0.42, 0.27),
    // Skybridge from the central tower to the east tower.
    box(0.46, 0.06, 0.07, 'steel', [0.28, 0.66, -0.28]),
    box(0.46, 0.035, 0.075, 'glass', [0.28, 0.675, -0.28]),
  );
};

/**
 * Enemy HQ: an alien citadel. The pointed shell of the original grows into a tall central spire with three
 * smaller spires round it, curved buttresses at its feet, a glowing core showing through slits between the ribs,
 * shards floating round the top and a green orb on a spike. The shards turn and the orb pulses over four frames.
 */
const enemyHq: Builder = (_view, frame) => {
  const k = Number(frame.slice(-1)) || 0;
  const shell = (s: number): [number, number][] =>
    (
      [
        [0.62, 0],
        [0.6, 0.15],
        [0.52, 0.5],
        [0.4, 0.9],
        [0.25, 1.25],
        [0.11, 1.55],
        [0.0, 1.8],
      ] as [number, number][]
    ).map(([r, y]) => [r * s, y * s]);
  const spire = (x: number, z: number, s: number, ribMat: MaterialName) => {
    const g = group(lathe(shell(s).map(([r, y]) => [r * 0.94, y * 0.985]), 'glassDark', [x, 0.08, z], 8));
    for (let i = 0; i < 4; i++) g.add(lathe(shell(s), ribMat, [x, 0.08, z], 2, (i * Math.PI) / 2 - 0.2, 0.4));
    // Core light between the ribs.
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const slit = box(0.04 * s, 0.6 * s, 0.04 * s, 'lamp', [x + Math.sin(a) * 0.5 * s, 0.12 + 0.2 * s, z + Math.cos(a) * 0.5 * s]);
      slit.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      g.add(slit);
    }
    return g;
  };
  const g = group(
    cyl(0.95, 0.98, 0.08, 'teamDark', [0, 0, 0], 8),
    spire(0, 0, 1, 'steelLight'),
    spire(-0.62, -0.32, 0.45, 'steel'),
    spire(0.62, -0.32, 0.45, 'steel'),
    spire(0, 0.66, 0.38, 'steel'),
  );
  // Buttresses curving out to the corners.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const b = cyl(0.02, 0.08, 0.75, 'teamDark', [Math.sin(a) * 0.62, 0.05, Math.cos(a) * 0.62], 4);
    b.rotation.set(-Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
    g.add(b);
  }
  // Floating shards round the top.
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + (k * Math.PI) / 6;
    const shard = new THREE.OctahedronGeometry(0.07, 0);
    shard.scale(0.6, 1.8, 0.6);
    g.add(mesh(shard, i === 0 ? 'lamp' : 'glass', [Math.sin(a) * 0.42, 1.55 + 0.05 * Math.sin(a * 2), Math.cos(a) * 0.42]));
  }
  g.add(box(0.3, 0.32, 0.12, 'steelDark', [0, 0.08, 0.62]));
  g.add(box(0.2, 0.2, 0.13, 'lamp', [0, 0.08, 0.62]));
  g.add(cyl(0.0, 0.05, 0.42, 'glass', [0.68, 0.08, 0.5], 4));
  g.add(ball(k % 2 ? 0.08 : 0.1, k % 2 ? 'glass' : 'signal', [0.68, 0.56, 0.5], 6));
  return g;
};

/**
 * One mushroom building: a flared stem with a window slit, under a domed cap whose rim is a band of panoramic
 * windows; the team colours a ring at the foot.
 */
function mushroom(x: number, z: number, h: number, r: number): THREE.Group {
  return group(
    lathe(
      [
        [r * 0.62, 0],
        [r * 0.45, 0.08],
        [r * 0.38, h * 0.5],
        [r * 0.36, h],
        [0.0, h],
      ],
      'steel',
      [x, 0, z],
      8,
      Math.PI / 8,
    ),
    cyl(r * 0.47, r * 0.6, 0.05, 'team', [x, 0.03, z], 8),
    box(r * 0.16, h * 0.55, 0.02, 'glass', [x, h * 0.25, z + r * 0.38]),
    // Cap: dark underside, glass rim, domed roof.
    cyl(r, r * 0.55, 0.08, 'steelDark', [x, h, z], 12),
    cyl(r * 1.01, r * 1.01, 0.13, 'glass', [x, h + 0.08, z], 12),
    cyl(r * 1.04, r * 1.04, 0.025, 'team', [x, h + 0.21, z], 12),
    lathe(
      [
        [r * 1.03, 0],
        [r * 0.95, 0.06],
        [r * 0.72, 0.15],
        [r * 0.38, 0.21],
        [0, 0.23],
      ],
      'steelLight',
      [x, h + 0.235, z],
      12,
    ),
    cyl(0, r * 0.12, r * 0.4, 'steel', [x, h + 0.45, z], 4),
  );
}

/** Silo: three mushroom buildings of different heights joined by a tube, as a small grove. */
const silo: Builder = () =>
  group(
    mushroom(-0.35, -0.3, 0.9, 0.42),
    mushroom(0.38, 0.05, 0.62, 0.36),
    mushroom(-0.3, 0.52, 0.36, 0.28),
    barrel(0.045, 0.62, 'steel', [0.38, 0.45, 0.05], 6).rotateY(Math.PI / 2 + 0.5) as THREE.Mesh,
    box(0.24, 0.05, 0.2, 'steelDark', [0.55, 0, 0.62]),
  );

/**
 * Tank factory: one big low mushroom. A wide drum hall under an overhanging cap ringed with panoramic glass, a
 * hangar mouth to the south, and a gantry crane on a mast at the east side. The crane swings between the frames:
 * idle it is parked over the roof, working it reaches out over the pad where a half-built hull sits and the
 * hangar glows.
 */
const factory: Builder = (_view, frame) => {
  const work = frame === 'work';
  const len = 0.7;
  const arm = group(
    box(0.07, 0.06, len, 'teamLight', [0, 0, -len / 2]),
    box(0.1, 0.1, 0.14, 'steelDark', [0, -0.02, 0.05]),
    box(0.014, 0.3, 0.014, 'steelDark', [0, -0.3, -len + 0.04]),
    box(0.09, 0.05, 0.09, work ? 'gold' : 'steelDark', [0, -0.35, -len + 0.04]),
  );
  arm.position.set(0.66, 1.0, -0.3);
  arm.rotation.y = work ? Math.PI * 0.95 : Math.PI * 0.35;
  return group(
    // Stem: a wide, slightly flared drum.
    lathe(
      [
        [0.66, 0],
        [0.6, 0.06],
        [0.52, 0.34],
        [0.0, 0.34],
      ],
      'steel',
      [-0.18, 0, -0.12],
      12,
    ),
    cyl(0.63, 0.67, 0.04, 'team', [-0.18, 0.02, -0.12], 12),
    // Cap: dark underside, a deep band of glass, a team rim and a low dome with a glass lantern.
    cyl(0.8, 0.52, 0.08, 'steelDark', [-0.18, 0.34, -0.12], 14),
    cyl(0.81, 0.81, 0.14, 'glass', [-0.18, 0.42, -0.12], 14),
    cyl(0.83, 0.83, 0.03, 'team', [-0.18, 0.56, -0.12], 14),
    lathe(
      [
        [0.83, 0],
        [0.74, 0.07],
        [0.5, 0.17],
        [0.22, 0.22],
        [0, 0.23],
      ],
      'steelLight',
      [-0.18, 0.59, -0.12],
      14,
    ),
    cyl(0.14, 0.16, 0.08, 'glass', [-0.18, 0.8, -0.12], 6),
    cyl(0.0, 0.15, 0.06, 'team', [-0.18, 0.88, -0.12], 6),
    // Hangar mouth: a deep frame in the south face.
    box(0.5, 0.36, 0.2, 'steelDark', [-0.18, 0, 0.5]),
    box(0.4, 0.28, 0.21, work ? 'lamp' : 'teamDark', [-0.18, 0, 0.5]),
    box(0.56, 0.05, 0.22, 'team', [-0.18, 0.36, 0.5]),
    // Mast, crane and pad.
    box(0.12, 1.0, 0.12, 'steelDark', [0.66, 0, -0.3]),
    box(0.16, 0.04, 0.16, 'team', [0.66, 0.35, -0.3]),
    arm,
    box(0.42, 0.04, 0.42, 'steelDark', [0.6, 0, 0.32]),
    box(0.32, 0.02, 0.32, 'steel', [0.6, 0.04, 0.32]),
    ...(work ? [box(0.24, 0.09, 0.3, 'teamDark', [0.6, 0.06, 0.32]), box(0.14, 0.06, 0.14, 'team', [0.6, 0.15, 0.34])] : []),
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

/**
 * Resource field: a field of yellow crystals growing straight out of the sand. Clusters of long faceted shards on
 * a jittered grid over the footprint, a tall one in each cluster and shorter ones leaning out, tallest mid-field.
 */
const resource: Builder = () => {
  const g = group();
  const rnd = seeded(42);
  const n = 5;
  for (let gx = 0; gx < n; gx++) {
    for (let gz = 0; gz < n; gz++) {
      const cx = -0.68 + (gx * 1.36) / (n - 1) + (rnd() - 0.5) * 0.24;
      const cz = -0.68 + (gz * 1.36) / (n - 1) + (rnd() - 0.5) * 0.24;
      if (Math.hypot(cx, cz) > 0.95 || rnd() < 0.15) continue;
      const big = 1.15 - Math.hypot(cx, cz) * 0.55;
      const count = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < count; i++) {
        // Long thin shards with a short point: a few tall ones per cluster, the rest stubby.
        const h = (i === 0 ? 0.45 + rnd() * 0.3 : 0.15 + rnd() * 0.3) * big;
        const r = 0.035 + rnd() * 0.035;
        const sides = rnd() < 0.5 ? 4 : 6;
        const tip = new THREE.CylinderGeometry(0, r, h * 0.25, sides);
        tip.translate(0, h * 0.875, 0);
        const body = new THREE.CylinderGeometry(r, r * 0.8, h * 0.75, sides);
        body.translate(0, h * 0.375, 0);
        const dir = (i / count) * Math.PI * 2 + rnd();
        const lean = i === 0 ? 0.08 : 0.35 + rnd() * 0.35;
        const off = i ? 0.04 + rnd() * 0.03 : 0;
        const pos: Vec3 = [cx + Math.cos(dir) * off, -0.02, cz + Math.sin(dir) * off];
        const rot: Vec3 = [Math.sin(dir) * lean, rnd() * 3, -Math.cos(dir) * lean];
        g.add(mesh(body, 'crystal', pos, rot), mesh(tip, 'gold', pos, rot));
      }
    }
  }
  return g;
};

/** Wall piece: a low dark grey bar with a lighter top, arms reaching towards neighbouring walls (bits N1 E2 S4 W8). */
const wall: Builder = (mask) => {
  const h = 0.22;
  const t = 0.3;
  const g = group(box(t, h, t, 'steelDark', [0, 0, 0]), box(t + 0.02, 0.04, t + 0.02, 'steel', [0, h, 0]));
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
    g.add(box(w, h, d, 'steelDark', [dx * 0.25, 0, dz * 0.25]));
    g.add(box(dx ? 0.5 : t + 0.02, 0.04, dz ? 0.5 : t + 0.02, 'steel', [dx * 0.25, h, dz * 0.25]));
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
