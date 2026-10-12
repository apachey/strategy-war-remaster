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
