# Game rules (phase 1)

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
