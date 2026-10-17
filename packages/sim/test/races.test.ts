import { describe, expect, it } from 'vitest';
import { campaign, ObjectType, spriteName } from '@sw/data';
import { canPlace, createSkirmish, createWorld, hashWorld, issue, loadWorld, raceOf, saveWorld, step, TICKS_PER_SECOND, type Side, type World } from '../src';

const run = (world: World, seconds: number) => {
  for (let i = 0; i < seconds * TICKS_PER_SECOND && world.outcome === 'playing'; i++) step(world);
};
const of = (world: World, team: Side, type: number) => world.entities.filter((e) => e.team === team && e.type === type);

/** Builds a factory next to the first side's HQ and has it produce a light tank. */
function lightTank(world: World) {
  const hq = of(world, 'player', ObjectType.PlayerHQ)[0]!;
  const spot = [...Array(49).keys()]
    .map((i) => ({ cx: Math.floor(hq.x / 15) + (i % 7) - 3, cy: Math.floor(hq.y / 15) + Math.floor(i / 7) - 3 }))
    .find((c) => canPlace(world, 'player', ObjectType.TankFactory, c.cx, c.cy))!;
  expect(issue(world, 'player', { kind: 'build', hqId: hq.id, building: ObjectType.TankFactory, ...spot })).toEqual({ ok: true });
  run(world, 15);
  const factory = of(world, 'player', ObjectType.TankFactory)[0]!;
  const before = world.sides.player.money;
  expect(issue(world, 'player', { kind: 'produce', factoryId: factory.id, unit: ObjectType.LightTank }).ok).toBe(true);
  const price = before - world.sides.player.money;
  run(world, 60);
  return { tank: of(world, 'player', ObjectType.LightTank)[0]!, price };
}

describe('races', () => {
  it('the campaign is olive humans against cyan hovers', () => {
    const w = createWorld(campaign.maps[0]!, 0);
    expect(w.sides.player).toMatchObject({ race: 'human', color: 'olive' });
    expect(w.sides.enemy).toMatchObject({ race: 'hover', color: 'cyan' });
    expect(raceOf(w, 'enemy')).toBe('hover');
    expect(raceOf(w, 'neutral')).toBeNull();
  });

  it('a skirmish takes the chosen races and colours, by default humans against hovers', () => {
    const w = createSkirmish(3, { opponent: 'hard', races: ['walker', 'human'], colors: ['blue', 'red'] });
    expect(w.sides.player).toMatchObject({ race: 'walker', color: 'blue' });
    expect(w.sides.enemy).toMatchObject({ race: 'human', color: 'red' });
    const d = createSkirmish(3, { opponent: 'human' });
    expect([d.sides.player.race, d.sides.enemy.race]).toEqual(['human', 'hover']);
    expect([d.sides.player.color, d.sides.enemy.color]).toEqual(['olive', 'cyan']);
  });

  it('refuses both sides in the same colour', () => {
    expect(() => createSkirmish(3, { opponent: 'easy', colors: ['red', 'red'] })).toThrow(/red/);
    expect(() => createWorld(campaign.maps[0]!, 0, 1, { colors: ['olive', 'olive'] })).toThrow();
  });

  it('secondary colours default to white and may repeat any colour', () => {
    const c = createWorld(campaign.maps[0]!, 0);
    expect([c.sides.player.color2, c.sides.enemy.color2]).toEqual(['white', 'white']);
    const d = createSkirmish(3, { opponent: 'human' });
    expect([d.sides.player.color2, d.sides.enemy.color2]).toEqual(['white', 'white']);
    // Both sides in black accents, and the second side's accent equal to its own main colour.
    const w = createSkirmish(3, { opponent: 'hard', colors: ['blue', 'red'], colors2: ['black', 'red'] });
    expect(w.sides.player).toMatchObject({ color: 'blue', color2: 'black' });
    expect(w.sides.enemy).toMatchObject({ color: 'red', color2: 'red' });
    const same = createWorld(campaign.maps[0]!, 0, 1, { colors2: ['olive', 'olive'] });
    expect([same.sides.player.color2, same.sides.enemy.color2]).toEqual(['olive', 'olive']);
  });

  it('a save keeps each side race and colours', () => {
    const w = createSkirmish(2, { opponent: 'normal', races: ['hover', 'walker'], colors: ['pink', 'white'], colors2: ['black', 'pink'] });
    const l = loadWorld(saveWorld(w));
    expect(l.sides.player).toMatchObject({ race: 'hover', color: 'pink', color2: 'black' });
    expect(l.sides.enemy).toMatchObject({ race: 'walker', color: 'white', color2: 'pink' });
    expect(hashWorld(l)).toBe(hashWorld(w));
  });

  it('a race changes no rule: a walker light tank costs and holds what a human one does', () => {
    const human = lightTank(createSkirmish(3, { opponent: 'human' }));
    const walker = lightTank(createSkirmish(3, { opponent: 'human', races: ['walker', 'hover'], colors: ['violet', 'orange'] }));
    expect(walker.price).toBe(human.price);
    expect(walker.tank.maxHp).toBe(human.tank.maxHp);
    // Two computer games that differ only in looks play out identically.
    const a = createSkirmish(4, { opponent: 'normal', playerAi: 'normal', seed: 3 });
    const b = createSkirmish(4, { opponent: 'normal', playerAi: 'normal', seed: 3, races: ['walker', 'walker'], colors: ['red', 'blue'] });
    run(a, 120);
    run(b, 120);
    expect(hashWorld(b)).toBe(hashWorld(a));
  });

  it('names the sprite of each object by race', () => {
    expect(spriteName('hover', ObjectType.EnemyHQ)).toBe('hover_hq');
    expect(spriteName('human', ObjectType.PlayerHQ)).toBe('human_hq');
    expect(spriteName('walker', ObjectType.LightTank)).toBe('walker_light_tank');
    expect(spriteName('hover', ObjectType.EnemyTank)).toBe('hover_middle_tank');
    expect(spriteName('walker', ObjectType.ResourceField)).toBe('resource');
  });
});
