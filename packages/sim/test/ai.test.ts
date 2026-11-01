import { describe, expect, it } from 'vitest';
import { campaign, ObjectType, type CampaignMap, type MapObject } from '@sw/data';
import { createWorld, hashWorld, issue, loadWorld, SAVE_VERSION, saveWorld, step, TICKS_PER_SECOND, type World, type WorldOptions } from '../src';

/** A 20×10 tile sand map (40×20 cells) with the given objects. */
function arena(objects: Array<Partial<MapObject> & { type: MapObject['type'] }>, money: number, options: WorldOptions): World {
  const tiles = Array.from({ length: 10 }, () => Array.from({ length: 20 }, () => 1));
  const map: CampaignMap = {
    name: 'Test',
    w: 20,
    h: 10,
    tiles,
    missions: [{ title: 'Test', brief: '', money, objects: objects.map((o) => ({ x: 0, y: 0, hp: 100, enemy: false, ...o })) }],
  };
  return createWorld(map, 0, 7, options);
}

const run = (world: World, seconds: number) => {
  for (let i = 0; i < seconds * TICKS_PER_SECOND && world.outcome === 'playing'; i++) step(world);
};
const count = (world: World, team: string, type: number) => world.entities.filter((e) => e.team === team && e.type === type).length;

describe('computer enemy', () => {
  const base = [
    { type: ObjectType.PlayerHQ, x: 30, y: 120, hp: 150 },
    { type: ObjectType.EnemyHQ, x: 510, y: 120, hp: 150, enemy: true },
    { type: ObjectType.ResourceField, x: 450, y: 60, hp: 2000 },
  ];

  it('classic keeps the original enemy: no money, no building', () => {
    const w = arena(base, 0, { difficulty: 'classic' });
    run(w, 60);
    expect(w.ai.enemy).toBeUndefined();
    expect(w.sides.enemy.money).toBe(0);
    expect(w.entities.filter((e) => e.team === 'enemy')).toHaveLength(1);
  });

  it('builds a silo and a factory, then harvests with its own harvesters', () => {
    // $600 keeps the idle player in the game: a factory and a tank (1.2 ends it for a side that can do nothing).
    const w = arena(base, 600, { difficulty: 'normal' });
    expect(w.sides.enemy.money).toBe(700);
    run(w, 300);
    expect(count(w, 'enemy', ObjectType.Silo)).toBe(1);
    expect(count(w, 'enemy', ObjectType.TankFactory)).toBe(1);
    expect(count(w, 'enemy', ObjectType.Harvester)).toBeGreaterThanOrEqual(1);
    run(w, 60);
    const field = w.entities.find((e) => e.type === ObjectType.ResourceField)!;
    expect(field.hp).toBeLessThan(2000);
  });

  it('fields the same tank types as the player and sends them at the player base in waves', () => {
    const w = arena(base, 600, { difficulty: 'hard' });
    run(w, 240);
    const types = new Set(w.entities.filter((e) => e.team === 'enemy').map((e) => e.type));
    expect(types.has(ObjectType.MiddleTank) || types.has(ObjectType.HeavyTank)).toBe(true);
    expect(w.ai.enemy!.wave).toBeGreaterThanOrEqual(1);
    // With nothing to stop them, the waves take the player HQ.
    run(w, 600);
    expect(w.outcome).toBe('lost');
  });

  it('home tanks answer an attack on the base', () => {
    const w = arena(
      [...base, { type: ObjectType.EnemyTank, x: 480, y: 180, hp: 100 }, { type: ObjectType.EnemyTank, x: 495, y: 180, hp: 100 }, { type: ObjectType.LightTank, x: 420, y: 120, hp: 70 }],
      0,
      { difficulty: 'normal' },
    );
    run(w, 2);
    const raiders = w.entities.filter((e) => e.type === ObjectType.EnemyTank);
    expect(raiders.every((r) => r.order.kind === 'attackMove' || r.targetId !== 0)).toBe(true);
    run(w, 30);
    expect(count(w, 'player', ObjectType.LightTank)).toBe(0);
  });

  it('on the training map it commands its units but never builds', () => {
    const w = createWorld(campaign.maps[0]!, 1, 1, { difficulty: 'hard' });
    expect(w.training).toBe(true);
    const before = w.entities.filter((e) => e.team === 'enemy' && e.type !== ObjectType.EnemyTank).length;
    run(w, 120);
    expect(w.entities.filter((e) => e.team === 'enemy' && e.type !== ObjectType.EnemyTank && e.type !== ObjectType.Wall).length).toBeLessThanOrEqual(before);
    expect(count(w, 'enemy', ObjectType.TankFactory)).toBe(0);
  });

  it('stays deterministic', () => {
    const a = createWorld(campaign.maps[3]!, 1, 3, { difficulty: 'hard', playerAi: 'autoplay' });
    const b = createWorld(campaign.maps[3]!, 1, 3, { difficulty: 'hard', playerAi: 'autoplay' });
    run(a, 120);
    run(b, 120);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});

describe('attack-move', () => {
  it('stops to fight an enemy tank on the way, then drives on', () => {
    const w = arena(
      [
        { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
        { type: ObjectType.EnemyHQ, x: 570, y: 270, hp: 150, enemy: true },
        { type: ObjectType.MiddleTank, x: 30, y: 150, hp: 100 },
        { type: ObjectType.EnemyTank, x: 210, y: 150, hp: 30 },
      ],
      0,
      {},
    );
    const tank = w.entities.find((e) => e.type === ObjectType.MiddleTank)!;
    expect(issue(w, 'player', { kind: 'attackMove', ids: [tank.id], x: 400, y: 157 })).toEqual({ ok: true });
    run(w, 20);
    expect(w.entities.some((e) => e.type === ObjectType.EnemyTank)).toBe(false);
    run(w, 30);
    expect(Math.abs(tank.x - 400)).toBeLessThanOrEqual(30);
  });

  it('shoots through an enemy wall that blocks the only road', () => {
    const wall = Array.from({ length: 20 }, (_, cy) => ({ type: ObjectType.Wall, x: 300, y: cy * 15, hp: 50, enemy: true }));
    const w = arena(
      [{ type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 }, { type: ObjectType.EnemyHQ, x: 570, y: 270, hp: 150, enemy: true }, { type: ObjectType.HeavyTank, x: 60, y: 150, hp: 120 }, ...wall],
      0,
      {},
    );
    const tank = w.entities.find((e) => e.type === ObjectType.HeavyTank)!;
    issue(w, 'player', { kind: 'attackMove', ids: [tank.id], x: 450, y: 157 });
    run(w, 90);
    expect(tank.x).toBeGreaterThan(300);
  });
});

describe('cheat codes of the original', () => {
  it('1298* shows the whole map, 12986 adds 1000, 12989 repairs', () => {
    const w = createWorld(campaign.maps[0]!, 0, 1);
    expect(w.sides.player.explored.includes(0)).toBe(true);
    issue(w, 'player', { kind: 'cheat', cheat: 'reveal' });
    expect(w.sides.player.explored.includes(0)).toBe(false);
    const money = w.sides.player.money;
    issue(w, 'player', { kind: 'cheat', cheat: 'money' });
    expect(w.sides.player.money).toBe(money + 1000);
    const hq = w.entities.find((e) => e.type === ObjectType.PlayerHQ)!;
    hq.hp = 10;
    issue(w, 'player', { kind: 'cheat', cheat: 'repair', id: hq.id });
    expect(hq.hp).toBe(hq.maxHp);
  });
});

describe('saves', () => {
  it('a loaded game continues exactly like the one that was saved', () => {
    const live = createWorld(campaign.maps[5]!, 1, 9, { difficulty: 'normal', playerAi: 'autoplay' });
    run(live, 100);
    const json = JSON.stringify(saveWorld(live));
    const loaded = loadWorld(JSON.parse(json));
    expect(hashWorld(loaded)).toBe(hashWorld(live));
    run(live, 120);
    run(loaded, 120);
    expect(hashWorld(loaded)).toBe(hashWorld(live));
    expect(JSON.stringify(saveWorld(loaded))).toBe(JSON.stringify(saveWorld(live)));
  });

  it('a save is a snapshot: the game going on does not change it', () => {
    const w = createWorld(campaign.maps[0]!, 0, 1);
    const save = saveWorld(w);
    const before = JSON.stringify(save);
    run(w, 10);
    issue(w, 'player', { kind: 'cheat', cheat: 'money' });
    expect(JSON.stringify(save)).toBe(before);
  });

  it('refuses saves from another version', () => {
    const save = saveWorld(createWorld(campaign.maps[0]!, 0, 1));
    expect(() => loadWorld({ ...save, version: 99 as typeof SAVE_VERSION })).toThrow(/version/);
  });
});
