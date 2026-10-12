/** Packs frames into one texture and writes a PixiJS-compatible spritesheet description. */

export interface Frame {
  name: string;
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  /** Footprint centre inside the untrimmed frame, in pixels. */
  ax: number;
  ay: number;
}

interface Trimmed extends Frame {
  /** Offset of the trimmed box inside the original frame. */
  ox: number;
  oy: number;
  tw: number;
  th: number;
}

function trim(f: Frame): Trimmed {
  let x0 = f.w;
  let y0 = f.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      if (!f.rgba[(y * f.w + x) * 4 + 3]) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return { ...f, ox: 0, oy: 0, tw: 1, th: 1 };
  return { ...f, ox: x0, oy: y0, tw: x1 - x0 + 1, th: y1 - y0 + 1 };
}

export interface Atlas {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  json: SpritesheetJson;
}

export interface SpritesheetJson {
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      rotated: false;
      trimmed: boolean;
      spriteSourceSize: { x: number; y: number; w: number; h: number };
      sourceSize: { w: number; h: number };
      anchor: { x: number; y: number };
    }
  >;
  animations: Record<string, string[]>;
  meta: Record<string, unknown>;
}

/** Shelf packing, tallest first, with 1 px of padding so filtering never bleeds between frames. */
export function pack(frames: Frame[], width: number, image: string, meta: Record<string, unknown> = {}): Atlas {
  const items = frames.map(trim).sort((a, b) => b.th - a.th || b.tw - a.tw || a.name.localeCompare(b.name));
  const pad = 1;
  let x = pad;
  let y = pad;
  let shelf = 0;
  const placed: { t: Trimmed; x: number; y: number }[] = [];
  for (const t of items) {
    if (x + t.tw + pad > width) {
      x = pad;
      y += shelf + pad;
      shelf = 0;
    }
    placed.push({ t, x, y });
    x += t.tw + pad;
    shelf = Math.max(shelf, t.th);
  }
  const h = y + shelf + pad;
  const rgba = new Uint8ClampedArray(width * h * 4);
  const json: SpritesheetJson = { frames: {}, animations: {}, meta: { image, format: 'RGBA8888', size: { w: width, h }, scale: 1, ...meta } };
  for (const { t, x: px, y: py } of placed.sort((a, b) => a.t.name.localeCompare(b.t.name))) {
    for (let row = 0; row < t.th; row++) {
      const src = ((t.oy + row) * t.w + t.ox) * 4;
      rgba.set(t.rgba.subarray(src, src + t.tw * 4), ((py + row) * width + px) * 4);
    }
    json.frames[t.name] = {
      frame: { x: px, y: py, w: t.tw, h: t.th },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: t.ox, y: t.oy, w: t.tw, h: t.th },
      sourceSize: { w: t.w, h: t.h },
      anchor: { x: t.ax / t.w, y: t.ay / t.h },
    };
  }
  return { w: width, h, rgba, json };
}
