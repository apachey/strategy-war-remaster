import { describe, it } from 'vitest';
import { campaign } from '@sw/data';
import { createSkirmish, step, TICKS_PER_SECOND, type AiBrainName, type Opponent } from '../src';

/**
 * Balance tool, skipped in normal runs: computer against computer on every map from both starts.
 * `TOURNAMENT=veryhard:hard,hard:normal pnpm --filter @sw/sim exec vitest run test/tournament.test.ts`
 * prints, for each pair, how often the first brain beat the second and how long the games took.
 */
const pairs = (process.env.TOURNAMENT ?? '').split(',').filter(Boolean).map((p) => p.split(':') as [AiBrainName, AiBrainName]);
const LIMIT_SECONDS = Number(process.env.TOURNAMENT_SECONDS ?? 1800);

describe.skipIf(pairs.length === 0)('tournament', () => {
  for (const [a, b] of pairs) {
    it(`${a} vs ${b}`, { timeout: 1_800_000 }, () => {
      const rows: string[] = [];
      let wins = 0;
      let draws = 0;
      for (let m = 0; m < campaign.maps.length; m++) {
        for (const first of [true, false]) {
          const w = first ? createSkirmish(m, { opponent: b as Opponent, playerAi: a }) : createSkirmish(m, { opponent: a as Opponent, playerAi: b });
          while (w.tick < LIMIT_SECONDS * TICKS_PER_SECOND && w.outcome === 'playing') step(w);
          const aWon = first ? w.outcome === 'won' : w.outcome === 'lost';
          if (w.outcome === 'playing') draws++;
          else if (aWon) wins++;
          const mine = first ? w.sides.player.stats : w.sides.enemy.stats;
          rows.push(`map ${m + 1} ${first ? 'left ' : 'right'}: ${w.outcome === 'playing' ? 'draw' : aWon ? a : b} at ${Math.round(w.tick / TICKS_PER_SECOND)} s, ${a} lost ${mine.lost} killed ${mine.killed}`);
        }
      }
      console.log(`${a} vs ${b}: ${a} won ${wins}, drew ${draws} of ${campaign.maps.length * 2}\n  ${rows.join('\n  ')}`);
    });
  }
});
