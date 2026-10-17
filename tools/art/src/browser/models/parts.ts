import * as THREE from 'three';
import type { MaterialName } from '../../materials';
import { ball, box, group, mesh, paintAll, type Vec3 } from '../kit';

/**
 * Parts shared by the races' models. A builder gets the view (direction 0..7, or the wall mask) and the frame name,
 * and returns the model already turned to face that direction. Sizes are in cells (1 = one 15 px cell of the
 * original); a unit must stay inside about 0.9 x 0.9 so neighbours do not overlap.
 */

export type Builder = (view: number, frame: string) => THREE.Object3D;

/** Directions go clockwise from north, matching DIRECTION_NAMES in the catalog. */
export function facing(model: THREE.Object3D, view: number): THREE.Object3D {
  const g = group(model);
  g.rotation.y = (-view * Math.PI) / 4;
  return g;
}

function noShadow<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => (c.castShadow = false));
  return o;
}

/**
 * Shot of the humans' gauss guns: a yellow-hot slug leaving the muzzle through two orange rings, stretched along the
 * barrel; warm colours keep it apart from the hovers' cyan and the walkers' green. Aimed north; `size` is about the radius of the burst.
 */
export function gaussFlash(pos: Vec3, size: number): THREE.Group {
  const core = new THREE.OctahedronGeometry(size * 0.55, 0);
  core.scale(0.7, 0.7, 2.4);
  const g = group(mesh(core, 'flash', [pos[0], pos[1], pos[2] - size * 0.6]));
  for (const [z, r] of [
    [size * 0.5, 0.75],
    [-size * 0.2, 0.55],
  ] as const) {
    g.add(mesh(new THREE.TorusGeometry(size * r, size * 0.13, 4, 10), 'ember', [pos[0], pos[1], pos[2] + z]));
  }
  return noShadow(g);
}

/** Shot of the hover race: a cyan plasma bolt flying out of a ring of light. */
export function plasmaFlash(pos: Vec3, size: number): THREE.Group {
  const bolt = new THREE.IcosahedronGeometry(size * 0.7, 0);
  bolt.scale(0.8, 0.8, 2.2);
  const ring = new THREE.TorusGeometry(size * 0.9, size * 0.22, 4, 10);
  return noShadow(group(mesh(bolt, 'lamp', [pos[0], pos[1], pos[2] - size * 0.8]), mesh(ring, 'glass', [pos[0], pos[1], pos[2] + size * 0.6])));
}

/**
 * Shot of the walkers: a cone of chitin in the side's main colour, a thorn pointing the way it flies (-z), trailing a
 * short streak of acid that is always green. At a muzzle (`muzzle`) it is drawn over the unit, so the body never
 * hides it.
 */
export function thornShot(pos: Vec3, size: number, muzzle = false): THREE.Group {
  const thorn = new THREE.ConeGeometry(size * 0.34, size * 2.2, 6);
  thorn.rotateX(-Math.PI / 2);
  const butt = new THREE.ConeGeometry(size * 0.34, size * 0.5, 6);
  butt.rotateX(Math.PI / 2);
  const trail = new THREE.ConeGeometry(size * 0.26, size * 1.5, 5);
  trail.rotateX(Math.PI / 2);
  const g = noShadow(
    group(
      mesh(thorn, 'team', [pos[0], pos[1], pos[2] - size * 0.6]),
      mesh(butt, 'teamDark', [pos[0], pos[1], pos[2] + size * 0.75]),
      mesh(trail, 'bileGlow', [pos[0], pos[1], pos[2] + size * 1.6]),
    ),
  );
  if (muzzle) g.userData.onTop = true;
  return g;
}

/** Slot of cyan light set into a surface. */
export function lightSlot(w: number, h: number, d: number, pos: Vec3): THREE.Mesh {
  const m = box(w, h, d, 'lamp', pos);
  m.castShadow = false;
  return m;
}

/** Thin limb from `a` to `b`: the walkers' legs and roots, the hover race's ribs. */
export function limb(a: Vec3, b: Vec3, r: number, mat: MaterialName, segments = 4): THREE.Mesh {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const geo = new THREE.CylinderGeometry(r * 0.7, r, from.distanceTo(to), segments);
  const m = mesh(geo, mat);
  m.position.copy(from.clone().add(to).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return m;
}

/** Faceted plate (a squashed icosahedron), the walkers' armour. */
export function plate(r: number, sx: number, sy: number, sz: number, mat: MaterialName, pos: Vec3, rot: Vec3 = [0, 0, 0]): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(r, 0);
  geo.scale(sx, sy, sz);
  return mesh(geo, mat, pos, rot);
}

/** Pointed crystal: a four-sided spike with its faces to the compass points. */
export function spike(r: number, h: number, mat: MaterialName, pos: Vec3): THREE.Mesh {
  return mesh(new THREE.ConeGeometry(r, h, 4).translate(0, h / 2, 0), mat, pos, [0, Math.PI / 4, 0]);
}

/** Crystal chips flung up while harvesting; `k` (0 or 1) moves them along between the two frames. */
export function chips(from: Vec3, to: Vec3, k: number, size = 0.035): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5 * k + 0.25) / 3;
    const p: Vec3 = [from[0] + (to[0] - from[0]) * t + (i - 1) * 0.04, from[1] + (to[1] - from[1]) * t + Math.sin(t * Math.PI) * 0.08, from[2] + (to[2] - from[2]) * t];
    out.push(mesh(new THREE.OctahedronGeometry(size * (1 - t * 0.3), 0), i % 2 ? 'gold' : 'crystal', p, [t * 3, i, 0]));
  }
  return out;
}

/** Wreck: everything burnt, the turret (if any) knocked askew. */
export function wreck(g: THREE.Group, turret?: THREE.Object3D): void {
  if (turret) {
    turret.rotation.y += 0.7;
    turret.rotation.z = 0.12;
    turret.position.x += 0.04;
  }
  paintAll(g, 'burnt', ['steelDark']);
}

/** Wreck of a floating or walking machine: sunk on the ground, tilted, burnt. */
export function slump(g: THREE.Group, y = -0.05, tilt = 0.18): void {
  g.position.y = y;
  g.rotation.z = tilt;
  paintAll(g, 'burnt');
}

/** Tube between two points on the ground plane at height y: walkways between buildings. */
export function tube(a: [number, number], b: [number, number], y: number, mats: [MaterialName, MaterialName] = ['steel', 'steelDark']): THREE.Group {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const g = group(box(0.1, 0.08, len, mats[0], [0, 0, 0]), box(0.11, 0.025, len * 0.8, mats[1], [0, 0.08, 0]));
  g.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
  g.rotation.y = Math.atan2(dx, dz);
  return g;
}

/** Wall arms reach towards the neighbours set in the mask (N1 E2 S4 W8): [bit, dx, dz]. */
export const WALL_ARMS: readonly [number, number, number][] = [
  [1, 0, -1],
  [2, 1, 0],
  [4, 0, 1],
  [8, -1, 0],
];
