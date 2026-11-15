import { describe, expect, it } from 'vitest';
import { campaign, ObjectType, type CampaignMap, type MapObject } from '@sw/data';
import { createSkirmish, createWorld, ENEMY_BONUS, gapBetween, spawnUnit, step, TICKS_PER_SECOND, type Entity, type World, type WorldOptions } from '../src';

/** Smarter computer player (1.3): repair, retreat, scouting and outposts, strength-timed waves, very hard. */

function arena(objects: Array<Partial<MapObject> & { type: MapObject['type'] }>, money: number, options: WorldOptions): World {
  const tiles = Array.from({ length: 10 }, () => Array.from({ length: 20 }, () => 1));
  const map: CampaignMap = {
    name: 'Test',
    w: 20,
    h: 10,
    tiles,
    missions: [{ title: 'Test', brief: '', money, objects: objects.map((o) => ({ x: 0, y: 0, hp: 100, enemy: false, ...o })) }],
  };
  const w = createWorld(map, 0, 7, options);
  w.sides.player.explored.fill(1);
  w.sides.enemy.explored.fill(1);
  return w;
}
const run = (world: World, seconds: number) => {
  for (let i = 0; i < seconds * TICKS_PER_SECOND && world.outcome === 'playing'; i++) step(world);
};
const unit = (w: World, team: string, type: number) => w.entities.find((e) => e.team === team && e.type === type)!;
const damaged = (e: Entity, hp: number) => {
  e.hp = hp;
  return e;
};

describe('smarter computer player', () => {
  it('repairs a unit standing beside its own factory, for half its price, and not one standing elsewhere', () => {
    const w = arena(
      [
        { type: ObjectType.PlayerHQ, x: 30, y: 120, hp: 150 },
        { type: ObjectType.TankFactory, x: 90, y: 30, hp: 100 },
        { type: ObjectType.EnemyHQ, x: 510, y: 120, hp: 150, enemy: true },
      ],
      1000,
      { difficulty: 'classic' },
    );
    const medium = damaged(spawnUnit(w, ObjectType.MiddleTank, 'player', 8, 2), 20);
    const light = damaged(spawnUnit(w, ObjectType.LightTank, 'player', 30, 2), 20);
    run(w, 10);
    expect(medium.hp).toBe(60);
    expect(light.hp).toBe(20);
    run(w, 60);
    expect(medium.hp).toBe(100);
    // 80 hit points of a 150 tank at half price: 60.
    expect(w.sides.player.money).toBe(1000 - 60);
  });

  it('sends a badly damaged tank home for repair instead of fighting on', () => {
    const w = arena(
      [
        { type: ObjectType.PlayerHQ, x: 30, y: 120, hp: 150 },
        { type: ObjectType.EnemyHQ, x: 510, y: 120, hp: 150, enemy: true },
      ],
      600,
      { difficulty: 'veryhard' },
    );
    w.sides.enemy.money = 2000;
    const tank = damaged(spawnUnit(w, ObjectType.MiddleTank, 'enemy', 20, 8), 30);
    run(w, 1);
    expect(w.ai.enemy!.repairing).toContain(tank.id);
    run(w, 40);
    expect(tank.x).toBeGreaterThan(450);
    expect(tank.hp).toBeGreaterThan(30);
  });

  it('keeps its wave home while the enemy army outweighs it', () => {
    const play = (playerTanks: number) => {
      const w = arena([{ type: ObjectType.PlayerHQ, x: 30, y: 120, hp: 150 }, { type: ObjectType.EnemyHQ, x: 510, y: 120, hp: 150, enemy: true }], 0, { difficulty: 'veryhard' });
      for (let i = 0; i < playerTanks; i++) spawnUnit(w, ObjectType.MiddleTank, 'player', 2 + (i % 3), 2 + Math.floor(i / 3));
      for (let i = 0; i < 6; i++) spawnUnit(w, ObjectType.MiddleTank, 'enemy', 32 + (i % 3), 2 + Math.floor(i / 3));
      w.ai.enemy!.nextWaveTick = 0;
      run(w, 5);
      return w.ai.enemy!.wave;
    };
    expect(play(9)).toBe(0);
    expect(play(2)).toBe(1);
  });

  it('very hard gets no bonus money, scouts the far fields and builds a silo out there', () => {
    expect(ENEMY_BONUS.veryhard.incomePerMinute).toBe(0);
    const mission = createWorld(campaign.maps[3]!, 0, 1, { difficulty: 'veryhard' });
    expect(mission.sides.enemy.money).toBe(campaign.maps[3]!.missions[0]!.money);
    // Map 7 has fields between the bases. With its home fields nearly mined out, it scouts them and builds a silo there.
    const w = createSkirmish(6, { opponent: 'veryhard', playerAi: 'easy' });
    const hq = unit(w, 'enemy', ObjectType.EnemyHQ);
    const away = (e: Entity) => Math.hypot(e.x - hq.x, e.y - hq.y);
    for (const f of w.entities) if (f.type === ObjectType.ResourceField && gapBetween(f, hq) <= 10 * 15) f.hp = 100;
    let scouted = false;
    let posted = false;
    for (let i = 0; i < 420 * TICKS_PER_SECOND && w.outcome === 'playing'; i++) {
      step(w);
      scouted ||= w.ai.enemy!.scout !== null;
      posted ||= (w.ai.enemy!.outpost?.ids.length ?? 0) > 0;
    }
    expect(scouted).toBe(true);
    expect(posted).toBe(true);
    expect(w.entities.filter((e) => e.team === 'enemy' && e.type === ObjectType.Silo && away(e) > 8 * 15).length).toBeGreaterThanOrEqual(1);
  });
});
