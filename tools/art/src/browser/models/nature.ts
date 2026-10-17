import * as THREE from 'three';
import type { MaterialName } from '../../materials';
import { cyl, group, mesh, seeded, type Vec3 } from '../kit';
import type { Builder } from './parts';

/** Things that belong to nobody: the crystal field everyone harvests and the fir trees of the forest. */

/**
 * Resource field: crystals that grew up from deep under the ground and only just break the surface. Clusters of
 * short, thick faceted tips poke out of what they pushed through: low sand mounds (frame idle), heaps of dark soil
 * with tufts of moss (forest), or the hovers' floor plates cracked and lifted on edge round them (plates). A few broken
 * chips lie between them; nothing stands taller than a harvester's tracks, so a harvester parked on the field reads
 * as standing on top of it.
 */
const resource: Builder = (_view, frame) => {
  const g = group();
  const rnd = seeded(42);
  const spots: [number, number][] = [
    [0, 0],
    [-0.5, -0.4],
    [0.5, -0.44],
    [-0.54, 0.42],
    [0.5, 0.44],
    [0.02, -0.7],
    [0.0, 0.66],
    [-0.72, 0.0],
    [0.72, 0.02],
  ];
  for (const [cx0, cz0] of spots) {
    const cx = cx0 + (rnd() - 0.5) * 0.12;
    const cz = cz0 + (rnd() - 0.5) * 0.12;
    const big = 1.1 - Math.hypot(cx, cz) * 0.3;
    if (frame === 'plates') {
      // Floor plates broken into shards and pushed up on edge round the cluster.
      const shards = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < shards; i++) {
        const a = (i / shards) * Math.PI * 2 + rnd() * 0.8;
        const d = 0.13 * big;
        const shard = mesh(new THREE.BoxGeometry(0.16 * big, 0.025, 0.11 * big), i % 2 ? 'plate' : 'plateDark', [cx + Math.cos(a) * d, 0.02, cz + Math.sin(a) * d]);
        shard.rotation.set(0, -a, 0);
        shard.rotateZ(-0.35 - rnd() * 0.3);
        g.add(shard);
      }
    } else {
      // Sand or soil heaped round the tips where they pushed up through it.
      const mound = new THREE.SphereGeometry(0.2 * big, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
      mound.scale(1, 0.32, 0.85);
      g.add(mesh(mound, frame === 'forest' ? 'soil' : 'sand', [cx, -0.01, cz], [0, rnd() * 3, 0]));
      if (frame === 'forest') g.add(cyl(0, 0.05, 0.05, 'pineDark', [cx + 0.15 * big, 0, cz + 0.05], 5));
    }
    const count = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      // Only the top of a long crystal shows: a short body and its point, leaning away from the cluster centre.
      const h = (i === 0 ? 0.2 + rnd() * 0.08 : 0.08 + rnd() * 0.1) * big;
      const r = (i === 0 ? 0.075 : 0.045 + rnd() * 0.025) * big;
      const tip = new THREE.CylinderGeometry(0, r, h * 0.55, 6);
      tip.translate(0, h * 0.72, 0);
      const body = new THREE.CylinderGeometry(r, r * 1.1, h * 0.45, 6);
      body.translate(0, h * 0.22, 0);
      const dir = (i / count) * Math.PI * 2 + rnd();
      const lean = i === 0 ? 0.1 + rnd() * 0.15 : 0.5 + rnd() * 0.35;
      const off = i ? 0.06 + rnd() * 0.06 : 0;
      const pos: Vec3 = [cx + Math.cos(dir) * off, -0.02, cz + Math.sin(dir) * off];
      const rot: Vec3 = [Math.sin(dir) * lean, rnd() * 3, -Math.cos(dir) * lean];
      g.add(mesh(body, 'crystal', pos, rot), mesh(tip, 'gold', pos, rot));
    }
  }
  // Loose chips between the clusters.
  for (let i = 0; i < 10; i++) {
    const p: Vec3 = [(rnd() - 0.5) * 1.6, 0, (rnd() - 0.5) * 1.6];
    g.add(mesh(new THREE.OctahedronGeometry(0.03 + rnd() * 0.02, 0), i % 2 ? 'gold' : 'crystal', p, [rnd(), rnd(), rnd()]));
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

export const NATURE: Record<string, Builder> = { resource, fir };
