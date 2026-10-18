import * as THREE from 'three';
import { ball, barrel, box, cyl, dome, group, lathe, mesh, paintAll, slab, type Vec3 } from '../kit';
import { chips, facing, lightSlot, limb, plasmaFlash, slump, spike, wallPiece, type Builder } from './parts';

/**
 * The hover race: the original's enemy. Smooth oval shells in the main colour skimming the ground, grooves and
 * raised plates in the secondary colour, grey guns, light strips on the nose and plasma guns; nothing touches the
 * ground and they bob between move frames. Their buildings are monolithic vaults in the main colour standing on
 * their corners, with crystals in the secondary colour glowing inside, on the light plated ground they live on.
 */

/** Smooth half-oval hull floating over a dark belly; returns it with the height of its top. */
function hoverHull(rx: number, ry: number, rz: number, y: number): { g: THREE.Group; top: number } {
  const shell = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.scale(rx, ry, rz);
  const belly = new THREE.CylinderGeometry(rx * 0.95, rx * 0.8, 0.06, 12);
  belly.scale(1, 1, rz / rx);
  return { g: group(mesh(belly, 'team2Dark', [0, y - 0.02, 0]), mesh(shell, 'team', [0, y, 0])), top: y + ry };
}

/** Floating height of a hover unit for a frame: it bobs between the two move frames. */
const hoverY = (frame: string, base = 0.08) => (frame === 'move1' ? base + 0.02 : base);

/**
 * Gun pod of the hover tanks, their turret: a smooth pale saddle with grey plasma guns and a light strip, turning on
 * the spine. `xs` places the guns across it.
 */
function plasmaPod(r: number, xs: number[], gunR: number, gunLen: number, fire: boolean): THREE.Group {
  const shell = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.scale(r, r * 0.55, r * 1.15);
  const recoil = fire ? 0.03 : 0;
  const pod = group(mesh(shell, 'team2Light', [0, 0, 0.02]), box(r * 0.5, 0.02, r * 1.6, 'team2Dark', [0, r * 0.55, 0.02]), lightSlot(r * 0.9, 0.018, 0.02, [0, r * 0.28, -r * 1.05]));
  for (const x of xs) {
    pod.add(box(gunR * 3, gunR * 2.6, 0.08, 'team2Dark', [x, r * 0.22, -r * 0.9]));
    pod.add(barrel(gunR, gunLen, 'steel', [x, r * 0.25, -r * 0.95 + recoil]));
    pod.add(barrel(gunR * 1.35, 0.03, 'steelDark', [x, r * 0.25, -r * 0.95 - gunLen + 0.03 + recoil], 8));
    if (fire) pod.add(plasmaFlash([x, r * 0.25, -r * 0.95 - gunLen - 0.1], 0.08));
  }
  pod.userData.turret = true;
  return pod;
}

/** Hover light tank: a small teardrop with a one-gun pod on its spine, a light strip across the nose and two tail fins. */
const lightTank: Builder = (view, frame) => {
  const y = hoverY(frame);
  const fire = frame === 'fire';
  const { g, top } = hoverHull(0.24, 0.13, 0.36, y);
  const pod = plasmaPod(0.1, [0], 0.022, 0.24, fire);
  pod.position.set(0, top - 0.03, 0);
  g.add(
    slab(0.07, 0.05, 0.4, 'team2Light', [0, top - 0.04, 0.04], 0.6),
    box(0.04, 0.02, 0.4, 'team2Dark', [0, top + 0.005, 0.04]),
    pod,
    lightSlot(0.24, 0.02, 0.03, [0, y + 0.03, -0.34]),
    ...[-1, 1].map((sx) => {
      const fin = slab(0.03, 0.1, 0.12, 'team2Light', [sx * 0.12, top - 0.06, 0.28], 0.5);
      fin.rotation.z = sx * 0.35;
      return fin;
    }),
  );
  if (frame === 'wreck') slump(g);
  return facing(g, view);
};

/**
 * Hover middle tank (the original's enemy tank): a smooth oval shell split at the front into two lobes with an
 * intake in the channel between them, light strips under the lobes, a raised spine down the back and a gun pod on it.
 */
