import { CELL, ObjectType, ORIGINAL_BALANCE } from '@sw/data';

/**
 * Gameplay rules of the original, read from the decompiled v1.3.5 code (v1.6.3 is identical).
 * Everything time-based is in milliseconds; the sim converts with TICK_MS.
 */

/** One sim tick. The original ran on per-object millisecond timers; 50 ms divides all of them closely enough. */
export const TICK_MS = 50;
export const TICKS_PER_SECOND = 1000 / TICK_MS;

export type UnitType =
  | typeof ObjectType.EnemyTank
  | typeof ObjectType.LightTank
  | typeof ObjectType.MiddleTank
  | typeof ObjectType.HeavyTank
  | typeof ObjectType.Harvester;

export type BuildingType =
  | typeof ObjectType.PlayerHQ
  | typeof ObjectType.Silo
  | typeof ObjectType.TankFactory
  | typeof ObjectType.EnemyHQ
  | typeof ObjectType.ResourceField
  | typeof ObjectType.Wall
  | typeof ObjectType.Defender;

/** Two shells exist in the original: projectile_1 (light gun) and projectile_2 (cannon). */
export interface Weapon {
  damage: number;
  /** Shell speed in pixels per second. */
  speed: number;
  /** Time between shots. */
  reloadMs: number;
  /** Fires when the edge-to-edge gap to the target is below this many pixels. */
  range: number;
}

const LIGHT_GUN = { damage: 7, speed: 400 } as const;
const CANNON = { damage: 15, speed: 50 } as const;

export interface UnitRules {
  price: number;
  hp: number;
  /** Milliseconds per pixel of movement (the original's step delay). */
  stepMs: number;
  /** Original "range" in cells; also how far a unit looks for targets on its own. */
  rangeCells: number;
  weapon: Weapon | null;
  /** Production time at the factory: the original counts one 100 ms step per hit point. */
  buildMs: number;
}

function unit(type: UnitType, gun: typeof LIGHT_GUN | typeof CANNON | null): UnitRules {
  const b = ORIGINAL_BALANCE.units[type];
  return {
    price: b.price,
    hp: b.hp,
    stepMs: b.stepDelayMs,
    rangeCells: b.rangeCells,
    weapon: gun && { ...gun, reloadMs: 2000, range: b.rangeCells * CELL },
    buildMs: b.hp * 100,
  };
}

export const UNIT_RULES: Record<UnitType, UnitRules> = {
  [ObjectType.EnemyTank]: unit(ObjectType.EnemyTank, LIGHT_GUN),
  [ObjectType.LightTank]: unit(ObjectType.LightTank, LIGHT_GUN),
  [ObjectType.MiddleTank]: unit(ObjectType.MiddleTank, CANNON),
  [ObjectType.HeavyTank]: unit(ObjectType.HeavyTank, CANNON),
  [ObjectType.Harvester]: unit(ObjectType.Harvester, null),
};

export interface BuildingRules {
  price: number;
  hp: number;
  /** Footprint in 15 px cells (square). */
  cells: number;
  buildMs: number;
  weapon: Weapon | null;
}

function building(type: Exclude<BuildingType, typeof ObjectType.ResourceField>, cells: number, weapon: Weapon | null = null): BuildingRules {
  const b = ORIGINAL_BALANCE.buildings[type];
  // Walls go up instantly; everything else takes one 100 ms step per hit point, like units.
  return { price: b.price, hp: b.hp, cells, buildMs: type === ObjectType.Wall ? 0 : b.hp * 100, weapon };
}

export const BUILDING_RULES: Record<BuildingType, BuildingRules> = {
  [ObjectType.PlayerHQ]: building(ObjectType.PlayerHQ, 2),
  [ObjectType.Silo]: building(ObjectType.Silo, 2),
  [ObjectType.TankFactory]: building(ObjectType.TankFactory, 2),
  [ObjectType.EnemyHQ]: building(ObjectType.EnemyHQ, 2),
  [ObjectType.ResourceField]: { price: 0, hp: 0, cells: 2, buildMs: 0, weapon: null },
  [ObjectType.Wall]: building(ObjectType.Wall, 1),
  // The turret turns one step and fires a cannon shell every 2.5 s at units within 5 cells.
  [ObjectType.Defender]: building(ObjectType.Defender, 1, { ...CANNON, reloadMs: 2500, range: 5 * CELL }),
};

/** What the HQ can build and the factory can produce, in menu order. */
export const HQ_BUILDS = [ObjectType.Silo, ObjectType.TankFactory, ObjectType.Defender, ObjectType.Wall] as const;
export const FACTORY_BUILDS = [ObjectType.Harvester, ObjectType.LightTank, ObjectType.MiddleTank, ObjectType.HeavyTank] as const;
export type HqBuild = (typeof HQ_BUILDS)[number];
export type FactoryBuild = (typeof FACTORY_BUILDS)[number];

