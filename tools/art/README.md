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
   picks a step in the material's colour ramp (`src/palette.ts`, 43 colours for objects and
   19 for the ground); surfaces that pass behind a nearer
   one get an inner line two steps darker; a 2 px outline, two ramp steps darker than the body it touches, goes round the silhouette and the floor shadow becomes a
   38% dark overlay.
4. **Team colours**: a side wears a main, a secondary and a chassis colour, any of the 24 `TEAM_COLORS` in `@sw/data`
   (8 hues × dark, base, light). `team` surfaces are drawn once in olive, `team2` (secondary) in the red `accent`
   ramp, `chassis` in the blue `frame` ramp, and `team3`, light in the secondary (the walkers' eyes), in the magenta
   `glow` ramp. `recolor` (and the game, when it loads the atlas) swaps the four ramps for the side's three colours
   and `glowRamp(secondary)`; the atlas meta lists the drawn ramps (`teamRamp`, `secondRamp`, `chassisRamp`,
   `glowRamp`) and `teamColors`. Nothing else in the palette uses those twenty colours. The chassis colour paints
   what carries a unit: human tracks and tyres, walker legs and knees, the skirt a hover shell floats on
   (`defaultChassisColor` gives a side without one its old look). Which parts wear the other colours:
   - humans: hulls, cabs and building shells in the main colour; glass, bands and fittings in the
     secondary; small fittings (turret rings, grilles, hatches, vents, gun sleeves), wheel hubs, the harvester's
     cutter, guns, platforms, the silo's and factory's thin rings and masts and the factory's big dark blocks stay
     grey, so a side in two equal colours still has some contrast; cyan lights stay cyan;
   - hovers: shells and vaults in the main colour, everything else that is not grey (grooves, plates, crystals) in
     the secondary; cyan lights stay cyan;
   - walkers: carapace and their thorn shots in the main colour, sacs and plates in the secondary, eyes glowing
     neon in the secondary round a white-hot core; muzzles, the thorns' trails and all acid stay toxic green
     (`acid` ramp) whatever the colours.
   Human and hover shots keep their race's own colours (grey slugs in yellow-orange fire, cyan plasma).
5. **Atlas** (`src/atlas.ts`): frames are trimmed and shelf-packed into `assets/sprites/sprites.png` with a
   PixiJS spritesheet `sprites.json`.

## Using the spritesheet

Frame names are `name/frame/direction`, e.g. `hover_heavy_tank/fire/se`; buildings have no direction
(`human_hq/idle2`), walls use the neighbour mask instead (`walker_wall/idle/5` = north + south): `wallMask` in `@sw/data` packs the
eight neighbours (N1 E2 S4 W8, NE16 SE32 SW64 NW128; a diagonal counts only when neither orthogonal cell beside it
is a wall), so `WALL_MASKS` holds 47 joins. Each wall piece is rendered with its neighbours' arms as invisible
"ghost" geometry (`GHOST_ID`): they hide the piece's outline where it meets them, so joins have no seam. Directions run
clockwise from north: `n ne e se s sw w nw`. `spriteName(race, objectType)` in `@sw/data` gives the name for an
object of a race.

`animations` groups numbered frames: `human_light_tank/move/e` = `[move0, move1]`, `*_harvester/harvest/<dir>` =
four frames of harvesting (tracks still, the front mechanism turning, roof closed), `*_hq/idle` = four frames (radar, glowing crystal, breathing maw). Single frames:
`*_factory/work` (building a tank), `fire` (recoil and the race's muzzle flash), `wreck`.

Tanks and defenders come in two parts so the turret can aim on its own: the hull (`<race>_light_tank` with
`move0`, `move1`, `wreck`; the defender's base is one `idle` frame) and the turret (`<race>_light_tank_turret` with
`idle` and `fire`, 8 directions), both anchored at the cell centre; draw the turret over the hull. The split happens
at render time: model builders mark their turret group with `userData.turret`, so `MODELS[name](view, frame)` still
builds the whole vehicle for live 3D views.

Every frame carries an `anchor` at the centre of its footprint, so a sprite placed at a cell centre (units, walls,
defender) or at the centre of its 2x2 cells (buildings) lines up with the map. Art scale is 32 px per cell.

Each race (`human`, `hover`, `walker`) has the same roster, `<race>_<kind>`: `harvester`, `light_tank`,
`middle_tank`, `heavy_tank`, `defender`, `hq`, `silo`, `factory`, `construction`, `wall`, and `shot`
(frames `gun` and `cannon`, 8 directions: the projectile in flight).
- humans: tracks and wheels, mushroom-tower buildings with panoramic glass; gauss guns fire grey steel slugs with a
  yellow-hot tail of fire;
- hovers (the original's enemy): floating oval shells, monolithic pale vaults on four legs with team crystals
  inside, round domed rotundas for the silo and a smooth capsule hangar for the factory; cyan plasma;
- walkers: jointed many-legged creatures, hive mounds, sacs and a clawed womb; they shoot sharp thorns (`THORNS`:
  a bullet for the gun, a thicker shell for the cannon) trailing two or three drops of acid, drawn over the unit as
  they leave the muzzle (`onTop`).

Every object gets a 2 px outline two ramp steps darker than the body next to it (black around the darkest colours);
`pnpm sprites --outline 0 --out <dir>` renders without it, as the sprite studio wants. Materials marked `thin`
(the drops of acid) get a 1 px outline, so each drop stays a drop instead of merging into a lump.

Neutral: `resource` (low crystals breaking through the ground, flat enough for a harvester to stand on: frame `idle`
on sand, `forest` through forest soil, `plates` through the hovers' cracked plates; pick by the ground under the
field) and
`fir/idle/0..3`, four fir trees (young, wide and dark, slim and light, old and tall); the game scatters one or two
per forest cell with a little jitter; `sway0`/`sway1` lean them in the wind. `decor/idle/0..7` are small neutral
props for the open sand (pebbles, a slab, a dry bush, ribs, crystal shards, scrap, a succulent, a crater).

## Effects

`src/effects.ts` draws the pixel effects in Node into `assets/sprites/effects.png` + `effects.json`, all from the
shared palette: `blast/small/0..5`, `blast/big/0..7`, `smoke/0..5`, `dust/0..4`, `spark/0..3` (human hits),
`plasma/0..4` (hover hits), `acid/0..4` (walker hits), `fire/0..3` (a looping flame anchored at its bottom, for
burning buildings), `scorch/small|big`, `track/<tread|wheel|foot>/<dir>` (marks left on the sand), `glint/0..3`
(crystal sparkle) and `wisp` (blowing sand).

## Terrain

`src/terrain.ts` paints the ground in Node, without 3D, into `assets/sprites/terrain.png` + `terrain.json`:

- `sand`: one seamless 256 px texture (8 x 8 cells) with two crossing dune systems lit from the north-west,
  ripples, colour drift and pebbles. Tile it by world position under the whole map.
- `forest/<mask>/<0..3>`: four variants of a 32 px forest floor tile per neighbour mask (N1 E2 S4 W8 set = that neighbour is forest too).
  Sides facing sand get a jagged edge, a black rim and a soft shadow on the sand outside; draw it over the sand
  in every forest cell, then the firs on top. `forest-fringe/<mask8>` (eight-neighbour mask as for walls) scatters
  grass tufts over a sand cell beside the forest, so the edge thins out instead of stopping at a line. Humans are at home here.
- `plates`: the hover race's ground, one seamless 256 px texture of pale floor plates seen at the sprites' low
  angle: random sizes laid across the cell grid, each with a lit rim, its top and a dark south face as deep as it
  stands high; some worn, cracked or lit. Draw it by world position in plated cells, then `plate-edge/<mask>` over
  each sand cell beside them (N1 E2 S4 W8 set = that neighbour is plated): the front face of the raised floor and
  its shadow. Walkers live on the open sand.

Everything is quantised to the palette's sand, pine and plate ramps with ordered dithering, and `pnpm sprites:check`
covers the terrain files too.

## Adding a sprite

Add an entry to `SPRITES` in `src/catalog.ts`, a builder with the same name in `MODELS`, run `pnpm sprites` and
look at `docs/art/sprites-preview.png`. Keep units within about 0.9 x 0.9 cells.
