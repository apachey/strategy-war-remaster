/**
 * A tiny pixel canvas for the art the interface draws in code: frames, buttons, cursors, flags. Everything is drawn
 * one art pixel at a time and scaled up with nearest neighbour, so it stays crisp at any whole zoom.
 */

export type Color = string | null;

export class Pixels {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.g = this.canvas.getContext('2d')!;
  }

  px(x: number, y: number, c: Color): this {
    if (c === null || x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.g.fillStyle = c;
    this.g.fillRect(x, y, 1, 1);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: Color): this {
    if (c === null) return this;
    this.g.fillStyle = c;
    this.g.fillRect(x, y, w, h);
    return this;
  }

  /** Clears a pixel back to transparent. */
  clear(x: number, y: number): this {
    this.g.clearRect(x, y, 1, 1);
    return this;
  }

  /** Draws a bitmap given as rows of characters, each looked up in `colors` (missing ones stay empty). */
  bitmap(x: number, y: number, rows: readonly string[], colors: Record<string, Color>): this {
    rows.forEach((row, r) => [...row].forEach((ch, c) => this.px(x + c, y + r, colors[ch] ?? null)));
    return this;
  }

  /** Mirrors the left half onto the right (for symmetric frames), `h` mirrors the top onto the bottom too. */
  mirror(horizontal = true, vertical = false): this {
    const img = this.g.getImageData(0, 0, this.w, this.h);
    const d = img.data;
    const copy = (sx: number, sy: number, dx: number, dy: number) => {
      const s = (sy * this.w + sx) * 4;
      const t = (dy * this.w + dx) * 4;
      for (let k = 0; k < 4; k++) d[t + k] = d[s + k]!;
    };
    if (horizontal) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w >> 1; x++) copy(x, y, this.w - 1 - x, y);
    if (vertical) for (let y = 0; y < this.h >> 1; y++) for (let x = 0; x < this.w; x++) copy(x, y, x, this.h - 1 - y);
    this.g.putImageData(img, 0, 0);
    return this;
  }

  /** Rotates a square canvas a quarter turn clockwise `turns` times. */
  rotated(turns: number): Pixels {
    const out = new Pixels(this.h, this.w);
    const g = out.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.translate(out.w / 2, out.h / 2);
    g.rotate((turns * Math.PI) / 2);
    g.drawImage(this.canvas, -this.w / 2, -this.h / 2);
    return out;
  }

  /** A copy scaled up `k` times with hard pixel edges. */
  scaled(k: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w * k;
    c.height = this.h * k;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.canvas, 0, 0, c.width, c.height);
    return c;
  }

  url(k = 1): string {
    return (k === 1 ? this.canvas : this.scaled(k)).toDataURL('image/png');
  }
}

/** `#rrggbb` with an alpha 0..1, as an rgba() string. */
export function alpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Mixes two `#rrggbb` colours, t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = Number.parseInt(a.slice(1), 16);
  const y = Number.parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
