import { Container, Graphics, Sprite, type Spritesheet, type Texture } from 'pixi.js';
import { CELL, ObjectType, spriteName, TEAM_COLORS, type Race } from '@sw/data';
import { isUnit, TICK_MS, UNIT_RULES, BUILDING_RULES, type Entity, type GameEvent, type Side, type UnitType, type BuildingType, type World } from '@sw/sim';
import { ART_PX_PER_CELL, groundPiece, type Art } from './assets';
import type { Commander } from './game';
import { Marks } from './ui/marks';

/** Map pixels per art pixel: the sprites are drawn at 32 px per 15 px cell. */
const ART = CELL / ART_PX_PER_CELL;

const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

const C = {
  shroud: 0x0b0a08,
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

interface Effect {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  kind: 'blast' | 'spark' | 'smoke';
  /** Smoke drifts up and sideways. */
  vx: number;
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
  private readonly decals = new Container();
  private readonly objects = new Container({ sortableChildren: true });
  private readonly shots = new Container();
  private readonly fx = new Graphics();
  private readonly marks = new Marks();
  private readonly shroud = new Graphics();
  private readonly ui = new Graphics();
  private readonly ghost = new Sprite();
  private readonly sprites = new Map<number, Sprite>();
  private readonly shotSprites: Sprite[] = [];
  private effects: Effect[] = [];
  private decalList: Decal[] = [];
  private exploredCount = -1;
  /** Positions at the previous tick, for smooth movement between 20 Hz sim steps. */
  private prev = new Map<number, { x: number; y: number }>();
  private readonly lastMoved = new Map<number, number>();
  private readonly firedAt = new Map<number, number>();
  private readonly lastDir = new Map<number, number>();
  private clock = 0;
  private readonly plated: Uint8Array;
  /** Firs by the cell they grow in: hidden until the cell is seen, as they would poke out of the dark. */
  private readonly firs: Array<{ sprite: Sprite; cell: number }> = [];

  /** Draws the world as one person sees it: their fog, their selection, their cursor. */
  constructor(
    private readonly game: Commander,
    private readonly art: Art,
  ) {
    this.plated = platedCells(game.world);
    this.ghost.visible = false;
    this.camera.addChild(this.ground, this.decals, this.marks.under, this.objects, this.shots, this.fx, this.marks.over, this.shroud, this.ui);
    this.objects.addChild(this.ghost);
    this.ghost.zIndex = 1e9;
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
  }

  /** Call right after every sim step: notes who moved and fired, and turns sim events into effects. */
  afterStep(events: GameEvent[]): void {
    for (const e of this.game.world.entities) {
      const p = this.prev.get(e.id);
      if (p && (p.x !== e.x || p.y !== e.y)) this.lastMoved.set(e.id, this.clock);
    }
    for (const ev of events) {
      if (ev.kind === 'shot') this.firedAt.set(ev.id, this.clock);
      if (ev.kind === 'hit') this.burst(ev.x, ev.y, ev.weapon === 'cannon' ? 5 : 3, 'spark');
      if (ev.kind === 'destroyed') this.destroyed(ev);
    }
  }

  private burst(x: number, y: number, r: number, kind: Effect['kind'], max = kind === 'spark' ? 220 : 650, vx = 0): void {
    this.effects.push({ x, y, r, life: 0, max, kind, vx });
  }

  private destroyed(ev: Extract<GameEvent, { kind: 'destroyed' }>): void {
    const cx = ev.x + ev.size / 2;
    const cy = ev.y + ev.size / 2;
    const seed = hash(ev.id);
    const big = ev.size > CELL;
    this.burst(cx, cy, ev.size * 0.75, 'blast', big ? 900 : 650);
    for (let i = 0; i < (big ? 6 : 3); i++) {
      const h = hash(seed + i);
      this.burst(cx + ((h % 13) - 6) * (big ? 1.4 : 0.7), cy + (((h >>> 8) % 9) - 4), 3 + (h % 4), 'smoke', 1800 + (h % 900), ((h >>> 4) % 5) / 900);
    }
    if (ev.type === ObjectType.ResourceField || !this.visibleCell(cx, cy)) return;
    if (isUnit(ev.type) && ev.team !== 'neutral') {
      const race = this.game.world.sides[ev.team].race;
      const dir = DIRS[this.lastDir.get(ev.id) ?? ev.dir]!;
      const wreck = this.sprite(this.tex(ev.team, `${spriteName(race, ev.type)}/wreck/${dir}`));
      wreck.position.set(cx, cy);
      this.decals.addChild(wreck);
      this.decalList.push({ node: wreck, life: 0, max: WRECK_MS });
    } else {
      // A building leaves a scorched patch of ground.
      const g = new Graphics();
      const r = ev.size * 0.55;
      g.ellipse(cx, cy + 1, r * 1.15, r * 0.8).fill({ color: 0x1a120a, alpha: 0.55 });
      g.ellipse(cx - r * 0.2, cy, r * 0.6, r * 0.42).fill({ color: 0x0a0806, alpha: 0.5 });
      this.decals.addChild(g);
      this.decalList.push({ node: g, life: 0, max: SCORCH_MS });
    }
  }

  private visibleCell(x: number, y: number): boolean {
    const w = this.game.world;
    return w.sides[this.game.side].explored[Math.floor(y / CELL) * w.cols + Math.floor(x / CELL)] === 1;
  }

  /** Sand everywhere, the hovers' plates around their base, forest floor with firs in the forest. */
  private drawGround(): void {
    const w = this.game.world;
    const terrain = this.art.terrain;
    const blocked = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= w.cols || cy >= w.rows || w.blocked[cy * w.cols + cx] === 1;
    const plated = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < w.cols && cy < w.rows && this.plated[cy * w.cols + cx] === 1;
    const mask = (test: (cx: number, cy: number) => boolean, cx: number, cy: number) =>
      (test(cx, cy - 1) ? 1 : 0) | (test(cx + 1, cy) ? 2 : 0) | (test(cx, cy + 1) ? 4 : 0) | (test(cx - 1, cy) ? 8 : 0);
    const put = (texture: Texture, cx: number, cy: number) => {
      const s = new Sprite(texture);
      s.scale.set(ART);
      s.position.set(cx * CELL, cy * CELL);
      this.ground.addChild(s);
    };
    for (let cy = 0; cy < w.rows; cy++)
      for (let cx = 0; cx < w.cols; cx++) {
        if (plated(cx, cy)) {
          put(groundPiece(terrain, 'plates', cx, cy), cx, cy);
          continue;
        }
        put(groundPiece(terrain, 'sand', cx, cy), cx, cy);
        if (blocked(cx, cy)) {
          put(terrain.textures[`forest/${mask(blocked, cx, cy)}`]!, cx, cy);
          this.plantFirs(cx, cy);
        } else {
          const m = mask(plated, cx, cy);
          if (m) put(terrain.textures[`plate-edge/${m}`]!, cx, cy);
        }
      }
  }

  /** One or two of the four firs per forest cell, a little off the cell centre. */
  private plantFirs(cx: number, cy: number): void {
    const h = hash(cx * 7919 + cy * 104729 + 17);
    const count = 1 + (h % 3 === 0 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const k = hash(h + i * 31);
      const fir = this.sprite(this.tex('neutral', `fir/idle/${k % 4}`));
      const x = cx * CELL + CELL / 2 + ((k >>> 4) % 9) - 4 + (count === 2 ? (i ? 3 : -3) : 0);
      const y = cy * CELL + CELL / 2 + ((k >>> 8) % 7) - 3;
      fir.position.set(x, y);
      fir.zIndex = y;
      fir.visible = false;
      this.objects.addChild(fir);
      this.firs.push({ sprite: fir, cell: cy * this.game.world.cols + cx });
    }
  }

  draw(alpha: number, dtMs: number, mouse: { x: number; y: number } | null, drag: { x0: number; y0: number; x1: number; y1: number } | null): void {
    this.clock += dtMs;
    const game = this.game;
    const world = game.world;
    const selected = new Set(game.selection);
    this.marks.clear();
    this.ui.clear();
    this.fx.clear();

    const walls = this.wallCells();
    const seen = new Set<number>();
    for (const e of world.entities) {
      if (e.hidden || !game.visible(e)) continue;
      const p = this.prev.get(e.id);
      const x = p ? p.x + (e.x - p.x) * alpha : e.x;
      const y = p ? p.y + (e.y - p.y) * alpha : e.y;
      seen.add(e.id);
      this.drawObject(e, x, y, walls);
      if (selected.has(e.id)) this.marks.selection(e, x, y, game.side);
      const showHp = selected.has(e.id) || (e.hp < e.maxHp && e.type !== ObjectType.ResourceField);
      if (showHp) this.marks.bars(e, x, y);
    }
    for (const [id, s] of this.sprites) {
      if (seen.has(id)) continue;
      if (!world.byId.has(id)) {
        s.destroy();
        this.sprites.delete(id);
        this.lastMoved.delete(id);
        this.firedAt.delete(id);
        this.lastDir.delete(id);
      } else s.visible = false;
    }

    this.drawShots(alpha);
    this.drawEffects(dtMs);
    this.drawShroud();
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

  /** The sprite frame an object shows right now. */
  private frameOf(e: Entity, race: Race, walls: Map<string, Set<number>>): { name: string; alpha: number } {
    const base = spriteName(race, e.type);
    const dir = DIRS[e.dir]!;
    const firing = this.clock - (this.firedAt.get(e.id) ?? -1e9) < FIRE_MS;
    const step = Math.floor(this.clock / 150) % 2;
    if (e.type === ObjectType.ResourceField) {
      const cell = Math.floor((e.y + e.size / 2) / CELL) * this.game.world.cols + Math.floor((e.x + e.size / 2) / CELL);
      return { name: `resource/${this.plated[cell] ? 'plates' : 'idle'}`, alpha: 0.6 + 0.4 * Math.max(0, e.hp / e.maxHp) };
    }
    if (isUnit(e.type)) {
      const moving = this.clock - (this.lastMoved.get(e.id) ?? -1e9) < MOVE_HOLD_MS;
      if (e.type === ObjectType.Harvester) {
        if (e.phase === 'loading') return { name: `${base}/harvest${step}/${dir}`, alpha: 1 };
        return { name: `${base}/move${moving ? step : 0}/${dir}`, alpha: 1 };
      }
      if (firing) return { name: `${base}/fire/${dir}`, alpha: 1 };
      return { name: `${base}/move${moving ? step : 0}/${dir}`, alpha: 1 };
    }
    if (e.type === ObjectType.Wall) {
      const w = this.game.world;
      const set = walls.get(e.team)!;
      const cx = Math.floor(e.x / CELL);
      const cy = Math.floor(e.y / CELL);
      const has = (x: number, y: number) => x >= 0 && y >= 0 && x < w.cols && y < w.rows && set.has(y * w.cols + x);
      const mask = (has(cx, cy - 1) ? 1 : 0) | (has(cx + 1, cy) ? 2 : 0) | (has(cx, cy + 1) ? 4 : 0) | (has(cx - 1, cy) ? 8 : 0);
      return { name: `${base}/idle/${mask}`, alpha: 1 };
    }
    if (e.type === ObjectType.Defender) {
      return { name: `${base}/${firing && e.complete ? 'fire' : 'idle'}/${dir}`, alpha: e.complete ? 1 : 0.5 };
    }
    if (!e.complete) return { name: `${race}_construction/idle`, alpha: 1 };
    if (e.type === ObjectType.PlayerHQ || e.type === ObjectType.EnemyHQ) return { name: `${base}/idle${Math.floor(this.clock / 260) % 4}`, alpha: 1 };
    if (e.type === ObjectType.TankFactory) return { name: `${base}/${e.job?.kind === 'produce' ? 'work' : 'idle'}`, alpha: 1 };
    return { name: `${base}/idle`, alpha: 1 };
  }

  private drawObject(e: Entity, x: number, y: number, walls: Map<string, Set<number>>): void {
    const race = e.team === 'neutral' ? 'human' : this.game.world.sides[e.team].race;
    const { name, alpha } = this.frameOf(e, race, walls);
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
    this.effects = this.effects.filter((fx) => (fx.life += dtMs) < fx.max);
    const g = this.fx;
    for (const fx of this.effects) {
      const k = fx.life / fx.max;
      if (fx.kind === 'spark') {
        g.circle(fx.x, fx.y, fx.r * (0.5 + k)).fill({ color: 0xffd27a, alpha: 0.9 * (1 - k) });
        g.circle(fx.x, fx.y, fx.r * 0.45 * (1 - k)).fill({ color: 0xffffff, alpha: 1 - k });
      } else if (fx.kind === 'blast') {
        g.circle(fx.x, fx.y, fx.r * (0.5 + 0.9 * k)).fill({ color: 0xff6a1a, alpha: 0.85 * (1 - k) });
        g.circle(fx.x, fx.y, fx.r * (0.35 + 0.5 * k)).fill({ color: 0xffc04a, alpha: 0.9 * (1 - k) * (1 - k) });
        if (k < 0.25) g.circle(fx.x, fx.y, fx.r * 0.5).fill({ color: 0xffffff, alpha: 0.8 * (1 - k * 4) });
      } else {
        const rise = fx.life * 0.006;
        g.circle(fx.x + fx.life * fx.vx * 6, fx.y - rise, fx.r * (0.8 + k)).fill({ color: 0x2a2620, alpha: 0.45 * (1 - k) });
      }
    }
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
  }

  /** A side's team colour: the middle of its ramp. */
  private sideColor(side: Side): number {
    const ramp = TEAM_COLORS[this.game.world.sides[side].color];
    return Number.parseInt(ramp[2].slice(1), 16);
  }

  private drawShroud(): void {
    const world = this.game.world;
    const explored = world.sides[this.game.side].explored;
    let count = 0;
    for (let i = 0; i < explored.length; i++) count += explored[i]!;
    if (count === this.exploredCount) return;
    this.exploredCount = count;
    for (const f of this.firs) f.sprite.visible = explored[f.cell] === 1;
    const g = this.shroud;
    g.clear();
    const dark = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < world.cols && cy < world.rows && !explored[cy * world.cols + cx];
    for (let cy = 0; cy < world.rows; cy++)
      for (let cx = 0; cx < world.cols; cx++) {
        if (dark(cx, cy)) {
          g.rect(cx * CELL - 0.5, cy * CELL - 0.5, CELL + 1, CELL + 1).fill(C.shroud);
          continue;
        }
        // A soft edge: seen cells next to the dark get a little of it along that side.
        const fade = 5;
        if (dark(cx, cy - 1)) g.rect(cx * CELL, cy * CELL, CELL, fade).fill({ color: C.shroud, alpha: 0.45 });
        if (dark(cx, cy + 1)) g.rect(cx * CELL, (cy + 1) * CELL - fade, CELL, fade).fill({ color: C.shroud, alpha: 0.45 });
        if (dark(cx - 1, cy)) g.rect(cx * CELL, cy * CELL, fade, CELL).fill({ color: C.shroud, alpha: 0.45 });
        if (dark(cx + 1, cy)) g.rect((cx + 1) * CELL - fade, cy * CELL, fade, CELL).fill({ color: C.shroud, alpha: 0.45 });
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
          ? `${base}/idle/s`
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
