/** One step of a small seeded PRNG (mulberry32). Returns the next state and a number in [0, 1). */
export function nextRandom(state: number): { state: number; value: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/**
 * Seeded PRNG as a closure, for code outside the world. The simulation keeps its state in `World.rngState`
 * (so saves can store it) and must never use Math.random, so replays stay identical.
 */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    const r = nextRandom(s);
    s = r.state;
    return r.value;
  };
}
