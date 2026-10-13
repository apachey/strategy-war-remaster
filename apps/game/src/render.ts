import { Container, Graphics, Text } from 'pixi.js';
import { CELL, ObjectType, TILE } from '@sw/data';
import { isUnit, TICK_MS, UNIT_RULES, BUILDING_RULES, type Entity, type GameEvent, type UnitType, type BuildingType } from '@sw/sim';
import type { Commander } from './game';
import { SHORT } from './text';

/** Grey-box palette: readable shapes only, the real art arrives in phase 2. */
const C = {
  sand: 0xd8c491,
  sandLine: 0xcbb57f,
  forest: 0x2f6b3d,
  forestEdge: 0x24552f,
  player: 0x2c8fa3,
  playerDark: 0x1b5f6e,
  enemy: 0xb8372a,
  enemyDark: 0x7a2018,
  field: 0xf0c43a,
  fieldDark: 0xc79a1c,
  wall: 0x8d9497,
  shroud: 0x0b0a08,
  select: 0x9dff7a,
  hpGood: 0x6ee06e,
  hpBad: 0xe05a3a,
  shell: 0xfff1b0,
  ghostOk: 0x6ee06e,
  ghostBad: 0xe05a3a,
};

const DIR_VEC: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0.707, -0.707],
  [1, 0],
  [0.707, 0.707],
  [0, 1],
  [-0.707, 0.707],
  [-1, 0],
  [-0.707, -0.707],
];

interface Effect {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: number;
}

export class Renderer {
  readonly camera = new Container();
  private readonly ground = new Graphics();
  private readonly fields = new Graphics();
  private readonly bodies = new Graphics();
  private readonly labels = new Container();
  private readonly overlay = new Graphics();
  private readonly shroud = new Graphics();
  private readonly ui = new Graphics();
  private readonly texts = new Map<number, Text>();
  private effects: Effect[] = [];
  private exploredCount = -1;
  /** Positions at the previous tick, for smooth movement between 20 Hz sim steps. */
  private prev = new Map<number, { x: number; y: number }>();

  /** Draws the world as one person sees it: their fog, their selection, their cursor. */
  constructor(private readonly game: Commander) {
    this.camera.addChild(this.ground, this.fields, this.bodies, this.labels, this.overlay, this.shroud, this.ui);
    this.drawGround();
  }

  /** Call right before every sim step. */
  beforeStep(): void {
    this.prev.clear();
    for (const e of this.game.world.entities) this.prev.set(e.id, { x: e.x, y: e.y });
  }

