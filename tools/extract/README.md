# Original data extraction

`packages/data/src/campaign.json` was produced from the original J2ME builds (v1.3.5 MIDP-2 and v1.6.3, identical maps)
by decoding the `.tae` map files. The original JAR files are **not** in this repository; they live in the project files
(`/mnt/project-files/strategy-war/original/`).

`extract-campaign.mjs` re-creates the JSON from a folder that holds `map_1.tae … map_7.tae` and `map_1.txt … map_7.txt`:

```sh
node tools/extract/extract-campaign.mjs <folder-with-original-maps> > packages/data/src/campaign.json
```

## `.tae` format (big-endian)

Every chunk starts with `'O'` (0x4F), a chunk type byte and a 2-byte length.

- Type 0, map: `width`, `height` (in 30 px tiles), then `width*height` tile ids (1..10, index into `tiles.png`, 5×2 grid).
- Type 1, mission: 2-byte start money, followed by its objects.
- Type 2, object: type, x (2 bytes), y (2 bytes), 4 skipped bytes, HP in bytes 2–3 of a 4-byte group,
  4 skipped bytes, enemy flag in byte 2 of a 2-byte group. Type 100 objects carry 6 more bytes.

Object types: 0 player HQ, 1 silo, 2 tank factory, 4 enemy HQ, 5 resource field, 6 wall, 7 defender,
100 enemy tank, 101 light tank, 102 middle tank, 103 heavy tank, 104 harvester.

The `.txt` file (cp1250) holds the map name, then a title and a briefing line per mission. Map 6 mission 3
("Seek them") has an empty briefing in the original.
