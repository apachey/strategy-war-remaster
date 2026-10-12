#!/usr/bin/env node
// Re-creates packages/data/src/campaign.json from the original map files. See README.md for the format.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: extract-campaign.mjs <folder with map_N.tae and map_N.txt>');
  process.exit(1);
}

function parseTae(d) {
  if (d[0] !== 79 || d[1] !== 0) throw new Error('not a map chunk');
  const w = d[4], h = d[5];
  let n = 6;
  const tiles = [];
  for (let r = 0; r < h; r++) tiles.push([...d.subarray(n + r * w, n + (r + 1) * w)]);
  n += w * h;
  const missions = [];
  while (n < d.length - 1 && d[n] === 79 && d[n + 1] === 1) {
    n += 4;
    const money = d[n] * 256 + d[n + 1];
    n += 2;
    const objects = [];
    while (n < d.length - 1 && d[n] === 79 && d[n + 1] === 2) {
      const type = d[n + 4];
      n += 5;
      const x = d[n] * 256 + d[n + 1];
      const y = d[n + 2] * 256 + d[n + 3];
      n += 8;
      const hp = d[n + 1] * 256 + d[n + 2];
      n += 7;
      const enemy = d[n + 1] === 1;
      n += 2;
      if (type === 100) n += 6;
      objects.push({ type, x, y, hp, enemy });
    }
    missions.push({ money, objects });
  }
  if (n !== d.length) throw new Error(`${d.length - n} trailing bytes`);
  return { w, h, tiles, missions };
}

const maps = [];
for (let k = 1; k <= 7; k++) {
  const map = parseTae(readFileSync(join(dir, `map_${k}.tae`)));
  const lines = new TextDecoder('windows-1250').decode(readFileSync(join(dir, `map_${k}.txt`))).replace(/\r/g, '').split('\n');
  map.missions.forEach((m, i) => {
    m.title = lines[1 + 2 * i] ?? '';
    m.brief = lines[2 + 2 * i] ?? '';
  });
  maps.push({ name: lines[0], ...map });
}
process.stdout.write(JSON.stringify({ source: 'Strategy War v1.3.5 MIDP-2 (identical maps in v1.6.3)', maps }, null, 1) + '\n');
