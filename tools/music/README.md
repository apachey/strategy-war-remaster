# tools/music: the remaster's music

```sh
pnpm music                          # re-render assets/music/main-theme.m4a
pnpm music --midi path/to/intro.mid # if the project files are elsewhere
pnpm music --only battle            # one track
```

`main-theme.m4a` is a new arrangement of the original intro tune (Jiří Mikula, 2004). The tool reads the original
`intro.mid` from the project files (it never goes into the repo), maps its General MIDI instruments to our own
synthesisers (`src/instruments.ts`: detuned-saw lead for the clarinet, pulse reed for the oboe, sine-and-saw bass,
string pad, synthesised drum kit), plays the tune twice with the lead doubled an octave up the second time, ends on
a held D minor chord, and mixes it with a ping-pong delay and a Freeverb-style reverb (`src/effects.ts`).

`battle.m4a` (144 bpm, 32 bars) and `tension.m4a` (96 bpm, 16 bars) are new in-game tracks written by hand in
`src/tracks.ts` with a small notation (`src/score.ts`: `D5:1 F5:.5 r:1`, chords `D4+F4+A4:8`, drum step patterns).
Both loop seamlessly: whatever rings past the loop point is folded back onto the start.

Everything is computed in TypeScript with seeded noise; ffmpeg only measures loudness and encodes AAC at
-16 LUFS with one fixed gain per track. Rendering takes about 40 s.
