import { describe, expect, it } from 'vitest';
import { campaign, CELL, ObjectType, type CampaignMap, type MapObject } from '@sw/data';
import {
  BUILDING_RULES,
  CHASE_CELLS,
  cellOf,
  createWorld,
  issue,
  productionLine,
  spawnUnit,
  step,
  TICKS_PER_SECOND,
  UNIT_RULES,
  type GameEvent,
  type World,
  type WorldOptions,
} from '../src';

/** Version 1.1 gameplay: one test per change (docs/rules.md, "Remaster changes in 1.1"). */

/** A 10×10 tile sand map (20×20 cells); forest tiles are listed as [tx, ty]. */
function arena(objects: Array<Partial<MapObject> & { type: MapObject['type'] }>, money = 1000, forest: Array<[number, number]> = [], options: WorldOptions = {}): World {
  const tiles = Array.from({ length: 10 }, (_, ty) => Array.from({ length: 10 }, (_, tx) => (forest.some(([x, y]) => x === tx && y === ty) ? 6 : 1)));
  const map: CampaignMap = {
    name: 'Test',
    w: 10,
    h: 10,
    tiles,
    missions: [{ title: 'Test', brief: '', money, objects: objects.map((o) => ({ x: 0, y: 0, hp: 100, enemy: false, ...o })) }],
  };
  return createWorld(map, 0, 7, options);
}

const HQS = [
  { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
  { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150, enemy: true },
] as const;

/** Runs the world and returns every event on the way. */
function run(world: World, seconds: number, each?: () => void): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    step(world);
    events.push(...world.events);
    each?.();
  }
  return events;
}
const byType = (world: World, type: number) => world.entities.find((e) => e.type === type)!;

