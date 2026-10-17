import { describe, expect, it } from 'vitest';
import { ObjectType, type CampaignMap, type MapObject } from '@sw/data';
import { createWorld, issue, loadWorld, saveWorld, step, TICKS_PER_SECOND, type World } from '../src';

function arena(objects: Array<Partial<MapObject> & { type: MapObject['type'] }>, money = 1000): World {
  const tiles = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 1));
  const map: CampaignMap = { name: 'Test', w: 10, h: 10, tiles, missions: [{ title: 'Test', brief: '', money, objects: objects.map((o) => ({ x: 0, y: 0, hp: 100, enemy: false, ...o })) }] };
  return createWorld(map, 0, 7);
}
const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) step(w);
};
const byType = (w: World, type: number) => w.entities.find((e) => e.type === type)!;

describe('stats for the victory screen', () => {
  it('count harvested crystals, built tanks and losses on both sides, and survive a save', () => {
    const w = arena([
      { type: ObjectType.PlayerHQ, x: 0, y: 0, hp: 150 },
      { type: ObjectType.EnemyHQ, x: 270, y: 270, hp: 150 },
      { type: ObjectType.Silo, x: 60, y: 0, hp: 100 },
      { type: ObjectType.TankFactory, x: 0, y: 60, hp: 100 },
      { type: ObjectType.ResourceField, x: 60, y: 60, hp: 500 },
      { type: ObjectType.Harvester, x: 30, y: 45, hp: 50 },
      { type: ObjectType.LightTank, x: 60, y: 150, hp: 70 },
      { type: ObjectType.Wall, x: 90, y: 150, hp: 14, enemy: true },
    ]);
    const tank = byType(w, ObjectType.LightTank);
    issue(w, 'player', { kind: 'harvest', ids: [byType(w, ObjectType.Harvester).id], fieldId: byType(w, ObjectType.ResourceField).id });
    issue(w, 'player', { kind: 'attack', ids: [tank.id], targetId: byType(w, ObjectType.Wall).id });
    issue(w, 'player', { kind: 'produce', factoryId: byType(w, ObjectType.TankFactory).id, unit: ObjectType.LightTank });
    run(w, 11);
    expect(w.sides.player.stats).toEqual({ harvested: 50, built: 1, lost: 0, buildingsLost: 0, killed: 1 });
    expect(w.sides.enemy.stats).toMatchObject({ buildingsLost: 1, lost: 0 });
    expect(loadWorld(saveWorld(w)).sides.player.stats.harvested).toBe(50);
  });
});