const middleTank: Builder = (view, frame) => {
  const y = frame === 'move1' ? 0.02 : 0;
  const fire = frame === 'fire';
  const shell = new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.scale(0.95, 0.3, 1.12);
  const belly = new THREE.CylinderGeometry(0.38, 0.32, 0.06, 12);
  belly.scale(1, 1, 1.12);
  const g = group(
    mesh(belly, 'team2Dark', [0, 0.08 + y, 0]),
    mesh(shell, 'team', [0, 0.1 + y, 0]),
    // Spine: two raised plates either side of a dark groove.
    slab(0.09, 0.08, 0.56, 'team2Light', [-0.08, 0.17 + y, 0.08], 0.6),
    slab(0.09, 0.08, 0.56, 'team2Light', [0.08, 0.17 + y, 0.08], 0.6),
    box(0.06, 0.03, 0.6, 'team2Dark', [0, 0.215 + y, 0.06]),
    // Front channel splitting the shell into two lobes, the gun inside it.
    box(0.13, 0.13, 0.26, 'team2Dark', [0, 0.09 + y, -0.33]),
    // Light strips on the nose of each lobe and vents on the flanks.
    lightSlot(0.14, 0.025, 0.04, [-0.17, 0.12 + y, -0.39]),
    lightSlot(0.14, 0.025, 0.04, [0.17, 0.12 + y, -0.39]),
    ...[-1, 1].flatMap((sx) => [box(0.05, 0.03, 0.12, 'team2Dark', [sx * 0.24, 0.16 + y, -0.02]), box(0.05, 0.03, 0.08, 'team2Dark', [sx * 0.22, 0.15 + y, 0.22])]),
  );
  const pod = plasmaPod(0.13, [0], 0.03, 0.3, fire);
  pod.position.set(0, 0.22 + y, 0);
  g.add(pod);
  if (frame === 'wreck') slump(g);
  return facing(g, view);
};

/**
 * Hover heavy tank: a broad shell split at the nose into three lobes with intakes in the two channels, a twin-gun
 * pod on its back and three light strips across the front.
 */
const heavyTank: Builder = (view, frame) => {
  const y = hoverY(frame);
  const fire = frame === 'fire';
  const { g, top } = hoverHull(0.42, 0.18, 0.47, y);
  const pod = plasmaPod(0.19, [-0.07, 0.07], 0.03, 0.32, fire);
  pod.position.set(0, top - 0.05, 0);
  g.add(
    pod,
    ...[-1, 1].flatMap((sx) => [
      box(0.1, 0.14, 0.28, 'team2Dark', [sx * 0.13, y - 0.02, -0.34]),
      box(0.05, 0.03, 0.16, 'team2Dark', [sx * 0.33, y + 0.1, 0.02]),
    ]),
    lightSlot(0.12, 0.025, 0.03, [0, y + 0.06, -0.47]),
    lightSlot(0.1, 0.025, 0.03, [-0.3, y + 0.05, -0.36]),
    lightSlot(0.1, 0.025, 0.03, [0.3, y + 0.05, -0.36]),
  );
  if (frame === 'wreck') slump(g);
  return facing(g, view);
};

/**
 * Hover harvester: a shell with a wide toothed intake for a mouth and a glass dome hopper on its back. Harvesting, it
 * sinks low over the field and a cone of cyan light from its intake lifts crystal chips into it.
 */