export const HARVESTER = {
  capacity: 50,
  /** Loads one unit of resource from the field and unloads one into money per 50 ms. */
  perTick: 1,
  /** Docks at a silo when this close (pixels, edge to edge). */
  dockGap: 5,
} as const;

/** Enemy factories send out a new raider after this pause, while the enemy has fewer than ENEMY_MAX_TANKS. */
export const ENEMY_FACTORY_PAUSE_MS = 45_000;
export const ENEMY_MAX_TANKS = 10;
/** Raiders wander to a random cell up to this far away when they see nothing to shoot. */
export const RAIDER_WANDER_CELLS = 10;

/** Fog reveal radius in cells: units see 2 cells around them, buildings twice their footprint. */
export const UNIT_SIGHT_CELLS = 2;

/** Delay between the HQ falling and the mission result, like the original's 2 s pause. */
export const OUTCOME_DELAY_MS = 2000;

// ---------------------------------------------------------------------------------------------------------------
// Remaster: difficulty levels and the computer opponent. None of this exists in the original.

/**
 * `classic` is the original 2004 enemy: raiders that wander and a factory that sends one out every 55 s.
 * The other three hand the enemy side to the computer player in ai.ts.
 */
export type Difficulty = 'classic' | 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['classic', 'easy', 'normal', 'hard'];

/** How a computer player thinks. The same brain can play either side (the tests let it play the player). */
export interface AiBrain {
  /** Time between decisions; slower brains react later. */
  thinkMs: number;
  /** Harvesters it keeps working when it has a silo and a field to mine. */
  harvesters: number;
  /** Production order of combat units, repeated. Enemy tanks are dropped when the brain plays the player. */
  tankMix: UnitType[];
  /** Whether it builds new buildings; without, it only uses the base the mission gave it. */
  builds: boolean;
  /** Defender towers it builds around its HQ. */
  defenders: number;
  /** First attack wave leaves after this long, then one wave per cooldown. */
  firstWaveMs: number;
  waveCooldownMs: number;
  /** Tanks in the first wave; each later wave takes one more, up to waveMax. */
  waveSize: number;
  waveMax: number;
  /** Which enemy building an attack wave heads for. */
  targeting: 'hq' | 'nearest' | 'economy';
  /** Tanks in range all shoot the weakest target instead of each picking its nearest. */
  focusFire: boolean;
  /** Home tanks answer an attack on any building within this many cells. */
  guardCells: number;
}

export const AI_BRAINS = {
  easy: {
    thinkMs: 2000,
    harvesters: 1,
    tankMix: [ObjectType.EnemyTank, ObjectType.LightTank],
    builds: false,
    defenders: 0,
    firstWaveMs: 240_000,
    waveCooldownMs: 120_000,
    waveSize: 3,
    waveMax: 4,
    targeting: 'hq',
    focusFire: false,
    guardCells: 3,
  },
  normal: {
    thinkMs: 1000,
    harvesters: 2,
    tankMix: [ObjectType.EnemyTank, ObjectType.LightTank, ObjectType.MiddleTank],
    builds: true,
    defenders: 1,
    firstWaveMs: 150_000,
    waveCooldownMs: 80_000,
    waveSize: 4,
    waveMax: 7,
    targeting: 'nearest',
    focusFire: false,
    guardCells: 8,
  },
  hard: {
    thinkMs: 500,
    harvesters: 3,
    tankMix: [ObjectType.MiddleTank, ObjectType.LightTank, ObjectType.HeavyTank, ObjectType.MiddleTank],
    builds: true,
    defenders: 2,
    firstWaveMs: 100_000,
    waveCooldownMs: 50_000,
    waveSize: 5,
    waveMax: 10,
    targeting: 'economy',
    focusFire: true,
    guardCells: 10,
  },
  /** Scripted player for tests: builds an economy and goes straight for the enemy HQ. */
  autoplay: {
    thinkMs: 500,
    harvesters: 3,
    tankMix: [ObjectType.MiddleTank, ObjectType.HeavyTank],
    builds: true,
    defenders: 0,
    firstWaveMs: 60_000,
    waveCooldownMs: 30_000,
    waveSize: 8,
    waveMax: 12,
    targeting: 'hq',
    focusFire: true,
    guardCells: 8,
  },
} as const satisfies Record<string, AiBrain>;
export type AiBrainName = keyof typeof AI_BRAINS;

/** What the computer enemy starts with and earns on top of harvesting, so it can build even far from a field. */
export const ENEMY_BONUS: Record<Exclude<Difficulty, 'classic'>, { money: number; incomePerMinute: number }> = {
  easy: { money: 300, incomePerMinute: 60 },
  normal: { money: 700, incomePerMinute: 120 },
  hard: { money: 1500, incomePerMinute: 200 },
};

/** On the training map (map 1) the computer enemy commands what it has but never builds. */
export const TRAINING_MAPS = 1;
