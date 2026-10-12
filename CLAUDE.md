# Strategy War Remaster

Fan remaster of the 2004 J2ME real-time strategy Strategy War (Jiří Mikula / tadpole / Redboss) for macOS.
Pavlo (GitHub `apachey`) directs; Claude writes the code and art. Talk to Pavlo in Ukrainian; code, comments and
commit messages are in English.

## Layout

- `apps/game` — the game: Vite + TypeScript + PixiJS 8. `?m=6.2` opens map 6, mission 2.
- `apps/desktop` — Tauri 2 shell that packages `apps/game/dist` as a macOS app and .dmg.
- `packages/sim` — deterministic simulation with no rendering. Fixed 20 ticks/s, seeded RNG, never `Math.random`
  or wall-clock time inside the sim, so replays, AI tests and later online play stay in lockstep.
- `packages/data` — `campaign.json` (7 maps, 21 missions decoded from the original), types, original balance.
- `tools/extract` — decoder for the original `.tae` map format (see its README).

## Commands

```sh
pnpm install
pnpm dev            # game in the browser at http://localhost:5173
pnpm typecheck && pnpm test
pnpm e2e            # Playwright smoke tests + screenshots in apps/game/test-results
pnpm desktop:build  # macOS .app/.dmg (needs macOS + Rust)
```

## Rules

- Never commit original game files (JARs, sprites, sounds); they live in the project files, not the repo.
  Campaign layout data in `packages/data` is the only thing taken from the original.
- Gameplay logic goes in `packages/sim`, never in `apps/game`. The game only reads world state and sends commands.
- Every gameplay change needs a sim test; every visible change needs an updated smoke screenshot.
- Art direction: style B (HD pixel art) via low-poly 3D models rendered to 8-direction sprites; style E
  (low-poly 3D, three.js) is the fallback decided at the end of phase 2.
- Design doc and roadmap: https://claude.ai/code/artifact/11bd6ff4-4c06-45d8-87e0-f758ea577a8c