const harvester: Builder = (view, frame) => {
  const harvest = frame.startsWith('harvest');
  const k = harvest ? Number(frame.slice(-1)) : 0;
  const y = harvest ? 0.06 : hoverY(frame);
  const { g, top } = hoverHull(0.36, 0.17, 0.44, y);
  g.add(
    // Intake.
    box(0.36, 0.1, 0.14, 'team2Dark', [0, y - 0.02, -0.36]),
    box(0.4, 0.03, 0.16, 'team2Light', [0, y + 0.08, -0.36]),
    ...[-0.12, -0.04, 0.04, 0.12].map((x) => box(0.025, 0.05, 0.03, 'steel', [x, y - 0.01, -0.44])),
    // Hopper dome.
    dome(0.17, 'team2', [0, top - 0.06, 0.08], 0.75, 10),
    cyl(0.18, 0.18, 0.03, 'team2Light', [0, top - 0.07, 0.08], 10),
    lightSlot(0.08, 0.02, 0.03, [-0.22, y + 0.05, -0.34]),
    lightSlot(0.08, 0.02, 0.03, [0.22, y + 0.05, -0.34]),
    ...[-1, 1].map((sx) => box(0.04, 0.03, 0.14, 'team2Dark', [sx * 0.3, y + 0.09, 0.1])),
  );
  if (harvest) {
    // Tractor beam: a pale cone of light from the intake down to the ground, chips rising inside it.
    const beam = mesh(new THREE.CylinderGeometry(0.06, 0.15, y + 0.02, 8, 1, true), 'lamp', [0, (y + 0.02) / 2 - 0.02, -0.5]);
    beam.castShadow = false;
    g.add(beam, ...chips([0, 0.0, -0.52], [0, y + 0.05, -0.42], k / 2, 0.03));
  }
  if (frame === 'wreck') slump(g);
  return facing(g, view);
};

/**
 * Hover defender: three ribs rising round a crystal in the secondary colour and holding up a floating oval head with
 * a plasma gun, on a grey plinth; the head turns to face its target.
 */
const defender: Builder = (view, frame) => {
  const fire = frame === 'fire';
  const head = hoverHull(0.17, 0.11, 0.2, 0).g;
  head.add(
    box(0.08, 0.07, 0.1, 'team2Dark', [0, -0.01, -0.16]),
    barrel(0.024, 0.18, 'steel', [0, 0.03, -0.18 + (fire ? 0.03 : 0)]),
    lightSlot(0.12, 0.018, 0.02, [0, 0.03, -0.19]),
    box(0.03, 0.02, 0.22, 'team2Dark', [0, 0.1, 0.02]),
  );
  if (fire) head.add(plasmaFlash([0, 0.03, -0.4], 0.07));
  head.rotation.y = (-view * Math.PI) / 4;
  head.position.y = 0.66;
  head.userData.turret = true;
  const rib: [number, number][] = [
    [0.3, 0],
    [0.28, 0.2],
    [0.2, 0.42],
    [0.12, 0.58],
  ];
  const g = group(slab(0.56, 0.05, 0.56, 'steelLight', [0, 0, 0], 0.95), spike(0.16, 0.5, 'team2', [0, 0.05, 0]), head);
  for (let i = 0; i < 3; i++) g.add(lathe(rib, 'team', [0, 0.05, 0], 4, (i * Math.PI * 2) / 3 + 0.3, 0.6));
  return g;
};

/** Plasma in flight: a cyan ball of light in a ring, stretched into a comet for the cannon. */
const shot: Builder = (view, frame) => {
  const big = frame === 'cannon';
  const r = big ? 0.07 : 0.045;
  const core = new THREE.IcosahedronGeometry(r, 0);
  core.scale(1, 1, big ? 1.8 : 1.3);
  const g = group(mesh(core, 'lamp', [0, 0.32, 0]), mesh(new THREE.TorusGeometry(r * 1.3, r * 0.25, 4, 10), 'glass', [0, 0.32, r * 0.6]));
  if (big) g.add(ball(r * 0.5, 'lamp', [0, 0.32, r * 2.4], 4), ball(r * 0.3, 'glass', [0, 0.32, r * 3.4], 4));
  return facing(g, view);
};

/*
 * Buildings: monolithic vaults. A vault is a shell in the main colour rising from a square (or oblong) plan to a point, with an
 * arched opening cut through the middle of chosen sides, so it stands on its four corners like legs; a second,
 * grey shell inside gives it thickness and shows through the arches.
 */

interface VaultSpec {
  /** Half sizes of the plan at the ground, along x and z. */
  sx: number;
  sz: number;
  h: number;
  /** Arch half-width as a share of the side, and its height as a share of h. */
  archW: number;
  archH: number;
  /** Sides with an arch: north, east, south, west. */
  arches: [boolean, boolean, boolean, boolean];
  /** Share of the height where the shell stops, leaving an open crown (1 = closed point). */
  crown: number;
  /** Wall thickness. */
  t: number;
  /** Rounded top (a dome, or a barrel vault with `barrel`) instead of the pointed monolith. */
  round?: boolean;
  /** Keeps its full length along z all the way up: a barrel vault, open at its north and south ends. */
  barrel?: boolean;
}

