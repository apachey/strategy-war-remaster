import { CELL, ObjectType, TEAM_COLORS } from '@sw/data';
import { isUnit, type Side } from '@sw/sim';
import type { View } from './view';

/** Largest side of the minimap in screen points. */
const MAX = 168;
const REDRAW_MS = 200;
const PING_MS = 4000;

/**
 * A small map in the top right corner of a view: forest, crystal fields, what this person has explored, every object
 * they can see in its side's colour, and a frame round what the view shows. Clicking or dragging on it (with the mouse,
 * for the mouse player's view) moves the camera there.
 */
export class Minimap {
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D | null;
  private sinceDraw = REDRAW_MS;
  private readonly px: number;
  /** Places under attack, blinking red for PING_MS. */
  private pings: Array<{ x: number; y: number; ms: number }> = [];

  constructor(
    private readonly view: View,
    index: number,
    clickable: boolean,
  ) {
    const w = view.commander.world;
    this.px = Math.max(1, Math.floor(MAX / Math.max(w.cols, w.rows)));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w.cols * this.px * dpr;
    this.canvas.height = w.rows * this.px * dpr;
    this.canvas.style.width = `${w.cols * this.px}px`;
    this.canvas.style.height = `${w.rows * this.px}px`;
    this.canvas.className = `minimap side-${index + 1}`;
    this.canvas.id = index === 0 ? 'minimap' : `minimap-${index + 1}`;
    this.g = this.canvas.getContext('2d');
    this.g?.scale(dpr, dpr);
    document.body.appendChild(this.canvas);
    if (clickable) this.bindMouse();
  }

  private bindMouse(): void {
    let down = false;
    const jump = (ev: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / this.px) * CELL;
      const y = ((ev.clientY - r.top) / this.px) * CELL;
      this.view.centerOn(x, y);
      this.sinceDraw = REDRAW_MS;
    };
    this.canvas.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      down = true;
      this.canvas.setPointerCapture(ev.pointerId);
      jump(ev);
    });
    this.canvas.addEventListener('pointermove', (ev) => down && jump(ev));
    this.canvas.addEventListener('pointerup', () => (down = false));
  }

  /** Keeps the minimap in the top right corner of its view. */
  place(): void {
    const r = this.view.rect;
    this.canvas.style.left = `${r.x + r.w - this.canvas.offsetWidth - 12}px`;
  }

  /** Marks a spot where `side` is under attack, if it is this view's side. */
  ping(side: Side, x: number, y: number): void {
    if (side !== this.view.commander.side) return;
    this.pings.push({ x, y, ms: PING_MS });
    this.sinceDraw = REDRAW_MS;
  }

  update(dtMs: number): void {
    for (const p of this.pings) p.ms -= dtMs;
    this.pings = this.pings.filter((p) => p.ms > 0);
    this.sinceDraw += dtMs;
    if (this.sinceDraw < REDRAW_MS || !this.g) return;
    this.sinceDraw = 0;
    const g = this.g;
    const c = this.view.commander;
    const w = c.world;
    const p = this.px;
    const explored = w.sides[c.side].explored;
    g.fillStyle = '#0b0a08';
    g.fillRect(0, 0, w.cols * p, w.rows * p);
    for (let i = 0; i < explored.length; i++) {
      if (!explored[i]) continue;
      g.fillStyle = w.blocked[i] ? '#1f5a4c' : '#c9ad78';
      g.fillRect((i % w.cols) * p, Math.floor(i / w.cols) * p, p, p);
    }
    for (const e of w.entities) {
      if (e.hidden || !c.visible(e)) continue;
      if (e.type === ObjectType.ResourceField) g.fillStyle = '#f0c43a';
      else if (e.team === 'neutral') continue;
      else g.fillStyle = TEAM_COLORS[w.sides[e.team].color][isUnit(e.type) ? 4 : 3];
      const s = Math.max(isUnit(e.type) ? 2 : p, (e.size / CELL) * p);
      g.fillRect((e.x / CELL) * p, (e.y / CELL) * p, s, s);
    }
    // What the view shows.
    const v = this.view;
    const tl = v.toWorld(v.rect.x, v.rect.y + 40);
    const br = v.toWorld(v.rect.x + v.rect.w, v.rect.y + v.rect.h);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.strokeRect((tl.x / CELL) * p + 0.5, (tl.y / CELL) * p + 0.5, ((br.x - tl.x) / CELL) * p - 1, ((br.y - tl.y) / CELL) * p - 1);
    // Attack pings: a red square that blinks, then shrinks onto the spot.
    for (const ping of this.pings) {
      if (Math.floor(ping.ms / 400) % 2 === 1) continue;
      const r = 3 + 6 * (ping.ms / PING_MS);
      g.strokeStyle = '#ff3b2f';
      g.lineWidth = 2;
      g.strokeRect((ping.x / CELL) * p - r, (ping.y / CELL) * p - r, r * 2, r * 2);
    }
  }
}
