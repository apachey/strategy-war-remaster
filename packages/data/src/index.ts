import campaignJson from './campaign.json';

/** Object type ids exactly as stored in the original .tae map files. */
export const ObjectType = {
  PlayerHQ: 0,
  Silo: 1,
  TankFactory: 2,
  EnemyHQ: 4,
  ResourceField: 5,
  Wall: 6,
  Defender: 7,
  EnemyTank: 100,
  LightTank: 101,
  MiddleTank: 102,
  HeavyTank: 103,
  Harvester: 104,
} as const;
export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];

export interface MapObject {
  type: ObjectType;
  /** Pixels in the original 30 px tile grid. */
  x: number;
  y: number;
  hp: number;
  /** Owner flag for buildings; the original ignores it for units (type 100 is always the enemy). */
  enemy: boolean;
}

export interface Mission {
  title: string;
  brief: string;
  money: number;
  objects: MapObject[];
}

export interface CampaignMap {
  name: string;
  /** Width and height in 30 px tiles. */
  w: number;
  h: number;
  /** Tile ids (1..10) indexing the original tiles.png, row-major. */
  tiles: number[][];
  missions: Mission[];
}

export interface Campaign {
  source: string;
  maps: CampaignMap[];
}

export const campaign = campaignJson as unknown as Campaign;

/** Original tile size in pixels; each tile splits into 2x2 cells of 15 px for walls, units and passability. */
export const TILE = 30;
export const CELL = 15;

/**
 * Which 15 px quarter of each tile is forest (impassable), [row][col].
 * Taken from the original collision code (class c): edge tiles 2, 4, 8 and 10 leave one free quarter,
 * tiles 3, 5, 6, 7 and 9 are solid forest.
 */
export const TILE_FOREST: Record<number, [[number, number], [number, number]]> = {
  1: [[0, 0], [0, 0]],
  2: [[0, 1], [1, 1]],
  3: [[1, 1], [1, 1]],
  4: [[1, 0], [1, 1]],
  5: [[1, 1], [1, 1]],
  6: [[1, 1], [1, 1]],
  7: [[1, 1], [1, 1]],
  8: [[1, 1], [0, 1]],
  9: [[1, 1], [1, 1]],
  10: [[1, 1], [1, 0]],
};

/** Balance of the original game (v1.3.5 and v1.6.3 are identical), from the decompiled code. */
export const ORIGINAL_BALANCE = {
  units: {
    [ObjectType.LightTank]: { price: 100, hp: 70, stepDelayMs: 30, rangeCells: 3 },
    [ObjectType.MiddleTank]: { price: 150, hp: 100, stepDelayMs: 60, rangeCells: 4 },
    [ObjectType.HeavyTank]: { price: 250, hp: 120, stepDelayMs: 100, rangeCells: 4 },
    [ObjectType.Harvester]: { price: 150, hp: 50, stepDelayMs: 50, rangeCells: 2 },
    [ObjectType.EnemyTank]: { price: 50, hp: 100, stepDelayMs: 70, rangeCells: 3 },
  },
  buildings: {
    [ObjectType.PlayerHQ]: { price: 1000, hp: 150 },
    [ObjectType.EnemyHQ]: { price: 0, hp: 150 },
    [ObjectType.Silo]: { price: 400, hp: 100 },
    [ObjectType.TankFactory]: { price: 700, hp: 100 },
    [ObjectType.Defender]: { price: 250, hp: 80 },
    [ObjectType.Wall]: { price: 50, hp: 50 },
  },
} as const;
