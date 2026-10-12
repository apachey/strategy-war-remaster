import { describe, expect, it } from 'vitest';
import { battle, tension } from '../src/tracks';
import { beatsOf, line, pitch, steps } from '../src/score';

describe('score notation', () => {
  it('names pitches like MIDI', () => {
    expect(pitch('C4')).toBe(60);
    expect(pitch('A4')).toBe(69);
    expect(pitch('Bb1')).toBe(34);
    expect(pitch('C#5')).toBe(73);
  });

  it('reads notes, rests and chords', () => {
    const n = line('D4:1 r:.5 C4+E4:2', 4, 0.8, 1);
    expect(n.map((x) => [x.start, x.length, x.pitch])).toEqual([
      [4, 1, 62],
      [5.5, 2, 60],
      [5.5, 2, 64],
    ]);
    expect(beatsOf('D4:1 r:.5 C4+E4:2')).toBe(3.5);
  });

  it('turns step patterns into drum hits', () => {
    expect(steps('x..X', 36).map((x) => [x.start, x.velocity])).toEqual([
      [0, 0.7],
      [0.75, 1],
    ]);
  });
});

describe('in-game tracks', () => {
  it.each([
    ['battle', battle()],
    ['tension', tension()],
  ])('%s keeps every note inside the loop', (_, a) => {
    for (const p of a.parts) for (const n of p.notes) expect(n.start + n.length).toBeLessThanOrEqual(a.beats);
    expect(a.beats % 4).toBe(0);
  });
});
