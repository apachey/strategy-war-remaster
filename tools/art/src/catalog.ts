import { WALL_MASKS } from '@sw/data';

/**
 * Every sprite the pipeline produces. This file has no three.js import so the Node side can read it too; the models
 * themselves live in src/models and run inside the headless browser.
 */

/** Art pixels per original 15 px cell (the original drew a unit in one 15 px cell). */
export const PX_PER_CELL = 32;
/** Each sprite is rendered this many times larger, then reduced to the pixel grid. */
export const SUPERSAMPLE = 8;
/**
 * Camera tilt above the horizon. 90 would be straight down. The original draws its units and buildings from a low
 * angle, so walls and sides show nearly as much as roofs.
 */
export const CAMERA_ELEVATION_DEG = 40;
/** Orthographic camera placement; near..far is what the 16 bit depth pass spans. */
export const CAMERA_DISTANCE = 10;
export const CAMERA_NEAR = 6;
export const CAMERA_FAR = 14;

export interface SpriteDef {
  name: string;
  /** Footprint in cells: units, walls, the defender and shots take 1, other buildings 2x2. */
  cells: 1 | 2;
  /**
   * Number of views. 8 = compass directions, clockwise from north; fir trees use the view as the variant; walls
   * have one view per entry of `masks`.
   */
  views: number;
  /** Views are variants (numbered), not directions, even when there are eight of them. */
  variants?: boolean;
  /** Walls: the neighbour mask of each view (WALL_MASKS in @sw/data), which names the frame and goes to the model. */
  masks?: readonly number[];
  frames: readonly string[];
  /** Has team surfaces, which the game recolours to the colour of the side that owns it. */
  teamed: boolean;
  /** Model to build when it is not the one named `name`. */
  model?: string;
  /**
   * Part of a model with a turret (the mesh marked `userData.turret`): `hull` is the model without it (except in
   * `wreck`, where the turret lies knocked askew), `turret` the turret alone turning to the view, so the game can
   * aim it apart from the hull.
   */
  part?: 'hull' | 'turret';
}

const HULL_FRAMES = ['move0', 'move1', 'wreck'] as const;
const TURRET_FRAMES = ['idle', 'fire'] as const;
const HARVESTER_FRAMES = ['move0', 'move1', 'harvest0', 'harvest1', 'harvest2', 'harvest3', 'wreck'] as const;
/** Kinds whose gun turns apart from the body: the tanks' turrets, the walkers' heads and the defenders' heads. */
export const TURRETED = ['light_tank', 'middle_tank', 'heavy_tank', 'defender'] as const;

/** Each race has the same roster under its own name, `<race>_<kind>` (see spriteName in @sw/data). */
export const RACE_NAMES = ['human', 'hover', 'walker'] as const;

const roster = (race: (typeof RACE_NAMES)[number]): SpriteDef[] => [
  { name: `${race}_harvester`, cells: 1, views: 8, frames: HARVESTER_FRAMES, teamed: true },
  ...(['light_tank', 'middle_tank', 'heavy_tank'] as const).map((k): SpriteDef => ({ name: `${race}_${k}`, cells: 1, views: 8, frames: HULL_FRAMES, teamed: true, part: 'hull' })),
  { name: `${race}_defender`, cells: 1, views: 1, frames: ['idle'], teamed: true, part: 'hull' },
  ...TURRETED.map((k): SpriteDef => ({ name: `${race}_${k}_turret`, model: `${race}_${k}`, cells: 1, views: 8, frames: TURRET_FRAMES, teamed: true, part: 'turret' })),
  // In flight: a gauss slug, a plasma ball or a thorn, small for the light gun and big for the cannon.
  { name: `${race}_shot`, cells: 1, views: 8, frames: ['gun', 'cannon'], teamed: false },
  { name: `${race}_hq`, cells: 2, views: 1, frames: ['idle0', 'idle1', 'idle2', 'idle3'], teamed: true },
  { name: `${race}_silo`, cells: 2, views: 1, frames: ['idle'], teamed: true },
  { name: `${race}_factory`, cells: 2, views: 1, frames: ['idle', 'work'], teamed: true },
  { name: `${race}_construction`, cells: 2, views: 1, frames: ['idle'], teamed: true },
  { name: `${race}_wall`, cells: 1, views: WALL_MASKS.length, masks: WALL_MASKS, frames: ['idle'], teamed: true },
];

export const SPRITES: readonly SpriteDef[] = [
  ...RACE_NAMES.flatMap(roster),
  // The field on the ground it grew through: sand (idle), forest soil and the hovers' plates.
  { name: 'resource', cells: 2, views: 1, frames: ['idle', 'forest', 'plates'], teamed: false },
  // Four variants of fir tree for the forest, one per cell, swaying in the wind.
  { name: 'fir', cells: 1, views: 4, frames: ['idle', 'sway0', 'sway1'], teamed: false },
  // Eight odds and ends to scatter over the sand.
  { name: 'decor', cells: 1, views: 8, variants: true, frames: ['idle'], teamed: false },
];

/** Frame size in art pixels and where the footprint centre lands inside it. */
export function frameLayout(cells: 1 | 2): { w: number; h: number; ax: number; ay: number } {
  // Room for half a cell around the footprint, and above it for tall buildings and the oblique view.
  const w = cells * (PX_PER_CELL + 16);
  const h = cells * (PX_PER_CELL + 32);
  return { w, h, ax: w / 2, ay: h - cells * 20 };
}

export const DIRECTION_NAMES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
