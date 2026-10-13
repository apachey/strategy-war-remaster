import { CELL, ObjectType } from '@sw/data';
import { AI_BRAINS, BUILDING_RULES, ENEMY_BONUS, HARVESTER, TICK_MS, UNIT_RULES, type AiBrain, type AiBrainName, type BuildingType, type UnitType } from './rules';
import { findPath } from './path';
import { canPlace, cellOf, cellPassable, centerOf, gapBetween, isUnit, isVisibleTo, issue, SIDES, type Entity, type Side, type World } from './world';

/**
 * The computer player of the remaster. It plays through the same commands as a person (issue()), so it can run
 * either side, and it only uses the world and its own state, so it stays deterministic and is stored in saves.
 *
 * Each decision round it: keeps harvesters mining, builds a silo, a factory and a few defender towers, produces
 * harvesters and tanks, sends home tanks at anything that attacks its buildings, and sends attack waves that
 * grow over time. Like a player who has seen the map before, it knows where the enemy buildings and resource
 * fields are, but it fires only at what its units can see.
 */
export interface AiState {
  side: Side;
  brain: AiBrainName;
  /** Bonus money per minute (computer enemy only), paid out a unit at a time. */
  income: number;
  incomeAcc: number;
  nextThinkTick: number;
  nextWaveTick: number;
  wave: number;
  /** Tanks produced so far; picks the next type from the brain's mix. */
  produced: number;
  /** Tanks out on an attack wave; everything else stays home and guards. */
  attackers: number[];
  /** Field each harvester was sent to, to learn which fields get harvesters killed. */
  harvesting: Record<number, number>;
  /** Fields where a harvester died; never mined again. */
  avoid: number[];
  /** Towers built in a hurry because the base was under attack; capped so a lost fight does not eat the bank. */
  emergencies: number;
  /** Where the current wave gathers out of reach of enemy towers before the assault, and when it set out. */
  stage: { x: number; y: number } | null;
  stageTick: number;
}

export function createAi(world: World, side: Side, brain: AiBrainName): AiState {
  const b: AiBrain = AI_BRAINS[brain];
  const bonus = side === 'enemy' && brain in ENEMY_BONUS ? ENEMY_BONUS[brain as keyof typeof ENEMY_BONUS] : null;
  return {
    side,
    brain,
    income: bonus?.incomePerMinute ?? 0,
    incomeAcc: 0,
    // Different sides think on different ticks, so neither always moves first.
    nextThinkTick: world.tick + (side === 'enemy' ? 1 : 0),
    nextWaveTick: world.tick + Math.round(b.firstWaveMs / TICK_MS),
    wave: 0,
    produced: 0,
    attackers: [],
    harvesting: {},
    avoid: [],
    emergencies: 0,
    stage: null,
    stageTick: 0,
  };
}

/** Runs every computer player once per tick, before units move. */
export function aiStep(world: World): void {
  for (const side of SIDES) {
    const ai = world.ai[side];
    if (!ai) continue;
    if (ai.income > 0) {
      ai.incomeAcc += ai.income * TICK_MS;
      while (ai.incomeAcc >= 60_000) {
        ai.incomeAcc -= 60_000;
        world.sides[side].money++;
      }
    }
    if (world.tick < ai.nextThinkTick) continue;
    ai.nextThinkTick = world.tick + Math.round(AI_BRAINS[ai.brain].thinkMs / TICK_MS);
    think(world, ai);
  }
}

interface View {
  world: World;
  ai: AiState;
  brain: AiBrain;
  side: Side;
  mine: Entity[];
  foes: Entity[];
  hq: Entity | undefined;
  tanks: Entity[];
  harvesters: Entity[];
  fields: Entity[];
}

/** A wave that has not gathered by then attacks anyway. */
const STAGE_TIMEOUT_MS = 90_000;

/** Towers it may build in a hurry over a whole mission. */
const MAX_EMERGENCY_TOWERS = 3;

