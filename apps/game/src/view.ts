import { Container, Graphics } from 'pixi.js';
import { CELL } from '@sw/data';
import { centerOf } from '@sw/sim';
import type { Commander } from './game';
import type { Art } from './assets';
import { Renderer } from './render';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Height of the top bar the canvas runs under. */
const TOP = 44;

/**
 * Zoom moves in steps of half an art pixel: the sprites have 32 art pixels per 15 px cell, so at zoom n × 16/15 one
 * art pixel covers n/2 screen points, a whole number of pixels on a Retina screen, and the pixel art stays even.
 * Wheel, keys and pads glide to the next step over a few frames (ZOOM_GLIDE_MS) and settle exactly on it.
 */
const ZOOM_STEP = 16 / 15;
const MIN_STEPS = 1;
const MAX_STEPS = 8;
/** Time constant of the zoom glide: about two thirds of the way after this long. */
const ZOOM_GLIDE_MS = 60;

/**
 * One person's window onto the map: a renderer with its own camera, clipped to a part of the screen. A one-player
 * game has one view over the whole window; a two-player game splits the window into a left and a right half.
 */
export class View {
  readonly root = new Container();
  readonly renderer: Renderer;
  private readonly mask = new Graphics();
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  /** The zoom step being glided to, and the screen point that stays put meanwhile. */
  private zoomTarget = 0;
  private zoomAt = { x: 0, y: 0 };

  constructor(
    readonly commander: Commander,
    art: Art,
    /** Height of this player's selection panel, which covers the bottom of the view. */
    private readonly panelHeight: () => number,
  ) {
    this.renderer = new Renderer(commander, art);
    this.root.addChild(this.renderer.camera, this.mask);
    this.root.mask = this.mask;
  }

  get camera(): Container {
    return this.renderer.camera;
  }

  get zoom(): number {
    return this.camera.scale.x;
  }

  private get mapW(): number {
    return this.commander.world.cols * CELL;
  }

  private get mapH(): number {
    return this.commander.world.rows * CELL;
  }

  setRect(rect: Rect): void {
    this.rect = rect;
    this.root.position.set(rect.x, rect.y);
    this.mask.clear().rect(0, 0, rect.w, rect.h).fill(0xffffff);
  }

  contains(sx: number, sy: number): boolean {
    return sx >= this.rect.x && sx < this.rect.x + this.rect.w && sy >= this.rect.y && sy < this.rect.y + this.rect.h;
  }

  /** Map pixels under a screen point. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.rect.x - this.camera.x) / this.zoom, y: (sy - this.rect.y - this.camera.y) / this.zoom };
  }

  /** Screen point of a map position. */
  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.rect.x + this.camera.x + x * this.zoom, y: this.rect.y + this.camera.y + y * this.zoom };
  }

  /** Keeps the map on screen: centred when it fits, otherwise with at most a small margin past its edges. */
  clamp(): void {
    const z = this.zoom;
    const viewW = this.rect.w;
    const viewH = this.rect.h - this.panelHeight();
    const fitX = (viewW - this.mapW * z) / 2;
    const fitY = TOP + (viewH - TOP - this.mapH * z) / 2;
    const cam = this.camera;
    cam.x = this.mapW * z <= viewW ? Math.round(fitX) : Math.round(Math.min(40, Math.max(viewW - this.mapW * z - 40, cam.x)));
    cam.y = this.mapH * z <= viewH - TOP ? Math.round(fitY) : Math.round(Math.min(84, Math.max(viewH - this.mapH * z - 40, cam.y)));
  }

  pan(dx: number, dy: number): void {
    this.camera.x += dx;
    this.camera.y += dy;
    this.clamp();
  }

  /** Glides in (+1) or out (-1) by one step around a screen point (the view's centre by default). */
  zoomBy(delta: number, sx = this.rect.x + this.rect.w / 2, sy = this.rect.y + this.rect.h / 2): void {
    const from = this.zoomTarget || this.zoom;
    const zoom = Math.max(MIN_STEPS, Math.min(MAX_STEPS, Math.round(from / ZOOM_STEP) + delta)) * ZOOM_STEP;
    if (zoom === from) return;
    this.zoomTarget = zoom;
    this.zoomAt = { x: sx - this.rect.x, y: sy - this.rect.y };
  }

  /** Call every frame: moves a zoom glide on, landing exactly on its step. */
  animate(dtMs: number): void {
    const target = this.zoomTarget;
    if (!target) return;
    const old = this.zoom;
    let zoom = old + (target - old) * (1 - Math.exp(-dtMs / ZOOM_GLIDE_MS));
    if (Math.abs(zoom - target) < 0.004) {
      zoom = target;
      this.zoomTarget = 0;
    }
    this.applyZoom(zoom, this.zoomAt.x, this.zoomAt.y);
  }

  /** Zooms straight to the nearest step around a screen point (the view's centre by default). */
  setZoom(z: number, sx = this.rect.x + this.rect.w / 2, sy = this.rect.y + this.rect.h / 2): void {
    this.zoomTarget = 0;
    const zoom = Math.max(MIN_STEPS, Math.min(MAX_STEPS, Math.round(z / ZOOM_STEP))) * ZOOM_STEP;
    if (zoom !== this.zoom) this.applyZoom(zoom, sx - this.rect.x, sy - this.rect.y);
  }

  private applyZoom(zoom: number, lx: number, ly: number): void {
    const old = this.zoom;
    this.camera.x = lx - ((lx - this.camera.x) * zoom) / old;
    this.camera.y = ly - ((ly - this.camera.y) * zoom) / old;
    this.camera.scale.set(zoom);
    this.clamp();
  }

  /** The largest zoom step that shows the whole map, at least 2 steps (a split half then shows the home base). */
  fit(): void {
    this.zoomTarget = 0;
    const z = Math.min(this.rect.w / (this.mapW + 40), (this.rect.h - this.panelHeight() - 60) / (this.mapH + 20));
    this.camera.scale.set(Math.max(2, Math.min(5, Math.floor(z / ZOOM_STEP))) * ZOOM_STEP);
    this.centerOnHome();
  }

  /** Puts a map point in the middle of the view. */
  centerOn(x: number, y: number): void {
    this.camera.x = this.rect.w / 2 - x * this.zoom;
    this.camera.y = (this.rect.h - this.panelHeight() + TOP) / 2 - y * this.zoom;
    this.clamp();
  }

  /** Puts this player's HQ in the middle of the view. */
  centerOnHome(): void {
    const hq = this.commander.hq();
    if (hq) {
      const c = centerOf(hq);
      this.camera.x = this.rect.w / 2 - c.x * this.zoom;
      this.camera.y = (this.rect.h - this.panelHeight() + TOP) / 2 - c.y * this.zoom;
    }
    this.clamp();
  }
}
