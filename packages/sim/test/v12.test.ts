import { describe, expect, it } from 'vitest';
import { CELL, ObjectType, type CampaignMap, type MapObject } from '@sw/data';
import { createWorld, issue, step, TICKS_PER_SECOND, UNIT_RULES, type Entity, type GameEvent, type World } from '../src';

/** Version 1.2 gameplay: one test per change (docs/rules.md, "Version 1.2 changes"). */

/** A 10×10 tile sand map (20×20 cells). */
function arena(objects: Array<Partial<MapObject> & { type: MapObject['type'] }>, money = 1000): World {
  const tiles = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 1));
  const map: CampaignMap = {
    name: 'Test',
    w: 10,
    h: 10,
    tiles,
    missions: [{ title: 'Test', brief: '', money, objects: objects.map((o) => ({ x: 0, y: 0, hp: 100, enemy: false, ...o })) }],
  };
  return createWorld(map, 0, 7);
}

const HQS = [
  { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
  { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150, enemy: true },
] as const;

function run(world: World, seconds: number, each?: () => void): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    step(world);
    events.push(...world.events);
    each?.();
  }
  return events;
}
const all = (world: World, type: number) => world.entities.filter((e) => e.type === type);
const overlap = (a: Entity, b: Entity) => a.x < b.x + b.size && b.x < a.x + a.size && a.y < b.y + b.size && b.y < a.y + a.size;

describe('version 1.2', () => {
  it('tanks attacking the same target do not end up standing in one cell', () => {
    const w = arena([...HQS, { type: ObjectType.LightTank, x: 120, y: 120, hp: 70 }, { type: ObjectType.LightTank, x: 135, y: 120, hp: 70 }]);
    const [a, b] = all(w, ObjectType.LightTank);
    const hq = all(w, ObjectType.EnemyHQ)[0]!;
    issue(w, 'player', { kind: 'cheat', cheat: 'reveal' });
    expect(issue(w, 'player', { kind: 'attack', ids: [a!.id, b!.id], targetId: hq.id }).ok).toBe(true);
    run(w, 12);
    expect(hq.hp).toBeLessThan(150);
    expect(overlap(a!, b!)).toBe(false);
  });

  it('a shell hits only its target and flies over other enemies on the way', () => {
    const w = arena([...HQS, { type: ObjectType.MiddleTank, x: 225, y: 270, hp: 100 }, { type: ObjectType.Wall, x: 255, y: 270, hp: 50, enemy: true }]);
    const hq = all(w, ObjectType.EnemyHQ)[0]!;
    const wall = all(w, ObjectType.Wall)[0]!;
    issue(w, 'player', { kind: 'cheat', cheat: 'reveal' });
    issue(w, 'player', { kind: 'attack', ids: [all(w, ObjectType.MiddleTank)[0]!.id], targetId: hq.id });
    run(w, 6);
    expect(hq.hp).toBeLessThan(150);
    expect(wall.hp).toBe(50);
  });

  it('self-destruct blows the unit up on the next step, with an explosion event and the loss counted', () => {
    const w = arena([...HQS, { type: ObjectType.LightTank, x: 120, y: 120, hp: 70 }, { type: ObjectType.Harvester, x: 60, y: 60, hp: 50 }]);
    const tank = all(w, ObjectType.LightTank)[0]!;
    expect(issue(w, 'player', { kind: 'destruct', id: tank.id }).ok).toBe(true);
    step(w);
    expect(w.events).toContainEqual(expect.objectContaining({ kind: 'destroyed', id: tank.id }));
    expect(w.byId.has(tank.id)).toBe(false);
    expect(w.sides.player.stats.lost).toBe(1);
  });

  it('the heavy tank outranges the middle tank by a cell', () => {
    expect(UNIT_RULES[ObjectType.HeavyTank].weapon!.range).toBe(4 * CELL);
    expect(UNIT_RULES[ObjectType.MiddleTank].weapon!.range).toBe(3 * CELL);
  });

  it('a side with no units and no way to get one loses, even with its HQ standing', () => {
    const poor = arena([...HQS, { type: ObjectType.Harvester, x: 60, y: 60, hp: 50 }], 100);
    const rich = arena([...HQS, { type: ObjectType.Harvester, x: 60, y: 60, hp: 50 }], 700);
    for (const w of [poor, rich]) {
      run(w, 2);
      expect(w.outcome).toBe('playing');
      issue(w, 'player', { kind: 'destruct', id: all(w, ObjectType.Harvester)[0]!.id });
      run(w, 5);
    }
    expect(poor.outcome).toBe('lost');
    // $700 still buys a factory ($500) and a light tank ($100).
    expect(rich.outcome).toBe('playing');
  });
});