/** Half size of the plan at height share v: steep near the ground, rounding in to a point at the top. */
const vaultProfile = (v: number) => Math.pow(Math.max(0, 1 - Math.pow(v, 1.8)), 0.7);
/** Profile of a rounded vault: walls stand nearly upright, then curve over into a full round top. */
const domeProfile = (v: number) => Math.sqrt(Math.max(0, 1 - Math.pow(v, 2.2)));

/** Point on a vault side (north, east, south, west) at u -1..1 across and v 0..1 up; `inset` pulls it in. */
function vaultPoint(s: VaultSpec, side: number, u: number, v: number, inset: number): THREE.Vector3 {
  const p = s.round ? domeProfile(v) : vaultProfile(v);
  const hx = Math.max(0.001, s.sx * p - inset);
  const hz = Math.max(0.001, (s.barrel ? s.sz : s.sz * p) - inset);
  // Sides bulge out a little between the corners, so the vault reads as one smooth monolith; round vaults bulge
  // more, into a dome, and a barrel vault keeps flat ends.
  const k = s.barrel ? 0 : s.round ? 0.32 : 0.1;
  const bulge = 1 + k * (1 - u * u) * Math.sin(Math.PI * Math.min(1, v * 1.2));
  const y = s.h * v * (inset ? 1 - inset / s.h : 1);
  switch (side) {
    case 0:
      return new THREE.Vector3(-u * hx, y, -hz * bulge);
    case 1:
      return new THREE.Vector3(hx * bulge, y, -u * hz);
    case 2:
      return new THREE.Vector3(u * hx, y, hz * bulge);
    default:
      return new THREE.Vector3(-hx * bulge, y, u * hz);
  }
}

/** Outer and inner shells of a vault as two meshes. */
function vault(s: VaultSpec, innerMat: 'steel' | 'steelDark' = 'steel'): THREE.Group {
  const U = 18;
  const V = 14;
  const outer: number[] = [];
  const inner: number[] = [];
  const open = (side: number, u: number, v: number) => s.arches[side]! && (u / s.archW) ** 2 + (v / s.archH) ** 2 < 1;
  // Adds quad a-b-c-d (in order round it) facing `dir`, or both ways when dir is null.
  const quad = (out: number[], q: THREE.Vector3[], dir: THREE.Vector3 | null) => {
    const n = q[1]!.clone().sub(q[0]!).cross(q[2]!.clone().sub(q[0]!));
    const tris = [
      [0, 1, 2],
      [0, 2, 3],
    ];
    const flip = dir ? n.dot(dir) < 0 : false;
    for (const t of tris) {
      const order = flip ? [t[0]!, t[2]!, t[1]!] : t;
      for (const i of order) out.push(q[i]!.x, q[i]!.y, q[i]!.z);
    }
    if (!dir) for (const t of tris) for (const i of [t[0]!, t[2]!, t[1]!]) out.push(q[i]!.x, q[i]!.y, q[i]!.z);
  };
  for (let side = 0; side < 4; side++) {
    for (let j = 0; j < V; j++) {
      const v0 = (j / V) * s.crown;
      const v1 = ((j + 1) / V) * s.crown;
      for (let i = 0; i < U; i++) {
        const u0 = -1 + (2 * i) / U;
        const u1 = -1 + (2 * (i + 1)) / U;
        const uc = (u0 + u1) / 2;
        const vc = (v0 + v1) / 2;
        if (open(side, uc, vc / 1)) continue;
        const o = [vaultPoint(s, side, u0, v0, 0), vaultPoint(s, side, u1, v0, 0), vaultPoint(s, side, u1, v1, 0), vaultPoint(s, side, u0, v1, 0)];
        const n = [vaultPoint(s, side, u0, v0, s.t), vaultPoint(s, side, u1, v0, s.t), vaultPoint(s, side, u1, v1, s.t), vaultPoint(s, side, u0, v1, s.t)];
        const centre = o[0]!.clone().add(o[2]!).multiplyScalar(0.5);
        const outward = new THREE.Vector3(centre.x, 0, centre.z);
        quad(outer, o, outward);
        quad(inner, n, outward.clone().negate());
        // Reveals where the shell meets an arch, the crown or the next quad's opening.
        const edges: [number, number, boolean][] = [
          [0, 1, j === 0 || open(side, uc, (v0 - s.crown / V / 2) / 1)],
          [1, 2, i === U - 1 ? false : open(side, u1 + 1 / U, vc)],
          [2, 3, j === V - 1 || open(side, uc, v1 + s.crown / V / 2)],
          [3, 0, i === 0 ? false : open(side, u0 - 1 / U, vc)],
        ];
        for (const [a, b, show] of edges) if (show) quad(outer, [o[a]!, o[b]!, n[b]!, n[a]!], null);
      }
    }
  }
  const geo = (arr: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  };
  return group(mesh(geo(outer), 'team'), mesh(geo(inner), innerMat));
}

