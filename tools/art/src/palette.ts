/**
 * The shared palette of style B: 32 colours for units and buildings plus 10 for the ground (fir trees and sand).
 * Every sprite and tile is quantised to these colours, so units, buildings and terrain always sit together.
 * Colours are grouped into ramps, dark to light; a 3D material picks a ramp and the lighting picks the step inside
 * it, which gives hand-pixelled shading instead of smooth gradients.
 */

export type Rgb = readonly [number, number, number];

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export const RAMPS = {
  // Close to the original's colours: black outlines, neutral greys, yellow-olive bodies and cyan glass.
  outline: ['#000000'],
  steel: ['#333333', '#666666', '#999999', '#cccccc', '#f4f4ec'],
  olive: ['#333300', '#666600', '#999933', '#cccc66', '#ffff99'],
  cyan: ['#003333', '#006666', '#009999', '#33cccc', '#99ffff'],
  red: ['#5a1410', '#9a2a1e', '#d2492f', '#f5895a'],
  gold: ['#996600', '#cc9933', '#ffcc00', '#ffff33'],
  concrete: ['#4d4a3c', '#7a7660', '#a8a388', '#d4cfb2'],
  fire: ['#ff8a1c', '#ffffcc'],
  signal: ['#006633', '#33ff66'],
  // Terrain: turquoise fir needles and desert sand (dark to light).
  pine: ['#0e3a36', '#17564e', '#227368', '#349482', '#5cb8a2'],
  sand: ['#8f7748', '#a88d58', '#bfa36b', '#d1b77f', '#e0c995'],
} as const satisfies Record<string, readonly string[]>;

export type RampName = keyof typeof RAMPS;

/** Flat list of all palette colours; index 0 is the outline colour. */
export const PALETTE: Rgb[] = Object.values(RAMPS).flatMap((r) => r.map(hex));

export const ramp = (name: RampName): Rgb[] => RAMPS[name].map(hex);

/**
 * Teams recolour every "team" surface. As in the original the player is olive and the enemy cyan; player 2 of a
 * split-screen game is red.
 */
export const TEAMS = { player: 'olive', enemy: 'cyan', player2: 'red' } as const satisfies Record<string, RampName>;
export type Team = keyof typeof TEAMS;

/** Shadow under objects: the outline colour at this opacity. */
export const SHADOW_ALPHA = 0.38;
