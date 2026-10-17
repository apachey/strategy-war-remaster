import { ObjectType } from './index';

/**
 * The three races of the remaster. The original has one side of vehicles against an enemy of hover tanks; the remaster
 * gives each side a race of its own and lets either seat play any of them:
 * - humans: tracked and wheeled vehicles with slightly futuristic gauss guns, white buildings, at home in the fir forest;
 * - hovers: smooth floating shells with plasma guns, monolithic arches on pale plated ground (the original's enemy);
 * - walkers: jointed many-legged creatures that spit organic acid, at home in the open sand.
 * All three use the original's numbers; the race only changes how a side looks and sounds.
 */
export type Race = 'human' | 'hover' | 'walker';
export const RACES: readonly Race[] = ['human', 'hover', 'walker'];

/** Ground each race is at home on (terrain tiles in assets/sprites/terrain.json). */
export const RACE_GROUND: Record<Race, 'forest' | 'sand' | 'plate'> = { human: 'forest', hover: 'plate', walker: 'sand' };

/**
 * Colours a side can wear: eight hues in rainbow order, each in a dark, a base and a light shade. Each colour is a
 * five-step ramp, dark to light. A side has a main colour and a secondary colour, which may be any of these; which
 * parts of a unit or building wear which depends on the race and the object. Sprites are drawn once with the main
 * colour in olive and the secondary in red, and recoloured to the side's two colours when loaded. Shots and muzzle
 * flashes keep their race's own colours, except the walkers', which glow in the side's colours (see `glowRamp`).
 */
export const TEAM_COLORS = {
  crimson: ['#2a0610', '#520c1e', '#7e1630', '#a82c48', '#d0566e'],
  red: ['#4a0c0a', '#8a1c16', '#c4362a', '#ee6a4e', '#ffae8e'],
  pink: ['#5a1e26', '#9a3a46', '#d0606a', '#f2929a', '#ffc8c8'],
  brown: ['#24140a', '#442814', '#664022', '#8a5c36', '#ae7e54'],
  orange: ['#4a2000', '#8a4200', '#cc6e12', '#f29c3a', '#ffd08a'],
  peach: ['#6a3a22', '#a86a48', '#dc9a74', '#f6c09e', '#ffe2cc'],
  olive: ['#333300', '#666600', '#999933', '#cccc66', '#ffff99'],
  yellow: ['#4a3a00', '#8a6e00', '#c8a010', '#ecca30', '#fff07a'],
  sunny: ['#7a6a10', '#b8a42a', '#e6d64a', '#fff27a', '#ffffc4'],
  forest: ['#0a2410', '#14401e', '#205c2c', '#327a40', '#4e9c5a'],
  green: ['#103a0c', '#22661a', '#3a982c', '#62c446', '#a6ec7c'],
  lime: ['#3a5a10', '#6a8e1e', '#98c034', '#c4e260', '#ecffa4'],
  cyan: ['#003333', '#006666', '#009999', '#33cccc', '#99ffff'],
  azure: ['#0a3a58', '#126a98', '#2a9ad0', '#5cc4f0', '#b0e8ff'],
  sky: ['#3a6a86', '#6496b2', '#92c2da', '#c0e2f2', '#ecfaff'],
  indigo: ['#120a36', '#241660', '#38268c', '#5440b4', '#7e6cd8'],
  blue: ['#0c1440', '#1c2e7a', '#3554b8', '#6a8ae6', '#b0c8ff'],
  lightblue: ['#2a3e7a', '#4a64b0', '#7290dc', '#a2bcf6', '#d4e2ff'],
  purple: ['#1a0626', '#340c4a', '#521870', '#702a94', '#9448b8'],
  violet: ['#2a0e40', '#4e2078', '#7a3cb0', '#a870dc', '#dcb4ff'],
  lilac: ['#5a3a7a', '#8a64ae', '#b490d6', '#d8baf2', '#f4e4ff'],
  black: ['#08080a', '#16161b', '#26262e', '#3a3a45', '#55555f'],
  // Warmer than the steel of unpainted parts, so a grey side still reads as painted.
  grey: ['#2e2618', '#5a4e3a', '#867a66', '#b2a692', '#ded2be'],
  white: ['#3a3e44', '#6c727a', '#a0a6ae', '#d0d4da', '#ffffff'],
} as const satisfies Record<string, readonly string[]>;
export type TeamColor = keyof typeof TEAM_COLORS;
/** All colours in rainbow order, each hue dark, base, light. */
export const TEAM_COLOR_NAMES = Object.keys(TEAM_COLORS) as TeamColor[];

