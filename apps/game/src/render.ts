import { Container, Graphics, Sprite, type Spritesheet, type Texture } from 'pixi.js';
import { CELL, ObjectType, spriteName, TEAM_COLORS, wallMask, type Race } from '@sw/data';
import { isUnit, TICK_MS, UNIT_RULES, BUILDING_RULES, type Entity, type GameEvent, type Side, type UnitType, type BuildingType, type World } from '@sw/sim';
import { ART_PX_PER_CELL, groundPiece, type Art } from './assets';
import { Fog } from './fog';
import type { Commander } from './game';

/** Map pixels per art pixel: the sprites are drawn at 32 px per 15 px cell. */
const ART = CELL / ART_PX_PER_CELL;

const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

const C = {
  select: 0x9dff7a,
  field: 0xf0c43a,
  hpGood: 0x6ee06e,
  hpBad: 0xe05a3a,
  ghostOk: 0x6ee06e,
  ghostBad: 0xe05a3a,
};

/** How long a unit shows its firing frame (recoil and muzzle flash), and keeps its move animation after a step. */
const FIRE_MS = 160;
const MOVE_HOLD_MS = 260;
const WRECK_MS = 12_000;
const SCORCH_MS = 25_000;
/** Track marks: one every this many map pixels driven, swept away by the wind over MARK_MS; at most MAX_MARKS lie about. */
const MARK_STEP = 6;
const MARK_MS = 20_000;
const MAX_MARKS = 800;
/** How often the fog is recomputed, and the ambient life of the map spawns. */
const FOG_MS = 100;
const GLINT_MS = 260;
const WISP_MS = 340;

/** Unit and building kinds whose gun turns on a turret of its own (sprites `<race>_<kind>_turret`). */
const TURRETED = new Set<number>([ObjectType.LightTank, ObjectType.MiddleTank, ObjectType.HeavyTank, ObjectType.Defender]);

/** Decor scattered over open sand (`decor/idle/<variant>`), weighted: pebbles and plants often, bones and craters rarely. */
const DECOR_WEIGHTS = [3, 2, 2, 1, 1, 1, 2, 1];
/** Share of open sand cells, in thousandths, that get a piece of decor. */
const DECOR_DENSITY = 55;

interface Effect {
  sprite: Sprite;
  frames: Texture[];
  frameMs: number;
  life: number;
  /** Waits this long before it shows. */
  delay: number;
  /** Drift in map pixels per ms. */
  vx: number;
  vy: number;
  /** Lasts this long when it has one frame (a wisp of sand), fading in and out. */
  hold?: number;
}

interface Decal {
  node: Sprite | Graphics;
  life: number;
  max: number;
}

