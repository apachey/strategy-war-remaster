/**
 * The shared 32-colour palette of style B. Every sprite is quantised to these colours, so units, buildings and
 * (later) tiles always sit together. Colours are grouped into ramps, dark to light; a 3D material picks a ramp and
 * the lighting picks the step inside it, which gives hand-pixelled shading instead of smooth gradients.
 */

export type Rgb = readonly [number, number, number];

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export const RAMPS = {
  outline: ['#14110c'],
  steel: ['#1f2326', '#3a4045', '#5f676b', '#8f979a', '#c9cfcf'],
  olive: ['#2b3115', '#4b5523', '#737f35', '#a6ad5a', '#d2d38a'],
  red: ['#3a1010', '#6b1c18', '#a32d22', '#d3523a', '#f08a5d'],
  blue: ['#13203a', '#1f3d6b', '#2e64a3', '#4c95d3'],
  cyan: ['#145a5e', '#2aa0a0', '#8ff0e0'],
  gold: ['#8a6a12', '#d9a520', '#ffe066'],
  concrete: ['#4a463e', '#77705f', '#a59c83', '#d6ccb0'],
  fire: ['#e2611c', '#fff3b0'],
} as const satisfies Record<string, readonly string[]>;

export type RampName = keyof typeof RAMPS;

/** Flat list of all palette colours; index 0 is the outline colour. */
export const PALETTE: Rgb[] = Object.values(RAMPS).flatMap((r) => r.map(hex));

export const ramp = (name: RampName): Rgb[] => RAMPS[name].map(hex);

/** Teams recolour every "team" surface. Player 1 keeps the olive of the original, the AI is red, player 2 blue. */
export const TEAMS = { player: 'olive', enemy: 'red', player2: 'blue' } as const satisfies Record<string, RampName>;
export type Team = keyof typeof TEAMS;

/** Shadow under objects: the outline colour at this opacity. */
export const SHADOW_ALPHA = 0.38;
