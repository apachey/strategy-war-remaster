import { Sprite, Texture } from 'pixi.js';
import { CELL } from '@sw/data';
import { isUnit, UNIT_SIGHT_CELLS, type Entity, type Side, type World } from '@sw/sim';

/** Fog pixels per map cell: the edge of the fog is drawn this much finer than the cells the sim explores. */
export const FOG_PX = 16;
/** Darkness of ground that was explored but is out of sight now. */
const MEMORY = 0.42;
/** Soft edge of a sight circle, in fog pixels. */
const EDGE = 10;
const SHROUD = [0x0b, 0x0a, 0x08] as const;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * How far an object sees, in cells: units their sight, buildings twice their size, as the sim reveals the shroud. The
 * sim reveals a square round the object's corner cell; the fog draws a circle round its middle instead, half a cell
 * wider, so it covers what the sim explores.
 */
export function sightCells(e: Entity): number {
  return (isUnit(e.type) ? UNIT_SIGHT_CELLS : (e.size / CELL) * 2 + e.size / CELL / 2) + 0.5;
}

/**
 * One player's fog of war, drawn as a pixel texture over the map: black where the side never looked, half dark over
 * ground it explored but sees no more, clear round its own units and buildings. Edges are round and dithered with a
 * 4x4 ordered pattern instead of blurred, so they stay pixel art. Enemies standing in the half dark are not drawn.
 */
export class Fog {
  readonly sprite: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly texture: Texture;
  private readonly w: number;
  private readonly h: number;
  /** How much each fog pixel is in sight now, 0..1. */
  private readonly seen: Float32Array;
  private readonly explored: Float32Array;

  constructor(
    private readonly world: World,
    private readonly side: Side,
  ) {
    this.w = world.cols * FOG_PX;
    this.h = world.rows * FOG_PX;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(this.w, this.h);
    this.seen = new Float32Array(this.w * this.h);
    this.explored = new Float32Array(world.cols * world.rows);
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.texture);
    this.sprite.scale.set(CELL / FOG_PX);
  }

  /** True when the side sees the map point (x, y) right now. */
  sees(x: number, y: number): boolean {
    const px = Math.floor((x / CELL) * FOG_PX);
    const py = Math.floor((y / CELL) * FOG_PX);
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return false;
    return this.seen[py * this.w + px]! >= 0.5;
  }

  /** Recomputes sight from the side's objects and redraws the texture. */
  update(): void {
    const { world, w, h, seen } = this;
    seen.fill(0);
    for (const e of world.entities) {
      if (e.team !== this.side || e.hidden) continue;
      const cx = ((e.x + e.size / 2) / CELL) * FOG_PX;
      const cy = ((e.y + e.size / 2) / CELL) * FOG_PX;
      const r = sightCells(e) * FOG_PX;
      const reach = r + EDGE / 2;
      const x0 = Math.max(0, Math.floor(cx - reach));
      const x1 = Math.min(w - 1, Math.ceil(cx + reach));
      const y0 = Math.max(0, Math.floor(cy - reach));
      const y1 = Math.min(h - 1, Math.ceil(cy + reach));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const v = Math.min(1, (r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)) / EDGE + 0.5);
          const i = y * w + x;
          if (v > seen[i]!) seen[i] = v;
        }
    }
    // Explored cells, softened over their neighbours so the shroud's edge rounds off between cell centres.
    const { cols, rows } = world;
    const ex = world.sides[this.side].explored;
    const at = (x: number, y: number) => ex[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))]!;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const sum =
          4 * at(x, y) + 2 * (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) + at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1);
        // Keep explored cells fully open in their middle; only the border to the dark fades.
        this.explored[y * cols + x] = at(x, y) ? Math.min(1, (sum / 16) * 1.6) : (sum / 16) * 0.8;
      }
    const ev = this.explored;
    const px = this.image.data;
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) / FOG_PX - 0.5;
      const cy = Math.max(0, Math.min(rows - 1, Math.floor(v)));
      const cy1 = Math.min(rows - 1, cy + 1);
      const fy = Math.max(0, Math.min(1, v - cy));
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / FOG_PX - 0.5;
        const cx = Math.max(0, Math.min(cols - 1, Math.floor(u)));
        const cx1 = Math.min(cols - 1, cx + 1);
        const fx = Math.max(0, Math.min(1, u - cx));
        const top = ev[cy * cols + cx]! * (1 - fx) + ev[cy * cols + cx1]! * fx;
        const bottom = ev[cy1 * cols + cx]! * (1 - fx) + ev[cy1 * cols + cx1]! * fx;
        const e = top * (1 - fy) + bottom * fy;
        const i = y * w + x;
        const dark = 1 - e * (1 - MEMORY * (1 - seen[i]!));
        // Three levels, dithered between neighbours: clear, half dark, black.
        const b = BAYER[(y & 3) * 4 + (x & 3)]!;
        const alpha = dark <= MEMORY ? (dark / MEMORY > b ? MEMORY : 0) : (dark - MEMORY) / (1 - MEMORY) > b ? 1 : MEMORY;
        const k = i * 4;
        px[k] = SHROUD[0];
        px[k + 1] = SHROUD[1];
        px[k + 2] = SHROUD[2];
        px[k + 3] = Math.round(alpha * 255);
      }
    }
    this.ctx.putImageData(this.image, 0, 0);
    this.texture.source.update();
  }
}
