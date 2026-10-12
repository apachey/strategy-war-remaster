import { ObjectType } from '@sw/data';
import { gapBetween, isUnit, isVisibleTo, issue, step, UNIT_RULES, type Entity, type UnitType, type World } from '../src';

/**
 * A blunt scripted player for tests: harvests with every harvester and drives every tank at the enemy HQ,
 * shooting through whatever enemy buildings are in the way. Returns the tick the mission ended on.
 */
export function autoplay(world: World, maxSeconds: number): number {
  const ehq = world.entities.find((e) => e.type === ObjectType.EnemyHQ)!;
  const limit = maxSeconds * 20;
  for (let i = 0; i < limit && world.outcome === 'playing'; i++) {
    if (i % 20 === 0) think(world, ehq);
    step(world);
  }
  return world.tick;
}

function think(world: World, ehq: Entity): void {
  const mine = world.entities.filter((e) => e.team === 'player' && isUnit(e.type) && e.hp > 0);
  for (const u of mine) {
    if (u.type === ObjectType.Harvester) {
      if (u.order.kind !== 'idle') continue;
      // The script knows the map: it drives toward the closest field until it comes out of the dark.
      const field = world.entities
        .filter((e) => e.type === ObjectType.ResourceField)
        .sort((a, b) => Math.abs(a.x - u.x) + Math.abs(a.y - u.y) - (Math.abs(b.x - u.x) + Math.abs(b.y - u.y)))[0];
      if (!field) continue;
      if (isVisibleTo(world, 'player', field)) issue(world, 'player', { kind: 'harvest', ids: [u.id], fieldId: field.id });
      else issue(world, 'player', { kind: 'move', ids: [u.id], x: field.x + 15, y: field.y + 15 });
      continue;
    }
    if (u.path.length > 0) continue;
    const range = UNIT_RULES[u.type as UnitType].weapon!.range;
    const current = u.order.kind === 'attack' ? world.byId.get(u.order.targetId) : undefined;
    if (current && gapBetween(u, current) < range) continue;
    const enemies = world.entities
      .filter((e) => e.team === 'enemy' && e.hp > 0 && isVisibleTo(world, 'player', e))
      .sort((a, b) => gapBetween(u, a) - gapBetween(u, b) || a.id - b.id);
    // Head for the HQ; if already stuck in front of something, shoot the closest enemy object instead.
    const target = isVisibleTo(world, 'player', ehq) && u.order.kind !== 'attack' ? ehq : enemies[0];
    if (target) issue(world, 'player', { kind: 'attack', ids: [u.id], targetId: target.id });
    else issue(world, 'player', { kind: 'move', ids: [u.id], x: ehq.x, y: ehq.y });
  }
}
