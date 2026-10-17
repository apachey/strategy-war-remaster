import { Assets, Rectangle, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';
import { glowRamp, TEAM_COLORS, type TeamColor } from '@sw/data';
import spritesUrl from '../../../assets/sprites/sprites.png?url';
import spritesData from '../../../assets/sprites/sprites.json';
import terrainUrl from '../../../assets/sprites/terrain.png?url';
import terrainData from '../../../assets/sprites/terrain.json';

/**
 * The style B art from tools/art: one atlas of units, buildings, shots and trees, and one of ground tiles. Sprites are
 * drawn with the main colour in olive and the secondary in red; every side gets its own copy of the atlas recoloured
 * to its two colours, the same swap tools/art does for its previews. Pixels stay crisp (nearest filtering).
 */

/** Art pixels per 15 px map cell. */
export const ART_PX_PER_CELL = 32;

interface Pipeline {
  teamRamp: string[];
  secondRamp: string[];
  glowRamp: string[];
}

export interface Art {
  /** The atlas recoloured for a side's main and secondary colour. */
  sheet(color: TeamColor, color2: TeamColor): Spritesheet;
  /** Ground tiles: `sand`, `plates`, `forest/<mask>`, `plate-edge/<mask>`. */
  terrain: Spritesheet;
}

let image: HTMLImageElement | null = null;
let terrain: Spritesheet | null = null;
const sheets = new Map<string, Spritesheet>();

/** Loads both atlases and recolours the sprites for each pair of colours the game will draw; call before rendering. */
export async function loadArt(pairs: ReadonlyArray<readonly [TeamColor, TeamColor]>): Promise<Art> {
  image ??= await loadImage(spritesUrl);
  if (!terrain) {
    const texture = await Assets.load<Texture>(terrainUrl);
    texture.source.scaleMode = 'nearest';
    terrain = new Spritesheet(texture, terrainData as unknown as SpritesheetData);
    await terrain.parse();
  }
  for (const [c, c2] of pairs) {
    const id = `${c}/${c2}`;
    if (sheets.has(id)) continue;
    const texture = Texture.from(recolored(image, c, c2));
    texture.source.scaleMode = 'nearest';
    const sheet = new Spritesheet(texture, spritesData as unknown as SpritesheetData);
    await sheet.parse();
    sheets.set(id, sheet);
  }
  return {
    sheet: (c, c2) => {
      const sheet = sheets.get(`${c}/${c2}`);
      if (!sheet) throw new Error(`No sprite sheet for ${c}/${c2}`);
      return sheet;
    },
    terrain,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/** The atlas with the drawn team, secondary and glow ramps swapped for a side's colours, step for step. */
function recolored(img: HTMLImageElement, color: TeamColor, color2: TeamColor): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, img.width, img.height);
  const meta = (spritesData as unknown as { meta: { pipeline: Pipeline } }).meta.pipeline;
  const map = new Map<number, [number, number, number]>();
  const swap = (from: string[], to: readonly string[]) => from.forEach((c, k) => map.set(key(...rgb(c)), rgb(to[k]!)));
  swap(meta.teamRamp, TEAM_COLORS[color]);
  swap(meta.secondRamp, TEAM_COLORS[color2]);
  swap(meta.glowRamp, glowRamp(color2));
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const c = map.get(key(px[i]!, px[i + 1]!, px[i + 2]!));
    if (!c) continue;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  }
  g.putImageData(data, 0, 0);
  return canvas;
}

/** A square piece of a repeating ground texture (`sand`, `plates`) for the cell at (cx, cy). */
export function groundPiece(sheet: Spritesheet, name: 'sand' | 'plates', cx: number, cy: number): Texture {
  const base = sheet.textures[name]!;
  const f = base.frame;
  const cells = Math.round(f.width / ART_PX_PER_CELL);
  const x = f.x + (((cx % cells) + cells) % cells) * ART_PX_PER_CELL;
  const y = f.y + (((cy % cells) + cells) % cells) * ART_PX_PER_CELL;
  return new Texture({ source: base.source, frame: new Rectangle(x, y, ART_PX_PER_CELL, ART_PX_PER_CELL) });
}
