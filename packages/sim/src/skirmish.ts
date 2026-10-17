import { campaign, CELL, ObjectType, type CampaignMap, type MapObject, type Race, type TeamColor } from '@sw/data';
import { findPath, type Cell } from './path';
import { buildBlockedGrid, createWorld, spawnUnit, type World } from './world';
import { BUILDING_RULES, type AiBrainName } from './rules';

/**
 * Skirmish: any of the seven campaign maps with two equal bases and no mission script. Each side starts with an HQ,
 * a harvester and the same money; whoever loses their HQ loses. The second side is played by the computer or, in a
 * two-player game on one Mac, by a second person.
 */

/** Who commands the second side: a computer brain of some difficulty, or a person. */
export type Opponent = 'easy' | 'normal' | 'hard' | 'human';
export const OPPONENTS: readonly Opponent[] = ['easy', 'normal', 'hard', 'human'];

export const SKIRMISH_MONEY = [1500, 3000, 6000] as const;
export const DEFAULT_SKIRMISH_MONEY = 3000;

/** Crystal fields each base gets right next to it, so neither side has to fight for its first harvest. */
const HOME_FIELDS = 2;
const HOME_FIELD_AMOUNT = 3000;
/** Mission fields this close to a start are dropped in favour of the even home fields. */
const HOME_RADIUS_CELLS = 7;
/** Each side starts knowing the land this far around its HQ, enough to lay out a base. */
const START_SIGHT_CELLS = 8;
/** A base spot needs at least this many free cells in the 12×12 cells around it; fewer is a forest pocket. */
const MIN_ROOM = 35;

export interface SkirmishOptions {
  opponent: Opponent;
  money?: number;
  seed?: number;
  /** Hand the first side to a computer brain too (tests and demos). */
  playerAi?: AiBrainName;
  /** Races of the two sides, [first, second]. Default humans against hovers. Races only change looks. */
  races?: readonly [Race, Race];
  /** Team colours of the two sides; they must differ. Default olive and cyan. */
  colors?: readonly [TeamColor, TeamColor];
}

export interface SkirmishLayout {
  /** Top-left cells of the two HQs: [first side, second side]. */
  starts: [Cell, Cell];
  fields: Array<{ cx: number; cy: number; amount: number }>;
}

/** A 2x2 spot is free of forest and inside the map. */
function open(blocked: Uint8Array, cols: number, rows: number, cx: number, cy: number, n = 2): boolean {
  for (let dy = 0; dy < n; dy++)
    for (let dx = 0; dx < n; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows || blocked[y * cols + x]) return false;
    }
  return true;
}

const overlap = (a: Cell, b: Cell, n = 2) => Math.abs(a.cx - b.cx) < n && Math.abs(a.cy - b.cy) < n;
const chebyshev = (a: Cell, b: Cell) => Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));

/**
 * Where the bases and fields go on a campaign map. The two starts are the pair of HQ spots used anywhere in the
 * map's missions that lie farthest apart and can reach each other. Each start gets the same two home fields;
 * the missions' own fields away from the bases stay as contested fields in between.
 */
export function skirmishLayout(map: CampaignMap): SkirmishLayout {
  const { cols, rows, blocked } = buildBlockedGrid(map);
  const objects = map.missions.flatMap((m) => m.objects);
  const cellOfObject = (o: MapObject): Cell => ({ cx: Math.floor(o.x / CELL), cy: Math.floor(o.y / CELL) });
  const spots: Cell[] = [];
  for (const o of objects) {
    if (o.type !== ObjectType.PlayerHQ && o.type !== ObjectType.EnemyHQ) continue;
    const c = cellOfObject(o);
    if (!open(blocked, cols, rows, c.cx, c.cy) || spots.some((s) => s.cx === c.cx && s.cy === c.cy)) continue;
    let room = 0;
    for (let dy = -5; dy <= 6; dy++) for (let dx = -5; dx <= 6; dx++) if (open(blocked, cols, rows, c.cx + dx, c.cy + dy, 1)) room++;
    if (room >= MIN_ROOM) spots.push(c);
  }
  const passable = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < cols && cy < rows && !blocked[cy * cols + cx];
  let best: [Cell, Cell] | null = null;
  let bestD = -1;
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i]!;
      const b = spots[j]!;
      const d = (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
      if (d <= bestD) continue;
      if (!findPath(cols, rows, passable, a, b, false, 50_000)) continue;
      best = [a, b];
      bestD = d;
    }
  if (!best) throw new Error(`Map "${map.name}" has no two connected base spots`);
  // The first side takes the start on the left (then top), as on the minimap.
  const starts: [Cell, Cell] = best[0].cx * 1000 + best[0].cy <= best[1].cx * 1000 + best[1].cy ? best : [best[1], best[0]];

  const fields: SkirmishLayout['fields'] = [];
  const taken = (c: Cell) => starts.some((s) => overlap(s, c)) || fields.some((f) => overlap(f, c));
  const centre = { cx: cols / 2, cy: rows / 2 };
  for (const start of starts) {
    // Home fields: the free 2x2 spots 3 to 6 cells from the HQ, nearest first, then the ones facing the map centre.
    const candidates: Array<Cell & { score: number }> = [];
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const c = { cx: start.cx + dx, cy: start.cy + dy };
        const r = chebyshev(c, start);
        if (r < 3 || !open(blocked, cols, rows, c.cx, c.cy)) continue;
        candidates.push({ ...c, score: r * 1000 + (c.cx - centre.cx) ** 2 + (c.cy - centre.cy) ** 2 + c.cy * 0.001 + c.cx * 0.000001 });
      }
    candidates.sort((a, b) => a.score - b.score);
    let placed = 0;
    for (const c of candidates) {
      if (placed >= HOME_FIELDS) break;
      // Keep a lane to the HQ: never right against another field.
      if (taken(c) || fields.some((f) => chebyshev(f, c) < 3)) continue;
      fields.push({ cx: c.cx, cy: c.cy, amount: HOME_FIELD_AMOUNT });
      placed++;
    }
  }
  for (const o of objects) {
    if (o.type !== ObjectType.ResourceField) continue;
    const c = cellOfObject(o);
    if (starts.some((s) => chebyshev(s, c) <= HOME_RADIUS_CELLS) || taken(c) || !open(blocked, cols, rows, c.cx, c.cy)) continue;
    fields.push({ cx: c.cx, cy: c.cy, amount: Math.max(1500, o.hp) });
  }
  return { starts, fields };
}