/** Small integer hash, so trees and smoke look random but come out the same every time. */
function hash(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

/** 8-way facing of a vector, 0 = north, clockwise. */
function dirOf(dx: number, dy: number): number {
  const a = Math.atan2(dx, -dy);
  return (Math.round(a / (Math.PI / 4)) + 8) % 8;
}

/** Where a turret looks: its own facing once the sim gives turrets one, else the hull's. */
const turretDir = (e: Entity): number => (e as Entity & { turretDir?: number }).turretDir ?? e.dir;

/** The marks a unit leaves on the sand: tracks, the light tank's wheels, walkers' feet; hovers leave none. */
function markKind(race: Race, type: number): 'tread' | 'wheel' | 'foot' | null {
  if (race === 'hover') return null;
  if (race === 'walker') return 'foot';
  return type === ObjectType.LightTank ? 'wheel' : 'tread';
}

/**
 * Cells the hover race has plated: open sand around each hover side's starting buildings, so their base stands on
 * its pale floor plates (`RACE_GROUND`). Purely cosmetic; fields keep their crystals on top.
 */
export function platedCells(world: World): Uint8Array {
  const plated = new Uint8Array(world.cols * world.rows);
  for (const e of world.entities) {
    if (e.team === 'neutral' || world.sides[e.team].race !== 'hover' || isUnit(e.type) || e.type === ObjectType.Wall) continue;
    const r = e.type === ObjectType.PlayerHQ || e.type === ObjectType.EnemyHQ ? 4 : 2;
    const n = e.size / CELL;
    const cx0 = Math.floor(e.x / CELL);
    const cy0 = Math.floor(e.y / CELL);
    for (let cy = cy0 - r; cy < cy0 + n + r; cy++)
      for (let cx = cx0 - r; cx < cx0 + n + r; cx++) {
        if (cx < 0 || cy < 0 || cx >= world.cols || cy >= world.rows) continue;
        // Round the corners off so the plating does not look like a stamped square.
        const ox = Math.max(cx0 - cx, cx - (cx0 + n - 1), 0);
        const oy = Math.max(cy0 - cy, cy - (cy0 + n - 1), 0);
        if (ox + oy > r + 1 || ((ox === r || oy === r) && hash(cx * 977 + cy) % 3 === 0)) continue;
        const i = cy * world.cols + cx;
        if (!world.blocked[i]) plated[i] = 1;
      }
  }
  return plated;
}

export class Renderer {
  readonly camera = new Container();
  private readonly ground = new Container();
  /** Flat things on the ground, bottom to top: decor, track marks, scorch marks and wrecks. */
  private readonly decor = new Container();
  private readonly marks = new Container();
  private readonly decals = new Container();
  private readonly objects = new Container({ sortableChildren: true });
  private readonly shots = new Container();
  private readonly fx = new Container();
  private readonly overlay = new Graphics();
  private readonly fog: Fog;
  private readonly ui = new Graphics();
  private readonly ghost = new Sprite();
  private readonly sprites = new Map<number, Sprite>();
  private readonly turrets = new Map<number, Sprite>();
  /** Flames on buildings below a quarter of their life. */
  private readonly flames = new Map<number, Sprite[]>();
  private readonly smokeAt = new Map<number, number>();
  private readonly shotSprites: Sprite[] = [];
  private effects: Effect[] = [];
  private decalList: Decal[] = [];
  private markList: { sprite: Sprite; life: number }[] = [];
  private readonly lastMark = new Map<number, { x: number; y: number; n: number }>();
  private exploredCount = -1;
  private fogAt = -1e9;
  private glintAt = 0;
  private wispAt = 0;
  /** Positions at the previous tick, for smooth movement between 20 Hz sim steps. */
  private prev = new Map<number, { x: number; y: number }>();
  /** Shells in flight before the step, to tell whose shot a hit was. */
  private prevShots: { x: number; y: number; team: Side }[] = [];
  private readonly lastMoved = new Map<number, number>();
  private readonly firedAt = new Map<number, number>();
  private readonly lastDir = new Map<number, number>();
  private clock = 0;
  private readonly plated: Uint8Array;
  /** Firs by the cell they grow in: hidden until the cell is seen, as they would poke out of the dark. */
  private readonly firs: Array<{ sprite: Sprite; cell: number; variant: number; phase: number; frame: string }> = [];
  /** Effect animations by name (`blast/big` = its frames in order). */
  private readonly fxFrames = new Map<string, Texture[]>();

  /** Draws the world as one person sees it: their fog, their selection, their cursor. */
  constructor(
    private readonly game: Commander,
    private readonly art: Art,
  ) {
    this.plated = platedCells(game.world);
    this.fog = new Fog(game.world, game.side);
    this.ghost.visible = false;
    this.camera.addChild(this.ground, this.decor, this.marks, this.decals, this.objects, this.shots, this.fx, this.overlay, this.fog.sprite, this.ui);
    this.objects.addChild(this.ghost);
    this.ghost.zIndex = 1e9;
    const names = Object.keys(art.effects.textures).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    for (const name of names) {
      const cut = name.lastIndexOf('/');
      const key = name.slice(0, cut);
      if (!this.fxFrames.has(key)) this.fxFrames.set(key, []);
      this.fxFrames.get(key)!.push(art.effects.textures[name]!);
    }
    this.drawGround();
  }

  private sheetOf(team: Side | 'neutral'): Spritesheet {
    const s = this.game.world.sides[team === 'neutral' ? 'player' : team];
    return this.art.sheet(s.color, s.color2);
  }

  private tex(team: Side | 'neutral', name: string): Texture {
    const t = this.sheetOf(team).textures[name];
    if (!t) throw new Error(`Missing sprite frame ${name}`);
    return t;
  }

  private sprite(texture: Texture): Sprite {
    const s = new Sprite(texture);
    s.scale.set(ART);
    return s;
  }

  /** Call right before every sim step. */
  beforeStep(): void {
    this.prev.clear();
    for (const e of this.game.world.entities) this.prev.set(e.id, { x: e.x, y: e.y });
    this.prevShots = this.game.world.projectiles.map((p) => ({ x: p.x + p.vx, y: p.y + p.vy, team: p.team }));
  }

  /** Call right after every sim step: notes who moved and fired, and turns sim events into effects. */
  afterStep(events: GameEvent[]): void {
    const world = this.game.world;
    for (const e of world.entities) {
      const p = this.prev.get(e.id);
      if (p && (p.x !== e.x || p.y !== e.y)) {
        this.lastMoved.set(e.id, this.clock);
        if (isUnit(e.type) && e.team !== 'neutral' && !e.hidden) this.leaveMark(e);
      }
    }
    for (const ev of events) {
      if (ev.kind === 'shot') this.firedAt.set(ev.id, this.clock);
      if (ev.kind === 'hit') this.hit(ev.x, ev.y, ev.weapon);
      if (ev.kind === 'destroyed') this.destroyed(ev);
    }
  }

  /** Starts an effect animation (`blast/small`, `smoke`...) centred on a map point. */
  private play(name: string, x: number, y: number, frameMs: number, opts: { delay?: number; vx?: number; vy?: number; hold?: number; scale?: number } = {}): void {
    const frames = this.fxFrames.get(name);
    if (!frames) return;
    const s = new Sprite(frames[0]!);
    s.anchor.copyFrom(frames[0]!.defaultAnchor ?? { x: 0.5, y: 0.5 });
    s.scale.set(ART * (opts.scale ?? 1));
    s.position.set(x, y);
    s.visible = !opts.delay;
    this.fx.addChild(s);
    this.effects.push({ sprite: s, frames, frameMs, life: 0, delay: opts.delay ?? 0, vx: opts.vx ?? 0, vy: opts.vy ?? 0, hold: opts.hold });
  }

  /** A shell striking: sparks for the humans' slugs, a ring of plasma for the hovers, a splash of acid for the walkers. */
  private hit(x: number, y: number, weapon: 'gun' | 'cannon'): void {
    if (!this.visibleCell(x, y)) return;
    let race: Race = 'human';
    let best = Infinity;
    for (const p of this.prevShots) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best) {
        best = d;
        race = this.game.world.sides[p.team].race;
      }
    }
    const big = weapon === 'cannon' ? 1.25 : 0.9;
    if (race === 'hover') this.play('plasma', x, y, 55, { scale: big });
    else if (race === 'walker') this.play('acid', x, y, 60, { scale: big });
    else this.play('spark', x, y, 50, { scale: big });
    if (weapon === 'cannon') this.play('dust', x, y + 1, 70, { delay: 60, vy: -0.002 });
  }

  private destroyed(ev: Extract<GameEvent, { kind: 'destroyed' }>): void {
    const cx = ev.x + ev.size / 2;
    const cy = ev.y + ev.size / 2;
    if (!this.visibleCell(cx, cy)) return;
    if (ev.type === ObjectType.ResourceField) {
      this.play('dust', cx, cy, 90, { scale: 1.5 });
      return;
    }
    const seed = hash(ev.id);
    const big = ev.size > CELL;
    if (big) {
      this.play('blast/big', cx, cy - 2, 85);
      for (let i = 0; i < 3; i++) {
        const h = hash(seed + i * 7);
        this.play('blast/small', cx + ((h % 17) - 8), cy + (((h >>> 8) % 13) - 6), 70, { delay: 120 + i * 140 });
      }
    } else this.play(ev.type === ObjectType.Wall ? 'dust' : 'blast/small', cx, cy - 1, 75, { scale: ev.type === ObjectType.Wall ? 1.6 : 1 });
    for (let i = 0; i < (big ? 5 : 2); i++) {
      const h = hash(seed + i);
      this.play('smoke', cx + ((h % 13) - 6) * (big ? 1.4 : 0.7), cy - 3 + (((h >>> 8) % 9) - 4), 260 + (h % 120), {
        delay: 250 + i * 160,
        vx: 0.0015 + ((h >>> 4) % 5) / 3000,
        vy: -0.004,
      });
    }
    const scorch = new Sprite(this.art.effects.textures[big ? 'scorch/big' : 'scorch/small']!);
    scorch.anchor.set(0.5);
    scorch.scale.set(ART);
    scorch.position.set(cx, cy + 1);
    this.decals.addChild(scorch);
    this.decalList.push({ node: scorch, life: 0, max: SCORCH_MS });
    if (isUnit(ev.type) && ev.team !== 'neutral') {
      const race = this.game.world.sides[ev.team].race;
      const dir = DIRS[this.lastDir.get(ev.id) ?? ev.dir]!;
      const wreck = this.sprite(this.tex(ev.team, `${spriteName(race, ev.type)}/wreck/${dir}`));
      wreck.position.set(cx, cy);
      this.decals.addChild(wreck);
      this.decalList.push({ node: wreck, life: 0, max: WRECK_MS });
    }
  }

  /** Stamps the unit's marks on the sand every few pixels it drives, now and then with a puff of dust. */
  private leaveMark(e: Entity): void {
    const kind = markKind(this.game.world.sides[e.team as Side].race, e.type);
    const cx = e.x + e.size / 2;
    const cy = e.y + e.size / 2;
    const last = this.lastMark.get(e.id);
    if (last && Math.hypot(cx - last.x, cy - last.y) < MARK_STEP) return;
    const n = (last?.n ?? 0) + 1;
    this.lastMark.set(e.id, { x: cx, y: cy, n });
    if (!kind || !last) return;
    const w = this.game.world;
    const cell = Math.floor(cy / CELL) * w.cols + Math.floor(cx / CELL);
    if (this.plated[cell] || !this.visibleCell(cx, cy)) return;
    const s = new Sprite(this.art.effects.textures[`track/${kind}/${DIRS[e.dir]}`]!);
    s.anchor.set(0.5);
    s.scale.set(ART);
    s.position.set((cx + last.x) / 2, (cy + last.y) / 2);
    this.marks.addChild(s);
    this.markList.push({ sprite: s, life: 0 });
    if (this.markList.length > MAX_MARKS) this.markList.shift()!.sprite.destroy();
    if (kind !== 'foot' && hash(e.id * 31 + n) % 4 === 0) this.play('dust', last.x, last.y + 2, 80, { vy: -0.002 });
  }

  private visibleCell(x: number, y: number): boolean {
    const w = this.game.world;
    return w.sides[this.game.side].explored[Math.floor(y / CELL) * w.cols + Math.floor(x / CELL)] === 1;
  }

  /**
   * Sand everywhere with odds and ends lying on it, the hovers' plates around their base, forest floor with firs in
   * the forest and its fringe of tufts spilling onto the sand around it.
   */
  private drawGround(): void {
    const w = this.game.world;
    const terrain = this.art.terrain;
    const inMap = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < w.cols && cy < w.rows;
    const blocked = (cx: number, cy: number) => !inMap(cx, cy) || w.blocked[cy * w.cols + cx] === 1;
    const forest = (cx: number, cy: number) => inMap(cx, cy) && w.blocked[cy * w.cols + cx] === 1;
    const plated = (cx: number, cy: number) => inMap(cx, cy) && this.plated[cy * w.cols + cx] === 1;
    const mask = (test: (cx: number, cy: number) => boolean, cx: number, cy: number) =>
      (test(cx, cy - 1) ? 1 : 0) | (test(cx + 1, cy) ? 2 : 0) | (test(cx, cy + 1) ? 4 : 0) | (test(cx - 1, cy) ? 8 : 0);
    const corners = (test: (cx: number, cy: number) => boolean, cx: number, cy: number) =>
      (test(cx + 1, cy - 1) ? 16 : 0) | (test(cx + 1, cy + 1) ? 32 : 0) | (test(cx - 1, cy + 1) ? 64 : 0) | (test(cx - 1, cy - 1) ? 128 : 0);
    const put = (texture: Texture, cx: number, cy: number) => {
      const s = new Sprite(texture);
      s.scale.set(ART);
      s.position.set(cx * CELL, cy * CELL);
      this.ground.addChild(s);
    };
    // Cells under fields and buildings stay clear of decor.
    const taken = new Uint8Array(w.cols * w.rows);
    for (const e of w.entities) {
      if (isUnit(e.type)) continue;
      const n = Math.max(1, e.size / CELL);
      for (let dy = -1; dy <= n; dy++)
        for (let dx = -1; dx <= n; dx++) {
          const x = Math.floor(e.x / CELL) + dx;
          const y = Math.floor(e.y / CELL) + dy;
          if (inMap(x, y)) taken[y * w.cols + x] = 1;
        }
    }
    const decorTotal = DECOR_WEIGHTS.reduce((a, b) => a + b, 0);
    for (let cy = 0; cy < w.rows; cy++)
      for (let cx = 0; cx < w.cols; cx++) {
        if (plated(cx, cy)) {
          put(groundPiece(terrain, 'plates', cx, cy), cx, cy);
          continue;
        }
        put(groundPiece(terrain, 'sand', cx, cy), cx, cy);
        const h = hash(cx * 7919 + cy * 104729 + 3);
        if (blocked(cx, cy)) {
          put(terrain.textures[`forest/${mask(blocked, cx, cy)}/${h % 4}`]!, cx, cy);
          this.plantFirs(cx, cy);
          continue;
        }
        const fringe = terrain.textures[`forest-fringe/${mask(forest, cx, cy) | corners(forest, cx, cy)}`];
        if (fringe) put(fringe, cx, cy);
        const m = mask(plated, cx, cy);
        if (m) put(terrain.textures[`plate-edge/${m}`]!, cx, cy);
        else if (!taken[cy * w.cols + cx] && (h >>> 8) % 1000 < DECOR_DENSITY) {
          let pick = (h >>> 18) % decorTotal;
          let variant = 0;
          while (pick >= DECOR_WEIGHTS[variant]!) pick -= DECOR_WEIGHTS[variant++]!;
          const d = this.sprite(this.tex('neutral', `decor/idle/${variant}`));
          d.position.set(cx * CELL + CELL / 2 + ((h >>> 3) % 7) - 3, cy * CELL + CELL / 2 + ((h >>> 5) % 5) - 2);
          this.decor.addChild(d);
        }
      }
  }

  /** One or two of the four firs per forest cell, a little off the cell centre. */
  private plantFirs(cx: number, cy: number): void {
    const h = hash(cx * 7919 + cy * 104729 + 17);
    const count = 1 + (h % 3 === 0 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const k = hash(h + i * 31);
      const variant = k % 4;
      const fir = this.sprite(this.tex('neutral', `fir/idle/${variant}`));
      const x = cx * CELL + CELL / 2 + ((k >>> 4) % 9) - 4 + (count === 2 ? (i ? 3 : -3) : 0);
      const y = cy * CELL + CELL / 2 + ((k >>> 8) % 7) - 3;
      fir.position.set(x, y);
      fir.zIndex = y;
      fir.visible = false;
      this.objects.addChild(fir);
      // The wind reaches neighbouring trees a moment apart: the phase follows the position, plus a little noise.
      this.firs.push({ sprite: fir, cell: cy * this.game.world.cols + cx, variant, phase: x * 0.045 + y * 0.02 + ((k >>> 12) % 100) / 60, frame: 'idle' });
    }
  }

  draw(alpha: number, dtMs: number, mouse: { x: number; y: number } | null, drag: { x0: number; y0: number; x1: number; y1: number } | null): void {
    this.clock += dtMs;
    const game = this.game;
    const world = game.world;
    const selected = new Set(game.selection);
    this.overlay.clear();
    this.ui.clear();

    this.updateFog();
    const walls = this.wallCells();
    const seen = new Set<number>();
    for (const e of world.entities) {
      if (e.hidden || !game.visible(e)) continue;
      const p = this.prev.get(e.id);
      const x = p ? p.x + (e.x - p.x) * alpha : e.x;
      const y = p ? p.y + (e.y - p.y) * alpha : e.y;
      // Enemy units show only while in sight; buildings stay remembered where they were seen.
      if (isUnit(e.type) && e.team !== game.side && !this.fog.sees(x + e.size / 2, y + e.size / 2)) continue;
      seen.add(e.id);
      this.drawObject(e, x, y, walls);
      if (!isUnit(e.type) && e.type !== ObjectType.ResourceField) this.burn(e, dtMs);
      if (selected.has(e.id)) this.drawSelection(e, x, y);
      const showHp = selected.has(e.id) || (e.hp < e.maxHp && e.type !== ObjectType.ResourceField);
      if (showHp) this.drawBars(e, x, y);
    }
    for (const [id, s] of this.sprites) {
      if (seen.has(id)) continue;
      const turret = this.turrets.get(id);
      if (!world.byId.has(id)) {
        s.destroy();
        turret?.destroy();
        this.sprites.delete(id);
        this.turrets.delete(id);
        this.lastMoved.delete(id);
        this.firedAt.delete(id);
        this.lastDir.delete(id);
        this.lastMark.delete(id);
        this.smokeAt.delete(id);
      } else {
        s.visible = false;
        if (turret) turret.visible = false;
      }
    }
    for (const [id, list] of this.flames) {
      if (seen.has(id) && world.byId.has(id)) continue;
      for (const f of list) f.destroy();
      this.flames.delete(id);
    }

    this.drawShots(alpha);
    this.ambient();
    this.drawEffects(dtMs);
    this.swayFirs();
    const cursor = this.game.cursor;
    this.drawPlacement(cursor ?? mouse);
    if (cursor) this.drawCursor(cursor);
    if (drag) {
      this.ui
        .rect(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0))
        .fill({ color: C.select, alpha: 0.12 })
        .stroke({ width: 1 / this.camera.scale.x, color: C.select });
    }
  }

  /** Cells holding a wall, per side, for picking each wall's joined frame. */
  private wallCells(): Map<string, Set<number>> {
    const w = this.game.world;
    const out = new Map<string, Set<number>>();
    for (const e of w.entities) {
      if (e.type !== ObjectType.Wall) continue;
      let set = out.get(e.team);
      if (!set) out.set(e.team, (set = new Set()));
      set.add(Math.floor(e.y / CELL) * w.cols + Math.floor(e.x / CELL));
    }
    return out;
  }

  /** The sprite frame an object shows right now, and its turret's when it has one. */
  private frameOf(e: Entity, race: Race, walls: Map<string, Set<number>>): { name: string; alpha: number; turret?: string } {
    const base = spriteName(race, e.type);
    const dir = DIRS[e.dir]!;
    const firing = this.clock - (this.firedAt.get(e.id) ?? -1e9) < FIRE_MS;
    const step = Math.floor(this.clock / 150) % 2;
    const turret = TURRETED.has(e.type) ? `${base}_turret/${firing && e.complete ? 'fire' : 'idle'}/${DIRS[turretDir(e)]}` : undefined;
    if (e.type === ObjectType.ResourceField) {
      const cell = Math.floor((e.y + e.size / 2) / CELL) * this.game.world.cols + Math.floor((e.x + e.size / 2) / CELL);
      return { name: `resource/${this.plated[cell] ? 'plates' : 'idle'}`, alpha: 0.6 + 0.4 * Math.max(0, e.hp / e.maxHp) };
    }
    if (isUnit(e.type)) {
      const moving = this.clock - (this.lastMoved.get(e.id) ?? -1e9) < MOVE_HOLD_MS;
      // Harvesting, the harvester stands still and only its cutter, beam or mandibles work.
      if (e.type === ObjectType.Harvester && e.phase === 'loading') return { name: `${base}/harvest${Math.floor(this.clock / 120) % 4}/${dir}`, alpha: 1 };
      return { name: `${base}/move${moving ? step : 0}/${dir}`, alpha: 1, turret };
    }
    if (e.type === ObjectType.Wall) {
      const w = this.game.world;
      const set = walls.get(e.team)!;
      const cx = Math.floor(e.x / CELL);
      const cy = Math.floor(e.y / CELL);
      const mask = wallMask((dx, dy) => {
        const x = cx + dx;
        const y = cy + dy;
        return x >= 0 && y >= 0 && x < w.cols && y < w.rows && set.has(y * w.cols + x);
      });
      return { name: `${base}/idle/${mask}`, alpha: 1 };
    }
    if (e.type === ObjectType.Defender) return { name: `${base}/idle`, alpha: e.complete ? 1 : 0.5, turret };
    if (!e.complete) return { name: `${race}_construction/idle`, alpha: 1 };
    if (e.type === ObjectType.PlayerHQ || e.type === ObjectType.EnemyHQ) return { name: `${base}/idle${Math.floor(this.clock / 260) % 4}`, alpha: 1 };
    if (e.type === ObjectType.TankFactory) return { name: `${base}/${e.job?.kind === 'produce' ? 'work' : 'idle'}`, alpha: 1 };
    return { name: `${base}/idle`, alpha: 1 };
  }

  private drawObject(e: Entity, x: number, y: number, walls: Map<string, Set<number>>): void {
    const race = e.team === 'neutral' ? 'human' : this.game.world.sides[e.team].race;
    const { name, alpha, turret } = this.frameOf(e, race, walls);
    let s = this.sprites.get(e.id);
    const texture = this.tex(e.team, name);
    if (!s) {
      s = this.sprite(texture);
      this.sprites.set(e.id, s);
      this.objects.addChild(s);
    }
    if (s.texture !== texture) s.texture = texture;
    s.visible = true;
    s.alpha = alpha;
    s.position.set(x + e.size / 2, y + e.size / 2);
    // Fields lie flat on the ground, under anything standing on them.
    const z = e.type === ObjectType.ResourceField ? -1e6 + y : y + e.size;
    if (s.zIndex !== z) s.zIndex = z;
    this.lastDir.set(e.id, e.dir);
    let t = this.turrets.get(e.id);
    if (!turret) {
      if (t) t.visible = false;
      return;
    }
    const tt = this.tex(e.team, turret);
    if (!t) {
      t = this.sprite(tt);
      this.turrets.set(e.id, t);
      this.objects.addChild(t);
    }
    if (t.texture !== tt) t.texture = tt;
    t.visible = true;
    t.alpha = alpha;
    t.position.copyFrom(s.position);
    if (t.zIndex !== z + 0.5) t.zIndex = z + 0.5;
  }

  /** A building below half its life smokes, below a quarter it burns as well. */
  private burn(e: Entity, dtMs: number): void {
    const k = e.complete ? e.hp / e.maxHp : 1;
    const big = e.size > CELL;
    const flames = this.flames.get(e.id);
    if (k >= 0.25 && flames) {
      for (const f of flames) f.destroy();
      this.flames.delete(e.id);
    }
    if (k >= 0.5) return;
    const seed = hash(e.id * 13);
    const spot = (i: number) => {
      const h = hash(seed + i * 101);
      return { x: e.x + e.size * (0.25 + ((h % 50) / 100)), y: e.y + e.size * (0.3 + (((h >>> 8) % 40) / 100)) };
    };
    const next = (this.smokeAt.get(e.id) ?? 0) - dtMs;
    if (next <= 0) {
      const p = spot(Math.floor(this.clock / 700) % (big ? 3 : 1));
      this.play('smoke', p.x, p.y - (big ? 8 : 4), 230, { vx: 0.002, vy: -0.006, scale: big ? 1 : 0.7 });
      this.smokeAt.set(e.id, (k < 0.25 ? 260 : 480) + (seed % 120));
    } else this.smokeAt.set(e.id, next);
    if (k >= 0.25) return;
    let list = flames;
    if (!list) {
      list = [];
      for (let i = 0; i < (big ? 2 : 1); i++) {
        const p = spot(i);
        const f = new Sprite(this.fxFrames.get('fire')![0]!);
        f.anchor.copyFrom(f.texture.defaultAnchor ?? { x: 0.5, y: 1 });
        f.scale.set(ART * (big ? 1 : 0.75));
        f.position.set(p.x, p.y - (big ? 3 : 1));
        f.zIndex = e.y + e.size + 0.6;
        this.objects.addChild(f);
        list.push(f);
      }
      this.flames.set(e.id, list);
    }
    const frames = this.fxFrames.get('fire')!;
    list.forEach((f, i) => (f.texture = frames[(Math.floor(this.clock / 110) + i * 2) % frames.length]!));
  }

  /** The map's own life: crystals glinting in the sun and wisps of sand blown across the dunes. */
  private ambient(): void {
    const w = this.game.world;
    if (this.clock - this.glintAt > GLINT_MS) {
      this.glintAt = this.clock;
      const fields = w.entities.filter((e) => e.type === ObjectType.ResourceField && this.visibleCell(e.x + e.size / 2, e.y + e.size / 2));
      const f = fields[Math.floor(Math.random() * fields.length)];
      if (f) this.play('glint', f.x + 3 + Math.random() * (f.size - 6), f.y + 3 + Math.random() * (f.size - 6), 75);
    }
    if (this.clock - this.wispAt > WISP_MS) {
      this.wispAt = this.clock;
      const cx = Math.floor(Math.random() * w.cols);
      const cy = Math.floor(Math.random() * w.rows);
      const i = cy * w.cols + cx;
      if (!w.blocked[i] && !this.plated[i] && this.visibleCell(cx * CELL, cy * CELL)) {
        this.play('wisp', cx * CELL + Math.random() * CELL, cy * CELL + Math.random() * CELL, 0, { vx: 0.014, vy: 0.003, hold: 2600 });
      }
    }
  }

  /** Firs lean with the gusts, each a moment after the tree upwind of it. */
  private swayFirs(): void {
    const t = this.clock / 1000;
    for (const f of this.firs) {
      if (!f.sprite.visible) continue;
      const gust = Math.sin(t * 1.1 + f.phase) + 0.7 * Math.sin(t * 0.43 + f.phase * 0.5);
      const frame = gust > 1.15 ? 'sway0' : gust < -1.25 ? 'sway1' : 'idle';
      if (frame === f.frame) continue;
      f.frame = frame;
      f.sprite.texture = this.tex('neutral', `fir/${frame}/${f.variant}`);
    }
  }

  private drawShots(alpha: number): void {
    const world = this.game.world;
    let i = 0;
    for (const p of world.projectiles) {
      const x = p.x + p.vx * alpha;
      const y = p.y + p.vy * alpha;
      if (!this.visibleCell(x, y)) continue;
      const race = world.sides[p.team].race;
      const texture = this.tex(p.team, `${race}_shot/${p.weapon}/${DIRS[dirOf(p.vx, p.vy)]}`);
      let s = this.shotSprites[i];
      if (!s) {
        s = this.sprite(texture);
        this.shotSprites.push(s);
        this.shots.addChild(s);
      }
      s.texture = texture;
      s.visible = true;
      s.position.set(x, y);
      i++;
    }
    for (; i < this.shotSprites.length; i++) this.shotSprites[i]!.visible = false;
  }

  private drawEffects(dtMs: number): void {
    this.effects = this.effects.filter((fx) => {
      fx.life += dtMs;
      const t = fx.life - fx.delay;
      if (t < 0) return true;
      const s = fx.sprite;
      s.visible = true;
      s.x += fx.vx * dtMs;
      s.y += fx.vy * dtMs;
      if (fx.hold) {
        if (t >= fx.hold) {
          s.destroy();
          return false;
        }
        s.alpha = Math.min(1, t / 400, (fx.hold - t) / 600);
        return true;
      }
      const k = Math.floor(t / fx.frameMs);
      if (k >= fx.frames.length) {
        s.destroy();
        return false;
      }
      s.texture = fx.frames[k]!;
      return true;
    });
    this.decalList = this.decalList.filter((d) => {
      d.life += dtMs;
      if (d.life >= d.max) {
        d.node.destroy();
        return false;
      }
      // Wrecks and scorch marks fade over the last third of their time.
      d.node.alpha = Math.min(1, 3 * (1 - d.life / d.max));
      return true;
    });
    this.markList = this.markList.filter((m) => {
      m.life += dtMs;
      if (m.life >= MARK_MS) {
        m.sprite.destroy();
        return false;
      }
      m.sprite.alpha = Math.min(1, 2 * (1 - m.life / MARK_MS));
      return true;
    });
  }

  /** Fog: recomputed a few times a second, and at once when more of the map is explored. */
  private updateFog(): void {
    const explored = this.game.world.sides[this.game.side].explored;
    let count = 0;
    for (let i = 0; i < explored.length; i++) count += explored[i]!;
    if (count === this.exploredCount && this.clock - this.fogAt < FOG_MS) return;
    if (count !== this.exploredCount) for (const f of this.firs) f.sprite.visible = explored[f.cell] === 1;
    this.exploredCount = count;
    this.fogAt = this.clock;
    this.fog.update();
  }

  /** A side's team colour: the middle of its ramp. */
  private sideColor(side: Side): number {
    const ramp = TEAM_COLORS[this.game.world.sides[side].color];
    return Number.parseInt(ramp[2].slice(1), 16);
  }

  private drawSelection(e: Entity, x: number, y: number): void {
    const w = 1 / this.camera.scale.x;
    const own = e.team === this.game.side;
    const color = own ? C.select : e.team === 'neutral' ? C.field : C.hpBad;
    const len = Math.max(3, e.size / 4);
    const g = this.overlay;
    const s = e.size;
    // Corner brackets like the original selection frame.
    for (const [ox, oy, sx, sy] of [
      [x, y, 1, 1],
      [x + s, y, -1, 1],
      [x, y + s, 1, -1],
      [x + s, y + s, -1, -1],
    ] as const) {
      g.moveTo(ox + sx * len, oy).lineTo(ox, oy).lineTo(ox, oy + sy * len).stroke({ width: w * 1.5, color });
    }
    if (own && isUnit(e.type)) {
      const weapon = UNIT_RULES[e.type as UnitType].weapon;
      if (weapon) g.rect(x - weapon.range, y - weapon.range, s + weapon.range * 2, s + weapon.range * 2).stroke({ width: w, color, alpha: 0.25 });
    }
    if (own && e.type === ObjectType.Defender) {
      const range = BUILDING_RULES[e.type as BuildingType].weapon!.range;
      g.rect(x - range, y - range, s + range * 2, s + range * 2).stroke({ width: w, color, alpha: 0.25 });
    }
  }

  private drawBars(e: Entity, x: number, y: number): void {
    const g = this.overlay;
    const w = e.size;
    const k = Math.max(0, e.hp / e.maxHp);
    // Above the sprite: buildings and units stand taller than their footprint.
    const top = y - (e.size > CELL ? 9 : 6);
    g.rect(x, top, w, 2).fill({ color: 0x000000, alpha: 0.6 });
    g.rect(x, top, w * k, 2).fill(k > 0.4 ? C.hpGood : C.hpBad);
    let progress = -1;
    if (!e.complete && e.buildTotalMs > 0) progress = e.buildElapsedMs / e.buildTotalMs;
    if (e.job?.kind === 'produce') progress = e.job.elapsedMs / e.job.totalMs;
    if (e.type === ObjectType.Harvester) progress = e.cargo / 50;
    if (progress >= 0) {
      g.rect(x, top - 3, w, 2).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(x, top - 3, w * progress, 2).fill(e.type === ObjectType.Harvester ? C.field : 0x8fb8ff);
    }
  }

  /** A gamepad player's crosshair. */
  private drawCursor(c: { x: number; y: number }): void {
    const w = 1.5 / this.camera.scale.x;
    const r = 5;
    const color = this.sideColor(this.game.side);
    for (const stroke of [{ width: w * 3, color: 0x000000, alpha: 0.6 }, { width: w, color: 0xffffff }]) {
      this.ui.circle(c.x, c.y, r).stroke(stroke);
      this.ui.moveTo(c.x - r * 1.8, c.y).lineTo(c.x - r * 0.6, c.y).moveTo(c.x + r * 0.6, c.y).lineTo(c.x + r * 1.8, c.y).stroke(stroke);
      this.ui.moveTo(c.x, c.y - r * 1.8).lineTo(c.x, c.y - r * 0.6).moveTo(c.x, c.y + r * 0.6).lineTo(c.x, c.y + r * 1.8).stroke(stroke);
    }
    this.ui.circle(c.x, c.y, 1.2 * w).fill(color);
  }

  /** The building about to be placed, see-through, on a green or red footprint. */
  private drawPlacement(mouse: { x: number; y: number } | null): void {
    const placing = this.game.placing;
    if (!placing || !mouse) {
      this.ghost.visible = false;
      return;
    }
    const { cx, cy } = this.game.placementCell(mouse.x, mouse.y, placing.type);
    const size = BUILDING_RULES[placing.type].cells * CELL;
    const ok = this.game.canPlaceAt(mouse.x, mouse.y);
    this.ui
      .rect(cx * CELL, cy * CELL, size, size)
      .fill({ color: ok ? C.ghostOk : C.ghostBad, alpha: 0.25 })
      .stroke({ width: 1 / this.camera.scale.x, color: ok ? C.ghostOk : C.ghostBad });
    const side = this.game.side;
    const race = this.game.world.sides[side].race;
    const base = spriteName(race, placing.type);
    const frame =
      placing.type === ObjectType.Wall
        ? `${base}/idle/0`
        : placing.type === ObjectType.Defender
          ? `${base}/idle`
          : placing.type === ObjectType.PlayerHQ || placing.type === ObjectType.EnemyHQ
            ? `${base}/idle0`
            : `${base}/idle`;
    this.ghost.texture = this.tex(side, frame);
    this.ghost.anchor.copyFrom(this.ghost.texture.defaultAnchor ?? { x: 0.5, y: 0.5 });
    this.ghost.scale.set(ART);
    this.ghost.position.set(cx * CELL + size / 2, cy * CELL + size / 2);
    this.ghost.alpha = 0.6;
    this.ghost.tint = ok ? 0xffffff : 0xff8070;
    this.ghost.visible = true;
  }
}

/** Fraction of the current tick that has elapsed, for interpolation. */
export function tickAlpha(accMs: number): number {
  return Math.min(1, accMs / TICK_MS);
}
