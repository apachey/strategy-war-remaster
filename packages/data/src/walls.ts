/**
 * How walls join: a wall piece links to the walls on its four sides, and to a wall on a corner when neither cell
 * beside that corner is a wall (otherwise the two already meet through it). The art pipeline renders one sprite per
 * mask the rule can produce (`WALL_MASKS`), the game picks the frame `<race>_wall/idle/<mask>` with `wallMask`.
 */

/** Bits of a wall mask with their neighbour offsets in cells: sides N1 E2 S4 W8, corners NE16 SE32 SW64 NW128. */
export const WALL_LINKS: readonly (readonly [bit: number, dx: number, dy: number])[] = [
  [1, 0, -1],
  [2, 1, 0],
  [4, 0, 1],
  [8, -1, 0],
  [16, 1, -1],
  [32, 1, 1],
  [64, -1, 1],
  [128, -1, -1],
];

/** The mask of a wall piece whose neighbour (dx, dy) is a wall when `wall(dx, dy)`. */
export function wallMask(wall: (dx: number, dy: number) => boolean): number {
  let mask = 0;
  for (const [bit, dx, dy] of WALL_LINKS) {
    if (!wall(dx, dy)) continue;
    // A corner links only when both cells beside it are open.
    if (dx && dy && (wall(dx, 0) || wall(0, dy))) continue;
    mask |= bit;
  }
  return mask;
}

/** Every mask `wallMask` can return: 47 of the 256. */
export const WALL_MASKS: readonly number[] = Array.from({ length: 256 }, (_, m) => m).filter(
  (m) => wallMask((dx, dy) => WALL_LINKS.some(([bit, x, y]) => x === dx && y === dy && m & bit)) === m,
);
