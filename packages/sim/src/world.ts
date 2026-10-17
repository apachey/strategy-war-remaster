import {
  campaign,
  CAMPAIGN_RACES,
  CELL,
  DEFAULT_COLORS,
  ObjectType,
  TILE_FOREST,
  type CampaignMap,
  type MapObject,
  type Race,
  type TeamColor,
} from '@sw/data';
import { aiStep, createAi, type AiState } from './ai';
import { findPath, type Cell } from './path';
import { nextRandom } from './rng';
import {
  BUILDING_RULES,
  ENEMY_BONUS,
  ENEMY_FACTORY_PAUSE_MS,
  ENEMY_MAX_TANKS,
  FACTORY_BUILDS,
  HARVESTER,
  OUTCOME_DELAY_MS,
  RAIDER_WANDER_CELLS,
  TICK_MS,
  TRAINING_MAPS,
  UNIT_RULES,
  UNIT_SIGHT_CELLS,
  type AiBrainName,
  type BuildingType,
  type Difficulty,
  type UnitType,
  type Weapon,
} from './rules';

/** The two sides that fight. Resource fields belong to nobody. */
export type Side = 'player' | 'enemy';
export type Team = Side | 'neutral';
export const SIDES: readonly Side[] = ['player', 'enemy'];

export type Order =
  | { kind: 'idle' }
  /** Walk to a point (pixel coordinates of the unit's centre). */
  | { kind: 'move'; x: number; y: number }
  /** Drive to a point but stop to fight whatever enemy comes into range on the way. */
  | { kind: 'attackMove'; x: number; y: number }
  | { kind: 'attack'; targetId: number }
  | { kind: 'harvest'; fieldId: number }
  | { kind: 'defend'; targetId: number };

export type HarvestPhase = 'toField' | 'loading' | 'toSilo' | 'unloading';

export type Job =
  | { kind: 'construct'; siteId: number }
  | { kind: 'produce'; unit: UnitType; elapsedMs: number; totalMs: number; price: number };

export interface Entity {
  id: number;
  type: ObjectType;
  team: Team;
  /** Top-left corner in map pixels (original 30 px tile scale). */
  x: number;
  y: number;
  /** Footprint in pixels: 30 for most buildings, 15 for units, walls and defenders. */
  size: number;
  hp: number;
  maxHp: number;
  /** Facing, 0 = up, clockwise in 45° steps, as in the original sprite sheets. */
  dir: number;
  /** False while a building is still under construction. */
  complete: boolean;
  buildElapsedMs: number;
  buildTotalMs: number;

  // Units.
  order: Order;
  path: Cell[];
  moveMs: number;
  targetId: number;
  reloadMs: number;
  repathMs: number;
  cargo: number;
  phase: HarvestPhase | null;
  /** Field a harvester returns to after unloading. */
  fieldId: number;
  /** A harvester inside a silo is hidden and cannot be shot. */
  hidden: boolean;

  // Buildings.
  job: Job | null;
  /** Harvester currently unloading into this silo. */
  dockedId: number;
  /** Enemy factory: time since the last raider left. */
  pauseMs: number;
}

export interface Projectile {
  id: number;
  team: Side;
  weapon: 'gun' | 'cannon';
  x: number;
  y: number;
  /** Pixels per tick. */
  vx: number;
  vy: number;
  /** Pixels left before the shell falls short. */
  left: number;
  damage: number;
}

export type GameEvent =
  | { kind: 'shot'; x: number; y: number; weapon: 'gun' | 'cannon'; team: Side }
  | { kind: 'hit'; x: number; y: number; weapon: 'gun' | 'cannon' }
  | { kind: 'destroyed'; type: ObjectType; team: Team; x: number; y: number; size: number }
  | { kind: 'completed'; id: number; type: ObjectType };

export interface SideState {
  /** How the side looks: its race and team colour. Neither changes any rule. */
  race: Race;
  color: TeamColor;
  money: number;
  /** 1 = cell has been seen. The original has a classic shroud: once seen, always shown. */
  explored: Uint8Array;
}

export type Outcome = 'playing' | 'won' | 'lost';

/** A campaign mission from the original, or a skirmish on one of its maps (against the computer or a second person). */
export type Mode = 'campaign' | 'skirmish';

export interface World {
  /** Map size in 15 px cells. */
  cols: number;
  rows: number;
  /** 1 = forest (impassable), row-major, cols * rows. */
  blocked: Uint8Array;
  /** Id of the building standing on each cell, 0 when free. Resource fields are drivable and not stored here. */
  buildingAt: Int32Array;
  entities: Entity[];
  byId: Map<number, Entity>;
  projectiles: Projectile[];
  sides: Record<Side, SideState>;
  tick: number;
  /** State of the seeded PRNG; read it only through random(). */
  rngState: number;
  difficulty: Difficulty;
  mode: Mode;
  /** Computer players by side. Without one for the enemy, the enemy behaves exactly like the original. */
  ai: Partial<Record<Side, AiState>>;
  /** The training map: a computer enemy there commands its units but never builds. */
  training: boolean;
  nextId: number;
  outcome: Outcome;
  /** Tick at which a decided mission reports its outcome, after the original's short pause. */
  pendingOutcome: { outcome: Exclude<Outcome, 'playing'>; atTick: number } | null;
  /** What happened during the last step, for sounds and effects. Cleared at the start of every step. */
  events: GameEvent[];
}

const UNIT_TYPES: ReadonlySet<number> = new Set(Object.keys(UNIT_RULES).map(Number));

export function isUnit(type: ObjectType): type is UnitType {
  return UNIT_TYPES.has(type);
}

export function footprint(type: ObjectType): number {
  return isUnit(type) ? CELL : BUILDING_RULES[type as BuildingType].cells * CELL;
}

function teamOf(o: MapObject): Team {
  // In the original only type 100 tanks belong to the enemy; player units ignore the flag.
  if (o.type === ObjectType.EnemyTank || o.type === ObjectType.EnemyHQ) return 'enemy';
  if (o.type === ObjectType.ResourceField) return 'neutral';
  if (isUnit(o.type)) return 'player';
  return o.enemy ? 'enemy' : 'player';
}