/** Harvesters only mine fields this close to a silo. */
const HARVEST_RADIUS_CELLS = 16;

const isArmed = (e: Entity) => isUnit(e.type) && UNIT_RULES[e.type as UnitType].weapon !== null;
const hqTypeOf = (side: Side) => (side === 'player' ? ObjectType.PlayerHQ : ObjectType.EnemyHQ);

function dist2(a: Entity, b: { x: number; y: number }): number {
  const c = centerOf(a);
  return (c.x - b.x) ** 2 + (c.y - b.y) ** 2;
}

function closest<T extends Entity>(list: T[], to: { x: number; y: number }): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const e of list) {
    const d = dist2(e, to);
    if (d < bestD || (d === bestD && best && e.id < best.id)) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function think(world: World, ai: AiState): void {
  const side = ai.side;
  const mine = world.entities.filter((e) => e.team === side && e.hp > 0);
  const v: View = {
    world,
    ai,
    brain: AI_BRAINS[ai.brain],
    side,
    mine,
    foes: world.entities.filter((e) => e.team !== side && e.team !== 'neutral' && e.hp > 0),
    hq: mine.find((e) => e.type === hqTypeOf(side) && e.complete),
    tanks: mine.filter(isArmed),
    harvesters: mine.filter((e) => e.type === ObjectType.Harvester),
    fields: world.entities.filter((e) => e.type === ObjectType.ResourceField && e.hp > 0),
  };
  ai.attackers = ai.attackers.filter((id) => (world.byId.get(id)?.hp ?? 0) > 0);
  const reserved = construct(v);
  produce(v, reserved);
  harvest(v);
  guard(v);
  attack(v);
}

/** Where the base is: the HQ, or failing that any own building or unit. */
function home(v: View): { x: number; y: number } {
  const anchor = v.hq ?? v.mine.find((e) => !isUnit(e.type)) ?? v.mine[0];
  return anchor ? centerOf(anchor) : { x: 0, y: 0 };
}

function foeBase(v: View): { x: number; y: number } {
  const foeHq = v.foes.find((e) => e.type === hqTypeOf(v.side === 'player' ? 'enemy' : 'player'));
  const anchor = foeHq ?? v.foes.find((e) => !isUnit(e.type)) ?? v.foes[0];
  return anchor ? centerOf(anchor) : home(v);
}

// ---------------------------------------------------------------------------------------------------------------
// Economy

/** Builds what the base lacks. Returns true when it is saving up for a building, so production waits. */
function construct(v: View): boolean {
  const { world, side, hq, brain } = v;
  // On the training map the computer enemy only commands what the mission gave it.
  if (!hq || hq.job || !brain.builds || (world.training && side === 'enemy')) return false;
  const count = (type: number) => v.mine.filter((e) => e.type === type).length;
  const silos = count(ObjectType.Silo);
  const factories = count(ObjectType.TankFactory);
  let want: BuildingType | null = null;
  let toward = foeBase(v);
  let emergency = false;
  // Under attack with too few tanks to answer: a tower first, on the side the attack comes from.
  const threats = threatsTo(v);
  const homeTanks = v.tanks.filter((t) => !v.ai.attackers.includes(t.id)).length;
  if (threats.length > homeTanks && v.ai.emergencies < MAX_EMERGENCY_TOWERS && count(ObjectType.Defender) < threats.length + brain.defenders) {
    want = ObjectType.Defender;
    toward = centerOf(closest(threats, home(v))!);
    emergency = true;
  } else if (threats.length > 0 && factories > 0) {
    // No new silos in the middle of a fight; they would only be shot down again.
    return false;
  } else if (factories === 0 && v.harvesters.length === 0) {
    // A silo is no use before there is a harvester to fill it.
    want = ObjectType.TankFactory;
  } else if (silos === 0 && v.fields.length > 0 && threats.length === 0) want = ObjectType.Silo;
  else if (factories === 0) want = ObjectType.TankFactory;
  else if (v.harvesters.length > silos * 2) want = ObjectType.Silo;
  else if (count(ObjectType.Defender) < brain.defenders && v.tanks.length >= 2) want = ObjectType.Defender;
  if (want === null) return false;
  const price = BUILDING_RULES[want].price;
  if (world.sides[side].money < price) return want !== ObjectType.Defender;
  const spot = findSpot(v, want, toward);
  if (!spot) return false;
  if (issue(world, side, { kind: 'build', hqId: hq.id, building: want, cx: spot.cx, cy: spot.cy }).ok && emergency) v.ai.emergencies++;
  return false;
}

/**
 * A free spot near the HQ that keeps a one-cell lane around every building, so the base never walls itself in.
 * Towers go on the side facing the enemy.
 */
function findSpot(v: View, type: BuildingType, facing: { x: number; y: number }): { cx: number; cy: number } | null {
  const { world, side } = v;
  const n = BUILDING_RULES[type].cells;
  const base = home(v);
  const hc = { cx: Math.floor(base.x / CELL), cy: Math.floor(base.y / CELL) };
  const tower = type === ObjectType.Defender;
  const spots: Array<{ cx: number; cy: number; score: number }> = [];
  const foeTowers = v.foes.filter((f) => f.type === ObjectType.Defender);
  const towerReach = BUILDING_RULES[ObjectType.Defender].weapon!.range + CELL;
  for (let r = tower ? 3 : 2; r <= (tower ? 6 : 12); r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = hc.cx + dx - (n - 1);
        const cy = hc.cy + dy - (n - 1);
        if (!canPlace(world, side, type, cx, cy)) continue;
        // A cramped base may have to give up the lane around a building.
        const cramped = !hasLane(world, cx, cy, n);
        // Nothing but towers goes up where an enemy tower can shoot it, unless there is no other place.
        const probe = { x: cx * CELL, y: cy * CELL, size: n * CELL } as Entity;
        const exposed = !tower && foeTowers.some((t) => gapBetween(t, probe) <= towerReach);
        const px = (cx + n / 2) * CELL;
        const py = (cy + n / 2) * CELL;
        // Towers go toward the danger, everything else behind the HQ.
        const d = (px - facing.x) ** 2 + (py - facing.y) ** 2;
        spots.push({ cx, cy, score: (exposed ? 1e15 : 0) + (cramped ? 1e14 : 0) + (tower ? d : r * 1e9 - d) });
      }
  }
  spots.sort((a, b) => a.score - b.score);
  // The first few candidates that do not cut the map in two (a silo in a narrow pass would strand the army).
  const reach = reachableCount(world, -1, -1, 0);
  for (const s of spots.slice(0, 40)) if (reachableCount(world, s.cx, s.cy, n) === reach - n * n) return s;
  return null;
}

