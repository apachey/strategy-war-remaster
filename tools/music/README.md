# tools/music: the remaster's music

```sh
pnpm music                          # re-render assets/music/main-theme.m4a
pnpm music --midi path/to/intro.mid # if the project files are elsewhere
pnpm music --only battle            # one track
```

The sound is dark and wide, in the spirit of Dune: drones, brass swells ("braam"), a throat singer whose
overtone wanders over the drone, a wailing voice for the tunes, war drums and struck metal, and desert wind
(`src/instruments.ts`, all synthesised: formant filters, detuned saws, filtered noise).

`main-theme.m4a` is a new arrangement of the original intro tune (Jiří Mikula, 2004). The tool reads the original
`intro.mid` from the project files (it never goes into the repo) and plays it at two thirds of its old speed: the
clarinet tune on the wailing voice, the oboe as a lower second voice, the bass as driven low strings, the strings
as a dark pad an octave down and the drum track on war drums. Sixteen beats of wind, drone and throat singing come
first; it ends on an Eb to D brass cadence with a last boom.

`battle.m4a` (D Phrygian, 116 bpm, 32 bars: ostinato and taiko, then brass and throat, then the wailing tune, then
a breakdown) and `tension.m4a` (66 bpm, 16 bars: drone, wind, heartbeat taiko, metal, fragments of the wail) are
written by hand in `src/tracks.ts` with a small notation (`src/score.ts`: `D5:1 F5:.5 r:1`, chords `D4+F4+A4:8`,
drum step patterns). Both loop seamlessly: whatever rings past the loop point is folded back onto the start.

Everything is computed in TypeScript with seeded noise; ffmpeg only measures loudness and encodes AAC at
-16 LUFS with one fixed gain per track. Rendering takes about 90 s.
