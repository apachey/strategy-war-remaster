import {
  CAMPAIGN_RACES,
  DEFAULT_COLORS,
  DEFAULT_SECOND_COLORS,
  defaultChassisColor,
  RACES,
  TEAM_COLOR_NAMES,
  type Race,
  type TeamColor,
} from './races';

/**
 * A faction the player makes in the faction studio: a race, a name, a symbol and three colours (main, secondary and
 * the chassis). Like races, a faction only changes how a side looks.
 */
export interface Faction {
  /** The player's own name for it; empty shows the race's name. */
  name: string;
  race: Race;
  color: TeamColor;
  color2: TeamColor;
  color3: TeamColor;
  symbol: FactionSymbol;
}

/** Symbols a faction can carry, painted in its colours: the field in the main colour, the sign in the secondary, the rim in the chassis colour. */
export const FACTION_SYMBOLS = ['crystal', 'fang', 'eye', 'star', 'crown', 'skull', 'wings', 'sun', 'tower', 'wave', 'arrow', 'ring'] as const;
export type FactionSymbol = (typeof FACTION_SYMBOLS)[number];

/** Longest faction name, in letters. */
export const FACTION_NAME_MAX = 18;

/** The two campaign sides as factions: olive humans with turquoise accents, red hovers with white. */
export const CAMPAIGN_FACTIONS: readonly [Faction, Faction] = [0, 1].map((i) => ({
  name: '',
  race: CAMPAIGN_RACES[i]!,
  color: DEFAULT_COLORS[i]!,
  color2: DEFAULT_SECOND_COLORS[i]!,
  color3: defaultChassisColor(CAMPAIGN_RACES[i]!, DEFAULT_COLORS[i]!, DEFAULT_SECOND_COLORS[i]!),
  symbol: (['tower', 'eye'] as const)[i]!,
})) as unknown as readonly [Faction, Faction];

/** Ready-made factions offered next to the player's own: the campaign's two, and a walker swarm. */
export const PRESET_FACTIONS: readonly Faction[] = [
  ...CAMPAIGN_FACTIONS,
  { name: '', race: 'walker', color: 'violet', color2: 'lime', color3: 'purple', symbol: 'fang' },
];

/** A faction from untrusted input (storage, a URL): each unknown field takes the fallback's value. */
export function cleanFaction(raw: unknown, fallback: Faction): Faction {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Faction, unknown>>;
  const color = (v: unknown, f: TeamColor) => (TEAM_COLOR_NAMES.includes(v as TeamColor) ? (v as TeamColor) : f);
  const race = RACES.includes(r.race as Race) ? (r.race as Race) : fallback.race;
  const c = color(r.color, fallback.color);
  const c2 = color(r.color2, fallback.color2);
  return {
    name: typeof r.name === 'string' ? r.name.replace(/[<>&"|]/g, '').trim().slice(0, FACTION_NAME_MAX) : fallback.name,
    race,
    color: c,
    color2: c2,
    color3: color(r.color3, defaultChassisColor(race, c, c2)),
    symbol: FACTION_SYMBOLS.includes(r.symbol as FactionSymbol) ? (r.symbol as FactionSymbol) : fallback.symbol,
  };
}
