import { describe, expect, it } from 'vitest';
import { campaign, ObjectType } from '@sw/data';
import { canPlace, createSkirmish, hashWorld, issue, loadWorld, saveWorld, skirmishLayout, step, TICKS_PER_SECOND, type World } from '../src';

const run = (world: World, seconds: number) => {
  for (let i = 0; i < seconds * TICKS_PER_SECOND && world.outcome === 'playing'; i++) step(world);
};
const of = (world: World, team: string, type?: number) => world.entities.filter((e) => e.team === team && (type === undefined || e.type === type));

describe('skirmish', () => {
  it('lays out every campaign map with two far apart bases and the same home fields', () => {
    campaign.maps.forEach((map) => {
      const { starts, fields } = skirmishLayout(map);
      const [a, b] = starts;
      expect(Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy))).toBeGreaterThanOrEqual(map.w);
      for (const s of starts) {
        const home = fields.filter((f) => f.amount === 3000 && Math.max(Math.abs(f.cx - s.cx), Math.abs(f.cy - s.cy)) <= 6);
        expect(home.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  it('starts both sides equal: an HQ, a harvester and the same money', () => {
    const w = createSkirmish(3, { opponent: 'human', money: 1500 });
    expect(w.mode).toBe('skirmish');
    for (const side of ['player', 'enemy'] as const) {
      expect(w.sides[side].money).toBe(1500);
      expect(of(w, side).map((e) => e.type).sort()).toEqual([side === 'player' ? ObjectType.PlayerHQ : ObjectType.EnemyHQ, ObjectType.Harvester].sort());
    }
    expect(w.ai.enemy).toBeUndefined();
  });

  it('a person on the second side commands it like the first: builds, produces, no free raiders', () => {
    const w = createSkirmish(3, { opponent: 'human' });
    const hq = of(w, 'enemy', ObjectType.EnemyHQ)[0]!;
    // The first free spot three cells from the HQ.
    const spot = [...Array(49).keys()]
      .map((i) => ({ cx: Math.floor(hq.x / 15) + (i % 7) - 3, cy: Math.floor(hq.y / 15) + Math.floor(i / 7) - 3 }))
      .find((c) => Math.max(Math.abs(c.cx - hq.x / 15), Math.abs(c.cy - hq.y / 15)) === 3 && canPlace(w, 'enemy', ObjectType.TankFactory, c.cx, c.cy))!;
    expect(issue(w, 'enemy', { kind: 'build', hqId: hq.id, building: ObjectType.TankFactory, ...spot })).toEqual({ ok: true });
    run(w, 15);
    const factory = of(w, 'enemy', ObjectType.TankFactory)[0]!;
    expect(factory.complete).toBe(true);
    // The campaign enemy's own tank belongs to the campaign; skirmish sides build the same four vehicles.
    expect(issue(w, 'enemy', { kind: 'produce', factoryId: factory.id, unit: ObjectType.EnemyTank }).ok).toBe(false);
    expect(issue(w, 'enemy', { kind: 'produce', factoryId: factory.id, unit: ObjectType.LightTank }).ok).toBe(true);
    run(w, 60);
    expect(of(w, 'enemy', ObjectType.LightTank)).toHaveLength(1);
    expect(of(w, 'enemy', ObjectType.EnemyTank)).toHaveLength(0);
    // Each person only commands their own side.
    const tank = of(w, 'enemy', ObjectType.LightTank)[0]!;
    expect(issue(w, 'player', { kind: 'stop', ids: [tank.id] })).toEqual({ ok: true });
    expect(issue(w, 'player', { kind: 'move', ids: [tank.id], x: 0, y: 0 }).ok).toBe(false);
  });

  it('losing your HQ loses the game for either side', () => {
    const a = createSkirmish(0, { opponent: 'human' });
    issue(a, 'enemy', { kind: 'destruct', id: of(a, 'enemy', ObjectType.EnemyHQ)[0]!.id });
    run(a, 3);
    expect(a.outcome).toBe('won');
    const b = createSkirmish(0, { opponent: 'human' });
    issue(b, 'player', { kind: 'destruct', id: of(b, 'player', ObjectType.PlayerHQ)[0]!.id });
    run(b, 3);
    expect(b.outcome).toBe('lost');
  });

  it('the computer opponent builds its base from nothing on every difficulty', () => {
    for (const opponent of ['easy', 'normal', 'hard'] as const) {
      const w = createSkirmish(6, { opponent });
      run(w, 240);
      expect(of(w, 'enemy', ObjectType.TankFactory).length, opponent).toBeGreaterThanOrEqual(1);
      expect(of(w, 'enemy', ObjectType.Silo).length, opponent).toBeGreaterThanOrEqual(1);
      expect(of(w, 'enemy').filter((e) => [ObjectType.LightTank, ObjectType.MiddleTank, ObjectType.HeavyTank].includes(e.type as never)).length, opponent).toBeGreaterThanOrEqual(1);
    }
  });

  // Both starts must be playable: the stronger brain wins from either side on every map.
  it.each(campaign.maps.map((m, i) => [i + 1, m.name] as const))('map %i (%s) can be won from both starts', (n) => {
    const left = createSkirmish(n - 1, { opponent: 'easy', playerAi: 'hard' });
    run(left, 1500);
    expect(left.outcome, 'hard on the first start vs easy').toBe('won');
    const right = createSkirmish(n - 1, { opponent: 'hard', playerAi: 'easy' });
    run(right, 1500);
    expect(right.outcome, 'easy on the first start vs hard').toBe('lost');
  });

  // Difficulty means something: on all 7 maps from both starts, normal beats easy every time and hard beats normal
  // most of the time.
  it('normal beats easy and hard mostly beats normal', { timeout: 120_000 }, () => {
    const wins = (strong: 'normal' | 'hard', weak: 'easy' | 'normal') => {
      let n = 0;
      for (let m = 0; m < campaign.maps.length; m++) {
        const left = createSkirmish(m, { opponent: weak, playerAi: strong });
        run(left, 1800);
        const right = createSkirmish(m, { opponent: strong, playerAi: weak });
        run(right, 1800);
        n += Number(left.outcome === 'won') + Number(right.outcome === 'lost');
      }
      return n;
    };
    expect(wins('normal', 'easy')).toBe(14);
    expect(wins('hard', 'normal')).toBeGreaterThanOrEqual(9);
  });

  it('is deterministic and survives a save', () => {
    const a = createSkirmish(4, { opponent: 'normal', playerAi: 'normal', seed: 5 });
    const b = createSkirmish(4, { opponent: 'normal', playerAi: 'normal', seed: 5 });
    run(a, 120);
    run(b, 120);
    expect(hashWorld(a)).toBe(hashWorld(b));
    const c = loadWorld(saveWorld(a));
    expect(c.mode).toBe('skirmish');
    run(a, 120);
    run(c, 120);
    expect(hashWorld(c)).toBe(hashWorld(a));
  });
});