  /** Call right after every sim step: turns sim events into short-lived effects. */
  afterStep(events: GameEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'hit') this.effects.push({ x: ev.x, y: ev.y, r: ev.weapon === 'cannon' ? 6 : 3, life: 0, max: 250, color: 0xffb347 });
      if (ev.kind === 'shot') this.effects.push({ x: ev.x, y: ev.y, r: 2, life: 0, max: 100, color: 0xffffff });
      if (ev.kind === 'destroyed')
        this.effects.push({ x: ev.x + ev.size / 2, y: ev.y + ev.size / 2, r: ev.size * 0.9, life: 0, max: 600, color: 0xff7a2a });
    }
  }

  private drawGround(): void {
    const w = this.game.world;
    const g = this.ground;
    g.rect(0, 0, w.cols * CELL, w.rows * CELL).fill(C.sand);
    for (let x = TILE; x < w.cols * CELL; x += TILE) g.rect(x, 0, 0.5, w.rows * CELL).fill({ color: C.sandLine, alpha: 0.6 });
    for (let y = TILE; y < w.rows * CELL; y += TILE) g.rect(0, y, w.cols * CELL, 0.5).fill({ color: C.sandLine, alpha: 0.6 });
    for (let i = 0; i < w.blocked.length; i++) {
      if (!w.blocked[i]) continue;
      const x = (i % w.cols) * CELL;
      const y = Math.floor(i / w.cols) * CELL;
      g.rect(x, y, CELL, CELL).fill(C.forest);
      // A few "tree" dots so the forest reads as forest, not as a wall.
      g.circle(x + 4, y + 5, 2.5).fill(C.forestEdge);
      g.circle(x + 10, y + 10, 2.5).fill(C.forestEdge);
    }
  }

  draw(alpha: number, dtMs: number, mouse: { x: number; y: number } | null, drag: { x0: number; y0: number; x1: number; y1: number } | null): void {
    const game = this.game;
    const world = game.world;
    const selected = new Set(game.selection);

    this.fields.clear();
    this.bodies.clear();
    this.overlay.clear();
    this.ui.clear();
    const seenLabels = new Set<number>();

    for (const e of world.entities) {
      if (e.hidden || !game.visible(e)) continue;
      const p = this.prev.get(e.id);
      const x = p ? p.x + (e.x - p.x) * alpha : e.x;
      const y = p ? p.y + (e.y - p.y) * alpha : e.y;
      if (e.type === ObjectType.ResourceField) this.drawField(e, x, y);
      else if (isUnit(e.type)) this.drawUnit(e, x, y);
      else {
        this.drawBuilding(e, x, y);
        if (SHORT[e.type]) {
          this.label(e, x, y);
          seenLabels.add(e.id);
        }
      }
      if (selected.has(e.id)) this.drawSelection(e, x, y);
      const showHp = selected.has(e.id) || (e.hp < e.maxHp && e.type !== ObjectType.ResourceField);
      if (showHp) this.drawBars(e, x, y);
    }
    for (const [id, t] of this.texts) {
      if (!seenLabels.has(id)) {
        t.destroy();
        this.texts.delete(id);
      }
    }

    for (const p of world.projectiles) {
      this.bodies.circle(p.x + p.vx * alpha, p.y + p.vy * alpha, p.weapon === 'cannon' ? 2 : 1.2).fill(C.shell);
    }

    this.effects = this.effects.filter((fx) => (fx.life += dtMs) < fx.max);
    for (const fx of this.effects) {
      const k = fx.life / fx.max;
      this.overlay.circle(fx.x, fx.y, fx.r * (0.4 + k)).fill({ color: fx.color, alpha: 0.8 * (1 - k) });
    }

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

  private teamColor(e: Entity, dark = false): number {
    if (e.team === 'enemy') return dark ? C.enemyDark : C.enemy;
    return dark ? C.playerDark : C.player;
  }

  private drawField(e: Entity, x: number, y: number): void {
    const g = this.fields;
    g.rect(x + 1, y + 1, e.size - 2, e.size - 2).fill(C.field);
    for (let i = 4; i < e.size - 2; i += 5) g.rect(x + 2, y + i, e.size - 4, 1).fill(C.fieldDark);
  }

  private drawBuilding(e: Entity, x: number, y: number): void {
    const g = this.bodies;
    if (e.type === ObjectType.Wall) {
      g.rect(x + 1, y + 1, e.size - 2, e.size - 2).fill(C.wall).stroke({ width: 1, color: this.teamColor(e) });
      return;
    }
    const inset = e.size === CELL ? 1.5 : 2;
    const alpha = e.complete ? 1 : 0.45;
    g.roundRect(x + inset, y + inset, e.size - inset * 2, e.size - inset * 2, 3)
      .fill({ color: this.teamColor(e), alpha })
      .stroke({ width: 1, color: this.teamColor(e, true) });
    if (e.type === ObjectType.Defender && e.complete) {
      const [dx, dy] = DIR_VEC[e.dir]!;
      const cx = x + e.size / 2;
      const cy = y + e.size / 2;
      g.circle(cx, cy, 3.5).fill(this.teamColor(e, true));
      g.moveTo(cx, cy).lineTo(cx + dx * 7, cy + dy * 7).stroke({ width: 2, color: this.teamColor(e, true) });
    }
    if (e.type === ObjectType.Silo && e.dockedId) g.rect(x + 9, y + 9, 12, 12).fill({ color: 0xffffff, alpha: 0.5 });
  }

  private drawUnit(e: Entity, x: number, y: number): void {
    const g = this.bodies;
    const color = this.teamColor(e);
    const dark = this.teamColor(e, true);
    const cx = x + e.size / 2;
    const cy = y + e.size / 2;
    const [dx, dy] = DIR_VEC[e.dir]!;
    if (e.type === ObjectType.Harvester) {
      g.rect(x + 2, y + 2, 11, 11).fill(color).stroke({ width: 1, color: dark });
      g.rect(x + 4, y + 4, 7, 7).fill(e.cargo > 0 ? C.field : dark);
      return;
    }
    const r = e.type === ObjectType.HeavyTank ? 6.5 : e.type === ObjectType.MiddleTank ? 5.8 : 5;
    g.roundRect(cx - r, cy - r, r * 2, r * 2, 2).fill(color).stroke({ width: 1, color: dark });
    const barrel = e.type === ObjectType.LightTank || e.type === ObjectType.EnemyTank ? 6 : 8;
    g.moveTo(cx, cy).lineTo(cx + dx * barrel, cy + dy * barrel).stroke({ width: e.type === ObjectType.HeavyTank ? 2.5 : 1.8, color: dark });
    g.circle(cx, cy, 2.2).fill(dark);
  }

  private label(e: Entity, x: number, y: number): void {
    let t = this.texts.get(e.id);
    if (!t) {
      t = new Text({ text: SHORT[e.type]!, style: { fontFamily: 'Menlo, monospace', fontSize: 24, fontWeight: 'bold', fill: 0xffffff } });
      t.scale.set(e.size === CELL ? 0.25 : 0.33);
      t.anchor.set(0.5);
      this.labels.addChild(t);
      this.texts.set(e.id, t);
    }
    t.position.set(x + e.size / 2, y + e.size / 2);
    t.alpha = e.complete ? 0.9 : 0.5;
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
    g.rect(x, y - 3, w, 2).fill({ color: 0x000000, alpha: 0.6 });
    g.rect(x, y - 3, w * k, 2).fill(k > 0.4 ? C.hpGood : C.hpBad);
    let progress = -1;
    if (!e.complete && e.buildTotalMs > 0) progress = e.buildElapsedMs / e.buildTotalMs;
    if (e.job?.kind === 'produce') progress = e.job.elapsedMs / e.job.totalMs;
    if (e.type === ObjectType.Harvester) progress = e.cargo / 50;
    if (progress >= 0) {
      g.rect(x, y - 6, w, 2).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(x, y - 6, w * progress, 2).fill(e.type === ObjectType.Harvester ? C.field : 0x8fb8ff);
    }
  }

  private drawShroud(): void {
    const world = this.game.world;
    const explored = world.sides[this.game.side].explored;
    let count = 0;
    for (let i = 0; i < explored.length; i++) count += explored[i]!;
    if (count === this.exploredCount) return;
    this.exploredCount = count;
    const g = this.shroud;
    g.clear();
    for (let cy = 0; cy < world.rows; cy++)
      for (let cx = 0; cx < world.cols; cx++) {
        if (explored[cy * world.cols + cx]) continue;
        g.rect(cx * CELL - 0.5, cy * CELL - 0.5, CELL + 1, CELL + 1).fill(C.shroud);
      }
  }

  /** A gamepad player's crosshair. */
  private drawCursor(c: { x: number; y: number }): void {
    const w = 1.5 / this.camera.scale.x;
    const r = 5;
    const color = this.game.side === 'player' ? C.player : C.enemy;
    for (const stroke of [{ width: w * 3, color: 0x000000, alpha: 0.6 }, { width: w, color: 0xffffff }]) {
      this.ui.circle(c.x, c.y, r).stroke(stroke);
      this.ui.moveTo(c.x - r * 1.8, c.y).lineTo(c.x - r * 0.6, c.y).moveTo(c.x + r * 0.6, c.y).lineTo(c.x + r * 1.8, c.y).stroke(stroke);
      this.ui.moveTo(c.x, c.y - r * 1.8).lineTo(c.x, c.y - r * 0.6).moveTo(c.x, c.y + r * 0.6).lineTo(c.x, c.y + r * 1.8).stroke(stroke);
    }
    this.ui.circle(c.x, c.y, 1.2 * w).fill(color);
  }

  private drawPlacement(mouse: { x: number; y: number } | null): void {
    const placing = this.game.placing;
    if (!placing || !mouse) return;
    const { cx, cy } = this.game.placementCell(mouse.x, mouse.y, placing.type);
    const size = BUILDING_RULES[placing.type].cells * CELL;
    const ok = this.game.canPlaceAt(mouse.x, mouse.y);
    this.ui
      .rect(cx * CELL, cy * CELL, size, size)
      .fill({ color: ok ? C.ghostOk : C.ghostBad, alpha: 0.35 })
      .stroke({ width: 1 / this.camera.scale.x, color: ok ? C.ghostOk : C.ghostBad });
  }
}

/** Fraction of the current tick that has elapsed, for interpolation. */
export function tickAlpha(accMs: number): number {
  return Math.min(1, accMs / TICK_MS);
}
