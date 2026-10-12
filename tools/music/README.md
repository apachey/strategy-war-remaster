# tools/music: the remaster's music

```sh
pnpm music                          # re-render assets/music/main-theme.m4a
pnpm music --midi path/to/intro.mid # if the project files are elsewhere
```

`main-theme.m4a` is a new arrangement of the original intro tune (Jiří Mikula, 2004). The tool reads the original
`intro.mid` from the project files (it never goes into the repo), maps its General MIDI instruments to our own
synthesisers (`src/instruments.ts`: detuned-saw lead for the clarinet, pulse reed for the oboe, sine-and-saw bass,
string pad, synthesised drum kit), plays the tune twice with the lead doubled an octave up the second time, ends on
a held D minor chord, and mixes it with a ping-pong delay and a Freeverb-style reverb (`src/effects.ts`).

Everything is computed in TypeScript with seeded noise; ffmpeg only encodes AAC and normalises loudness to
-16 LUFS. Rendering takes about 40 s.
