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
  /** Footprint in cells: units, walls and the defender take 1, other buildings 2x2. */
  cells: 1 | 2;
  /**
   * Number of views. 8 = compass directions, clockwise from north; walls use 16 = neighbour mask (N1 E2 S4 W8);
   * fir trees use the view as the variant.
   */
  views: number;
  frames: readonly string[];
  /** Team-coloured sprites are exported once per team; neutral ones once. */
  teamed: boolean;
}

const TANK_FRAMES = ['move0', 'move1', 'fire', 'wreck'] as const;

export const SPRITES: readonly SpriteDef[] = [
  { name: 'harvester', cells: 1, views: 8, frames: ['move0', 'move1', 'wreck'], teamed: true },
  { name: 'light_tank', cells: 1, views: 8, frames: TANK_FRAMES, teamed: true },
  { name: 'middle_tank', cells: 1, views: 8, frames: TANK_FRAMES, teamed: true },
  { name: 'heavy_tank', cells: 1, views: 8, frames: TANK_FRAMES, teamed: true },
  { name: 'hover_tank', cells: 1, views: 8, frames: TANK_FRAMES, teamed: true },
  { name: 'defender', cells: 1, views: 8, frames: ['idle', 'fire'], teamed: true },
  { name: 'hq', cells: 2, views: 1, frames: ['idle0', 'idle1', 'idle2', 'idle3'], teamed: true },
  { name: 'enemy_hq', cells: 2, views: 1, frames: ['idle0', 'idle1', 'idle2', 'idle3'], teamed: true },
  { name: 'silo', cells: 2, views: 1, frames: ['idle'], teamed: true },
  { name: 'factory', cells: 2, views: 1, frames: ['idle', 'work'], teamed: true },
  { name: 'construction', cells: 2, views: 1, frames: ['idle'], teamed: false },
  { name: 'resource', cells: 2, views: 1, frames: ['idle'], teamed: false },
  { name: 'wall', cells: 1, views: 16, frames: ['idle'], teamed: false },
  // Four variants of fir tree for the forest, one per cell.
  { name: 'fir', cells: 1, views: 4, frames: ['idle'], teamed: false },
];

/** Frame size in art pixels and where the footprint centre lands inside it. */
export function frameLayout(cells: 1 | 2): { w: number; h: number; ax: number; ay: number } {
  // Room for half a cell around the footprint, and above it for tall buildings and the oblique view.
  const w = cells * (PX_PER_CELL + 16);
  const h = cells * (PX_PER_CELL + 32);
  return { w, h, ax: w / 2, ay: h - cells * 20 };
}

export const DIRECTION_NAMES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