/** The eight hues in rainbow order (azure is the light blue between green and blue). */
export const TEAM_HUES = ['red', 'orange', 'yellow', 'green', 'azure', 'blue', 'violet', 'grey'] as const;
export type TeamHue = (typeof TEAM_HUES)[number];
/** Each hue's colours: dark, base and light shade. */
export const TEAM_COLOR_GRID: Record<TeamHue, readonly [TeamColor, TeamColor, TeamColor]> = {
  red: ['crimson', 'red', 'pink'],
  orange: ['brown', 'orange', 'peach'],
  yellow: ['olive', 'yellow', 'sunny'],
  green: ['forest', 'green', 'lime'],
  azure: ['cyan', 'azure', 'sky'],
  blue: ['indigo', 'blue', 'lightblue'],
  violet: ['purple', 'violet', 'lilac'],
  grey: ['black', 'grey', 'white'],
};

const mix = (a: string, b: string, t: number): string =>
  '#' +
  [1, 3, 5]
    .map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

/**
 * Light glowing in a colour: the walkers' eyes (main colour) and their spit and muzzles (secondary colour). A dark
 * shade glows as its hue's base colour, since dark light does not read as light; the greys glow white.
 */
export function glowRamp(color: TeamColor): string[] {
  const hue = TEAM_HUES.find((h) => TEAM_COLOR_GRID[h].includes(color))!;
  const source = hue === 'grey' ? 'white' : TEAM_COLOR_GRID[hue][0] === color ? TEAM_COLOR_GRID[hue][1] : color;
  const r = TEAM_COLORS[source];
  return [r[1], r[2], r[3], mix(r[3], r[4], 0.5), r[4]];
}

/** The ramps the sprites are drawn in: main colour and secondary colour. */
export const SPRITE_TEAM_COLOR: TeamColor = 'olive';
export const SPRITE_SECOND_COLOR: TeamColor = 'red';

/**
 * Main colours by seat: white humans with olive accents (close to the original's olive army and white base) against
 * cyan hovers with white accents.
 */
export const DEFAULT_COLORS: readonly [TeamColor, TeamColor] = ['white', 'cyan'];
/** Secondary colours by seat when none is chosen; any colour may be a secondary, also the other side's. */
export const DEFAULT_SECOND_COLORS: readonly [TeamColor, TeamColor] = ['olive', 'white'];
/** The campaign is the original's war: humans against the hover race. */
export const CAMPAIGN_RACES: readonly [Race, Race] = ['human', 'hover'];

// Built on first use: this module and index.ts import each other.
let spriteKind: Partial<Record<ObjectType, string>> | null = null;
const kinds = (): Partial<Record<ObjectType, string>> => (spriteKind ??= {
  [ObjectType.PlayerHQ]: 'hq',
  [ObjectType.EnemyHQ]: 'hq',
  [ObjectType.Silo]: 'silo',
  [ObjectType.TankFactory]: 'factory',
  [ObjectType.Wall]: 'wall',
  [ObjectType.Defender]: 'defender',
  [ObjectType.Harvester]: 'harvester',
  [ObjectType.LightTank]: 'light_tank',
  [ObjectType.MiddleTank]: 'middle_tank',
  [ObjectType.HeavyTank]: 'heavy_tank',
  // The original's raider is a hover tank; any race fields it as its middle tank, with the light gun.
  [ObjectType.EnemyTank]: 'middle_tank',
});

/**
 * Sprite of an object of `race` in assets/sprites/sprites.json, e.g. `hover_hq`. Resource fields belong to nobody
 * and are 'resource'; a building site is `<race>_construction`.
 */
export function spriteName(race: Race, type: ObjectType): string {
  if (type === ObjectType.ResourceField) return 'resource';
  const kind = kinds()[type];
  if (!kind) throw new Error(`No sprite for object type ${type}`);
  return `${race}_${kind}`;
}

/** What each race fires: gauss slugs, plasma balls and acid spit, `<race>_shot` with frames gun and cannon. */
export const RACE_WEAPON: Record<Race, 'gauss' | 'plasma' | 'acid'> = { human: 'gauss', hover: 'plasma', walker: 'acid' };
