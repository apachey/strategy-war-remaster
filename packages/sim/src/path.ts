/** A* over the 15 px cell grid with 8 directions. Diagonals never cut a blocked corner. */

export interface Cell {
  cx: number;
  cy: number;
}

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, 10],
  [1, 0, 10],
  [0, 1, 10],
  [-1, 0, 10],
  [1, -1, 14],
  [1, 1, 14],
  [-1, 1, 14],
  [-1, -1, 14],
];

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
}

/**
 * Returns the cells to walk through after `from`, ending at `to`. When `to` cannot be reached it returns the
 * route to the reachable cell closest to `to` if `partial` is set, otherwise null.
 * `passable` decides walkability for every cell except `from`.
 */
export function findPath(
  cols: number,
  rows: number,
  passable: (cx: number, cy: number) => boolean,
  from: Cell,
  to: Cell,
  partial = false,
  maxExpanded = 4000,
): Cell[] | null {
  if (from.cx === to.cx && from.cy === to.cy) return [];
  if (!partial && !passable(to.cx, to.cy)) return null;
  const n = cols * rows;
  const g = new Int32Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  // Binary heap of [f, insertion order, index]; the order makes ties deterministic.
  const heap: Array<[number, number, number]> = [];
  let order = 0;
  const push = (f: number, i: number) => {
    heap.push([f, order++, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (less(heap[k]!, heap[p]!)) {
        [heap[k], heap[p]] = [heap[p]!, heap[k]!];
        k = p;
      } else break;
    }
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && less(heap[l]!, heap[m]!)) m = l;
        if (r < heap.length && less(heap[r]!, heap[m]!)) m = r;
        if (m === k) break;
        [heap[k], heap[m]] = [heap[m]!, heap[k]!];
        k = m;
      }
    }
    return top[2];
  };

  const start = from.cy * cols + from.cx;
  const goal = to.cy * cols + to.cx;
  g[start] = 0;
  push(heuristic(from.cx, from.cy, to.cx, to.cy), start);
  let expanded = 0;
  let best = start;
  let bestH = heuristic(from.cx, from.cy, to.cx, to.cy);
  while (heap.length > 0) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    if (++expanded > maxExpanded) break;
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    const h = heuristic(cx, cy, to.cx, to.cy);
    if (h < bestH) {
      best = cur;
      bestH = h;
    }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (!passable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(cx + dx, cy) || !passable(cx, cy + dy))) continue;
      const ni = ny * cols + nx;
      if (closed[ni]) continue;
      const ng = g[cur]! + cost;
      if (g[ni] !== -1 && ng >= g[ni]!) continue;
      g[ni] = ng;
      parent[ni] = cur;
      push(ng + heuristic(nx, ny, to.cx, to.cy), ni);
    }
  }
  let end = goal;
  if (g[goal] === -1) {
    if (!partial) return null;
    end = best;
  }
  const path: Cell[] = [];
  for (let i = end; i !== start; i = parent[i]!) {
    path.push({ cx: i % cols, cy: Math.floor(i / cols) });
  }
  path.reverse();
  return path;
}

function less(a: [number, number, number], b: [number, number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}