/** Point on the outside of a vault side, nudged out by `out`, for details stuck on its surface. */
function onVault(s: VaultSpec, side: number, u: number, v: number, out = 0.01): Vec3 {
  const p = vaultPoint(s, side, u, v, -out);
  return [p.x, p.y, p.z];
}

/** Lamp slit set into a vault side, leaning with the wall. */
function slit(s: VaultSpec, side: number, u: number, v: number, len: number): THREE.Mesh {
  const a = vaultPoint(s, side, u, v, -0.012);
  const b = vaultPoint(s, side, u, v + len, -0.012);
  const m = limb([a.x, a.y, a.z], [b.x, b.y, b.z], 0.022, 'lamp');
  m.castShadow = false;
  return m;
}

/**
 * Hover HQ: one monolithic arch. A pale vault on four corner legs with a tall pointed arch through every side and an
 * open crown, a crystal pyramid in the secondary colour inside rising out of the crown, small crystals on pedestals beside the
 * legs and lamp slits running up the legs. Beside it a slim obelisk beacon with a crystal at its foot and an orb on
 * top. The crystal glows and the orb pulses over four frames.
 */
const hq: Builder = (_view, frame) => {
  const k = Number(frame.slice(-1)) || 0;
  const s: VaultSpec = { sx: 0.68, sz: 0.68, h: 1.5, archW: 0.6, archH: 0.8, arches: [true, true, true, true], crown: 0.93, t: 0.07 };
  // Turned to stand corner-on to the camera: a leg in front, an arch to each side of it.
  const core = group(vault(s), spike(0.44, 1.56, k % 2 ? 'team2Light' : 'team2', [0, 0, 0]));
  for (let side = 0; side < 4; side++) {
    for (const u of [-0.82, 0.82]) core.add(slit(s, side, u, 0.1, 0.24));
    for (const u of [-0.45, 0.45]) {
      const [x, , z] = onVault(s, side, u, 0, -0.1);
      core.add(slab(0.15, 0.05, 0.15, 'steelLight', [x, 0, z], 0.85), spike(0.07, 0.22, 'team2Dark', [x, 0.05, z]));
    }
  }
  core.rotation.y = Math.PI / 4;
  const g = group(core);
  // Beacon on the east side.
  const bx = 0.86;
  const bz = 0.5;
  g.add(
    slab(0.2, 0.04, 0.2, 'steelLight', [bx, 0, bz], 0.85),
    lathe(
      [
        [0.09, 0],
        [0.05, 0.12],
        [0.03, 0.62],
        [0, 0.66],
      ],
      'team',
      [bx, 0.04, bz],
      6,
    ),
    spike(0.05, 0.16, 'team2', [bx, 0.04, bz + 0.06]),
    ball(k % 2 ? 0.045 : 0.06, k % 2 ? 'team2' : 'lamp', [bx, 0.76, bz], 6),
  );
  return g;
};

/**
 * Rotunda: a round drum wall in the main colour with tall arched windows glowing with stored crystals, a band in the
 * secondary colour and a smooth dome on top crowned with a crystal.
 */
