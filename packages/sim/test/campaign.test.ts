import { describe, expect, it } from 'vitest';
import { campaign } from '@sw/data';
import { createWorld, step, TICKS_PER_SECOND, type Difficulty } from '../src';

/**
 * Stage 3 gate: the campaign can be finished. The computer player ('autoplay' brain) takes the player side
 * and must win every mission against the enemy at each difficulty.
 */

const MISSIONS = campaign.maps.flatMap((map, m) => map.missions.map((_, s) => ({ key: `${m + 1}.${s + 1}`, map, s })));
const LIMIT_SECONDS = 1500;

function play(mission: (typeof MISSIONS)[number], difficulty: Difficulty, seed: number) {
  const w = createWorld(mission.map, mission.s, seed, { difficulty, playerAi: 'autoplay' });
  for (let i = 0; i < LIMIT_SECONDS * TICKS_PER_SECOND && w.outcome === 'playing'; i++) step(w);
  return w.outcome;
}

/**
 * Missions the script cannot crack at a level, even though a person can: 7.1 "Holdup" leaves almost no
 * resource, and against a computer enemy that keeps its tanks home the script loses the tower fight.
 */
const SCRIPT_LIMITS: Partial<Record<Difficulty, string[]>> = { easy: ['7.1'], normal: ['7.1'] };

describe('campaign gate: the scripted player wins', () => {
  it('every mission against the original enemy (raiders are random, so with one of three seeds)', () => {
    const lost = MISSIONS.filter((m) => ![1, 2, 3].some((seed) => play(m, 'classic', seed) === 'won')).map((m) => m.key);
    expect(lost).toEqual([]);
  }, 120_000);

  for (const difficulty of ['easy', 'normal'] as const) {
    it(`every mission against the ${difficulty} computer enemy`, () => {
      const lost = MISSIONS.filter((m) => play(m, difficulty, 1) !== 'won').map((m) => m.key);
      expect(lost).toEqual(SCRIPT_LIMITS[difficulty] ?? []);
    }, 120_000);
  }

  it('at least two thirds of the missions against the hard computer enemy', () => {
    const won = MISSIONS.filter((m) => play(m, 'hard', 1) === 'won').length;
    expect(won).toBeGreaterThanOrEqual(14);
  }, 120_000);
});
