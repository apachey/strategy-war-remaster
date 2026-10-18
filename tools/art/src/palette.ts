/**
 * The shared palette of style B: 43 colours for units and buildings, 5 for fire in the effects, plus 19 for the
 * ground (fir trees, soil, sand and the hover race's plates).
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
  // Secondary team colour as drawn (the game recolours it): red, which nothing else uses.
  accent: ['#4a0c0a', '#8a1c16', '#c4362a', '#ee6a4e', '#ffae8e'],
  gold: ['#996600', '#cc9933', '#ffcc00', '#ffff33'],
  concrete: ['#4d4a3c', '#7a7660', '#a8a388', '#d4cfb2'],
  fire: ['#ff8a1c', '#ffffcc'],
  // Explosions and burning buildings, from embers to white heat (effects only).
  blaze: ['#4a1406', '#94300c', '#d85a14', '#ffb02c', '#fff48a'],
  signal: ['#006633', '#33ff66'],
  // The walkers' eyes as drawn, magenta; the game recolours them to `glowRamp` of the secondary colour.
  glow: ['#3a0a30', '#701a5c', '#a83088', '#d860b4', '#ffa0e0'],
  // The walkers' acid: muzzles, the trail of their thorns, pools and glands. Fixed, not a team colour, and running
  // from deep green in shadow to hot yellow where it is lit or glowing, so it shimmers apart from any team green.
  acid: ['#0e3a1a', '#1c6a24', '#58a818', '#bcd81c', '#fff04a'],
  // Dark forest soil, heaped where crystals break through the forest floor.
  soil: ['#2a2016', '#463626', '#62503a', '#806c50'],
  // Terrain: turquoise fir needles and desert sand (dark to light).
  pine: ['#0e3a36', '#17564e', '#227368', '#349482', '#5cb8a2'],
  sand: ['#8f7748', '#a88d58', '#bfa36b', '#d1b77f', '#e0c995'],
  // Pale futuristic floor plates the hover race lives on.
  plate: ['#7d868c', '#9aa3a8', '#b6bdc0', '#d0d5d6', '#e8ecec'],
} as const satisfies Record<string, readonly string[]>;

export type RampName = keyof typeof RAMPS;

/** Flat list of all palette colours; index 0 is the outline colour. */
export const PALETTE: Rgb[] = Object.values(RAMPS).flatMap((r) => r.map(hex));

export const ramp = (name: RampName): Rgb[] => RAMPS[name].map(hex);

/**
 * Every "team" surface is drawn in this ramp. The game and the sprite studio recolour it to the colour a side wears
 * (TEAM_COLORS in @sw/data, whose first entry is this same ramp), so any number of colours costs no atlas space.
 */
export const TEAM_RAMP = 'olive' satisfies RampName;
/** Every "team2" (secondary colour) surface is drawn in this ramp: TEAM_COLORS.red. */
export const SECOND_RAMP = 'accent' satisfies RampName;
/** Light in the secondary colour ("team3": the walkers' eyes) is drawn in this ramp; it becomes `glowRamp(secondary)`. */
export const GLOW_RAMP = 'glow' satisfies RampName;

/** Shadow under objects: the outline colour at this opacity. */
export const SHADOW_ALPHA = 0.38;
