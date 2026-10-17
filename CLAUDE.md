# Strategy War Remaster

Fan remaster of the 2004 J2ME real-time strategy Strategy War (Jiří Mikula / tadpole / Redboss) for macOS.
Pavlo (GitHub `apachey`) directs; Claude writes the code and art. Talk to Pavlo in Ukrainian; code, comments and
commit messages are in English.

## Layout

- `apps/game` — the game: Vite + TypeScript + PixiJS 8. `?m=6.2` opens map 6, mission 2;
  `?s=4&vs=hard` a skirmish on map 4 (`vs=human` splits the screen for two players, player 2 on a gamepad);
  `&r=walker,hover&c=blue,red&c2=white,black` sets the two sides' races, team colours and secondary colours.
- `apps/desktop` — Tauri 2 shell that packages `apps/game/dist` as a macOS app and .dmg.
- `packages/sim` — deterministic simulation with no rendering. Fixed 20 ticks/s, seeded RNG, never `Math.random`
  or wall-clock time inside the sim, so replays, AI tests and later online play stay in lockstep.
  `src/rules.ts` holds the original's numbers (speeds, damage, build times) read from the decompiled code;
  `docs/rules.md` lists them and every deliberate deviation.
- `packages/data` — `campaign.json` (7 maps, 21 missions decoded from the original), types, original balance.
  `src/races.ts`: the three races (`Race`: human, hover, walker), the 24 team colour ramps (`TEAM_COLORS`: 8 hues in
  `TEAM_HUES`, each dark/base/light in `TEAM_COLOR_GRID`) and `spriteName(race, type)`. Races are cosmetic, every
  race plays by the original's numbers.
- `tools/extract` — decoder for the original `.tae` map format (see its README).
- `tools/art` — style B pipeline: low-poly three.js models rendered in headless Chromium to 8-direction palette
  sprites (see its README). Output: `assets/sprites/sprites.png` + `sprites.json` (PixiJS spritesheet), never edit
  them by hand.
- `tools/music` — renders the music (`assets/music`) from the original intro tune with our own synthesisers.

## Commands

```sh
pnpm install
pnpm dev            # game in the browser at http://localhost:5173
pnpm typecheck && pnpm test
pnpm e2e            # Playwright smoke tests + screenshots in apps/game/test-results
pnpm desktop:build  # macOS .app/.dmg (needs macOS + Rust)
pnpm sprites        # regenerate sprites from the 3D models; CI runs pnpm sprites:check
pnpm music          # re-render the music (needs the original intro.mid from the project files)
pnpm sfx            # re-render the sound effects into assets/sfx (WAV + sfx.json)
```

## Rules

- Never commit original game files (JARs, sprites, sounds); they live in the project files, not the repo.
  Campaign layout data in `packages/data` is the only thing taken from the original.
- Gameplay logic goes in `packages/sim`, never in `apps/game`. The game only reads world state and sends commands.
- Every gameplay change needs a sim test; every visible change needs an updated smoke screenshot.
- The game exposes `window.__sw` (game, issue, camera) so Playwright can read state and give orders.
- `packages/sim/test/autoplay.ts` is a scripted player; the "mission 1 can be won" test is the phase 1 gate.
- Each side (`world.sides.player` / `.enemy`, seats, not races) carries its `race`, `color` and secondary
  `color2` (accents; may repeat any colour); the campaign is white humans with olive accents against cyan hovers with
  white accents, a skirmish takes them from `SkirmishOptions`. The renderer takes team colours only from
  the side's ramp.
- `packages/sim/src/ai.ts` is the computer player (difficulty levels); `test/campaign.test.ts` plays all 21 missions on
  every difficulty and is the stage 3 gate. Saves are `saveWorld`/`loadWorld` in `src/save.ts`; bump `SAVE_VERSION`
  whenever the World shape changes.
- Interface text lives in `apps/game/src/text.ts` (UA and EN); mission titles and briefings in `packages/data/src/text.ts`.
- Art direction: style B (HD pixel art) via low-poly 3D models rendered to 8-direction sprites; style E
  (low-poly 3D, three.js) is the fallback decided at the end of phase 2.
- Design doc and roadmap: https://claude.ai/code/artifact/11bd6ff4-4c06-45d8-87e0-f758ea577a8c