/**
 * Free cells minus 100 000 per separate area, pretending an n×n building stands at (bx, by). Placing a building
 * removes exactly n² cells from the count unless it also splits an area in two.
 */
function reachableCount(world: World, bx: number, by: number, n: number): number {
  const inside = (x: number, y: number) => x >= bx && x < bx + n && y >= by && y < by + n;
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < world.cols && y < world.rows && !inside(x, y) && cellPassable(world, x, y);
  const seen = new Uint8Array(world.cols * world.rows);
  let components = 0;
  let total = 0;
  for (let i = 0; i < seen.length; i++) {
    const x0 = i % world.cols;
    const y0 = (i - x0) / world.cols;
    if (seen[i] || !free(x0, y0)) continue;
    components++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length > 0) {
      const j = stack.pop()!;
      total++;
      const x = j % world.cols;
      const y = (j - x) / world.cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = (y + dy) * world.cols + x + dx;
        if (free(x + dx, y + dy) && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
  }
  return total - components * 100_000;
}

function hasLane(world: World, cx: number, cy: number, n: number): boolean {
  for (let y = cy - 1; y <= cy + n; y++)
    for (let x = cx - 1; x <= cx + n; x++) {
      if (x < 0 || y < 0 || x >= world.cols || y >= world.rows) continue;
      if (world.buildingAt[y * world.cols + x] !== 0) return false;
    }
  return true;
}

function produce(v: View, reserved: boolean): void {
  const { world, side, brain, ai } = v;
  const factories = v.mine.filter((e) => e.type === ObjectType.TankFactory && e.complete);
  const hasSilo = v.mine.some((e) => e.type === ObjectType.Silo);
  for (const f of factories) {
    if (f.job) continue;
    const harvesters = v.harvesters.length + factories.filter((o) => o.job?.kind === 'produce' && o.job.unit === ObjectType.Harvester).length;
    // A harvester pays for itself after three loads; on a nearly empty map the money goes into tanks.
    const left = minable(v).reduce((sum, f) => sum + f.hp, 0);
    // Each field that cost a harvester means one fewer harvester worth having.
    const wanted = Math.min(brain.harvesters - ai.avoid.length, Math.floor(left / (HARVESTER.capacity * 3)));
    if (harvesters < wanted && hasSilo) {
      if (world.sides[side].money >= UNIT_RULES[ObjectType.Harvester].price) {
        issue(world, side, { kind: 'produce', factoryId: f.id, unit: ObjectType.Harvester });
      }
      continue;
    }
    if (reserved) continue;
    const mix = brain.tankMix.filter((t) => side === 'enemy' || t !== ObjectType.EnemyTank);
    const unit = mix[ai.produced % mix.length]!;
    if (world.sides[side].money >= UNIT_RULES[unit].price && issue(world, side, { kind: 'produce', factoryId: f.id, unit }).ok) ai.produced++;
  }
}

/**
 * Fields worth sending a harvester to: not under an enemy tower, not where a harvester was lost, and close
 * enough to a silo (far fields are raider country).
 */
function minable(v: View): Entity[] {
  const towers = v.foes.filter((e) => e.type === ObjectType.Defender);
  const silos = v.mine.filter((e) => e.type === ObjectType.Silo);
  return v.fields.filter(
    (f) =>
      !v.ai.avoid.includes(f.id) &&
      !towers.some((t) => gapBetween(f, t) < 6 * CELL) &&
      (silos.length === 0 || silos.some((s) => gapBetween(f, s) <= HARVEST_RADIUS_CELLS * CELL)),
  );
}

function harvest(v: View): void {
  const { world, side } = v;
  const base = home(v);
  const { ai } = v;
  for (const [id, field] of Object.entries(ai.harvesting)) {
    if (world.byId.has(Number(id))) continue;
    delete ai.harvesting[Number(id)];
    if (!ai.avoid.includes(field)) ai.avoid.push(field);
  }
  // Better idle harvesters than dead ones: with every field unsafe, the money goes into tanks instead.
  const fields = minable(v);
  for (const h of v.harvesters) {
    // Turn back the others still driving to a field that just cost a harvester.
    if (h.order.kind === 'harvest' && h.phase === 'toField' && ai.avoid.includes(h.fieldId)) issue(world, side, { kind: 'stop', ids: [h.id] });
    if (h.order.kind === 'harvest') ai.harvesting[h.id] = h.fieldId || h.order.fieldId;
    if (h.order.kind !== 'idle') continue;
    const field = closest(fields, base);
    if (!field) return;
    ai.harvesting[h.id] = field.id;
    if (isVisibleTo(world, side, field)) issue(world, side, { kind: 'harvest', ids: [h.id], fieldId: field.id });
    else {
      const c = centerOf(field);
      issue(world, side, { kind: 'move', ids: [h.id], x: c.x, y: c.y });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Fighting

/** Armed enemies near any own building (walls aside). */
function threatsTo(v: View): Entity[] {
  const buildings = v.mine.filter((e) => !isUnit(e.type) && e.type !== ObjectType.Wall);
  const reach = v.brain.guardCells * CELL;
  const homeTanks = v.tanks.filter((t) => !v.ai.attackers.includes(t.id));
  const towerReach = BUILDING_RULES[ObjectType.Defender].weapon!.range + CELL;
  const near = v.foes.filter(
    (f) =>
      (isArmed(f) && !f.hidden && buildings.some((b) => gapBetween(f, b) <= reach)) ||
      // Raiders hunting the harvesters out in the field.
      (isArmed(f) && !f.hidden && isVisibleTo(v.world, v.side, f) && v.harvesters.some((h) => !h.hidden && gapBetween(f, h) <= 4 * CELL)) ||
      // An enemy tower that can shoot at the base or the tanks waiting in it.
      (f.type === ObjectType.Defender && [...buildings, ...homeTanks].some((b) => gapBetween(f, b) <= towerReach)),
  );
  // Enemies fenced in behind walls or forest are no threat; chasing them only throws tanks at the walls.
  const base = home(v);
  const to = { cx: Math.floor(base.x / CELL), cy: Math.floor(base.y / CELL) };
  return near.filter((f) => {
    const path = findPath(v.world.cols, v.world.rows, (cx, cy) => cellPassable(v.world, cx, cy), cellOf(f), to, true, 20_000);
    const end = path && path.length > 0 ? path[path.length - 1]! : cellOf(f);
    return Math.max(Math.abs(end.cx - to.cx), Math.abs(end.cy - to.cy)) <= 3;
  });
}

/** Home tanks drive at armed enemies that come near any own building, then return to the HQ. */
function guard(v: View): void {
  const { world, side, brain, ai } = v;
  const threats = threatsTo(v);
  const homeTanks = v.tanks.filter((t) => !ai.attackers.includes(t.id));
  const towers = v.foes.filter((f) => f.type === ObjectType.Defender);
  const towerReach = BUILDING_RULES[ObjectType.Defender].weapon!.range + CELL;
  const underFire = (e: Entity) => towers.some((f) => gapBetween(f, e) <= towerReach);
  const base = rallyPoint(v, underFire);
  for (const t of homeTanks) {
    const busy = t.order.kind === 'attack' || (t.order.kind === 'attackMove' && t.path.length > 0) || t.targetId !== 0;
    if (threats.length > 0) {
      if (busy) continue;
      const threat = closest(threats, centerOf(t))!;
      const c = centerOf(threat);
      issue(world, side, { kind: 'attackMove', ids: [t.id], x: c.x, y: c.y });
    } else if (t.order.kind === 'idle' && t.targetId === 0 && (underFire(t) || dist2(t, base) > (brain.guardCells * CELL) ** 2)) {
      issue(world, side, { kind: 'attackMove', ids: [t.id], x: base.x, y: base.y });
    }
  }
  if (brain.focusFire) focusFire(v, v.tanks);
}

/** A free cell near the base where no enemy tower reaches (some missions start with the factory under fire). */
function rallyPoint(v: View, underFire: (e: Entity) => boolean): { x: number; y: number } {
  const base = home(v);
  const c = { cx: Math.floor(base.x / CELL), cy: Math.floor(base.y / CELL) };
  for (let r = 1; r <= 10; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !cellPassable(v.world, c.cx + dx, c.cy + dy)) continue;
        const probe = { x: (c.cx + dx) * CELL, y: (c.cy + dy) * CELL, size: CELL } as Entity;
        if (!underFire(probe)) return centerOf(probe);
      }
  return base;
}

/** Every tank with several enemies in range shoots the weakest one, so targets die sooner. */
function focusFire(v: View, tanks: Entity[]): void {
  for (const t of tanks) {
    if (t.order.kind !== 'idle' && t.order.kind !== 'attackMove') continue;
    const range = UNIT_RULES[t.type as UnitType].weapon!.range;
    let best: Entity | null = null;
    for (const f of v.foes) {
      if (f.hidden || !isVisibleTo(v.world, v.side, f) || gapBetween(t, f) >= range) continue;
      if (f.type === ObjectType.Wall && t.targetId !== f.id) continue;
      const armed = isArmed(f) || f.type === ObjectType.Defender;
      if (!best || (armed ? 0 : 1) < (isArmed(best) || best.type === ObjectType.Defender ? 0 : 1) || f.hp < best.hp) best = f;
    }
    if (best) t.targetId = best.id;
  }
}

function pickTarget(v: View): Entity | undefined {
  const buildings = v.foes.filter((e) => !isUnit(e.type) && e.type !== ObjectType.Wall);
  const base = home(v);
  const foeHq = buildings.find((e) => e.type === hqTypeOf(v.side === 'player' ? 'enemy' : 'player'));
  switch (v.brain.targeting) {
    case 'hq':
      return foeHq ?? closest(buildings, base);
    case 'nearest':
      return closest(buildings, base);
    case 'economy': {
      const economy = buildings.filter((e) => e.type === ObjectType.Silo || e.type === ObjectType.TankFactory);
      const harvesters = v.foes.filter((e) => e.type === ObjectType.Harvester && !e.hidden);
      return closest(economy, base) ?? closest(harvesters, base) ?? foeHq ?? closest(buildings, base);
    }
  }
}

/** Sends a wave once enough tanks wait at home, and keeps waves rolling from target to target. */
function attack(v: View): void {
  const { world, side, brain, ai } = v;
  if (world.tick >= ai.nextWaveTick) {
    const ready = v.tanks.filter((t) => !ai.attackers.includes(t.id) && t.order.kind !== 'attack' && t.targetId === 0);
    const size = Math.min(brain.waveMax, brain.waveSize + ai.wave);
    // With no money coming in and nothing in production, waiting longer only lets the enemy grow.
    const building = v.mine.some((e) => e.job !== null);
    const cheapest = Math.min(...brain.tankMix.map((t) => UNIT_RULES[t].price));
    const mining = v.harvesters.some((h) => h.order.kind === 'harvest');
    const stalled = !building && !mining && world.sides[side].money < cheapest;
    if (ready.length >= size || (stalled && ready.length > 0)) {
      ai.attackers.push(...ready.map((t) => t.id));
      ai.wave++;
      ai.nextWaveTick = world.tick + Math.round(brain.waveCooldownMs / TICK_MS);
      const target = pickTarget(v);
      ai.stage = target ? stagingPoint(v, centerOf(target), ready[0]!) : null;
      ai.stageTick = world.tick;
    }
  }
  const target = pickTarget(v);
  if (!target) return;
  const wave = ai.attackers.map((id) => world.byId.get(id)!);
  // First gather just outside the enemy towers, so the whole wave goes in at once.
  if (ai.stage) {
    const stage = ai.stage;
    const there = wave.filter((t) => dist2(t, stage) <= (4 * CELL) ** 2).length;
    if (there * 3 >= wave.length * 2 || world.tick - ai.stageTick > Math.round(STAGE_TIMEOUT_MS / TICK_MS)) ai.stage = null;
  }
  const goal = ai.stage ?? centerOf(target);
  const idle = ai.attackers
    .map((id) => world.byId.get(id)!)
    .filter((t) => t.order.kind === 'idle' && t.targetId === 0);
  // Keep the wave together: tanks far ahead of the middle of the pack wait for the rest.
  const d = wave.map((t) => Math.sqrt(dist2(t, goal))).sort((a, b) => a - b);
  const middle = d[Math.floor(d.length / 2)] ?? 0;
  const ahead = (t: Entity) => Math.sqrt(dist2(t, goal)) < middle - 3 * CELL;
  const waiting = wave.filter((t) => ahead(t) && t.order.kind === 'attackMove' && t.targetId === 0);
  if (waiting.length > 0) issue(world, side, { kind: 'stop', ids: waiting.map((t) => t.id) });
  const go = idle.filter((t) => !ahead(t));
  if (go.length === 0) return;
  // Tanks that gave up far from the target are boxed in by their own walls: open a gate.
  const stuck = go.find((t) => dist2(t, goal) > (8 * CELL) ** 2);
  if (stuck) breach(v, stuck, goal);
  issue(world, side, { kind: 'attackMove', ids: go.map((t) => t.id), x: goal.x, y: goal.y });
}

/** The reachable cell closest to `goal` that no enemy tower covers. */
function stagingPoint(v: View, goal: { x: number; y: number }, from: Entity): { x: number; y: number } | null {
  const { world } = v;
  const towers = v.foes.filter((f) => f.type === ObjectType.Defender);
  if (towers.length === 0) return null;
  const reach = BUILDING_RULES[ObjectType.Defender].weapon!.range + 2 * CELL;
  const g = { cx: Math.floor(goal.x / CELL), cy: Math.floor(goal.y / CELL) };
  for (let r = 2; r <= 16; r++) {
    const ring: Array<{ cx: number; cy: number; d: number }> = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !cellPassable(world, g.cx + dx, g.cy + dy)) continue;
        const probe = { x: (g.cx + dx) * CELL, y: (g.cy + dy) * CELL, size: CELL } as Entity;
        if (towers.some((t) => gapBetween(t, probe) <= reach)) continue;
        ring.push({ cx: g.cx + dx, cy: g.cy + dy, d: dx * dx + dy * dy });
      }
    ring.sort((a, b) => a.d - b.d);
    for (const c of ring.slice(0, 4)) {
      const path = findPath(world.cols, world.rows, (cx, cy) => cellPassable(world, cx, cy), cellOf(from), c, false, 20_000);
      if (path) return { x: c.cx * CELL + CELL / 2, y: c.cy * CELL + CELL / 2 };
    }
  }
  return null;
}

/**
 * Plans a route that drives through own walls and enemy buildings, and destroys the first own wall on it.
 * Several missions start with the player fenced in by their own walls; a person would blow one up too.
 */
function breach(v: View, unit: Entity, goal: { x: number; y: number }): void {
  const { world, side } = v;
  const ownWall = (i: number) => {
    const id = world.buildingAt[i]!;
    const b = id ? world.byId.get(id) : undefined;
    return b?.team === side && b.type === ObjectType.Wall;
  };
  const passable = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= world.cols || cy >= world.rows) return false;
    const i = cy * world.cols + cx;
    if (world.blocked[i]) return false;
    const id = world.buildingAt[i]!;
    return id === 0 || ownWall(i) || world.byId.get(id)?.team !== side;
  };
  const to = { cx: Math.floor(goal.x / CELL), cy: Math.floor(goal.y / CELL) };
  const near = (c: { cx: number; cy: number } | undefined) => !!c && Math.max(Math.abs(c.cx - to.cx), Math.abs(c.cy - to.cy)) <= 2;
  // Only when there is no way around.
  const open = findPath(world.cols, world.rows, (cx, cy) => cellPassable(world, cx, cy), cellOf(unit), to, true, 20_000);
  if (open && near(open.length > 0 ? open[open.length - 1] : cellOf(unit))) return;
  const path = findPath(world.cols, world.rows, passable, cellOf(unit), to, true, 20_000);
  for (const c of path ?? []) {
    const i = c.cy * world.cols + c.cx;
    if (ownWall(i)) {
      issue(world, side, { kind: 'destruct', id: world.buildingAt[i]! });
      return;
    }
  }
}
