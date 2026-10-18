import type { Lang } from '@sw/data';
import { Pixels } from './pixels';

/**
 * Pixel flags for the language buttons, waving in the wind: 6 frames of 16×11 art pixels side by side in one strip,
 * played by CSS (`.flag` with `steps(6)`). Each column rides a sine wave one pixel up and down and is lit or shaded
 * by the slope of the cloth.
 */

export const FLAG_W = 16;
export const FLAG_H = 11;
export const FLAG_FRAMES = 6;
const SCALE = 4;

/** The flat flag's colour at (x, y) of a 16×10 cloth. */
function cloth(lang: Lang, x: number, y: number): [number, number, number] {
  if (lang === 'uk') return y < 5 ? [0x00, 0x57, 0xb7] : [0xff, 0xd7, 0x00];
  // Union flag: blue field, white diagonals with red inside, white cross with red inside.
  const blue: [number, number, number] = [0x01, 0x21, 0x69];
  const white: [number, number, number] = [0xff, 0xff, 0xff];
  const red: [number, number, number] = [0xc8, 0x10, 0x2e];
  const cx = x + 0.5 - 8;
  const cy = y + 0.5 - 5;
  if (Math.abs(cx) < 1.1 || Math.abs(cy) < 1.1) return red;
  if (Math.abs(cx) < 2.1 || Math.abs(cy) < 2.1) return white;
  const d1 = Math.abs(cy - cx * (10 / 16));
  const d2 = Math.abs(cy + cx * (10 / 16));
  const d = Math.min(d1, d2);
  if (d < 0.45) return red;
  if (d < 1.1) return white;
  return blue;
}

const cache = new Map<Lang, string>();

/** The animated strip as a data URL, for `background-image` on a `.flag` element. */
export function flagStrip(lang: Lang): string {
  const hit = cache.get(lang);
  if (hit) return hit;
  const p = new Pixels(FLAG_W * FLAG_FRAMES, FLAG_H);
  for (let f = 0; f < FLAG_FRAMES; f++)
    for (let x = 0; x < FLAG_W; x++) {
      const phase = (x / FLAG_W) * Math.PI * 2 * 0.9 - (f / FLAG_FRAMES) * Math.PI * 2;
      // The cloth hangs from a pole on the left: the wave grows away from it.
      const amp = Math.min(1, x / 5);
      const dy = Math.round(Math.sin(phase) * amp);
      const light = 1 + Math.cos(phase) * 0.14 * amp;
      for (let y = 0; y < 10; y++) {
        const [r, g, b] = cloth(lang, x, y);
        const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * light)));
        p.px(f * FLAG_W + x, y + dy + (dy < 0 ? 1 : 0), `rgb(${k(r)}, ${k(g)}, ${k(b)})`);
      }
    }
  const url = p.url(SCALE);
  cache.set(lang, url);
  return url;
}

/** HTML for a waving flag. */
export function flagHtml(lang: Lang): string {
  return `<i class="flag" style="background-image: url(${flagStrip(lang)})"></i>`;
}
