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

## Skirmish and two players (stage 4)

A skirmish is any of the 7 campaign maps without the mission script. Both sides start even: an HQ, one harvester,
the same money ($1500, $3000 or $6000) and two crystal fields of 3000 next to the HQ. The starts are the two HQ spots
from the map's missions that lie farthest apart, can reach each other and are not forest pockets; the missions' other
crystal fields stay in between as contested fields. Each side sees 8 cells around its HQ from the start.
`packages/sim/src/skirmish.ts` builds it; the win rule is the campaign's (lose your HQ, lose the game).

- Skirmish sides are equal: both build the player's four vehicles. The alien enemy tank and the original enemy's free
  raiders belong to the campaign.
- The second side is the computer (easy, normal, hard) or a second person at the same Mac (`vs=human`). The computer
  gets the same money and only its difficulty's income bonus on top.
- The computer builds from a bare HQ on every difficulty in a skirmish (easy does not build in the campaign).
- New for every computer player: a second or third factory once money piles up (normal 2, hard 3), an army cap
  (easy 8, normal 16, hard 30 tanks), the whole map searched for a building spot (a corner base used to give up),
  and a wave never smaller than the enemy's army, up to the wave maximum.
- In a skirmish hard waits for a first wave of 8 at 3 minutes instead of 5 at 100 s: early small waves only fed
  tanks to the other base. Tests check that normal beats easy on all 7 maps from both starts and hard beats normal
  in at least 9 of those 14 games (10 now).

Two players share one Mac on a split screen: player 1 on the left with mouse and keyboard, player 2 on the right with
a gamepad (with two gamepads player 1 may use the first). Each half has its own camera, fog of war, selection,
panel and money. Gamepad: left stick moves a cursor (pushing the camera at the edge), right stick scrolls, A selects
(hold and move for a box), B orders or cancels placement, Y cycles HQ and factories, D-pad up takes the whole army,
down stops, LB/RB move a highlight over the panel buttons and X presses it, LT/RT zoom, Back centres on the HQ,
Start starts or pauses. Self-destruct stays mouse-only.

## Races and team colours

The remaster has three races: humans, hovers (the original's enemy hover tanks) and walkers (jointed alien
creatures). Races are cosmetic: every race uses the original's numbers and the race only changes how a side looks
(`Race`, `TEAM_COLORS` and `spriteName` in `packages/data/src/races.ts`). The campaign is white humans with olive
accents (close to the original's olive army and white base) against cyan hovers with white accents. A skirmish lets
each side pick any race and one of 24 team colours (8 hues, each in a dark, a base and a light shade), never both the
exact same colour (two shades of one hue are fine), plus a secondary colour for accents (olive for the first side and
white for the second by default), which may be any colour, also the other side's or the side's own. Shots and
muzzle flashes keep their race's own colours, except the walkers', which glow in the side's colours (`glowRamp`). The
original's raider (type 100) is drawn as the hover race's middle tank.

## Saves

`saveWorld()` turns the whole world (RNG state and the computer players included) into plain JSON and `loadWorld()`
restores it; the game continues tick for tick as if it had never stopped. Saves carry a version and older versions
are refused (version 2 added the skirmish mode, version 3 each side's race and colour, version 4 the secondary colour). Skirmishes save like missions. The game keeps a quick slot (F5 saves, F9 loads) and three slots in localStorage.

## Cheats

The original's keypad codes work as typed keys, as an easter egg: `1298*` reveals the map, `1298#` skips the
mission, `12986` gives $1000, `12989` repairs the selected objects.

## Campaign gate

`packages/sim/test/campaign.test.ts` lets the scripted player (`autoplay` brain) play every mission against every
difficulty. Classic and easy/normal must be won everywhere except the listed script limits (7.1 against a smart
enemy is beyond the script, not the player); hard must be won at least 14 times out of 21.
