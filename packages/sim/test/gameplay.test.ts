import { describe, expect, it } from 'vitest';
import { campaign, CELL, ObjectType, type CampaignMap, type MapObject } from '@sw/data';
import {
  BUILDING_RULES,
  createWorld,
  findPath,
  hashWorld,
  issue,
  step,
  TICKS_PER_SECOND,
  UNIT_RULES,
  type World,
} from '../src';
import { autoplay } from './autoplay';

/** A 10×10 tile sand map (20×20 cells) with the given objects; forest tiles can be listed as [tx, ty]. */
function arena(objects: Array<Partial<MapObject> & { type: MapObject['type'] }>, money = 1000, forest: Array<[number, number]> = []): World {
  const tiles = Array.from({ length: 10 }, (_, ty) => Array.from({ length: 10 }, (_, tx) => (forest.some(([x, y]) => x === tx && y === ty) ? 6 : 1)));
  const map: CampaignMap = {
    name: 'Test',
    w: 10,
    h: 10,
    tiles,
    missions: [{ title: 'Test', brief: '', money, objects: objects.map((o) => ({ x: 0, y: 0, hp: 100, enemy: false, ...o })) }],
  };
  return createWorld(map, 0, 7);
}

const run = (world: World, seconds: number) => {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) step(world);
};
const byType = (world: World, type: number) => world.entities.find((e) => e.type === type)!;

describe('pathfinding', () => {
  it('walks around a wall of blocked cells', () => {
    const blocked = new Set(['3,0', '3,1', '3,2', '3,3']);
    const path = findPath(6, 6, (x, y) => !blocked.has(`${x},${y}`), { cx: 0, cy: 0 }, { cx: 5, cy: 0 });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ cx: 5, cy: 0 });
    expect(path!.some((c) => blocked.has(`${c.cx},${c.cy}`))).toBe(false);
  });

  it('gets as close as possible to an unreachable spot when asked to', () => {
    const blocked = new Set(['4,0', '4,1', '4,2', '4,3', '4,4', '4,5']);
    const passable = (x: number, y: number) => !blocked.has(`${x},${y}`);
    expect(findPath(6, 6, passable, { cx: 0, cy: 0 }, { cx: 5, cy: 0 })).toBeNull();
    expect(findPath(6, 6, passable, { cx: 0, cy: 0 }, { cx: 5, cy: 0 }, true)!.at(-1)).toEqual({ cx: 3, cy: 0 });
  });
});

describe('movement', () => {
  it('drives at the original speed: a light tank covers 1 px per 30 ms', () => {
    const w = arena([{ type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 }, { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 }, { type: ObjectType.LightTank, x: 15, y: 90, hp: 70 }]);
    const tank = byType(w, ObjectType.LightTank);
    expect(issue(w, 'player', { kind: 'move', ids: [tank.id], x: 270, y: 97 })).toEqual({ ok: true });
    run(w, 3);
    expect(tank.x).toBe(15 + 100);
    run(w, 10);
    expect(tank.x).toBe(270);
    expect(tank.order.kind).toBe('idle');
  });

  it('never drives through forest', () => {
    const w = arena([{ type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 }, { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 }, { type: ObjectType.HeavyTank, x: 0, y: 150, hp: 120 }], 0, [[3, 3], [3, 4], [3, 5], [3, 6]]);
    const tank = byType(w, ObjectType.HeavyTank);
    issue(w, 'player', { kind: 'move', ids: [tank.id], x: 200, y: 157 });
    for (let i = 0; i < 40 * TICKS_PER_SECOND; i++) {
      step(w);
      const forest = tank.x + 15 > 90 && tank.x < 120 && tank.y + 15 > 90 && tank.y < 210;
      expect(forest).toBe(false);
    }
    expect(Math.floor((tank.x + 7) / CELL)).toBe(Math.floor(200 / CELL));
  });
});

