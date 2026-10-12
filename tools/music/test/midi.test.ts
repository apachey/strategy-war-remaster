import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi';
import { adsr, hz } from '../src/synth';

/** Builds a format-1 file: a tempo track and one note track (program 33, running status, a note-on with 0 velocity as note-off). */
function sampleMidi(): Uint8Array {
  const tempo = [0x00, 0xff, 0x51, 0x03, 0x06, 0x1a, 0x80, 0x00, 0xff, 0x2f, 0x00];
  const notes = [
    0x00, 0xc0, 0x21, // program 33
    0x00, 0x90, 0x3c, 0x64, // C4 on
    0x60, 0x3e, 0x7f, // +96 ticks, running status: D4 on
    0x60, 0x3c, 0x00, // +96: C4 off via velocity 0
    0x81, 0x40, 0x80, 0x3e, 0x00, // +192 (two-byte length): D4 off
    0x00, 0xff, 0x2f, 0x00,
  ];
  const chunk = (id: string, body: number[]) => [...id].map((c) => c.charCodeAt(0)).concat([0, 0, body.length >> 8, body.length & 0xff], body);
  return new Uint8Array([...chunk('MThd', [0, 1, 0, 2, 0, 96]), ...chunk('MTrk', tempo), ...chunk('MTrk', notes)]);
}

describe('parseMidi', () => {
  it('reads tempo, program and notes in beats', () => {
    const song = parseMidi(sampleMidi());
    expect(song.tempo).toBe(400000);
    expect(song.tracks).toHaveLength(2);
    expect(song.tracks[1]!.program).toBe(33);
    expect(song.tracks[1]!.notes).toEqual([
      { start: 0, length: 2, pitch: 60, velocity: 100 / 127, channel: 0 },
      { start: 1, length: 3, pitch: 62, velocity: 1, channel: 0 },
    ]);
  });

  it('rejects files that are not MIDI', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4]))).toThrow('not a MIDI file');
  });
});

describe('synth helpers', () => {
  it('tunes A4 to 440 Hz', () => {
    expect(hz(69)).toBe(440);
    expect(hz(81)).toBeCloseTo(880);
  });

  it('shapes notes with attack, sustain and release', () => {
    expect(adsr(0, 1, 0.1, 0.1, 0.5, 0.2)).toBe(0);
    expect(adsr(0.1, 1, 0.1, 0.1, 0.5, 0.2)).toBe(1);
    expect(adsr(0.5, 1, 0.1, 0.1, 0.5, 0.2)).toBe(0.5);
    expect(adsr(1.1, 1, 0.1, 0.1, 0.5, 0.2)).toBeCloseTo(0.25);
    expect(adsr(1.3, 1, 0.1, 0.1, 0.5, 0.2)).toBe(0);
  });
});
