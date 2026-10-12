import * as THREE from 'three';
import type { MaterialName } from '../materials';

/**
 * Small modelling kit for low-poly units and buildings. One world unit is one 15 px cell of the original map,
 * y is up and models face north (-z). Every mesh carries its surface kind in userData.mat; the renderer swaps in
 * its own materials for each pass, so models never deal with colour or lighting.
 */

export type Vec3 = [number, number, number];

export function mesh(geo: THREE.BufferGeometry, mat: MaterialName, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0]): THREE.Mesh {
  const m = new THREE.Mesh(geo);
  m.userData.mat = mat;
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

/** Box with its bottom face at pos[1]. */
export function box(w: number, h: number, d: number, mat: MaterialName, pos: Vec3 = [0, 0, 0]): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, [pos[0], pos[1] + h / 2, pos[2]]);
}

/** Upright cylinder (or cone, with rTop 0) with its bottom at pos[1]; few segments keep it low-poly. */
export function cyl(rTop: number, rBottom: number, h: number, mat: MaterialName, pos: Vec3 = [0, 0, 0], segments = 8): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat, [pos[0], pos[1] + h / 2, pos[2]]);
  m.rotation.y = Math.PI / segments;
  return m;
}

/** Cylinder lying along the z axis (barrels point north), starting at pos and running `len` towards -z. */
export function barrel(r: number, len: number, mat: MaterialName, pos: Vec3, segments = 6): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, len, segments);
  geo.rotateX(Math.PI / 2);
  return mesh(geo, mat, [pos[0], pos[1], pos[2] - len / 2]);
}

/** Upper half sphere (dome) sitting on pos[1]. */
export function dome(r: number, mat: MaterialName, pos: Vec3 = [0, 0, 0], squash = 1, segments = 8): THREE.Mesh {
  const geo = new THREE.SphereGeometry(r, segments, Math.max(2, segments >> 1), 0, Math.PI * 2, 0, Math.PI / 2);
  geo.scale(1, squash, 1);
  return mesh(geo, mat, pos);
}

/**
 * Side profile extruded across the x axis: points are [z, y] going round the outline, z negative at the front.
 * This is how hulls get sloped glacis plates.
 */
export function prism(profile: [number, number][], width: number, mat: MaterialName, pos: Vec3 = [0, 0, 0]): THREE.Mesh {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  // rotateY(-90°) maps the shape's x onto world z and the extrusion onto -x; centre it across the width.
  geo.translate(width / 2, 0, 0);
  return mesh(geo, mat, pos);
}

/** Track run along z: alternating light and dark links; `phase` 0/1 shifts them to animate driving. */
export function track(len: number, w: number, h: number, x: number, phase: number, y = 0): THREE.Group {
  const g = new THREE.Group();
  const n = Math.max(4, Math.round(len / 0.07));
  const link = len / n;
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + link * (i + 0.5);
    // Rounded ends: the first and last links sit lower.
    const end = i === 0 || i === n - 1;
    g.add(box(w, end ? h * 0.75 : h, link, (i + phase) % 2 ? 'track' : 'trackLight', [x, y + (end ? h * 0.1 : 0), z]));
  }
  return g;
}

/** Deterministic pseudo-random numbers for scattering details, so renders are repeatable. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Recolours a whole model, e.g. to the burnt look of a wreck. */
export function paintAll(root: THREE.Object3D, mat: MaterialName, except: MaterialName[] = []): void {
  root.traverse((o) => {
    if (o.userData.mat && !except.includes(o.userData.mat)) o.userData.mat = mat;
  });
}

/** Solid of revolution around the y axis from a profile of [radius, y] points, bottom to top; a slice if phiLength < 2π. */
export function lathe(profile: [number, number][], mat: MaterialName, pos: Vec3 = [0, 0, 0], segments = 8, phiStart = 0, phiLength = Math.PI * 2): THREE.Mesh {
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
    phiStart,
    phiLength,
  );
  return mesh(geo, mat, pos);
}

/** Low-poly ball centred on pos. */
export function ball(r: number, mat: MaterialName, pos: Vec3 = [0, 0, 0], segments = 8): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, segments, Math.max(3, segments >> 1)), mat, pos);
}
