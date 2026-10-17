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
 * Colours a side can wear. Each is a five-step ramp, dark to light. A side has a main colour for its team surfaces
 * and a secondary colour for its accents (which parts those are depends on the race and the object). Sprites are
 * drawn once with the main colour in olive and the secondary in red, and recoloured to the side's two colours when
 * loaded. Shots and muzzle flashes keep their race's own colours whatever the side wears.
 */
export const TEAM_COLORS = {
  olive: ['#333300', '#666600', '#999933', '#cccc66', '#ffff99'],
  cyan: ['#003333', '#006666', '#009999', '#33cccc', '#99ffff'],
  red: ['#4a0c0a', '#8a1c16', '#c4362a', '#ee6a4e', '#ffae8e'],
  blue: ['#0c1440', '#1c2e7a', '#3554b8', '#6a8ae6', '#b0c8ff'],
  violet: ['#2a0e40', '#4e2078', '#7a3cb0', '#a870dc', '#dcb4ff'],
  orange: ['#4a2000', '#8a4200', '#cc6e12', '#f29c3a', '#ffd08a'],
  pink: ['#40102a', '#7a1e52', '#b83a80', '#e46cb0', '#ffb4dc'],
  white: ['#3a3e44', '#6c727a', '#a0a6ae', '#d0d4da', '#ffffff'],
  black: ['#08080a', '#16161b', '#26262e', '#3a3a45', '#55555f'],
} as const satisfies Record<string, readonly string[]>;
export type TeamColor = keyof typeof TEAM_COLORS;
export const TEAM_COLOR_NAMES = Object.keys(TEAM_COLORS) as TeamColor[];
/** The ramps the sprites are drawn in: main colour and secondary colour. */
export const SPRITE_TEAM_COLOR: TeamColor = 'olive';
export const SPRITE_SECOND_COLOR: TeamColor = 'red';

/** As in the original: the first seat olive, the second cyan. */
export const DEFAULT_COLORS: readonly [TeamColor, TeamColor] = ['olive', 'cyan'];
/** Secondary colours by seat when none is chosen; any colour may be a secondary, also the other side's. */
export const DEFAULT_SECOND_COLORS: readonly [TeamColor, TeamColor] = ['white', 'white'];
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