export function buildBlockedGrid(map: CampaignMap): { cols: number; rows: number; blocked: Uint8Array } {
  const cols = map.w * 2;
  const rows = map.h * 2;
  const blocked = new Uint8Array(cols * rows);
  map.tiles.forEach((row, ty) =>
    row.forEach((tile, tx) => {
      const quarters = TILE_FOREST[tile];
      if (!quarters) return;
      for (let qy = 0; qy < 2; qy++)
        for (let qx = 0; qx < 2; qx++)
          if (quarters[qy]![qx]) blocked[(ty * 2 + qy) * cols + tx * 2 + qx] = 1;
    }),
  );
  return { cols, rows, blocked };
}

function newEntity(id: number, type: ObjectType, team: Team, x: number, y: number, hp: number): Entity {
  return {
    id,
    type,
    team,
    x,
    y,
    size: footprint(type),
    hp,
    maxHp: hp,
    dir: 4,
    complete: true,
    buildElapsedMs: 0,
    buildTotalMs: 0,
    order: { kind: 'idle' },
    path: [],
    moveMs: 0,
    targetId: 0,
    reloadMs: 0,
    repathMs: 0,
    cargo: 0,
    phase: null,
    fieldId: 0,
    hidden: false,
    job: null,
    dockedId: 0,
    pauseMs: 0,
  };
}

export interface WorldOptions {
  /** Default 'classic', the original enemy. */
  difficulty?: Difficulty;
  /** Hand the player side to a computer brain too (tests and demos). */
  playerAi?: AiBrainName;
  /** Default 'campaign'. */
  mode?: Mode;
  /** Races of the two seats, [player, enemy]. Default humans against hovers, as in the campaign. */
  races?: readonly [Race, Race];
  /** Team colours of the two seats, [player, enemy]; they must differ. Default olive and cyan. */
  colors?: readonly [TeamColor, TeamColor];
}

export function createWorld(map: CampaignMap, missionIndex: number, seed = 1, options: WorldOptions = {}): World {
  const difficulty = options.difficulty ?? 'classic';
  const mission = map.missions[missionIndex];
  if (!mission) throw new Error(`Map "${map.name}" has no mission ${missionIndex + 1}`);
  const [playerRace, enemyRace] = options.races ?? CAMPAIGN_RACES;
  const [playerColor, enemyColor] = options.colors ?? DEFAULT_COLORS;
  if (playerColor === enemyColor) throw new Error(`Both sides cannot wear ${playerColor}`);
  const grid = buildBlockedGrid(map);
  const cells = grid.cols * grid.rows;
  const world: World = {
    ...grid,
    buildingAt: new Int32Array(cells),
    entities: [],
    byId: new Map(),
    projectiles: [],
    sides: {
      player: { race: playerRace, color: playerColor, money: mission.money, explored: new Uint8Array(cells) },
      enemy: { race: enemyRace, color: enemyColor, money: 0, explored: new Uint8Array(cells) },
    },
    tick: 0,
    rngState: seed >>> 0,
    difficulty,
    mode: options.mode ?? 'campaign',
    ai: {},
    training: campaign.maps.indexOf(map) >= 0 && campaign.maps.indexOf(map) < TRAINING_MAPS,
    nextId: 1,
    outcome: 'playing',
    pendingOutcome: null,
    events: [],
  };
  for (const o of mission.objects) {
    // Hit points come from the mission file: placed units are often weaker than freshly built ones.
    addEntity(world, newEntity(world.nextId++, o.type, teamOf(o), o.x, o.y, o.hp));
  }
  if (difficulty !== 'classic') {
    world.ai.enemy = createAi(world, 'enemy', difficulty);
    world.sides.enemy.money = ENEMY_BONUS[difficulty].money;
  }
  if (options.playerAi) world.ai.player = createAi(world, 'player', options.playerAi);
  return world;
}

/** Race of the side an object belongs to; resource fields belong to nobody. */
export function raceOf(world: World, team: Team): Race | null {
  return team === 'neutral' ? null : world.sides[team].race;
}

/** Puts a fresh unit of `team` on a cell, as if it had just left a factory. */
export function spawnUnit(world: World, type: UnitType, team: Side, cx: number, cy: number): Entity {
  const u = newEntity(world.nextId++, type, team, cx * CELL, cy * CELL, UNIT_RULES[type].hp);
  addEntity(world, u);
  return u;
}

/** Next number in [0, 1) from the world's seeded PRNG. */
export function random(world: World): number {
  const r = nextRandom(world.rngState);
  world.rngState = r.state;
  return r.value;
}

function addEntity(world: World, e: Entity): void {
  world.entities.push(e);
  world.byId.set(e.id, e);
  if (!isUnit(e.type) && e.type !== ObjectType.ResourceField) markBuilding(world, e, e.id);
  if (e.team !== 'neutral') reveal(world, e.team, e);
}

function markBuilding(world: World, e: Entity, value: number): void {
  const n = e.size / CELL;
  const cx0 = Math.floor(e.x / CELL);
  const cy0 = Math.floor(e.y / CELL);
  for (let dy = 0; dy < n; dy++)
    for (let dx = 0; dx < n; dx++) {
      const cx = cx0 + dx;
      const cy = cy0 + dy;
      if (cx >= 0 && cy >= 0 && cx < world.cols && cy < world.rows) world.buildingAt[cy * world.cols + cx] = value;
    }
}

/** Reveals the shroud around an object: a square of radius r cells with the four corners cut, like the original. */
function reveal(world: World, side: Side, e: Entity): void {
  const r = isUnit(e.type) ? UNIT_SIGHT_CELLS : (e.size / CELL) * 2;
  // Centred on the top-left cell, exactly like the original.
  const cx = Math.floor(e.x / CELL);
  const cy = Math.floor(e.y / CELL);
  const explored = world.sides[side].explored;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) === r && Math.abs(dy) === r) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && y >= 0 && x < world.cols && y < world.rows) explored[y * world.cols + x] = 1;
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry helpers

export function centerOf(e: Entity): { x: number; y: number } {
  return { x: e.x + e.size / 2, y: e.y + e.size / 2 };
}

