import { TEAM_COLORS, type Faction, type FactionSymbol } from '@sw/data';
import { Pixels } from './pixels';

/**
 * Faction emblems: a pixel shield that always wears the faction's own colours. The field is the main colour, lit from
 * the top; the sign is the secondary colour with a drop shadow; the rim is the chassis colour inside a black outline.
 * So the same symbol looks different on every faction, and a change of colour in the studio repaints it at once.
 */

export const EMBLEM_W = 19;
export const EMBLEM_H = 21;

/** The signs, 11 art pixels wide at most: `#` is the secondary colour, `+` its light step. */
const SIGNS: Record<FactionSymbol, readonly string[]> = {
  crystal: ['.....#.....', '....#+#....', '...#+###...', '..#+#####..', '..#+#####..', '..##+####..', '..#######..', '...#####...', '....###....', '.....#.....'],
  fang: ['+#########+', '###########', '.###...###.', '.###...###.', '..##...##..', '..##...##..', '..#+...#+..', '...#...#...', '...#...#...'],
  eye: ['....###....', '..##+++##..', '.#..###..#.', '#..#+###..#', '#..#####..#', '.#..###..#.', '..##...##..', '....###....'],
  star: ['.....#.....', '.....+.....', '....#+#....', '#####+#####', '.####+####.', '..#######..', '...#####...', '...##.##...', '..##...##..', '.##.....##.'],
  crown: ['+....+....+', '#+..#+#..+#', '##+.#+#.+##', '###########', '###########', '#+#+#+#+#+#', '###########'],
  skull: ['...#####...', '..#+++####.', '.#+#######.', '.##..#..##.', '.##..#..##.', '.#########.', '..###.###..', '...#####...', '...#.#.#...'],
  wings: ['#.........#', '+#.......#+', '#+#.....#+#', '##+#.#.#+##', '.###+#+###.', '..#######..', '....###....', '.....#.....'],
  sun: ['#....#....#', '.#...#...#.', '...#####...', '..#++####..', '##+######.#', '..#######..', '...#####...', '.#...#...#.', '#....#....#'],
  tower: ['.#.#.#.#.#.', '.+########.', '..#######..', '..##...##..', '..#######..', '..###.###..', '..##...##..', '..##...##..', '.#########.'],
  wave: ['..+++......', '.#...#...#.', '#.....###..', '...........', '..+++......', '.#...#...#.', '#.....###..'],
  arrow: ['.....#.....', '....#+#....', '...#+###...', '..##+####..', '.#..###..#.', '....###....', '....###....', '...#####...', '..##.#.##..'],
  ring: ['....###....', '..##+++##..', '.#+#...###.', '.#+.....##.', '.##.....##.', '.###...###.', '..#######..', '....###....'],
};

/** Inside the shield at (x, y): a heater shield, square on top and drawn to a point below. */
function inShield(x: number, y: number): boolean {
  const cx = (EMBLEM_W - 1) / 2;
  if (y < 0 || y >= EMBLEM_H) return false;
  const half = y < 11 ? cx : cx * Math.cos(((y - 10) / (EMBLEM_H - 10)) * (Math.PI / 2));
  return Math.abs(x - cx) <= half + 0.01;
}

type Look = Pick<Faction, 'color' | 'color2' | 'color3' | 'symbol'>;

const cache = new Map<string, string>();

/** The emblem as a data URL, `k` screen pixels per art pixel. */
export function emblemUrl(f: Look, k = 3): string {
  const id = `${f.symbol}/${f.color}/${f.color2}/${f.color3}/${k}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const main = TEAM_COLORS[f.color];
  const sign = TEAM_COLORS[f.color2];
  const rim = TEAM_COLORS[f.color3];
  const p = new Pixels(EMBLEM_W, EMBLEM_H);
  for (let y = 0; y < EMBLEM_H; y++)
    for (let x = 0; x < EMBLEM_W; x++) {
      if (!inShield(x, y)) continue;
      const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => !inShield(x + dx!, y + dy!));
      const rimAt = [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([dx, dy]) => !inShield(x + dx!, y + dy!));
      // Black outline, a two-pixel rim lit on its upper-left, then the field shading from light at the top to dark.
      const field = y < 4 ? main[3] : y < 13 ? main[2] : main[1];
      p.px(x, y, edge ? '#000000' : rimAt ? (x + y < EMBLEM_W * 0.8 ? rim[3] : rim[1]) : field);
    }
  const rows = SIGNS[f.symbol];
  const w = Math.max(...rows.map((r) => r.length));
  const x0 = Math.floor((EMBLEM_W - w) / 2);
  const y0 = 4 + Math.floor((11 - rows.length) / 2);
  // A shadow one pixel down and right, then the sign.
  p.bitmap(x0 + 1, y0 + 1, rows, { '#': main[0], '+': main[0] });
  p.bitmap(x0, y0, rows, { '#': sign[3], '+': sign[4] });
  const url = p.url(k);
  cache.set(id, url);
  return url;
}

/** An emblem as an image tag. */
export function emblemHtml(f: Look, k = 3, cls = 'emblem'): string {
  return `<img class="${cls}" src="${emblemUrl(f, k)}" width="${EMBLEM_W * k}" height="${EMBLEM_H * k}" alt="">`;
}
