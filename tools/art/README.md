# tools/art: 3D models to style B pixel sprites

```sh
pnpm sprites                       # regenerate assets/sprites + docs/art/sprites-preview.png
pnpm sprites --only light_tank     # quick iteration: only the preview, nothing committed changes
pnpm sprites:check                 # CI: fail if assets/sprites is stale
```

## How it works

1. **Models** (`src/browser/models.ts`) are low-poly three.js scenes shaped after the original 2004 sprites, built in code with the kit in
   `src/browser/kit.ts`. One world unit is one 15 px cell of the original map; models face north (-z). Every mesh
   names a surface kind (`team`, `steel`, `glass`, `lamp`, ...; see `src/materials.ts`) instead of a colour.
2. **Render** (`src/browser/render.ts`) runs in headless Chromium (SwiftShader, so it is the same everywhere).
   An orthographic camera looks from the south at 40 degrees, low like the
   original's sprites. Each view and frame is rendered 8x larger in three
   passes: material id, light (white surfaces, sun from the north-west with shadows, sky and a weak fill), depth.
3. **Pixels** (`src/pixel.ts`, pure and unit-tested): each 8x8 block becomes one art pixel by majority; the light
   picks a step in the material's colour ramp (`src/palette.ts`, 32 colours for objects and
   10 for the ground); surfaces that pass behind a nearer
   one get an inner line two steps darker; a 1 px outline goes round the silhouette and the floor shadow becomes a
   38% dark overlay.
4. **Teams**: `team` surfaces are recoloured per team (player olive and enemy cyan as in the original, player 2
   red)
   without re-rendering.
5. **Atlas** (`src/atlas.ts`): frames are trimmed and shelf-packed into `assets/sprites/sprites.png` with a
   PixiJS spritesheet `sprites.json`.

## Using the spritesheet

Frame names are `name/team/frame/direction`, e.g. `heavy_tank/enemy/fire/se`; buildings have no direction
(`hq/player/idle2`), walls use the neighbour mask instead (`wall/idle/5` = north + south) and the resource field
and the construction site have no team (`resource/idle`, `construction/idle`). Directions run clockwise from north: `n ne e se s sw w nw`.

`animations` groups numbered frames: `light_tank/player/move/e` = `[move0, move1]` (track links shift),
`hq/player/idle` = 4 radar positions, `enemy_hq/enemy/idle` = turning shards and a pulsing orb. Single frames: `factory/<team>/work` (building a tank), `fire` (recoil +
muzzle flash), `wreck`.

Every frame carries an `anchor` at the centre of its footprint, so a sprite placed at a cell centre (units, walls,
defender) or at the centre of its 2x2 cells (buildings) lines up with the map. Art scale is 32 px per cell.

Fir trees are `fir/idle/0..3`, four variants (young, wide and dark, slim and light, old and tall) with no team or
direction; the game scatters one or two per forest cell with a little jitter.

## Terrain

`src/terrain.ts` paints the ground in Node, without 3D, into `assets/sprites/terrain.png` + `terrain.json`:

- `sand`: one seamless 256 px texture (8 x 8 cells) with two crossing dune systems lit from the north-west,
  ripples, colour drift and pebbles. Tile it by world position under the whole map.
- `forest/<mask>`: a 32 px forest floor tile per neighbour mask (N1 E2 S4 W8 set = that neighbour is forest too).
  Sides facing sand get a jagged edge, a black rim and a soft shadow on the sand outside; draw it over the sand
  in every forest cell, then the firs on top.

Everything is quantised to the palette's sand and pine ramps with ordered dithering, and `pnpm sprites:check`
covers the terrain files too.

## Adding a sprite

Add an entry to `SPRITES` in `src/catalog.ts`, a builder with the same name in `MODELS`, run `pnpm sprites` and
look at `docs/art/sprites-preview.png`. Keep units within about 0.9 x 0.9 cells.