export function cellOf(e: Entity): Cell {
  return { cx: Math.floor((e.x + e.size / 2) / CELL), cy: Math.floor((e.y + e.size / 2) / CELL) };
}

/** Edge-to-edge distance in pixels along the worse axis, the measure the original uses for ranges. */
export function gapBetween(a: Entity, b: Entity): number {
  const half = (a.size + b.size) / 2;
  const ca = centerOf(a);
  const cb = centerOf(b);
  return Math.max(Math.abs(ca.x - cb.x) - half, Math.abs(ca.y - cb.y) - half);
}

function overlaps(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.size && b.x < a.x + a.size && a.y < b.y + b.size && b.y < a.y + a.size;
}

function dirToward(dx: number, dy: number, fallback: number): number {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  if (sx === 0 && sy === 0) return fallback;
  // 0 up, 1 up-right, 2 right, ... 7 up-left.
  const table: Record<string, number> = { '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3, '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7 };
  return table[`${sx},${sy}`]!;
}

export function cellPassable(world: World, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= world.cols || cy >= world.rows) return false;
  const i = cy * world.cols + cx;
  return world.blocked[i] === 0 && world.buildingAt[i] === 0;
}

function canStand(world: World, x: number, y: number, size: number): boolean {
  if (x < 0 || y < 0 || x + size > world.cols * CELL || y + size > world.rows * CELL) return false;
  const cx0 = Math.floor(x / CELL);
  const cy0 = Math.floor(y / CELL);
  const cx1 = Math.floor((x + size - 1) / CELL);
  const cy1 = Math.floor((y + size - 1) / CELL);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (!cellPassable(world, cx, cy)) return false;
  return true;
}

/** Nearest passable cell to `goal` in growing rings, preferring cells closer to `from` within a ring. */
function nearestPassable(world: World, goal: Cell, from: Cell, maxRing = 9): Cell | null {
  if (cellPassable(world, goal.cx, goal.cy)) return goal;
  for (let r = 1; r <= maxRing; r++) {
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const c = { cx: goal.cx + dx, cy: goal.cy + dy };
        if (!cellPassable(world, c.cx, c.cy)) continue;
        const d = (c.cx - from.cx) ** 2 + (c.cy - from.cy) ** 2;
        if (d < bestD) {
          best = c;
          bestD = d;
        }
      }
    if (best) return best;
  }
  return null;
}

/** Plans a route to `goal`, or as close to it as the map allows (walls and forest can seal a base off). */
function setPathTo(world: World, e: Entity, goal: Cell): boolean {
  const from = cellOf(e);
  const target = nearestPassable(world, goal, from) ?? goal;
  e.path = [];
  const path = findPath(world.cols, world.rows, (cx, cy) => cellPassable(world, cx, cy), from, target, true);
  if (!path) return false;
  // Snap back onto the grid first, so diagonal steps never clip a forest corner.
  if (e.x !== from.cx * CELL || e.y !== from.cy * CELL) path.unshift(from);
  e.path = path;
  return path.length > 0;
}

function pathToward(world: World, e: Entity, target: Entity): boolean {
  return setPathTo(world, e, cellOf(target));
}

function stopMoving(e: Entity): void {
  e.path = [];
  e.moveMs = 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Commands

export type Command =
  | { kind: 'move'; ids: number[]; x: number; y: number }
  | { kind: 'attackMove'; ids: number[]; x: number; y: number }
  | { kind: 'attack'; ids: number[]; targetId: number }
  | { kind: 'harvest'; ids: number[]; fieldId: number }
  | { kind: 'defend'; ids: number[]; targetId: number }
  | { kind: 'stop'; ids: number[] }
  | { kind: 'build'; hqId: number; building: BuildingType; cx: number; cy: number }
  | { kind: 'produce'; factoryId: number; unit: UnitType }
  | { kind: 'cancel'; id: number }
  | { kind: 'destruct'; id: number }
  /** The original's cheat codes: 1298* reveals the map, 12986 adds 1000, 12989 repairs an object. */
  | { kind: 'cheat'; cheat: 'reveal' | 'money' | 'repair'; id?: number };

export type CommandResult = { ok: true } | { ok: false; reason: 'no-money' | 'blocked' | 'busy' | 'invalid' };

const OK: CommandResult = { ok: true };
const fail = (reason: Exclude<CommandResult, { ok: true }>['reason']): CommandResult => ({ ok: false, reason });

/** True when `side` may see `e`: its own objects always, anything else once its cells were explored. */
export function isVisibleTo(world: World, side: Side, e: Entity): boolean {
  if (e.team === side) return true;
  if (e.hidden) return false;
  const n = e.size / CELL;
  const cx0 = Math.floor(e.x / CELL);
  const cy0 = Math.floor(e.y / CELL);
  const explored = world.sides[side].explored;
  for (let dy = 0; dy < Math.max(1, n); dy++)
    for (let dx = 0; dx < Math.max(1, n); dx++) {
      const cx = Math.min(world.cols - 1, cx0 + dx);
      const cy = Math.min(world.rows - 1, cy0 + dy);
      if (explored[cy * world.cols + cx]) return true;
    }
  return false;
}

function ownUnits(world: World, side: Side, ids: number[]): Entity[] {
  const out: Entity[] = [];
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const e = world.byId.get(id);
    if (e && e.team === side && isUnit(e.type) && e.hp > 0) out.push(e);
  }
  return out;
}

function leaveSilo(world: World, e: Entity): void {
  if (!e.hidden) return;
  e.hidden = false;
  for (const s of world.entities) if (s.dockedId === e.id) s.dockedId = 0;
}

function giveOrder(world: World, e: Entity, order: Order): void {
  leaveSilo(world, e);
  e.order = order;
  e.targetId = 0;
  e.repathMs = 0;
  e.phase = null;
  stopMoving(e);
}

