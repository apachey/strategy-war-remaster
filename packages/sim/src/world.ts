import { CELL, ObjectType, TILE, TILE_FOREST, type CampaignMap, type MapObject } from '@sw/data';
import { createRng } from './rng';

export type Team = 'player' | 'enemy';

export interface Entity {
  id: number;
  type: ObjectType;
  team: Team;
  /** Top-left corner in map pixels (original 30 px tile scale). */
  x: number;
  y: number;
  /** Footprint in pixels: 30 for most buildings, 15 for units, walls and defenders. */
  size: number;
  hp: number;
}

export interface World {
  /** Map size in 15 px cells. */
  cols: number;
  rows: number;
  /** 1 = forest (impassable), row-major, cols * rows. */
  blocked: Uint8Array;
  entities: Entity[];
  money: number;
  tick: number;
  rng: () => number;
}

/** Fixed simulation rate; rendering interpolates between ticks. */
export const TICKS_PER_SECOND = 20;

const UNIT_TYPES: ReadonlySet<number> = new Set([
  ObjectType.EnemyTank,
  ObjectType.LightTank,
  ObjectType.MiddleTank,
  ObjectType.HeavyTank,
  ObjectType.Harvester,
]);

export function isUnit(type: ObjectType): boolean {
  return UNIT_TYPES.has(type);
}

function footprint(type: ObjectType): number {
  return isUnit(type) || type === ObjectType.Wall || type === ObjectType.Defender ? CELL : TILE;
}

function teamOf(o: MapObject): Team {
  // In the original only type 100 tanks belong to the enemy; player units ignore the flag.
  if (o.type === ObjectType.EnemyTank || o.type === ObjectType.EnemyHQ) return 'enemy';
  if (isUnit(o.type)) return 'player';
  return o.enemy ? 'enemy' : 'player';
}

export function buildBlockedGrid(map: CampaignMap): { cols: number; rows: number; blocked: Uint8Array } {
  const cols = map.w * 2;
  const rows = map.h * 2;
  const blocked = new Uint8Array(cols * rows);
  map.tiles.forEach((row, ty) =>
    row.forEach((tile, tx) => {
      const quarters = TILE_FOREST[tile];
      if (!quarters) return;
      for (let qy = 0; qy < 2; qy++)
        for (let qx = 0; qx < 2; qx++)
          if (quarters[qy]![qx]) blocked[(ty * 2 + qy) * cols + tx * 2 + qx] = 1;
    }),
  );
  return { cols, rows, blocked };
}

export function createWorld(map: CampaignMap, missionIndex: number, seed = 1): World {
  const mission = map.missions[missionIndex];
  if (!mission) throw new Error(`Map "${map.name}" has no mission ${missionIndex + 1}`);
  const grid = buildBlockedGrid(map);
  const entities = mission.objects.map((o, i) => ({
    id: i + 1,
    type: o.type,
    team: teamOf(o),
    x: o.x,
    y: o.y,
    size: footprint(o.type),
    hp: o.hp,
  }));
  return { ...grid, entities, money: mission.money, tick: 0, rng: createRng(seed) };
}

/** Advances the world by one fixed tick. Phase 0 only counts ticks; gameplay systems land in phase 1. */
export function step(world: World): void {
  world.tick++;
}

/** Order-independent fingerprint of the world, used to prove two runs stayed identical. */
export function hashWorld(world: World): number {
  let h = 2166136261 ^ world.tick ^ (world.money << 8);
  for (const e of world.entities) {
    for (const v of [e.id, e.type, e.x, e.y, e.hp, e.team === 'enemy' ? 1 : 0]) {
      h = Math.imul(h ^ v, 16777619);
    }
  }
  return h >>> 0;
}
