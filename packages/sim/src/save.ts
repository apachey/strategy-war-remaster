import type { World } from './world';

/** Bumped whenever the World shape changes; older saves are refused rather than loaded wrong. */
export const SAVE_VERSION = 1;

/** A world as plain JSON: everything the simulation needs to continue exactly where it stopped. */
export interface WorldSave {
  version: typeof SAVE_VERSION;
  world: Omit<World, 'blocked' | 'buildingAt' | 'byId' | 'sides' | 'events'> & {
    blocked: string;
    buildingAt: number[];
    sides: Record<keyof World['sides'], { money: number; explored: string }>;
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
        player: { money: sides.player.money, explored: bits(sides.player.explored) },
        enemy: { money: sides.enemy.money, explored: bits(sides.enemy.explored) },
      },
    },
  };
  // A deep copy, so the save never changes when the game goes on.
  return JSON.parse(JSON.stringify(copy)) as WorldSave;
}

export function loadWorld(save: WorldSave): World {
  if (save.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${String(save.version)}`);
  const s = JSON.parse(JSON.stringify(save.world)) as WorldSave['world'];
  const world: World = {
    ...s,
    blocked: unbits(s.blocked),
    buildingAt: Int32Array.from(s.buildingAt),
    byId: new Map(s.entities.map((e) => [e.id, e])),
    sides: {
      player: { money: s.sides.player.money, explored: unbits(s.sides.player.explored) },
      enemy: { money: s.sides.enemy.money, explored: unbits(s.sides.enemy.explored) },
    },
    events: [],
  };
  return world;
}
