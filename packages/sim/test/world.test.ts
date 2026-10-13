import { describe, expect, it } from 'vitest';
import { campaign, LANGS, MAP_NAMES, missionText, ObjectType } from '@sw/data';
import { createWorld, hashWorld, step } from '../src';

describe('campaign data', () => {
  it('has the 7 maps and 21 missions of the full original', () => {
    expect(campaign.maps).toHaveLength(7);
    expect(campaign.maps.reduce((n, m) => n + m.missions.length, 0)).toBe(21);
  });

  it('has a Ukrainian and an English title and briefing for every mission', () => {
    for (const lang of LANGS) {
      expect(MAP_NAMES[lang]).toHaveLength(campaign.maps.length);
      campaign.maps.forEach((map, mi) =>
        map.missions.forEach((_, si) => {
          const text = missionText(lang, mi, si);
          expect(text.title, `${lang} ${mi + 1}.${si + 1}`).not.toBe('?');
          expect(text.brief.length, `${lang} ${mi + 1}.${si + 1}`).toBeGreaterThan(10);
        }),
      );
    }
  });
});

describe('createWorld', () => {
  it('loads every mission with exactly one player HQ and one enemy HQ', () => {
    for (const map of campaign.maps) {
      map.missions.forEach((_, i) => {
        const world = createWorld(map, i);
        const hq = world.entities.filter((e) => e.type === ObjectType.PlayerHQ);
        const enemyHq = world.entities.filter((e) => e.type === ObjectType.EnemyHQ);
        expect(hq, `${map.name} #${i + 1}`).toHaveLength(1);
        expect(enemyHq, `${map.name} #${i + 1}`).toHaveLength(1);
        expect(enemyHq[0]!.team).toBe('enemy');
      });
    }
  });

  it('keeps every object inside the map', () => {
    for (const map of campaign.maps) {
      map.missions.forEach((_, i) => {
        const world = createWorld(map, i);
        for (const e of world.entities) {
          expect(e.x).toBeGreaterThanOrEqual(0);
          expect(e.y).toBeGreaterThanOrEqual(0);
          expect(e.x + e.size).toBeLessThanOrEqual(map.w * 30);
          expect(e.y + e.size).toBeLessThanOrEqual(map.h * 30);
        }
      });
    }
  });

  it('marks the forest of map 1 as impassable', () => {
    const world = createWorld(campaign.maps[0]!, 0);
    expect(world.blocked.some((c) => c === 1)).toBe(true);
    expect(world.blocked.some((c) => c === 0)).toBe(true);
  });
});

describe('determinism', () => {
  it('two worlds with the same seed stay identical', () => {
    const map = campaign.maps[5]!;
    const a = createWorld(map, 1, 42);
    const b = createWorld(map, 1, 42);
    for (let i = 0; i < 200; i++) {
      step(a);
      step(b);
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.rngState).toBe(b.rngState);
  });
});

describe('known quirks of the original data', () => {
  it('map 6 mission 3 "Seek them" ships without a briefing', () => {
    const m = campaign.maps[5]!.missions[2]!;
    expect(m.title).toBe('Seek them');
    expect(m.brief).toBe('');
  });
});
