import { LANGS, type Lang } from '@sw/data';
import { campaign } from '@sw/data';
import { DEFAULT_SKIRMISH_MONEY, DIFFICULTIES, OPPONENTS, SAVE_VERSION, SKIRMISH_MONEY, type Difficulty, type WorldSave } from '@sw/sim';
import { sidesLook, type Setup } from './game';

/**
 * Settings, campaign progress and save slots in localStorage. Storage can be missing or full (private windows,
 * blocked site data), so every access is wrapped and the game simply runs without it.
 */

const PREFIX = 'sw.';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export type SkirmishSetup = Extract<Setup, { kind: 'skirmish' }>;

export interface Settings {
  lang: Lang;
  difficulty: Difficulty;
  /** The last skirmish started, offered again by the Skirmish button. */
  skirmish: SkirmishSetup;
}

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>('settings') ?? {};
  const k = s.skirmish;
  return {
    lang: s.lang && LANGS.includes(s.lang) ? s.lang : 'uk',
    difficulty: s.difficulty && DIFFICULTIES.includes(s.difficulty) ? s.difficulty : 'normal',
    skirmish: {
      kind: 'skirmish',
      mapIndex: k && k.mapIndex >= 0 && k.mapIndex < campaign.maps.length ? k.mapIndex : 3,
      opponent: k && OPPONENTS.includes(k.opponent) ? k.opponent : 'normal',
      money: k && (SKIRMISH_MONEY as readonly number[]).includes(k.money) ? k.money : DEFAULT_SKIRMISH_MONEY,
      ...sidesLook(k?.races, k?.colors, k?.colors2),
    },
  };
}

export function saveSettings(s: Settings): void {
  write('settings', s);
}

/** Completed missions as "map.mission" keys, 1-based. */
export function completed(): Set<string> {
  return new Set(read<string[]>('completed') ?? []);
}

export function markCompleted(mapIndex: number, missionIndex: number): void {
  const done = completed();
  done.add(`${mapIndex + 1}.${missionIndex + 1}`);
  write('completed', [...done]);
}

export const SLOTS = ['quick', '1', '2', '3'] as const;
export type Slot = (typeof SLOTS)[number];

export interface SaveGame {
  version: typeof SAVE_VERSION;
  /** The mission or skirmish the save belongs to. */
  setup: Setup;
  savedAt: string;
  world: WorldSave;
}

export function readSave(slot: Slot): SaveGame | null {
  const s = read<SaveGame>(`save.${slot}`);
  return s && s.version === SAVE_VERSION ? s : null;
}

export function writeSave(slot: Slot, save: SaveGame): boolean {
  return write(`save.${slot}`, save);
}
