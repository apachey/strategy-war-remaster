/** Minimal Standard MIDI File reader: notes with times in beats, per track, plus the tempo. */

export interface Note {
  /** Start and length in beats (quarter notes). */
  start: number;
  length: number;
  pitch: number;
  /** 0..1 */
  velocity: number;
  channel: number;
}

export interface Track {
  notes: Note[];
  /** Last program change seen on the track (General MIDI instrument), if any. */
  program?: number;
}

export interface Song {
  /** Microseconds per beat of the first tempo event (120 bpm if none). */
  tempo: number;
  tracks: Track[];
}

class Reader {
  pos = 0;
  constructor(readonly data: Uint8Array) {}
  u8(): number {
    if (this.pos >= this.data.length) throw new Error('unexpected end of MIDI data');
    return this.data[this.pos++]!;
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  u32(): number {
    return ((this.u16() << 16) >>> 0) + this.u16();
  }
  vlq(): number {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('bad variable-length quantity');
  }
  text(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  }
}

export function parseMidi(bytes: Uint8Array): Song {
  const r = new Reader(bytes);
  if (r.text(4) !== 'MThd') throw new Error('not a MIDI file');
  const headerLen = r.u32();
  r.u16(); // format
  const trackCount = r.u16();
  const division = r.u16();
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  r.pos += headerLen - 6;

  let tempo = 500000;
  let tempoSet = false;
  const tracks: Track[] = [];
  for (let t = 0; t < trackCount; t++) {
    if (r.text(4) !== 'MTrk') throw new Error(`track ${t}: missing MTrk`);
    const size = r.u32();
    const end = r.pos + size;
    const track: Track = { notes: [] };
    const open = new Map<number, { tick: number; velocity: number }>();
    let tick = 0;
    let status = 0;
    const close = (key: number, at: number) => {
      const on = open.get(key);
      if (!on) return;
      open.delete(key);
      track.notes.push({
        start: on.tick / division,
        length: (at - on.tick) / division,
        pitch: key & 0x7f,
        velocity: on.velocity / 127,
        channel: key >> 7,
      });
    };
    while (r.pos < end) {
      tick += r.vlq();
      const b = r.u8();
      if (b === 0xff) {
        const type = r.u8();
        const len = r.vlq();
        if (type === 0x51 && len === 3 && !tempoSet) {
          tempo = (r.u8() << 16) | (r.u8() << 8) | r.u8();
          tempoSet = true;
        } else r.pos += len;
        continue;
      }
      if (b === 0xf0 || b === 0xf7) {
        r.pos += r.vlq();
        continue;
      }
      if (b & 0x80) status = b;
      else r.pos--; // running status: b was the first data byte
      const kind = status & 0xf0;
      const ch = status & 0x0f;
      if (kind === 0xc0 || kind === 0xd0) {
        const v = r.u8();
        if (kind === 0xc0) track.program = v;
        continue;
      }
      const d1 = r.u8();
      const d2 = r.u8();
      const key = (ch << 7) | d1;
      if (kind === 0x90 && d2 > 0) {
        close(key, tick);
        open.set(key, { tick, velocity: d2 });
      } else if (kind === 0x80 || kind === 0x90) close(key, tick);
    }
    for (const key of [...open.keys()]) close(key, tick);
    track.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    tracks.push(track);
  }
  return { tempo, tracks };
}
