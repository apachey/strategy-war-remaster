import { MAP_NAMES, missionText, ObjectType, type Lang } from '@sw/data';
import type { Difficulty, Opponent } from '@sw/sim';

/** Interface strings in both languages. Mission titles and briefings live in @sw/data. */
const UK = {
  names: {
    [ObjectType.PlayerHQ]: 'Штаб',
    [ObjectType.Silo]: 'Сховище',
    [ObjectType.TankFactory]: 'Танковий завод',
    [ObjectType.EnemyHQ]: 'Ворожий штаб',
    [ObjectType.ResourceField]: 'Поле кристалів',
    [ObjectType.Wall]: 'Стіна',
    [ObjectType.Defender]: 'Захисна вежа',
    [ObjectType.EnemyTank]: 'Ворожий танк',
    [ObjectType.LightTank]: 'Легкий танк',
    [ObjectType.MiddleTank]: 'Середній танк',
    [ObjectType.HeavyTank]: 'Важкий танк',
    [ObjectType.Harvester]: 'Харвестер',
  } as Record<number, string>,
  order: { idle: 'чекає', move: 'їде', attackMove: 'їде в атаку', attack: 'атакує', harvest: 'збирає ресурс', defend: 'охороняє' },
  phase: { toField: 'їде на поле', loading: 'набирає ресурс', toSilo: 'везе до сховища', unloading: 'розвантажується' },
  reason: {
    'no-money': 'Не вистачає грошей!',
    blocked: 'Тут будувати не можна',
    busy: 'Зайнято: спершу завершіть поточне',
    invalid: 'Так не можна',
  },
  difficulty: { classic: 'Класика', easy: 'Легко', normal: 'Нормально', hard: 'Важко' } as Record<Difficulty, string>,
  difficultyHint: {
    classic: 'Ворог як в оригіналі 2004 року: стоїть на місці й чекає.',
    easy: 'Ворог збирає кристали й зрідка атакує.',
    normal: 'Ворог будує базу, збирає кристали, захищається й атакує хвилями.',
    hard: 'Ворог швидкий і злий: бʼє по економіці, фокусує вогонь, великі хвилі.',
  } as Record<Difficulty, string>,
  pause: '⏸ Пауза',
  resume: '▶ Далі',
  missions: 'Місії',
  saves: 'Збереження',
  help: 'ЛКМ: вибір (рамка мишею) · ПКМ: наказ · Cmd+1…9: загін · H: штаб · S: стоп · Пробіл: пауза · колесо: зум · F: уся мапа · F5/F9: швидке збереження',
  hint: 'Виділіть юніт або будівлю. ПКМ дає наказ.',
  squad: 'Загін',
  hp: 'Міцність',
  resource: 'Ресурс',
  cargo: 'вантаж',
  building: 'будується',
  producing: 'випускає',
  constructing: 'будує',
  cancelBuild: '✕ Скасувати будівництво',
  cancel: '✕ Скасувати',
  destruct: 'Самознищення',
  destructConfirm: 'Знищити обʼєкт?',
  stop: '■ Стоп',
  kicker: (map: number, mission: number) => `Мапа ${map} · місія ${mission}`,
  goal: 'Мета: знищити ворожий штаб. Не втратьте свій.',
  difficultyLabel: 'Складність',
  languageLabel: 'Мова',
  start: 'Почати',
  won: 'Місію виконано',
  lost: 'Поразка',
  wonText: 'Ворожий штаб знищено.',
  lostText: 'Ваш штаб знищено.',
  retry: 'Ще раз',
  next: 'Наступна місія',
  campaignDone: 'Кампанію пройдено! Ворога розгромлено.',
  close: 'Закрити',
  locked: 'Спершу пройдіть попередні місії',
  slot: (n: number) => `Слот ${n}`,
  quick: 'Швидке',
  empty: 'порожньо',
  save: 'Зберегти',
  load: 'Завантажити',
  saved: 'Гру збережено',
  loaded: 'Гру завантажено',
  saveFailed: 'Не вдалося зберегти',
  noSave: 'Немає збереження',
  skirmish: 'Скірміш',
  campaign: 'Кампанія',
  helpDuo:
    'Гравець 1: миша й клавіатура (або геймпад, якщо їх два). Гравець 2: геймпад. Геймпад: лівий стік курсор · A вибір (тримати: рамка) · B наказ · Y штаб/завод · ↑ уся армія · ↓ стоп · LB/RB вибір кнопки · X натиснути · LT/RT зум · правий стік камера · Start пауза',
  padHint: 'A: вибір · B: наказ · Y: штаб · ↑: армія',
  opponent: { easy: 'Легкий ШІ', normal: 'Нормальний ШІ', hard: 'Важкий ШІ', human: 'Удвох' } as Record<Opponent, string>,
  opponentHint: {
    easy: 'Компʼютер будує базу повільно й тримає невелике військо.',
    normal: 'Компʼютер будує базу, збирає кристали й атакує хвилями.',
    hard: 'Компʼютер швидкий: кілька заводів, великі хвилі, бʼє по економіці.',
    human: 'Двоє гравців за одним Mac: екран ділиться навпіл. Гравець 1 з мишею, гравець 2 з геймпадом.',
  } as Record<Opponent, string>,
  mapLabel: 'Мапа',
  opponentLabel: 'Суперник',
  moneyLabel: 'Гроші',
  skirmishGoal: 'Мета: знищити штаб компʼютера. Обидві сторони починають рівно: штаб, харвестер і гроші.',
  duoGoal: 'Мета: знищити штаб суперника. Обидва починають рівно: штаб, харвестер і гроші.',
  playerName: (n: number) => `Гравець ${n}`,
  playerWins: (n: number) => `Переміг гравець ${n}!`,
  duoWinText: 'Штаб суперника знищено.',
  victory: 'Перемога',
  newSkirmish: 'Інша мапа',
  again: 'Ще раз',
  cheat: {
    reveal: 'Чит: уся мапа відкрита',
    money: 'Чит: +$1000',
    repair: 'Чит: відремонтовано',
    skip: 'Чит: місію пропущено',
  },
};

