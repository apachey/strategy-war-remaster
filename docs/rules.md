# Game rules

The simulation follows the decompiled v1.3.5 code (v1.6.3 has the same balance). Map coordinates use the original
30 px tiles split into 15 px cells; units, walls and defenders take one cell, other buildings 2×2 cells.

## From the original

| What | Value |
|---|---|
| Light tank | $100, 70 HP, 1 px per 30 ms, range 3 cells, light gun |
| Middle tank | $150, 100 HP, 1 px per 60 ms, range 4 cells, cannon |
| Heavy tank | $250, 120 HP, 1 px per 100 ms, range 4 cells, cannon |
| Harvester | $150, 50 HP, 1 px per 50 ms, unarmed, carries 50 |
| Enemy tank | 100 HP, 1 px per 70 ms, range 3 cells, light gun |
| Light gun | 7 damage, shell 400 px/s, one shot per 2 s |
| Cannon | 15 damage, shell 50 px/s, one shot per 2 s (defender: per 2.5 s, range 5 cells) |
| Silo / Factory / Defender / Wall | $400 / $700 / $250 / $50; 100 / 100 / 80 / 50 HP |
| Build time | 100 ms per hit point of the thing being built (silo 10 s, light tank 7 s); walls are instant |
| Construction | the HQ builds one thing at a time, placed first and finished on the spot; cancelling refunds everything |
| Harvesting | 1 unit per 50 ms onto the harvester, 1 unit of money per 50 ms while docked in a silo |
| Enemy factory | a new enemy tank after 45 s of quiet plus 10 s of building, while the enemy has fewer than 10 |
| Enemy tank AI | shoots player buildings in range first, then units; otherwise wanders up to 10 cells |
| Fog | classic shroud: units uncover 2 cells around them, buildings twice their size; seen stays seen |
| Mission end | enemy HQ destroyed: won; own HQ destroyed: lost; 2 s pause before the result |
| Hit points of placed objects | taken from the mission file, so starting units are often weaker than new ones |

## Deliberate changes

- Shells fly straight at the target instead of along one of 8 directions, so shots no longer miss stationary targets.
- A plain move order is just a move: tanks fire on their own only when idle or guarding, and do not chase.
- Pathfinding is A* over cells; a unit sent somewhere unreachable drives to the closest reachable point.
- Group moves spread units over neighbouring cells instead of stacking them on one.
- Only silos accept harvested resource, which matches mission 2's briefing ("Build a silo, start harvesting").
- Attack-move (`attackMove`, used by the computer player): drive to a point, fighting armed units and towers met on
  the way; when only enemy buildings block the route, shoot through the first one.

## Computer enemy and difficulty (stage 3)

The original enemy only waits at its base and trickles out tanks. That is kept as **Classic**; the other levels
hand the enemy side to a computer player (`packages/sim/src/ai.ts`) that sends ordinary commands through `issue()`,
exactly like the player. It is deterministic (seeded RNG, fixed ticks), so the same mission plays out the same way.

| | Easy | Normal | Hard |
|---|---|---|---|
| Thinks every | 2 s | 1 s | 0.5 s |
| Builds (silo, factory, towers) | no | yes | yes |
| Harvesters | 1 | 2 | 3 |
| Tanks | enemy, light | enemy, light, medium | medium, light, heavy |
| First wave / then every | 4 min / 2 min | 2.5 min / 80 s | 100 s / 50 s |
| Wave size (grows to) | 3 (4) | 4 (7) | 5 (10) |
| Wave target | your HQ | the nearest building | your economy (harvesters, silos, factory) |
| Focus fire, guard radius | no, 3 cells | no, 8 cells | yes, 10 cells |
| Starting money, income on top of harvesting | $300, $60/min | $700, $120/min | $1500, $200/min |

- The computer player builds tanks the player can build too (light, medium, heavy), as the design doc asks; the
  enemy tank stays in its mix on easy and normal.
- On map 1 (training) the computer enemy commands what it has but never builds or produces.
- It defends: home tanks answer threats near its buildings and harvesters, and it puts up up to three emergency
  towers when outnumbered. Harvesters avoid fields where harvesters died or that a player tower covers.
- Waves gather at a staging point out of tower range, then move together; a wave also launches when the enemy's
  economy has stalled.

## Saves

`saveWorld()` turns the whole world (RNG state and the computer players included) into plain JSON and `loadWorld()`
restores it; the game continues tick for tick as if it had never stopped. Saves carry a version and older versions
are refused. The game keeps a quick slot (F5 saves, F9 loads) and three slots in localStorage.

## Cheats

The original's keypad codes work as typed keys, as an easter egg: `1298*` reveals the map, `1298#` skips the
mission, `12986` gives $1000, `12989` repairs the selected objects.

## Campaign gate

`packages/sim/test/campaign.test.ts` lets the scripted player (`autoplay` brain) play every mission against every
difficulty. Classic and easy/normal must be won everywhere except the listed script limits (7.1 against a smart
enemy is beyond the script, not the player); hard must be won at least 14 times out of 21.