function rotunda(x: number, z: number, r: number, h: number, crown: boolean): THREE.Group {
  const steps = 8;
  const dome: [number, number][] = Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * (Math.PI / 2);
    return [r * 1.02 * Math.cos(a), h + r * 0.8 * Math.sin(a)];
  });
  const g = group(
    cyl(r * 1.12, r * 1.16, 0.06, 'team2Dark', [x, 0, z], 14),
    lathe([[r, 0.06], [r, h], ...dome], 'team', [x, 0, z], 16),
    cyl(r * 1.04, r * 1.04, 0.04, 'team2', [x, h - 0.02, z], 16),
  );
  // Arched windows round the drum, the ones the camera can see.
  for (const deg of [-60, -20, 20, 60, 100, 140]) {
    const t = (deg * Math.PI) / 180;
    const [dx, dz] = [Math.sin(t), Math.cos(t)];
    const ww = r * 0.32;
    const win = group(
      box(ww, (h - 0.12) * 0.62, 0.02, 'team2Dark', [0, 0.1, 0]),
      mesh(new THREE.CylinderGeometry(ww / 2, ww / 2, 0.02, 8, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), 'team2Dark', [0, 0.1 + (h - 0.12) * 0.62, 0]),
      box(ww * 0.5, 0.04, 0.025, 'gold', [0, 0.12, 0]),
    );
    win.position.set(x + dx * (r + 0.005), 0, z + dz * (r + 0.005));
    win.rotation.y = t;
    g.add(win);
  }
  if (crown) g.add(cyl(0.06, 0.08, 0.04, 'team2', [x, h + r * 0.8, z], 8), spike(0.06, 0.2, 'team2Light', [x, h + r * 0.8 + 0.04, z]));
  return g;
}

/**
 * Hover silo: two rotundas, a big one crowned with a crystal and a small one beside it, their arched windows glowing
 * with the crystals stored inside, and a round landing pad ringed with light where harvesters drop their load.
 */
const silo: Builder = () => {
  const g = group(rotunda(-0.34, -0.34, 0.4, 0.5, true), rotunda(0.5, -0.5, 0.24, 0.3, false));
  // Landing pad.
  g.add(
    cyl(0.44, 0.46, 0.05, 'steelLight', [0.3, 0, 0.36], 12),
    cyl(0.38, 0.38, 0.012, 'team2', [0.3, 0.05, 0.36], 12),
    cyl(0.32, 0.32, 0.016, 'steelLight', [0.3, 0.05, 0.36], 12),
    ...[0, 1, 2, 3, 4, 5].map((i) => {
      const t = (i / 6) * Math.PI * 2;
      return lightSlot(0.05, 0.02, 0.05, [0.3 + Math.cos(t) * 0.41, 0.05, 0.36 + Math.sin(t) * 0.41]);
    }),
  );
  return g;
};

/**
 * Hover factory: a long smooth capsule hangar like one of their hulls grown huge, open front and back through round
 * arches, a raised spine of pale plates down its back and light strips along its foot. Inside, a crystal in the
 * secondary colour hums; working, a fresh hover tank floats in the hangar in a ring of light. A small pointed tower
 * with an orb stands on the north-east.
 */
const factory: Builder = (_view, frame) => {
  const work = frame === 'work';
  const s: VaultSpec = { sx: 0.5, sz: 0.8, h: 0.66, archW: 0.62, archH: 0.72, arches: [true, false, true, false], crown: 1, t: 0.06, round: true };
  const hangar = vault(s, 'steelDark');
  // Spine: two raised plates either side of a groove, following the curve of the shell from front to back.
  for (let j = 0; j < 7; j++) {
    const z = -0.6 + j * 0.2;
    // Height of the shell's ridge over z: where the dome profile has narrowed to |z|.
    const y = s.h * Math.pow(Math.max(0, 1 - (z / s.sz) ** 2), 1 / 2.2) - 0.02;
    for (const sx of [-0.07, 0.07]) hangar.add(box(0.08, 0.05, 0.17, 'team2Light', [sx, y, z]));
  }
  hangar.position.set(-0.2, 0.04, 0.08);
  const g = group(
    cyl(0.62, 0.64, 0.04, 'steelLight', [-0.2, 0, 0.08], 12),
    hangar,
    cyl(0.32, 0.34, 0.03, 'steelDark', [-0.2, 0.04, 0.08], 10),
    spike(0.1, 0.36, work ? 'team2Light' : 'team2', [-0.2, 0.07, -0.4]),
    // Tower.
    lathe(
      [
        [0.16, 0],
        [0.1, 0.18],
        [0.06, 0.9],
        [0, 0.98],
      ],
      'team',
      [0.62, 0, -0.56],
      6,
    ),
    spike(0.08, 0.26, 'team2', [0.62, 0.05, -0.47]),
    ball(0.055, 'lamp', [0.62, 1.04, -0.56], 6),
    ...[-1, 1].map((sx) => lightSlot(0.012, 0.03, 0.8, [-0.2 + sx * (s.sx + 0.03), 0.1, 0.08])),
  );
  if (work) {
    const tank = middleTank(4, 'move0');
    paintAll(tank, 'steel', ['steelDark', 'lamp', 'team2Dark']);
    tank.position.set(-0.2, 0.12, 0.12);
    g.add(tank, mesh(new THREE.TorusGeometry(0.36, 0.02, 4, 16).rotateX(Math.PI / 2), 'lamp', [-0.2, 0.08, 0.12]));
  }
  return g;
};