type Strings = typeof UK;

const EN: Strings = {
  names: {
    [ObjectType.PlayerHQ]: 'Headquarters',
    [ObjectType.Silo]: 'Silo',
    [ObjectType.TankFactory]: 'Tank factory',
    [ObjectType.EnemyHQ]: 'Enemy HQ',
    [ObjectType.ResourceField]: 'Crystal field',
    [ObjectType.Wall]: 'Wall',
    [ObjectType.Defender]: 'Defense tower',
    [ObjectType.EnemyTank]: 'Enemy tank',
    [ObjectType.LightTank]: 'Light tank',
    [ObjectType.MiddleTank]: 'Medium tank',
    [ObjectType.HeavyTank]: 'Heavy tank',
    [ObjectType.Harvester]: 'Harvester',
  },
  order: { idle: 'waiting', move: 'moving', attackMove: 'attack-moving', attack: 'attacking', harvest: 'harvesting', defend: 'guarding' },
  phase: { toField: 'going to the field', loading: 'loading', toSilo: 'returning to silo', unloading: 'unloading' },
  reason: {
    'no-money': 'Not enough money!',
    blocked: "Can't build here",
    busy: 'Busy: finish the current job first',
    invalid: "Can't do that",
  },
  difficulty: { classic: 'Classic', easy: 'Easy', normal: 'Normal', hard: 'Hard' },
  difficultyHint: {
    classic: 'The enemy of the 2004 original: it stays put and waits.',
    easy: 'The enemy harvests crystals and attacks now and then.',
    normal: 'The enemy builds a base, harvests, defends itself and attacks in waves.',
    hard: 'Fast and mean: hits your economy, focuses fire, big waves.',
  },
  pause: '⏸ Pause',
  resume: '▶ Resume',
  missions: 'Missions',
  saves: 'Saves',
  help: 'LMB: select (drag a box) · RMB: order · Cmd+1…9: group · H: HQ · S: stop · Space: pause · wheel: zoom · F: whole map · F5/F9: quick save',
  hint: 'Select a unit or a building. Right click gives orders.',
  squad: 'Squad',
  hp: 'Hit points',
  resource: 'Resource',
  cargo: 'cargo',
  building: 'building',
  producing: 'producing',
  constructing: 'building',
  cancelBuild: '✕ Cancel building',
  cancel: '✕ Cancel',
  destruct: 'Self-destruct',
  destructConfirm: 'Destroy this?',
  stop: '■ Stop',
  kicker: (map: number, mission: number) => `Map ${map} · mission ${mission}`,
  goal: "Goal: destroy the enemy headquarters. Don't lose yours.",
  difficultyLabel: 'Difficulty',
  languageLabel: 'Language',
  start: 'Start',
  won: 'Mission complete',
  lost: 'Defeat',
  wonText: 'The enemy headquarters is destroyed.',
  lostText: 'Your headquarters is destroyed.',
  retry: 'Retry',
  next: 'Next mission',
  campaignDone: 'Campaign complete! The enemy is routed.',
  close: 'Close',
  locked: 'Finish the earlier missions first',
  slot: (n: number) => `Slot ${n}`,
  quick: 'Quick',
  empty: 'empty',
  save: 'Save',
  load: 'Load',
  saved: 'Game saved',
  loaded: 'Game loaded',
  saveFailed: 'Could not save',
  noSave: 'No save there',
  skirmish: 'Skirmish',
  campaign: 'Campaign',
  helpDuo:
    'Player 1: mouse and keyboard (or a gamepad when there are two). Player 2: gamepad. Gamepad: left stick cursor · A select (hold: box) · B order · Y HQ/factory · ↑ whole army · ↓ stop · LB/RB pick a button · X press it · LT/RT zoom · right stick camera · Start pause',
  padHint: 'A: select · B: order · Y: HQ · ↑: army',
  opponent: { easy: 'Easy AI', normal: 'Normal AI', hard: 'Hard AI', human: 'Two players' },
  opponentHint: {
    easy: 'The computer builds slowly and keeps a small army.',
    normal: 'The computer builds a base, harvests and attacks in waves.',
    hard: 'A fast computer: several factories, big waves, hits your economy.',
    human: 'Two players at one Mac on a split screen. Player 1 uses the mouse, player 2 a gamepad.',
  },
  mapLabel: 'Map',
  opponentLabel: 'Opponent',
  moneyLabel: 'Money',
  skirmishGoal: "Goal: destroy the computer's HQ. Both sides start even: an HQ, a harvester and the same money.",
  duoGoal: "Goal: destroy the other player's HQ. Both start even: an HQ, a harvester and the same money.",
  playerName: (n: number) => `Player ${n}`,
  playerWins: (n: number) => `Player ${n} wins!`,
  duoWinText: "The other player's HQ is destroyed.",
  victory: 'Victory',
  newSkirmish: 'Another map',
  again: 'Play again',
  cheat: {
    reveal: 'Cheat: map revealed',
    money: 'Cheat: +$1000',
    repair: 'Cheat: repaired',
    skip: 'Cheat: mission skipped',
  },
};

const STRINGS: Record<Lang, Strings> = { uk: UK, en: EN };

let lang: Lang = 'uk';

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
}

export function getLang(): Lang {
  return lang;
}

/** The interface strings in the current language. */
export function t(): Strings {
  return STRINGS[lang];
}

export function mapName(mapIndex: number): string {
  return MAP_NAMES[lang][mapIndex] ?? '?';
}

export function missionTitle(mapIndex: number, missionIndex: number): string {
  return missionText(lang, mapIndex, missionIndex).title;
}

export function missionBrief(mapIndex: number, missionIndex: number): string {
  return missionText(lang, mapIndex, missionIndex).brief;
}

/** Short labels drawn on the grey boxes. */
export const SHORT: Record<number, string> = {
  [ObjectType.PlayerHQ]: 'HQ',
  [ObjectType.Silo]: 'S',
  [ObjectType.TankFactory]: 'F',
  [ObjectType.EnemyHQ]: 'HQ',
  [ObjectType.Defender]: 'D',
};
