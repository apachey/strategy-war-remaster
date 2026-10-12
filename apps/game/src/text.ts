import { ObjectType } from '@sw/data';

/** Interface strings. Mission briefings stay in the original English until the campaign phase translates them. */
export const NAMES: Record<number, string> = {
  [ObjectType.PlayerHQ]: 'Штаб',
  [ObjectType.Silo]: 'Сховище',
  [ObjectType.TankFactory]: 'Танковий завод',
  [ObjectType.EnemyHQ]: 'Ворожий штаб',
  [ObjectType.ResourceField]: 'Поле ресурсу',
  [ObjectType.Wall]: 'Стіна',
  [ObjectType.Defender]: 'Захисна вежа',
  [ObjectType.EnemyTank]: 'Ворожий танк',
  [ObjectType.LightTank]: 'Легкий танк',
  [ObjectType.MiddleTank]: 'Середній танк',
  [ObjectType.HeavyTank]: 'Важкий танк',
  [ObjectType.Harvester]: 'Харвестер',
};

/** Short labels drawn on the grey boxes. */
export const SHORT: Record<number, string> = {
  [ObjectType.PlayerHQ]: 'HQ',
  [ObjectType.Silo]: 'S',
  [ObjectType.TankFactory]: 'F',
  [ObjectType.EnemyHQ]: 'HQ',
  [ObjectType.Defender]: 'D',
};

export const ORDER_TEXT = {
  idle: 'чекає',
  move: 'їде',
  attack: 'атакує',
  harvest: 'збирає ресурс',
  defend: 'охороняє',
} as const;

export const PHASE_TEXT = {
  toField: 'їде на поле',
  loading: 'набирає ресурс',
  toSilo: 'везе до сховища',
  unloading: 'розвантажується',
} as const;

export const REASON_TEXT = {
  'no-money': 'Не вистачає грошей!',
  blocked: 'Тут будувати не можна',
  busy: 'Зайнято: спершу завершіть поточне',
  invalid: 'Так не можна',
} as const;