/** A fresh skirmish world on campaign map `mapIndex`. */
export function createSkirmish(mapIndex: number, options: SkirmishOptions): World {
  const map = campaign.maps[mapIndex];
  if (!map) throw new Error(`No map ${mapIndex + 1}`);
  const layout = skirmishLayout(map);
  const money = options.money ?? DEFAULT_SKIRMISH_MONEY;
  const [p, e] = layout.starts;
  const objects: MapObject[] = [
    { type: ObjectType.PlayerHQ, x: p.cx * CELL, y: p.cy * CELL, hp: BUILDING_RULES[ObjectType.PlayerHQ].hp, enemy: false },
    { type: ObjectType.EnemyHQ, x: e.cx * CELL, y: e.cy * CELL, hp: BUILDING_RULES[ObjectType.EnemyHQ].hp, enemy: true },
    ...layout.fields.map((f) => ({ type: ObjectType.ResourceField, x: f.cx * CELL, y: f.cy * CELL, hp: f.amount, enemy: false })),
  ];
  // A copy of the map with one generated mission; it is not a campaign map, so it is never the training map.
  const world = createWorld({ ...map, missions: [{ title: map.name, brief: '', money, objects }] }, 0, options.seed ?? 1, {
    mode: 'skirmish',
    difficulty: options.opponent === 'human' ? 'classic' : options.opponent,
    playerAi: options.playerAi,
    races: options.races,
    colors: options.colors,
  });
  // The computer gets the same money as the person; its difficulty only adds the income bonus.
  world.sides.enemy.money = money;
  for (const [side, start] of [['player', p], ['enemy', e]] as const) {
    const explored = world.sides[side].explored;
    for (let y = Math.max(0, start.cy - START_SIGHT_CELLS); y <= Math.min(world.rows - 1, start.cy + 1 + START_SIGHT_CELLS); y++)
      for (let x = Math.max(0, start.cx - START_SIGHT_CELLS); x <= Math.min(world.cols - 1, start.cx + 1 + START_SIGHT_CELLS); x++) explored[y * world.cols + x] = 1;
  }
  // Each side's harvester waits beside its HQ, on the side facing its home fields.
  for (const [side, start] of [['player', p], ['enemy', e]] as const) {
    const home = layout.fields.filter((f) => f.amount === HOME_FIELD_AMOUNT && chebyshev(f, start) <= 6)[0];
    const spot = harvesterSpot(world, start, home ?? start);
    if (spot) spawnUnit(world, ObjectType.Harvester, side, spot.cx, spot.cy);
  }
  return world;
}

/** The free cell next to the HQ that is closest to its first home field. */
function harvesterSpot(world: World, hq: Cell, toward: Cell): Cell | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (let dy = -1; dy <= 2; dy++)
    for (let dx = -1; dx <= 2; dx++) {
      const c = { cx: hq.cx + dx, cy: hq.cy + dy };
      if (c.cx < 0 || c.cy < 0 || c.cx >= world.cols || c.cy >= world.rows) continue;
      const i = c.cy * world.cols + c.cx;
      if (world.blocked[i] || world.buildingAt[i]) continue;
      const d = (c.cx - toward.cx - 0.5) ** 2 + (c.cy - toward.cy - 0.5) ** 2;
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
  return best;
}
