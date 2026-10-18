import { Graphics } from 'pixi.js';
import { CELL, ObjectType } from '@sw/data';
import { BUILDING_RULES, isUnit, UNIT_RULES, type BuildingType, type Entity, type Side, type UnitType } from '@sw/sim';
import { ART_PX_PER_CELL } from '../assets';

/**
 * Selection marks and health bars in pixel art: drawn on the sprites' own grid (one art pixel = 15/32 map px), with
 * a dark outline round every line like the sprites have. Selection is corner brackets round the footprint.
 */

/** Map pixels per art pixel. */
const P = CELL / ART_PX_PER_CELL;
const snap = (v: number) => Math.round(v / P) * P;

const C = {
  outline: 0x0a0806,
  own: 0x9dff7a,
  foe: 0xff5a3a,
  field: 0xf0c43a,
  hpGood: 0x6ee06e,
  hpMid: 0xf0c43a,
  hpBad: 0xe05a3a,
  empty: 0x2a2620,
  build: 0x8fb8ff,
};

export class Marks {
  /** Over the objects: brackets, bars, weapon range. */
  readonly over = new Graphics();

  clear(): void {
    this.over.clear();
  }

  /** A one-art-pixel rectangle run with its outline, in map pixels. */
  private line(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
    g.rect(x - P, y - P, w + 2 * P, h + 2 * P).fill(C.outline);
    g.rect(x, y, w, h).fill(color);
  }

  selection(e: Entity, x: number, y: number, side: Side): void {
    const own = e.team === side;
    const color = own ? C.own : e.team === 'neutral' ? C.field : C.foe;
    const s = e.size;
    const x0 = snap(x - P);
    const y0 = snap(y - P);
    const x1 = snap(x + s + P);
    const y1 = snap(y + s + P);
    const len = snap(Math.max(4 * P, s / 4));
    const g = this.over;
    // Outlines first for all four corners, then the bright lines, so the outlines never cut a line.
    for (const pass of [0, 1])
      for (const [ox, oy, sx, sy] of [
        [x0, y0, 1, 1],
        [x1 - P, y0, -1, 1],
        [x0, y1 - P, 1, -1],
        [x1 - P, y1 - P, -1, -1],
      ] as const) {
        const hx = sx > 0 ? ox : ox - len + P;
        const vy = sy > 0 ? oy : oy - len + P;
        if (pass === 0) {
          g.rect(hx - P, oy - P, len + 2 * P, 3 * P).fill(C.outline);
          g.rect(ox - P, vy - P, 3 * P, len + 2 * P).fill(C.outline);
        } else {
          g.rect(hx, oy, len, P).fill(color);
          g.rect(ox, vy, P, len).fill(color);
        }
      }
    let range = 0;
    if (own && isUnit(e.type)) range = UNIT_RULES[e.type as UnitType].weapon?.range ?? 0;
    if (own && e.type === ObjectType.Defender) range = BUILDING_RULES[e.type as BuildingType].weapon?.range ?? 0;
    if (range) this.dotted(x - range, y - range, s + range * 2, color);
  }

  /** Weapon range as a dotted square: one art pixel lit every four. */
  private dotted(x: number, y: number, size: number, color: number): void {
    const g = this.over;
    const n = Math.round(size / P);
    const x0 = snap(x);
    const y0 = snap(y);
    for (let i = 0; i < n; i += 4) {
      g.rect(x0 + i * P, y0, P, P).rect(x0 + i * P, y0 + n * P, P, P).rect(x0, y0 + i * P, P, P).rect(x0 + n * P, y0 + i * P, P, P);
    }
    g.fill({ color, alpha: 0.45 });
  }

  /**
   * Health as a segmented bar above the object (green, yellow, red as it drops), and under it a thinner bar for
   * building progress, production or a harvester's load.
   */
  bars(e: Entity, x: number, y: number): void {
    const g = this.over;
    const k = Math.max(0, e.hp / e.maxHp);
    const segW = 4;
    const n = Math.max(4, Math.floor(Math.round(e.size / P) / (segW + 1)));
    const w = n * (segW + 1) - 1;
    const left = snap(x + e.size / 2 - (w * P) / 2);
    const top = snap(y - (e.size > CELL ? 10 : 7));
    const lit = Math.ceil(k * n);
    const color = k > 0.6 ? C.hpGood : k > 0.3 ? C.hpMid : C.hpBad;
    this.segments(g, left, top, n, segW, 3, lit, color);
    let progress = -1;
    if (!e.complete && e.buildTotalMs > 0) progress = e.buildElapsedMs / e.buildTotalMs;
    if (e.job?.kind === 'produce') progress = e.job.elapsedMs / e.job.totalMs;
    if (e.type === ObjectType.Harvester) progress = e.cargo / 50;
    if (progress >= 0) this.segments(g, left, top - 4 * P, n, segW, 2, Math.floor(progress * n), e.type === ObjectType.Harvester ? C.field : C.build);
  }

  private segments(g: Graphics, left: number, top: number, n: number, segW: number, h: number, lit: number, color: number): void {
    const w = n * (segW + 1) - 1;
    g.rect(left - P, top - P, (w + 2) * P, (h + 2) * P).fill(C.outline);
    for (let i = 0; i < n; i++) g.rect(left + i * (segW + 1) * P, top, segW * P, h * P).fill(i < lit ? color : C.empty);
  }
}
