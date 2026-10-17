# tools/art: 3D models to style B pixel sprites

```sh
pnpm sprites                       # regenerate assets/sprites + docs/art/sprites-preview.png
pnpm sprites --only human_light_tank   # quick iteration: only the preview (add --out dir for an atlas)
pnpm sprites:check                 # CI: fail if assets/sprites is stale
```

## How it works

1. **Models** (`src/browser/models/`, one file per race plus `nature.ts`) are low-poly three.js scenes shaped after the original 2004 sprites, built in code with the kit in
   `src/browser/kit.ts`. One world unit is one 15 px cell of the original map; models face north (-z). Every mesh
   names a surface kind (`team`, `steel`, `glass`, `lamp`, ...; see `src/materials.ts`) instead of a colour.
2. **Render** (`src/browser/render.ts`) runs in headless Chromium (SwiftShader, so it is the same everywhere).
   An orthographic camera looks from the south at 40 degrees, low like the
   original's sprites. Each view and frame is rendered 8x larger in three
   passes: material id, light (white surfaces, sun from the north-west with shadows, sky and a weak fill), depth.
3. **Pixels** (`src/pixel.ts`, pure and unit-tested): each 8x8 block becomes one art pixel by majority; the light
   picks a step in the material's colour ramp (`src/palette.ts`, 33 colours for objects and
   15 for the ground); surfaces that pass behind a nearer
   one get an inner line two steps darker; a 2 px outline, two ramp steps darker than the body it touches, goes round the silhouette and the floor shadow becomes a
   38% dark overlay.
4. **Team colours**: `team` surfaces are drawn once, in olive. `recolor` (and the game, when it loads the atlas)
   swaps those five colours for the ramp of the colour a side wears, any of `TEAM_COLORS` in `@sw/data`; the
   atlas meta lists `teamRamp` and `teamColors`. Nothing else in the palette uses the olive colours.
5. **Atlas** (`src/atlas.ts`): frames are trimmed and shelf-packed into `assets/sprites/sprites.png` with a
   PixiJS spritesheet `sprites.json`.

## Using the spritesheet

Frame names are `name/frame/direction`, e.g. `hover_heavy_tank/fire/se`; buildings have no direction
(`human_hq/idle2`), walls use the neighbour mask instead (`walker_wall/idle/5` = north + south). Directions run
clockwise from north: `n ne e se s sw w nw`. `spriteName(race, objectType)` in `@sw/data` gives the name for an
object of a race.

`animations` groups numbered frames: `human_light_tank/move/e` = `[move0, move1]`, `*_harvester/harvest/<dir>` =
two frames of harvesting, `*_hq/idle` = four frames (radar, glowing crystal, breathing maw). Single frames:
`*_factory/work` (building a tank), `fire` (recoil and the race's muzzle flash), `wreck`.

Every frame carries an `anchor` at the centre of its footprint, so a sprite placed at a cell centre (units, walls,
defender) or at the centre of its 2x2 cells (buildings) lines up with the map. Art scale is 32 px per cell.

Each race (`human`, `hover`, `walker`) has the same roster, `<race>_<kind>`: `harvester`, `light_tank`,
`middle_tank`, `heavy_tank`, `defender`, `hq`, `silo`, `factory`, `construction`, `wall`, and `shot`
(frames `gun` and `cannon`, 8 directions: the projectile in flight).
- humans: tracks and wheels, white buildings with cyan glass; gauss guns fire white-hot slugs through cyan rings;
- hovers (the original's enemy): floating oval shells, monolithic pale vaults on four legs with team crystals
  inside; cyan plasma;
- walkers: jointed many-legged creatures, hive mounds, sacs and a brood shell; green acid spit.

Every object gets a 2 px outline two ramp steps darker than the body next to it (black around the darkest colours);
`pnpm sprites --outline 0 --out <dir>` renders without it, as the sprite studio wants.

Neutral: `resource/idle` (low crystals breaking through the sand, flat enough for a harvester to stand on) and
`fir/idle/0..3`, four fir trees (young, wide and dark, slim and light, old and tall); the game scatters one or two
per forest cell with a little jitter.

## Terrain

`src/terrain.ts` paints the ground in Node, without 3D, into `assets/sprites/terrain.png` + `terrain.json`:

- `sand`: one seamless 256 px texture (8 x 8 cells) with two crossing dune systems lit from the north-west,
  ripples, colour drift and pebbles. Tile it by world position under the whole map.
- `forest/<mask>`: a 32 px forest floor tile per neighbour mask (N1 E2 S4 W8 set = that neighbour is forest too).
  Sides facing sand get a jagged edge, a black rim and a soft shadow on the sand outside; draw it over the sand
  in every forest cell, then the firs on top. Humans are at home here.
- `plate/<mask>`: the hover race's pale floor plates, four panels a cell with seams and a cyan light, chamfered
  where they end at the sand. Walkers live on the open sand.

Everything is quantised to the palette's sand, pine and plate ramps with ordered dithering, and `pnpm sprites:check`
covers the terrain files too.

## Adding a sprite

Add an entry to `SPRITES` in `src/catalog.ts`, a builder with the same name in `MODELS`, run `pnpm sprites` and
look at `docs/art/sprites-preview.png`. Keep units within about 0.9 x 0.9 cells.