/** Validates and applies one command from `side`. Invalid commands change nothing. */
export function issue(world: World, side: Side, cmd: Command): CommandResult {
  if (world.outcome !== 'playing') return fail('invalid');
  switch (cmd.kind) {
    case 'move': {
      const units = ownUnits(world, side, cmd.ids);
      if (units.length === 0) return fail('invalid');
      const slots = formationCells(world, units, { cx: Math.floor(cmd.x / CELL), cy: Math.floor(cmd.y / CELL) });
      units.forEach((u, i) => {
        const slot = slots[i];
        giveOrder(world, u, { kind: 'move', x: cmd.x, y: cmd.y });
        if (!slot || !setPathTo(world, u, slot)) u.order = { kind: 'idle' };
      });
      return OK;
    }
    case 'attackMove': {
      const units = ownUnits(world, side, cmd.ids).filter((u) => UNIT_RULES[u.type as UnitType].weapon);
      if (units.length === 0) return fail('invalid');
      const slots = formationCells(world, units, { cx: Math.floor(cmd.x / CELL), cy: Math.floor(cmd.y / CELL) });
      units.forEach((u, i) => {
        giveOrder(world, u, { kind: 'attackMove', x: cmd.x, y: cmd.y });
        const slot = slots[i];
        if (!slot || !setPathTo(world, u, slot)) u.order = { kind: 'idle' };
      });
      return OK;
    }
    case 'attack': {
      const target = world.byId.get(cmd.targetId);
      if (!target || target.team === side || target.team === 'neutral' || !isVisibleTo(world, side, target)) return fail('invalid');
      const units = ownUnits(world, side, cmd.ids).filter((u) => UNIT_RULES[u.type as UnitType].weapon);
      if (units.length === 0) return fail('invalid');
      for (const u of units) giveOrder(world, u, { kind: 'attack', targetId: target.id });
      return OK;
    }
    case 'harvest': {
      const field = world.byId.get(cmd.fieldId);
      if (!field || field.type !== ObjectType.ResourceField || !isVisibleTo(world, side, field)) return fail('invalid');
      const units = ownUnits(world, side, cmd.ids).filter((u) => u.type === ObjectType.Harvester);
      if (units.length === 0) return fail('invalid');
      for (const u of units) {
        const cargo = u.cargo;
        giveOrder(world, u, { kind: 'harvest', fieldId: field.id });
        u.fieldId = field.id;
        u.phase = cargo >= HARVESTER.capacity ? 'toSilo' : 'toField';
      }
      return OK;
    }
    case 'defend': {
      const guard = world.byId.get(cmd.targetId);
      if (!guard || guard.team !== side) return fail('invalid');
      const units = ownUnits(world, side, cmd.ids).filter((u) => UNIT_RULES[u.type as UnitType].weapon && u.id !== guard.id);
      if (units.length === 0) return fail('invalid');
      for (const u of units) giveOrder(world, u, { kind: 'defend', targetId: guard.id });
      return OK;
    }
    case 'stop': {
      for (const u of ownUnits(world, side, cmd.ids)) {
        // A harvester keeps unloading if it is already inside a silo.
        if (u.hidden) continue;
        giveOrder(world, u, { kind: 'idle' });
      }
      return OK;
    }
    case 'build':
      return build(world, side, cmd.hqId, cmd.building, cmd.cx, cmd.cy);
    case 'produce':
      return produce(world, side, cmd.factoryId, cmd.unit);
    case 'cancel':
      return cancel(world, side, cmd.id);
    case 'destruct': {
      const e = world.byId.get(cmd.id);
      if (!e || e.team !== side || e.hp <= 0) return fail('invalid');
      e.hp = 0;
      removeDead(world);
      return OK;
    }
    case 'cheat':
      return cheat(world, side, cmd.cheat, cmd.id);
  }
}

