import { glyph } from './font';
import { Pixels } from './pixels';

/**
 * The SHARDFALL wordmark, drawn in code from the bold font: every font pixel becomes 2×2 with its top-left and
 * bottom-right corners bevelled off, the word leans forward, and a slanted crack splits it so the lower slab slides away like a shard
 * breaking off, with crystal light along the break.
 */

const GAP = 1;
const LEAN = 3;
const SHIFT = { x: 2, y: 0 };
const PAD = 3;

const UPPER = ['#fffbe6', '#ffe58a', '#ffe58a', '#f4c63c', '#f4c63c', '#f4c63c', '#e0a028', '#e0a028', '#c87818', '#c87818', '#b0640e', '#b0640e', '#9a520a', '#9a520a'];
const LOWER = ['#ffd760', '#f0b030', '#e0a028', '#d08a1c', '#c07414', '#ac600e', '#984e0a', '#843f08', '#723406', '#622a04', '#622a04', '#622a04', '#622a04', '#622a04'];
const GLINT = '#fff6c0';
const OUTLINE = '#140a04';
const SHADOW = '#3e1804';

let cached: { url: string; w: number; h: number } | null = null;

/** The wordmark as a PNG data URL with its size in logo pixels. */
export function logo(word = 'SHARDFALL'): { url: string; w: number; h: number } {
  if (cached) return cached;
  // The word in font pixels.
  const gs = [...word].map((c) => glyph(c, true)!);
  const fw = gs.reduce((s, g) => s + g.width, 0) + GAP * (gs.length - 1);
  const fh = 7;
  const font: boolean[][] = Array.from({ length: fh }, () => Array<boolean>(fw).fill(false));
  let x0 = 0;
  for (const g of gs) {
    g.rows.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && (font[r]![x0 + c] = true)));
    x0 += g.width + GAP;
  }
  const on = (x: number, y: number) => font[y]?.[x] === true;
  // Doubled, with the top-left and bottom-right convex corners cut away.
  const H = fh * 2;
  const W = fw * 2;
  const mask: boolean[][] = Array.from({ length: H }, () => Array<boolean>(W).fill(false));
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) {
      if (!on(x, y)) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const sx = dx ? 1 : -1;
        const sy = dy ? 1 : -1;
        const cut = dx === dy && !on(x + sx, y) && !on(x, y + sy) && !on(x + sx, y + sy);
        if (!cut) mask[y * 2 + dy]![x * 2 + dx] = true;
      }
    }
  // Lean forward, then slice along a shallow rising line: the slice row is cut out and the lower slab slides right.
  const lean = (y: number) => Math.floor((H - 1 - y) / (H / LEAN));
  const crack = (x: number) => Math.round(9 - (3 * x) / (W + LEAN));
  const out = { w: W + LEAN + SHIFT.x + PAD * 2, h: H + SHIFT.y + PAD * 2 };
  const solid = (x: number, y: number) => mask[y]?.[x] === true && y !== crack(x + lean(y));
  const cells = new Map<string, string>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!solid(x, y)) continue;
      const lx = x + lean(y);
      const cut = crack(lx);
      const lower = y > cut;
      let c = lower ? LOWER[y - cut - 1]! : UPPER[y]!;
      if (!solid(x, y - 1) || y - 1 === crack(x + lean(y - 1))) c = lower ? '#ffe58a' : '#fffbe6';
      if (!lower && y + 1 === crack(x + lean(y + 1))) c = GLINT;
      cells.set(`${PAD + lx + (lower ? SHIFT.x : 0)},${PAD + y + (lower ? SHIFT.y : 0)}`, c);
    }
  const p = new Pixels(out.w, out.h);
  const keys = [...cells.keys()].map((k) => k.split(',').map(Number) as [number, number]);
  for (const [x, y] of keys) p.rect(x + 1, y + 1, 2, 2, SHADOW);
  for (const [x, y] of keys) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) p.px(x + dx, y + dy, OUTLINE);
  for (const [x, y] of keys) p.px(x, y, cells.get(`${x},${y}`)!);
  cached = { url: p.url(), w: out.w, h: out.h };
  return cached;
}

/** The wordmark as an `<img>` scaled by whole pixels, with the name as its text. */
export function logoHtml(scale = 3, word = 'SHARDFALL'): string {
  const l = logo(word);
  return `<img class="wordmark" src="${l.url}" alt="${word}" width="${l.w * scale}" height="${l.h * scale}">`;
}