describe('version 1.1', () => {
  it('units see 4 cells, every weapon reaches one cell less, shells fly at new speeds, a factory costs 500', () => {
    expect(UNIT_RULES[ObjectType.LightTank].weapon).toMatchObject({ range: 2 * CELL, speed: 340 });
    expect(UNIT_RULES[ObjectType.MiddleTank].weapon).toMatchObject({ range: 3 * CELL, speed: 65 });
    expect(UNIT_RULES[ObjectType.HeavyTank].weapon!.range).toBe(3 * CELL);
    expect(BUILDING_RULES[ObjectType.Defender].weapon!.range).toBe(4 * CELL);
    expect(BUILDING_RULES[ObjectType.TankFactory].price).toBe(500);
    const w = arena([...HQS, { type: ObjectType.LightTank, x: 150, y: 150, hp: 70 }]);
    const explored = w.sides.player.explored;
    expect(explored[10 * w.cols + 14]).toBe(1);
    expect(explored[10 * w.cols + 15]).toBe(0);
  });

  it('an idle tank goes after an enemy it sees, then drives back to where it stood', () => {
    const w = arena([...HQS, { type: ObjectType.MiddleTank, x: 60, y: 150, hp: 100 }, { type: ObjectType.Defender, x: 120, y: 150, hp: 15, enemy: true }]);
    const tank = byType(w, ObjectType.MiddleTank);
    run(w, 15);
    expect(w.entities.some((e) => e.type === ObjectType.Defender)).toBe(false);
    expect(cellOf(tank)).toEqual({ cx: 4, cy: 10 });
    expect(tank.home).toBeNull();
  });

  it('a tank shot from afar chases the shooter no more than 6 cells, then returns', () => {
    const w = arena([...HQS, { type: ObjectType.HeavyTank, x: 30, y: 150, hp: 120 }, { type: ObjectType.Defender, x: 255, y: 150, hp: 500, enemy: true }]);
    const tank = byType(w, ObjectType.HeavyTank);
    tank.hitBy = byType(w, ObjectType.Defender).id;
    tank.hitTick = 0;
    let farthest = 0;
    run(w, 20, () => (farthest = Math.max(farthest, cellOf(tank).cx)));
    expect(farthest).toBeGreaterThan(4);
    expect(farthest).toBeLessThanOrEqual(2 + CHASE_CELLS + 1);
    expect(cellOf(tank)).toEqual({ cx: 2, cy: 10 });
  });

  it('the turret turns to the target on its own, the hull keeps facing where it drove', () => {
    const w = arena([...HQS, { type: ObjectType.LightTank, x: 150, y: 150, hp: 70 }, { type: ObjectType.Wall, x: 150, y: 120, hp: 50, enemy: true }]);
    const tank = byType(w, ObjectType.LightTank);
    tank.dir = 2;
    issue(w, 'player', { kind: 'attack', ids: [tank.id], targetId: byType(w, ObjectType.Wall).id });
    const events = run(w, 1);
    expect(events.some((e) => e.kind === 'shot')).toBe(true);
    expect(tank.turretDir).toBe(0);
    expect(tank.dir).toBe(2);
  });

  it('nobody fires through forest', () => {
    // Forest tile (4, 5) covers cells 8–9 of rows 10–11, right between the two.
    const w = arena([...HQS, { type: ObjectType.MiddleTank, x: 105, y: 150, hp: 100 }, { type: ObjectType.Defender, x: 150, y: 150, hp: 80, enemy: true }], 0, [[4, 5]]);
    const tank = byType(w, ObjectType.MiddleTank);
    issue(w, 'player', { kind: 'stop', ids: [tank.id] });
    tank.home = { ...cellOf(tank), back: true };
    const events = run(w, 0.5);
    expect(events.some((e) => e.kind === 'shot')).toBe(false);
  });

  it('mission 1.1: the gate in the middle is forest now, other missions keep their walls', () => {
    const w = createWorld(campaign.maps[0]!, 0);
    for (const cx of [10, 11, 12]) expect(w.blocked[5 * w.cols + cx]).toBe(1);
    expect(w.entities.some((e) => e.type === ObjectType.Wall && e.y === 5 * CELL && e.x >= 10 * CELL && e.x <= 12 * CELL)).toBe(false);
    const w2 = createWorld(campaign.maps[0]!, 1);
    expect(w2.blocked[5 * w2.cols + 11]).toBe(0);
  });

  it('a factory queues up to 5 units, pays for each when it starts and sends them to the rally point', () => {
    const w = arena([...HQS, { type: ObjectType.TankFactory, x: 60, y: 60, hp: 100 }], 300);
    const f = byType(w, ObjectType.TankFactory);
    for (let i = 0; i < 5; i++) expect(issue(w, 'player', { kind: 'produce', factoryId: f.id, unit: ObjectType.LightTank })).toEqual({ ok: true });
    expect(issue(w, 'player', { kind: 'produce', factoryId: f.id, unit: ObjectType.LightTank })).toEqual({ ok: false, reason: 'busy' });
    expect(w.sides.player.money).toBe(200);
    expect(issue(w, 'player', { kind: 'cancel', id: f.id })).toEqual({ ok: true });
    expect(productionLine(f)).toHaveLength(4);
    expect(w.sides.player.money).toBe(200);
    issue(w, 'player', { kind: 'rally', factoryId: f.id, x: 157, y: 157 });
    run(w, 26);
    const tanks = w.entities.filter((e) => e.type === ObjectType.LightTank);
    expect(tanks).toHaveLength(3);
    expect(w.sides.player.money).toBe(0);
    expect(productionLine(f)).toEqual([ObjectType.LightTank]);
    for (const t of tanks) expect(Math.max(Math.abs(cellOf(t).cx - 10), Math.abs(cellOf(t).cy - 10))).toBeLessThanOrEqual(2);
  });

  it('shift-click adds route points that units drive in turn', () => {
    const w = arena([...HQS, { type: ObjectType.LightTank, x: 30, y: 150, hp: 70 }]);
    const tank = byType(w, ObjectType.LightTank);
    issue(w, 'player', { kind: 'move', ids: [tank.id], x: 157, y: 157 });
    issue(w, 'player', { kind: 'move', ids: [tank.id], x: 157, y: 37, queue: true });
    let passed = false;
    run(w, 12, () => (passed ||= cellOf(tank).cx === 10 && cellOf(tank).cy === 10));
    expect(passed).toBe(true);
    expect(cellOf(tank)).toEqual({ cx: 10, cy: 2 });
  });

  it('units that stop on the same cell spread out', () => {
    const w = arena([...HQS, { type: ObjectType.LightTank, x: 30, y: 150, hp: 70 }, { type: ObjectType.LightTank, x: 30, y: 180, hp: 70 }]);
    const [a, b] = w.entities.filter((e) => e.type === ObjectType.LightTank);
    issue(w, 'player', { kind: 'move', ids: [a!.id], x: 157, y: 157 });
    issue(w, 'player', { kind: 'move', ids: [b!.id], x: 157, y: 157 });
    run(w, 10);
    expect(cellOf(a!)).not.toEqual(cellOf(b!));
    expect(a!.x % CELL === 0 && b!.y % CELL === 0).toBe(true);
  });

  it('a new route never sends a unit back to the cell it is leaving', () => {
    const w = arena([...HQS, { type: ObjectType.LightTank, x: 30, y: 150, hp: 70 }]);
    const tank = byType(w, ObjectType.LightTank);
    issue(w, 'player', { kind: 'move', ids: [tank.id], x: 157, y: 157 });
    run(w, 0.3);
    expect(tank.x % CELL).not.toBe(0);
    let x = tank.x;
    issue(w, 'player', { kind: 'move', ids: [tank.id], x: 217, y: 157 });
    run(w, 3, () => {
      expect(tank.x).toBeGreaterThanOrEqual(x);
      x = tank.x;
    });
  });

  it('a full harvester with nowhere to unload tells the player why', () => {
    const w = arena([...HQS, { type: ObjectType.Harvester, x: 150, y: 150, hp: 50 }, { type: ObjectType.ResourceField, x: 210, y: 150, hp: 500 }]);
    const h = byType(w, ObjectType.Harvester);
    h.cargo = 50;
    issue(w, 'player', { kind: 'harvest', ids: [h.id], fieldId: byType(w, ObjectType.ResourceField).id });
    let events = run(w, 1);
    expect(events.filter((e) => e.kind === 'harvesterNotice')).toEqual([expect.objectContaining({ id: h.id, notice: 'noSilo' })]);
    // A silo walled off by forest.
    const walled = arena([...HQS, { type: ObjectType.Harvester, x: 30, y: 150, hp: 50 }, { type: ObjectType.Silo, x: 240, y: 30, hp: 100 }], 0, [
      [7, 0], [9, 0], [7, 1], [9, 1], [7, 2], [8, 2], [9, 2],
    ]);
    const h2 = byType(walled, ObjectType.Harvester);
    h2.cargo = 50;
    h2.order = { kind: 'harvest', fieldId: 0 };
    h2.phase = 'toSilo';
    events = run(walled, 1);
    expect(events.some((e) => e.kind === 'harvesterNotice' && e.notice === 'siloBlocked')).toBe(true);
    expect(h2.notice).toBe('siloBlocked');
  });

  it('the computer sends its home tanks after whoever breaks into its walled base', () => {
    // The enemy half is walled off; the player's heavy tank shoots its way through to the silo.
    const wall = Array.from({ length: 20 }, (_, cy) => ({ type: ObjectType.Wall, x: 120, y: cy * CELL, hp: 50, enemy: true }));
    const w = arena(
      [
        { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
        { type: ObjectType.EnemyHQ, x: 240, y: 240, hp: 150, enemy: true },
        { type: ObjectType.Silo, x: 135, y: 135, hp: 100, enemy: true },
        { type: ObjectType.HeavyTank, x: 90, y: 135, hp: 120 },
        ...wall,
      ],
      0,
      [],
      { difficulty: 'normal' },
    );
    const tank = byType(w, ObjectType.HeavyTank);
    const guard = spawnUnit(w, ObjectType.MiddleTank, 'enemy', 16, 9);
    issue(w, 'player', { kind: 'attack', ids: [tank.id], targetId: byType(w, ObjectType.Silo).id });
    run(w, 1.5);
    expect(guard.order.kind).toBe('idle');
    run(w, 3);
    expect(guard.order).toEqual({ kind: 'attack', targetId: tank.id });
  });

  it('an attack on a building pings the minimap once, and the muzzle flash gives the shooter away', () => {
    const w = arena([...HQS, { type: ObjectType.Wall, x: 150, y: 150, hp: 500 }]);
    const wall = byType(w, ObjectType.Wall);
    const heavy = spawnUnit(w, ObjectType.HeavyTank, 'enemy', 13, 10);
    const behind = 10 * w.cols + 14;
    expect(w.sides.player.explored[behind]).toBe(0);
    issue(w, 'enemy', { kind: 'attack', ids: [heavy.id], targetId: wall.id });
    const events = run(w, 6);
    expect(events.filter((e) => e.kind === 'underAttack')).toEqual([expect.objectContaining({ team: 'player', id: wall.id })]);
    expect(w.sides.player.explored[behind]).toBe(1);
  });
});