describe('economy', () => {
  it('a harvester fills up to 50 on the field and unloads it into the silo as money', () => {
    const w = arena(
      [
        { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
        { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 },
        { type: ObjectType.Silo, x: 60, y: 0, hp: 100 },
        { type: ObjectType.ResourceField, x: 60, y: 60, hp: 500 },
        { type: ObjectType.Harvester, x: 30, y: 45, hp: 50 },
      ],
      0,
    );
    const harvester = byType(w, ObjectType.Harvester);
    const field = byType(w, ObjectType.ResourceField);
    expect(issue(w, 'player', { kind: 'harvest', ids: [harvester.id], fieldId: field.id })).toEqual({ ok: true });
    // 1.5 s to drive onto the field, 2.5 s to load.
    run(w, 4.5);
    expect(harvester.cargo).toBe(50);
    expect(field.hp).toBe(450);
    run(w, 6);
    expect(w.sides.player.money).toBe(50);
    expect(harvester.phase === 'toField' || harvester.phase === 'loading').toBe(true);
  });

  it('builds a silo in 10 s for 400 and refunds a cancelled factory in full', () => {
    const w = arena([{ type: ObjectType.PlayerHQ, x: 60, y: 60, hp: 150 }, { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 }], 1500);
    const hq = byType(w, ObjectType.PlayerHQ);
    expect(issue(w, 'player', { kind: 'build', hqId: hq.id, building: ObjectType.Silo, cx: 7, cy: 4 })).toEqual({ ok: true });
    expect(w.sides.player.money).toBe(1100);
    const silo = byType(w, ObjectType.Silo);
    expect(silo.complete).toBe(false);
    expect(issue(w, 'player', { kind: 'build', hqId: hq.id, building: ObjectType.Defender, cx: 2, cy: 2 })).toEqual({ ok: false, reason: 'busy' });
    run(w, 9.9);
    expect(silo.complete).toBe(false);
    run(w, 0.2);
    expect(silo.complete).toBe(true);

    expect(issue(w, 'player', { kind: 'build', hqId: hq.id, building: ObjectType.TankFactory, cx: 2, cy: 7 })).toEqual({ ok: true });
    expect(w.sides.player.money).toBe(400);
    expect(issue(w, 'player', { kind: 'cancel', id: hq.id })).toEqual({ ok: true });
    expect(w.sides.player.money).toBe(1100);
    expect(w.entities.some((e) => e.type === ObjectType.TankFactory)).toBe(false);
  });

  it('refuses to build on forest, on top of units, in the dark or without money', () => {
    const w = arena([{ type: ObjectType.PlayerHQ, x: 60, y: 60, hp: 150 }, { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 }, { type: ObjectType.LightTank, x: 120, y: 60, hp: 70 }], 300, [[1, 3]]);
    const hq = byType(w, ObjectType.PlayerHQ);
    const build = (building: 1 | 2 | 6 | 7, cx: number, cy: number) => issue(w, 'player', { kind: 'build', hqId: hq.id, building, cx, cy });
    expect(build(ObjectType.Wall, 2, 6)).toEqual({ ok: false, reason: 'blocked' });
    expect(build(ObjectType.Wall, 8, 4)).toEqual({ ok: false, reason: 'blocked' });
    expect(build(ObjectType.Wall, 18, 18)).toEqual({ ok: false, reason: 'blocked' });
    expect(build(ObjectType.Silo, 4, 1)).toEqual({ ok: false, reason: 'no-money' });
    // Walls go up instantly and do not keep the HQ busy.
    expect(build(ObjectType.Wall, 4, 1)).toEqual({ ok: true });
    expect(build(ObjectType.Wall, 5, 1)).toEqual({ ok: true });
    expect(w.sides.player.money).toBe(200);
  });

  it('a factory turns out a light tank 7 s after paying 100', () => {
    const w = arena([{ type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 }, { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 }, { type: ObjectType.TankFactory, x: 90, y: 90, hp: 100 }], 120);
    const factory = byType(w, ObjectType.TankFactory);
    expect(issue(w, 'player', { kind: 'produce', factoryId: factory.id, unit: ObjectType.HeavyTank })).toEqual({ ok: false, reason: 'no-money' });
    expect(issue(w, 'player', { kind: 'produce', factoryId: factory.id, unit: ObjectType.LightTank })).toEqual({ ok: true });
    expect(w.sides.player.money).toBe(20);
    run(w, 6.9);
    expect(w.entities.some((e) => e.type === ObjectType.LightTank)).toBe(false);
    run(w, 0.2);
    const tank = byType(w, ObjectType.LightTank);
    expect(tank.hp).toBe(UNIT_RULES[ObjectType.LightTank].hp);
    expect(tank.team).toBe('player');
  });
});

describe('combat', () => {
  it('a light tank deals 7 damage every 2 s and the target dies at 0', () => {
    const w = arena([
      { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
      { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 },
      { type: ObjectType.LightTank, x: 60, y: 150, hp: 70 },
      { type: ObjectType.Wall, x: 90, y: 150, hp: 14, enemy: true },
    ]);
    const tank = byType(w, ObjectType.LightTank);
    const wall = byType(w, ObjectType.Wall);
    expect(issue(w, 'player', { kind: 'attack', ids: [tank.id], targetId: wall.id })).toEqual({ ok: true });
    run(w, 0.5);
    expect(wall.hp).toBe(7);
    run(w, 2);
    expect(w.entities.includes(wall)).toBe(false);
    expect(tank.order.kind).toBe('idle');
  });

  it('shot and destroyed events name the object, so the game can flash its gun and leave its wreck', () => {
    const w = arena([
      { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
      { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 },
      { type: ObjectType.HeavyTank, x: 60, y: 150, hp: 120 },
      { type: ObjectType.Wall, x: 90, y: 150, hp: 10, enemy: true },
    ]);
    const tank = byType(w, ObjectType.HeavyTank);
    const wall = byType(w, ObjectType.Wall);
    issue(w, 'player', { kind: 'attack', ids: [tank.id], targetId: wall.id });
    const events: World['events'] = [];
    for (let i = 0; i < 4 * TICKS_PER_SECOND; i++) {
      step(w);
      events.push(...w.events);
    }
    expect(events.find((e) => e.kind === 'shot')).toMatchObject({ id: tank.id, by: ObjectType.HeavyTank, weapon: 'cannon', team: 'player' });
    expect(events.find((e) => e.kind === 'destroyed')).toMatchObject({ id: wall.id, type: ObjectType.Wall, team: 'enemy', dir: wall.dir });
  });

  it('enemy tanks shoot player buildings in range, and idle player tanks shoot back', () => {
    const w = arena([
      { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
      { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 },
      { type: ObjectType.Silo, x: 120, y: 120, hp: 100 },
      { type: ObjectType.EnemyTank, x: 165, y: 120, hp: 100 },
      { type: ObjectType.MiddleTank, x: 105, y: 165, hp: 100 },
    ]);
    const silo = byType(w, ObjectType.Silo);
    const raider = byType(w, ObjectType.EnemyTank);
    run(w, 3);
    expect(silo.hp).toBeLessThan(100);
    expect(raider.targetId).toBe(silo.id);
    run(w, 3);
    expect(raider.hp).toBeLessThan(100);
  });

  it('a defender turret fires cannon shells at enemy units within 5 cells', () => {
    const w = arena([
      { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
      { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 },
      { type: ObjectType.Defender, x: 150, y: 150, hp: 80 },
      { type: ObjectType.EnemyTank, x: 210, y: 150, hp: 100 },
    ]);
    const raider = byType(w, ObjectType.EnemyTank);
    run(w, 0.1);
    expect(w.projectiles.length).toBe(1);
    run(w, 2);
    expect(raider.hp === 85 || raider.hp === 100).toBe(true);
    expect(BUILDING_RULES[ObjectType.Defender].weapon!.range).toBe(75);
  });

  it('an enemy factory sends out a raider after 45 s of quiet and 10 s of building', () => {
    const w = arena([
      { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
      { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 },
      { type: ObjectType.TankFactory, x: 210, y: 210, hp: 100, enemy: true },
    ]);
    run(w, 54);
    expect(w.entities.some((e) => e.type === ObjectType.EnemyTank)).toBe(false);
    run(w, 1.1);
    expect(w.entities.filter((e) => e.type === ObjectType.EnemyTank && e.team === 'enemy')).toHaveLength(1);
  });
});

describe('fog of war', () => {
  it('starts dark except around player objects and lifts where units drive', () => {
    const w = createWorld(campaign.maps[0]!, 0);
    const explored = w.sides.player.explored;
    const seen = () => explored.reduce((n, v) => n + v, 0);
    const before = seen();
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(w.cols * w.rows);
    const tank = byType(w, ObjectType.LightTank);
    issue(w, 'player', { kind: 'move', ids: [tank.id], x: 22, y: 82 });
    run(w, 6);
    expect(seen()).toBeGreaterThan(before);
  });
});

describe('mission outcome', () => {
  it('losing the HQ loses the mission after a short pause', () => {
    const w = createWorld(campaign.maps[0]!, 0);
    const hq = byType(w, ObjectType.PlayerHQ);
    expect(issue(w, 'player', { kind: 'destruct', id: hq.id })).toEqual({ ok: true });
    expect(w.outcome).toBe('playing');
    run(w, 2.1);
    expect(w.outcome).toBe('lost');
  });

  it('mission 1 "Beginning" can be played from start to victory', () => {
    const w = createWorld(campaign.maps[0]!, 0);
    const ticks = autoplay(w, 600);
    expect(w.outcome).toBe('won');
    // The scripted player needs about a minute and a half of game time.
    expect(ticks / TICKS_PER_SECOND).toBeLessThan(180);
    expect(w.sides.player.money).toBeGreaterThan(1000);
  });

  it('replaying the same mission with the same seed gives the identical game', () => {
    const a = createWorld(campaign.maps[1]!, 0, 3);
    const b = createWorld(campaign.maps[1]!, 0, 3);
    autoplay(a, 120);
    autoplay(b, 120);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('every mission runs for two minutes of scripted play without errors', () => {
    for (const map of campaign.maps)
      map.missions.forEach((_, i) => {
        const w = createWorld(map, i, 11);
        expect(() => autoplay(w, 120)).not.toThrow();
      });
  });
});