/** Distinct free cells around `goal` for a group move, nearest first, each claimed by the closest unit. */
function formationCells(world: World, units: Entity[], goal: Cell): Cell[] {
  const free: Cell[] = [];
  for (let r = 0; r <= 6 && free.length < units.length; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const c = { cx: goal.cx + dx, cy: goal.cy + dy };
        if (cellPassable(world, c.cx, c.cy)) free.push(c);
      }
  const slots: Cell[] = [];
  const taken = new Set<number>();
  units.forEach((u, i) => {
    let best = -1;
    let bestD = Infinity;
    const from = cellOf(u);
    free.slice(0, units.length).forEach((c, j) => {
      if (taken.has(j)) return;
      const d = (c.cx - from.cx) ** 2 + (c.cy - from.cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    if (best >= 0) {
      taken.add(best);
      slots[i] = free[best]!;
    } else slots[i] = goal;
  });
  return slots;
}

/** Whether `side` may place `type` with its top-left cell at (cx, cy). */
export function canPlace(world: World, side: Side, type: BuildingType, cx: number, cy: number): boolean {
  const n = BUILDING_RULES[type].cells;
  const explored = world.sides[side].explored;
  for (let dy = 0; dy < n; dy++)
    for (let dx = 0; dx < n; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!cellPassable(world, x, y)) return false;
      if (!explored[y * world.cols + x]) return false;
    }
  const probe = { x: cx * CELL, y: cy * CELL, size: n * CELL } as Entity;
  for (const e of world.entities) {
    if ((isUnit(e.type) || e.type === ObjectType.ResourceField) && !e.hidden && overlaps(probe, e)) return false;
  }
  return true;
}

function build(world: World, side: Side, hqId: number, type: BuildingType, cx: number, cy: number): CommandResult {
  const hq = world.byId.get(hqId);
  // The computer enemy builds from its own HQ; the original enemy never builds.
  const hqType = side === 'player' ? ObjectType.PlayerHQ : ObjectType.EnemyHQ;
  if (!hq || hq.team !== side || hq.type !== hqType || !hq.complete) return fail('invalid');
  if (![ObjectType.Silo, ObjectType.TankFactory, ObjectType.Defender, ObjectType.Wall].includes(type as never)) return fail('invalid');
  const rules = BUILDING_RULES[type];
  // Walls go up instantly, so only real construction keeps the HQ busy.
  if (rules.buildMs > 0 && hq.job) return fail('busy');
  if (!canPlace(world, side, type, cx, cy)) return fail('blocked');
  const money = world.sides[side];
  if (money.money < rules.price) return fail('no-money');
  money.money -= rules.price;
  const site = newEntity(world.nextId++, type, side, cx * CELL, cy * CELL, rules.hp);
  if (rules.buildMs > 0) {
    site.complete = false;
    site.buildTotalMs = rules.buildMs;
    hq.job = { kind: 'construct', siteId: site.id };
  }
  addEntity(world, site);
  return OK;
}

function cheat(world: World, side: Side, kind: 'reveal' | 'money' | 'repair', id?: number): CommandResult {
  if (kind === 'reveal') world.sides[side].explored.fill(1);
  else if (kind === 'money') world.sides[side].money += 1000;
  else {
    const e = id === undefined ? undefined : world.byId.get(id);
    if (!e || e.team !== side) return fail('invalid');
    e.hp = e.maxHp;
  }
  return OK;
}

/** Every side builds the player's four vehicles; the campaign enemy also has its own tank. Skirmish sides are equal. */
export function canProduce(world: World, side: Side, unit: UnitType): boolean {
  if (unit === ObjectType.EnemyTank) return side === 'enemy' && world.mode === 'campaign';
  return (FACTORY_BUILDS as readonly number[]).includes(unit);
}

function produce(world: World, side: Side, factoryId: number, unit: UnitType): CommandResult {
  const factory = world.byId.get(factoryId);
  if (!factory || factory.team !== side || factory.type !== ObjectType.TankFactory || !factory.complete) return fail('invalid');
  if (!canProduce(world, side, unit)) return fail('invalid');
  if (factory.job) return fail('busy');
  const rules = UNIT_RULES[unit];
  const money = world.sides[side];
  if (money.money < rules.price) return fail('no-money');
  money.money -= rules.price;
  factory.job = { kind: 'produce', unit, elapsedMs: 0, totalMs: rules.buildMs, price: rules.price };
  return OK;
}

function cancel(world: World, side: Side, id: number): CommandResult {
  const e = world.byId.get(id);
  if (!e || e.team !== side) return fail('invalid');
  // Cancelling refunds everything, as in the original.
  if (e.job?.kind === 'produce') {
    world.sides[side].money += e.job.price;
    e.job = null;
    return OK;
  }
  const site = e.job?.kind === 'construct' ? world.byId.get(e.job.siteId) : !e.complete ? e : undefined;
  if (!site || site.complete) return fail('invalid');
  world.sides[side].money += BUILDING_RULES[site.type as BuildingType].price;
  for (const b of world.entities) if (b.job?.kind === 'construct' && b.job.siteId === site.id) b.job = null;
  removeEntity(world, site);
  return OK;
}

// ---------------------------------------------------------------------------------------------------------------
// Simulation

/** Advances the world by one fixed tick of TICK_MS. */
export function step(world: World): void {
  world.events = [];
  if (world.outcome !== 'playing') {
    world.tick++;
    return;
  }
  aiStep(world);
  for (const e of [...world.entities]) {
    if (e.hp <= 0) continue;
    if (isUnit(e.type)) updateUnit(world, e);
    else updateBuilding(world, e);
  }
  updateProjectiles(world);
  removeDead(world);
  if (world.pendingOutcome && world.tick >= world.pendingOutcome.atTick) world.outcome = world.pendingOutcome.outcome;
  world.tick++;
}

function updateUnit(world: World, e: Entity): void {
  if (e.reloadMs > 0) e.reloadMs -= TICK_MS;
  if (e.repathMs > 0) e.repathMs -= TICK_MS;
  const rules = UNIT_RULES[e.type as UnitType];
  if (e.type === ObjectType.EnemyTank && !world.ai.enemy) raiderThink(world, e);
  else if (e.type === ObjectType.Harvester) harvesterThink(world, e);
  else tankThink(world, e);
  moveUnit(world, e, rules.stepMs);
  if (e.order.kind === 'move' && e.path.length === 0) e.order = { kind: 'idle' };
  if (rules.weapon && e.targetId) fireAt(world, e, rules.weapon);
}

function moveUnit(world: World, e: Entity, stepMs: number): void {
  if (e.path.length === 0) {
    e.moveMs = 0;
    return;
  }
  e.moveMs += TICK_MS;
  const startCell = cellOf(e);
  while (e.moveMs >= stepMs && e.path.length > 0) {
    e.moveMs -= stepMs;
    const wp = e.path[0]!;
    const dx = Math.sign(wp.cx * CELL - e.x);
    const dy = Math.sign(wp.cy * CELL - e.y);
    if (dx === 0 && dy === 0) {
      e.path.shift();
      e.moveMs += stepMs;
      continue;
    }
    if (canStand(world, e.x + dx, e.y + dy, e.size)) {
      e.x += dx;
      e.y += dy;
    } else if (dx !== 0 && canStand(world, e.x + dx, e.y, e.size)) {
      e.x += dx;
    } else if (dy !== 0 && canStand(world, e.x, e.y + dy, e.size)) {
      e.y += dy;
    } else {
      // Something was built in the way: look for a new route next tick.
      const goal = e.path[e.path.length - 1]!;
      if (!setPathTo(world, e, goal)) stopMoving(e);
      return;
    }
    e.dir = dirToward(dx, dy, e.dir);
    if (e.x === wp.cx * CELL && e.y === wp.cy * CELL) e.path.shift();
  }
  const now = cellOf(e);
  if ((now.cx !== startCell.cx || now.cy !== startCell.cy) && e.team !== 'neutral') reveal(world, e.team, e);
  if (e.path.length === 0) e.moveMs = 0;
}

function liveTarget(world: World, id: number): Entity | null {
  const t = world.byId.get(id);
  return t && t.hp > 0 && !t.hidden ? t : null;
}

/** Closest enemy of `e` among `candidates` within `range` pixels (edge to edge), ties broken by id. */
function nearest(e: Entity, candidates: Entity[], range: number): Entity | null {
  let best: Entity | null = null;
  let bestGap = Infinity;
  for (const c of candidates) {
    const g = gapBetween(e, c);
    if (g < range && g < bestGap) {
      best = c;
      bestGap = g;
    }
  }
  return best;
}

function enemiesOf(world: World, side: Team, filter: (e: Entity) => boolean): Entity[] {
  return world.entities.filter((o) => o.hp > 0 && !o.hidden && o.team !== side && o.team !== 'neutral' && filter(o));
}

/** Player tanks: follow orders; when idle, shoot whatever enemy unit or turret comes into range. */
function tankThink(world: World, e: Entity): void {
  const range = UNIT_RULES[e.type as UnitType].weapon!.range;
  const order = e.order;
  switch (order.kind) {
    case 'move':
      e.targetId = 0;
      if (e.path.length === 0) e.order = { kind: 'idle' };
      return;
    case 'attackMove': {
      attackMove(world, e, order.x, order.y, range);
      return;
    }
    case 'attack': {
      const t = liveTarget(world, order.targetId);
      if (!t) {
        e.order = { kind: 'idle' };
        e.targetId = 0;
        stopMoving(e);
        return;
      }
      engage(world, e, t, range);
      return;
    }
    case 'defend': {
      const guard = liveTarget(world, order.targetId);
      if (!guard) {
        e.order = { kind: 'idle' };
        e.targetId = 0;
        return;
      }
      let t = liveTarget(world, e.targetId);
      if (t && gapBetween(t, guard) > 5 * CELL && gapBetween(e, t) >= range) t = null;
      if (!t) {
        const threats = enemiesOf(world, e.team, (o) => o.type !== ObjectType.Wall);
        t = nearest(e, threats, range) ?? nearest(guard, threats, 4 * CELL);
      }
      if (t) {
        engage(world, e, t, range);
        return;
      }
      e.targetId = 0;
      if (gapBetween(e, guard) > CELL) {
        if (e.path.length === 0 && e.repathMs <= 0) {
          pathToward(world, e, guard);
          e.repathMs = 1000;
        }
      } else stopMoving(e);
      return;
    }
    case 'idle':
    case 'harvest': {
      const current = liveTarget(world, e.targetId);
      if (current && gapBetween(e, current) < range) return;
      const t = nearest(e, enemiesOf(world, e.team, (o) => isUnit(o.type) || o.type === ObjectType.Defender), range);
      e.targetId = t ? t.id : 0;
      return;
    }
  }
}

/**
 * Attack-move: shoot armed enemies in range first, then anything else in range except walls, and keep driving.
 * A tank that cannot get any closer (a walled base) shoots the nearest wall or building instead of giving up.
 */
function attackMove(world: World, e: Entity, x: number, y: number, range: number): void {
  const current = liveTarget(world, e.targetId);
  if (current && gapBetween(e, current) < range) {
    stopMoving(e);
    return;
  }
  // Still closing in on a wall we decided to break through.
  if (current && e.path.length > 0) return;
  let t: Entity | null = null;
  {
    const foes = enemiesOf(world, e.team, () => true);
    // Towers outrange every tank, so a tank on the move goes for one that can already hit it,
    // even out of sight: the shells show where it stands.
    const towerRange = BUILDING_RULES[ObjectType.Defender].weapon!.range;
    t =
      nearest(e, foes.filter((o) => (isUnit(o.type) && UNIT_RULES[o.type as UnitType].weapon) || o.type === ObjectType.Defender), range) ??
      nearest(e, foes.filter((o) => o.type === ObjectType.Defender), towerRange) ??
      nearest(e, foes.filter((o) => o.type !== ObjectType.Wall), range);
    if (t && gapBetween(e, t) >= range) {
      engage(world, e, t, range);
      return;
    }
  }
  if (t) {
    e.targetId = t.id;
    stopMoving(e);
    return;
  }
  e.targetId = 0;
  if (e.path.length > 0) return;
  const goal = { cx: Math.floor(x / CELL), cy: Math.floor(y / CELL) };
  const here = cellOf(e);
  if (Math.max(Math.abs(goal.cx - here.cx), Math.abs(goal.cy - here.cy)) <= 2) {
    e.order = { kind: 'idle' };
    return;
  }
  if (e.repathMs > 0) return;
  e.repathMs = 1000;
  // Try the road again first: whatever stopped us may be gone.
  if (setPathTo(world, e, goal)) {
    const end = e.path[e.path.length - 1]!;
    if (Math.max(Math.abs(goal.cx - end.cx), Math.abs(goal.cy - end.cy)) <= 2) return;
  }
  // Stuck short of the goal: shoot through the first enemy wall or building on the way.
  const blocker = firstBlocker(world, e, goal);
  if (blocker) {
    e.targetId = blocker.id;
    stopMoving(e);
    if (gapBetween(e, blocker) >= range) pathToward(world, e, blocker);
    return;
  }
  stopMoving(e);
  e.order = { kind: 'idle' };
}

/** The first enemy building on the shortest route to `goal` that drives straight through enemy buildings. */
function firstBlocker(world: World, e: Entity, goal: Cell): Entity | null {
  const foeAt = (cx: number, cy: number) => {
    const id = world.buildingAt[cy * world.cols + cx]!;
    const b = id ? world.byId.get(id) : undefined;
    return b && b.team !== e.team && b.team !== 'neutral' ? b : null;
  };
  const passable = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < world.cols && cy < world.rows && (cellPassable(world, cx, cy) || (world.blocked[cy * world.cols + cx] === 0 && foeAt(cx, cy) !== null));
  const path = findPath(world.cols, world.rows, passable, cellOf(e), goal, true, 20_000);
  let prev = cellOf(e);
  for (const c of path ?? []) {
    // A diagonal step squeezes between two cells; a wall on either corner blocks it for real.
    const b = foeAt(c.cx, c.cy) ?? (c.cx !== prev.cx && c.cy !== prev.cy ? (foeAt(c.cx, prev.cy) ?? foeAt(prev.cx, c.cy)) : null);
    if (b) return b;
    prev = c;
  }
  return null;
}

/** Shoot `t` if in range, otherwise drive toward it. */
function engage(world: World, e: Entity, t: Entity, range: number): void {
  e.targetId = t.id;
  if (gapBetween(e, t) < range) {
    stopMoving(e);
    return;
  }
  if (e.path.length === 0 || e.repathMs <= 0) {
    pathToward(world, e, t);
    e.repathMs = 1000;
  }
}

/**
 * The original enemy tank: shoots player buildings first, then units, but only what is already in range.
 * With nothing to shoot it wanders to a random spot up to 10 cells away.
 */
function raiderThink(world: World, e: Entity): void {
  const range = UNIT_RULES[ObjectType.EnemyTank].weapon!.range;
  if (e.order.kind === 'attack') {
    const t = liveTarget(world, e.order.targetId);
    if (t) return engage(world, e, t, range);
    e.order = { kind: 'idle' };
  }
  const current = liveTarget(world, e.targetId);
  if (current) {
    engage(world, e, current, range);
    return;
  }
  const t =
    nearest(e, enemiesOf(world, e.team, (o) => !isUnit(o.type)), range) ??
    nearest(e, enemiesOf(world, e.team, (o) => isUnit(o.type)), range);
  if (t) {
    e.targetId = t.id;
    stopMoving(e);
    return;
  }
  e.targetId = 0;
  if (e.path.length > 0) return;
  const here = cellOf(e);
  for (let tries = 0; tries < 10; tries++) {
    const span = RAIDER_WANDER_CELLS * 2 + 1;
    const cx = here.cx + Math.floor(random(world) * span) - RAIDER_WANDER_CELLS;
    const cy = here.cy + Math.floor(random(world) * span) - RAIDER_WANDER_CELLS;
    if (cellPassable(world, cx, cy) && setPathTo(world, e, { cx, cy })) return;
  }
}

function nearestBy(e: Entity, list: Entity[]): Entity | null {
  const c = centerOf(e);
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of list) {
    const oc = centerOf(o);
    const d = (oc.x - c.x) ** 2 + (oc.y - c.y) ** 2;
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

/** Harvest loop of the original: fill up to 50 on a yellow field, unload one unit per tick inside a silo. */
function harvesterThink(world: World, e: Entity): void {
  if (e.order.kind !== 'harvest') return;
  switch (e.phase) {
    case null:
    case 'toField': {
      let field = liveTarget(world, e.fieldId);
      if (!field || field.type !== ObjectType.ResourceField) {
        field = nearestBy(e, world.entities.filter((o) => o.type === ObjectType.ResourceField && o.hp > 0 && (e.team === 'neutral' || isVisibleTo(world, e.team, o))));
        if (!field) {
          if (e.cargo > 0) e.phase = 'toSilo';
          else e.order = { kind: 'idle' };
          return;
        }
        e.fieldId = field.id;
        e.order = { kind: 'harvest', fieldId: field.id };
        stopMoving(e);
      }
      e.phase = 'toField';
      if (field.x <= e.x && field.y <= e.y && e.x + e.size <= field.x + field.size && e.y + e.size <= field.y + field.size) {
        stopMoving(e);
        e.phase = 'loading';
        return;
      }
      if (e.path.length === 0) {
        // Drive onto the field cell closest to the harvester.
        const c = cellOf(e);
        const fx = Math.floor(field.x / CELL);
        const fy = Math.floor(field.y / CELL);
        const n = field.size / CELL;
        const goal = { cx: Math.min(fx + n - 1, Math.max(fx, c.cx)), cy: Math.min(fy + n - 1, Math.max(fy, c.cy)) };
        if (!setPathTo(world, e, goal)) e.order = { kind: 'idle' };
      }
      return;
    }
    case 'loading': {
      const field = liveTarget(world, e.fieldId);
      if (field && field.hp > 0 && e.cargo < HARVESTER.capacity) {
        const take = Math.min(HARVESTER.perTick, field.hp, HARVESTER.capacity - e.cargo);
        e.cargo += take;
        field.hp -= take;
      }
      if (!field || field.hp <= 0 || e.cargo >= HARVESTER.capacity) e.phase = e.cargo > 0 ? 'toSilo' : 'toField';
      return;
    }
    case 'toSilo': {
      const silos = world.entities.filter((o) => o.type === ObjectType.Silo && o.team === e.team && o.complete && o.hp > 0);
      const silo = nearestBy(e, silos);
      if (!silo) {
        stopMoving(e);
        return;
      }
      if (gapBetween(e, silo) <= HARVESTER.dockGap) {
        stopMoving(e);
        if (silo.dockedId === 0) {
          silo.dockedId = e.id;
          e.hidden = true;
          e.phase = 'unloading';
        }
        return;
      }
      if (e.path.length === 0 || e.repathMs <= 0) {
        pathToward(world, e, silo);
        e.repathMs = 2000;
      }
      return;
    }
    case 'unloading': {
      const silo = world.entities.find((o) => o.dockedId === e.id);
      if (!silo || silo.hp <= 0) {
        e.hidden = false;
        e.phase = 'toSilo';
        return;
      }
      const give = Math.min(HARVESTER.perTick, e.cargo);
      e.cargo -= give;
      if (e.team !== 'neutral') world.sides[e.team].money += give;
      if (e.cargo <= 0) {
        silo.dockedId = 0;
        e.hidden = false;
        e.phase = 'toField';
      }
      return;
    }
  }
}

function fireAt(world: World, e: Entity, weapon: Weapon): void {
  const t = liveTarget(world, e.targetId);
  if (!t || e.team === 'neutral') {
    e.targetId = 0;
    return;
  }
  const from = centerOf(e);
  const to = centerOf(t);
  e.dir = dirToward(Math.round(to.x - from.x), Math.round(to.y - from.y), e.dir);
  if (e.reloadMs > 0 || gapBetween(e, t) >= weapon.range) return;
  e.reloadMs = weapon.reloadMs;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const perTick = (weapon.speed * TICK_MS) / 1000;
  const kind = weapon.damage >= 15 ? 'cannon' : 'gun';
  world.projectiles.push({
    id: world.nextId++,
    team: e.team,
    weapon: kind,
    x: from.x,
    y: from.y,
    vx: (dx / dist) * perTick,
    vy: (dy / dist) * perTick,
    // Shells are aimed at the target's centre and fall a little past it.
    left: dist + 6,
    damage: weapon.damage,
  });
  world.events.push({ kind: 'shot', x: from.x, y: from.y, weapon: kind, team: e.team });
}

function updateProjectiles(world: World): void {
  const keep: Projectile[] = [];
  for (const p of world.projectiles) {
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    // Sub-steps of at most 4 px, so the fast gun shell cannot skip over a 15 px tank.
    const sub = Math.max(1, Math.ceil(speed / 4));
    let hit: Entity | null = null;
    for (let i = 0; i < sub && !hit && p.left > 0; i++) {
      p.x += p.vx / sub;
      p.y += p.vy / sub;
      p.left -= speed / sub;
      for (const e of world.entities) {
        if (e.hp <= 0 || e.hidden || e.team === p.team || e.team === 'neutral') continue;
        if (p.x >= e.x && p.x < e.x + e.size && p.y >= e.y && p.y < e.y + e.size) {
          hit = e;
          break;
        }
      }
    }
    if (hit) {
      hit.hp -= p.damage;
      world.events.push({ kind: 'hit', x: p.x, y: p.y, weapon: p.weapon });
    } else if (p.left > 0) keep.push(p);
    else world.events.push({ kind: 'hit', x: p.x, y: p.y, weapon: p.weapon });
  }
  world.projectiles = keep;
}

function updateBuilding(world: World, e: Entity): void {
  if (e.reloadMs > 0) e.reloadMs -= TICK_MS;
  if (!e.complete) return;
  const job = e.job;
  if (job?.kind === 'construct') {
    const site = world.byId.get(job.siteId);
    if (!site || site.hp <= 0) {
      e.job = null;
    } else {
      site.buildElapsedMs += TICK_MS;
      if (site.buildElapsedMs >= site.buildTotalMs) {
        site.complete = true;
        e.job = null;
        world.events.push({ kind: 'completed', id: site.id, type: site.type });
      }
    }
  } else if (job?.kind === 'produce') {
    job.elapsedMs = Math.min(job.totalMs, job.elapsedMs + TICK_MS);
    if (job.elapsedMs >= job.totalMs) {
      const spot = spawnCell(world, e);
      if (spot && e.team !== 'neutral') {
        const u = spawnUnit(world, job.unit, e.team, spot.cx, spot.cy);
        e.job = null;
        e.pauseMs = 0;
        world.events.push({ kind: 'completed', id: u.id, type: u.type });
      }
    }
  }
  // The original enemy factory; a skirmish factory makes only what its owner orders.
  if (e.type === ObjectType.TankFactory && e.team === 'enemy' && !e.job && !world.ai.enemy && world.mode === 'campaign') {
    e.pauseMs += TICK_MS;
    const raiders = world.entities.filter((o) => o.type === ObjectType.EnemyTank && o.hp > 0).length;
    if (e.pauseMs >= ENEMY_FACTORY_PAUSE_MS && raiders < ENEMY_MAX_TANKS) {
      const rules = UNIT_RULES[ObjectType.EnemyTank];
      e.job = { kind: 'produce', unit: ObjectType.EnemyTank, elapsedMs: 0, totalMs: rules.hp * 100, price: 0 };
    }
  }
  const weapon = BUILDING_RULES[e.type as BuildingType]?.weapon;
  if (weapon && e.team !== 'neutral') {
    let t = liveTarget(world, e.targetId);
    if (!t || gapBetween(e, t) >= weapon.range) {
      t = nearest(e, enemiesOf(world, e.team, (o) => isUnit(o.type)), weapon.range);
      e.targetId = t ? t.id : 0;
    }
    if (t) fireAt(world, e, weapon);
  }
}

/** First free cell around a factory, searched in growing rings like the original. */
function spawnCell(world: World, factory: Entity): Cell | null {
  const c = cellOf(factory);
  for (let r = 1; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = c.cx + dx;
        const cy = c.cy + dy;
        if (!cellPassable(world, cx, cy)) continue;
        const probe = { x: cx * CELL, y: cy * CELL, size: CELL } as Entity;
        if (world.entities.some((o) => isUnit(o.type) && !o.hidden && o.hp > 0 && overlaps(probe, o))) continue;
        return { cx, cy };
      }
  }
  return null;
}

function removeEntity(world: World, e: Entity): void {
  e.hp = Math.min(e.hp, 0);
  world.entities = world.entities.filter((o) => o !== e);
  world.byId.delete(e.id);
  if (!isUnit(e.type) && e.type !== ObjectType.ResourceField) markBuilding(world, e, 0);
}

function removeDead(world: World): void {
  const dead = world.entities.filter((e) => e.hp <= 0);
  if (dead.length === 0) return;
  for (const e of dead) {
    removeEntity(world, e);
    if (e.type !== ObjectType.ResourceField) {
      world.events.push({ kind: 'destroyed', type: e.type, team: e.team, x: e.x, y: e.y, size: e.size });
    }
    // A harvester inside a silo dies with it; a destroyed harvester frees its silo.
    for (const o of world.entities) {
      if (o.dockedId === e.id) o.dockedId = 0;
      if (e.dockedId === o.id) o.hp = 0;
      if (o.job?.kind === 'construct' && o.job.siteId === e.id) o.job = null;
    }
    if (!world.pendingOutcome) {
      const delay = Math.ceil(OUTCOME_DELAY_MS / TICK_MS);
      if (e.type === ObjectType.PlayerHQ && e.team === 'player') world.pendingOutcome = { outcome: 'lost', atTick: world.tick + delay };
      else if (e.type === ObjectType.EnemyHQ) world.pendingOutcome = { outcome: 'won', atTick: world.tick + delay };
    }
  }
  // Harvesters that died inside a destroyed silo.
  if (world.entities.some((e) => e.hp <= 0)) removeDead(world);
}

/** Order-independent fingerprint of the world, used to prove two runs stayed identical. */
export function hashWorld(world: World): number {
  let h = 2166136261 ^ world.tick;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v | 0), 16777619);
  };
  mix(world.sides.player.money);
  mix(world.sides.enemy.money);
  for (const e of world.entities) {
    for (const v of [e.id, e.type, e.x, e.y, e.hp, e.team === 'enemy' ? 1 : 0, e.cargo, e.targetId, e.path.length]) mix(v);
  }
  for (const p of world.projectiles) {
    mix(Math.round(p.x * 16));
    mix(Math.round(p.y * 16));
  }
  return h >>> 0;
}