/**
 * Hover building site: an octagonal plate in the main colour with light at its corners, four bare ribs of a vault
 * rising round it and a small crystal in the secondary colour floating in a ring over the middle, projecting the
 * building.
 */
const construction: Builder = () => {
  const g = group(
    lathe(
      [
        [1.0, 0],
        [0.98, 0.07],
        [0, 0.07],
      ],
      'team',
      [0, 0, 0],
      8,
      Math.PI / 8,
    ),
    cyl(0.6, 0.6, 0.012, 'team2', [0, 0.07, 0], 8),
    cyl(0.54, 0.54, 0.016, 'teamLight', [0, 0.07, 0], 8),
    mesh(new THREE.TorusGeometry(0.16, 0.02, 4, 12).rotateX(Math.PI / 2), 'lamp', [0, 0.62, 0]),
    spike(0.09, 0.26, 'team2', [0, 0.5, 0]),
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.add(lightSlot(0.05, 0.02, 0.05, [Math.cos(a) * 0.9, 0.07, Math.sin(a) * 0.9]));
  }
  // Ribs on the corners, curving in but stopping short of the top.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pts: Vec3[] = [0, 0.25, 0.5, 0.7].map((v) => {
      const r = 0.82 * vaultProfile(v);
      return [Math.cos(a) * r, 0.07 + v * 1.1, Math.sin(a) * r];
    });
    for (let j = 0; j < pts.length - 1; j++) g.add(limb(pts[j]!, pts[j + 1]!, 0.06 - j * 0.01, 'team', 6));
  }
  return g;
};

/**
 * Hover wall: smooth ridges in the main colour, half round in section, with a light strip along the top, meeting at
 * a pointed post crowned with a crystal in the secondary colour; runs join the neighbours (wallPiece).
 */
const wall: Builder = (mask) =>
  wallPiece(
    mask,
    () =>
      group(
        lathe(
          [
            [0.17, 0],
            [0.16, 0.12],
            [0.1, 0.32],
            [0, 0.38],
          ],
          'team',
          [0, 0, 0],
          4,
          Math.PI / 4,
        ),
        spike(0.07, 0.2, 'team2', [0, 0.3, 0]),
      ),
    (len) => {
      const ridge = new THREE.CylinderGeometry(0.13, 0.13, len, 8, 1, false, 0, Math.PI);
      ridge.rotateZ(Math.PI / 2);
      ridge.scale(1, 1.6, 1);
      const g = group(mesh(ridge, 'team', [len / 2, 0, 0]), box(len, 0.02, 0.03, 'lamp', [len / 2, 0.2, 0]), box(len, 0.012, 0.15, 'team2', [len / 2, 0.005, 0]));
      g.children[1]!.castShadow = false;
      return g;
    },
  );

export const HOVER: Record<string, Builder> = {
  hover_harvester: harvester,
  hover_light_tank: lightTank,
  hover_middle_tank: middleTank,
  hover_heavy_tank: heavyTank,
  hover_defender: defender,
  hover_shot: shot,
  hover_hq: hq,
  hover_silo: silo,
  hover_factory: factory,
  hover_construction: construction,
  hover_wall: wall,
};
