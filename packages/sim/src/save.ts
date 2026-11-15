import { defaultChassisColor, type Race, type TeamColor } from '@sw/data';
import { newStats, type SideState, type World } from './world';

/**
 * Bumped whenever the World shape changes. Each bump adds a step to MIGRATIONS that turns a save of the version
 * before into one of this version, so a save from any released game still loads.
 */
export const SAVE_VERSION = 8;
/** The oldest save that can still be loaded: 4, the first released game (1.0.0). */
export const OLDEST_SAVE_VERSION = 4;

/** A world as plain JSON: everything the simulation needs to continue exactly where it stopped. */
export interface WorldSave {
  version: typeof SAVE_VERSION;
  world: Omit<World, 'blocked' | 'buildingAt' | 'byId' | 'sides' | 'events'> & {
    blocked: string;
    buildingAt: number[];
    sides: Record<keyof World['sides'], Omit<SideState, 'explored'> & { explored: string }>;
  };
}

const bits = (a: Uint8Array) => Array.from(a, (v) => (v ? '1' : '0')).join('');
const unbits = (s: string) => Uint8Array.from(s, (c) => (c === '1' ? 1 : 0));

export function saveWorld(world: World): WorldSave {
  const { blocked, buildingAt, byId: _byId, sides, events: _events, ...rest } = world;
  const copy: WorldSave = {
    version: SAVE_VERSION,
    world: {
      ...rest,
      blocked: bits(blocked),
      buildingAt: Array.from(buildingAt),
      sides: {
        player: { ...sides.player, explored: bits(sides.player.explored) },
        enemy: { ...sides.enemy, explored: bits(sides.enemy.explored) },
      },
    },
  };
  // A deep copy, so the save never changes when the game goes on.
  return JSON.parse(JSON.stringify(copy)) as WorldSave;
}

/** Plain JSON on its way from an old version to the current one. */
type Json = Record<string, any>;

/**
 * MIGRATIONS[v] turns the world of a version-v save into a version v+1 one, in place. Each step only fills in what
 * that version added, with the value a fresh world has (or, where it matters, what the old game did), and leaves
 * fields that are already there alone, so saves from the unreleased versions in between load too.
 */
const MIGRATIONS: Record<number, (w: Json) => void> = {
  // 1.1: per-side stats for the victory screen and the minimap's "under attack" mark.
  4: (w) => {
    for (const side of Object.values(w.sides) as Json[]) {
      side.stats ??= newStats();
      side.alert ??= null;
    }
  },
  // 1.1: turrets, harvester homes and notices, waypoints, factory queues and rally points; shells know who fired.
  5: (w) => {
    for (const e of w.entities as Json[]) {
      e.turretDir ??= e.dir;
      e.home ??= null;
      e.waypoints ??= [];
      e.hitBy ??= 0;
      e.hitTick ??= 0;
      e.notice ??= null;
      e.queue ??= [];
      e.rally ??= null;
    }
    for (const p of w.projectiles as Json[]) p.shooterId ??= 0;
  },
  // 1.2: a chassis colour, which the side had painted in its secondary colour (or, for walkers, its team colour).
  6: (w) => {
    for (const side of Object.values(w.sides) as Json[]) {
      side.color3 ??= defaultChassisColor(side.race as Race, side.color as TeamColor, side.color2 as TeamColor);
    }
  },
  // 1.2: a shell only hits its target. One in flight takes the enemy that stands where it falls, as it would have hit.
  7: (w) => {
    for (const p of w.projectiles as Json[]) {
      if (p.targetId !== undefined) continue;
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const end = Math.max(0, p.left - 6);
      const x = p.x + (p.vx / speed) * end;
      const y = p.y + (p.vy / speed) * end;
      const t = (w.entities as Json[]).find(
        (e) => e.hp > 0 && !e.hidden && e.team !== p.team && e.team !== 'neutral' && x >= e.x && x < e.x + e.size && y >= e.y && y < e.y + e.size,
      );
      p.targetId = t ? t.id : 0;
    }
  },
};

/** Whether a save of this version can be loaded (after migrating it if it is older). */
export function canLoadSave(version: unknown): version is number {
  return typeof version === 'number' && Number.isInteger(version) && version >= OLDEST_SAVE_VERSION && version <= SAVE_VERSION;
}

/** A save of any loadable version brought up to SAVE_VERSION; the input is not changed. */
export function migrateSave(save: { version: number; world: unknown }): WorldSave {
  if (!canLoadSave(save.version)) throw new Error(`Unsupported save version ${String(save.version)}`);
  const world = JSON.parse(JSON.stringify(save.world)) as Json;
  for (let v = save.version; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from save version ${v}`);
    step(world);
  }
  return { version: SAVE_VERSION, world: world as WorldSave['world'] };
}

export function loadWorld(save: WorldSave | { version: number; world: unknown }): World {
  const s = migrateSave(save).world;
  const world: World = {
    ...s,
    blocked: unbits(s.blocked),
    buildingAt: Int32Array.from(s.buildingAt),
    byId: new Map(s.entities.map((e) => [e.id, e])),
    sides: {
      player: { ...s.sides.player, explored: unbits(s.sides.player.explored) },
      enemy: { ...s.sides.enemy, explored: unbits(s.sides.enemy.explored) },
    },
    events: [],
  };
  return world;
}
