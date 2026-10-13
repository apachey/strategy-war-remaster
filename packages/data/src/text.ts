/**
 * Campaign text in Ukrainian and English. The English follows the original briefings with the grammar fixed;
 * the enemy is called "aliens" here and there to match the remaster's art. Mission 6.3 had no briefing in the
 * original, so its text is new.
 */

export type Lang = 'uk' | 'en';
export const LANGS: readonly Lang[] = ['uk', 'en'];

export interface MissionText {
  title: string;
  brief: string;
}

export const MAP_NAMES: Record<Lang, readonly string[]> = {
  uk: ['Початок', 'Пошук бази', 'Окраїни', 'Арена', 'Відкрите поле', 'Шукач', 'Розгром'],
  en: ['Beginning', 'Base finder', 'Edges', 'Arena', 'Open field', 'Finder', 'Totaller'],
};

/** Keyed "map.mission", 1-based like the original menus. */
export const MISSION_TEXT: Record<Lang, Record<string, MissionText>> = {
  uk: {
    '1.1': {
      title: 'Перші кроки',
      brief:
        'Ласкаво просимо до Strategy War. Спробуй щось збудувати, покатайся мапою й зруйнуй кілька ворожих будівель: ворожих танків тут немає. Мета: знищити ворожий штаб.',
    },
    '1.2': { title: 'Жнива', brief: 'Збудуй сховище, почни збирати жовті кристали, випусти кілька танків і розбий ворога!' },
    '1.3': { title: 'Атака', brief: 'Обережно: ворог уже назбирав чимало кристалів!' },
    '1.4': { title: 'Прорив', brief: 'Увага, машини чужинців усюди! Знищ їхній останній опорний пункт, і ми змінимо позицію.' },
    '2.1': { title: 'Знайди їх', brief: 'Тепер навчися знаходити ворожу базу серед густого лісу. І знищ її.' },
    '2.2': { title: 'Спробуй дістань', brief: 'Ворожі сили вже близько. Будуй якнайшвидше!' },
    '2.3': { title: 'Битва', brief: 'Вирішальна битва за цей край буде нелегкою.' },
    '3.1': { title: 'Пошук', brief: 'Подивімося, куди рушати далі.' },
    '3.2': { title: 'Операція X', brief: 'І що тепер? Тікати?' },
    '3.3': { title: 'Шукач', brief: 'Ворог: «Готуйся до розгрому! Тобі ніде сховатися!»' },
    '4.1': { title: 'Центр', brief: 'Ласкаво просимо на арену. Подивимося, як ти бʼєшся!' },
    '4.2': {
      title: 'Переправа',
      brief: 'Довелося змінити позицію. Стережись: ворог кинув усе, що має. Побачимо, чи вміє він цим скористатися.',
    },
    '5.1': { title: 'Відкритий бій', brief: 'Тепер подивимося, як ти впораєшся у відкритому полі.' },
    '5.2': { title: 'Ще одна війна', brief: 'Цього разу ворожі машини підійшли зовсім близько. Знищ їх!' },
    '5.3': { title: 'Зможеш?', brief: 'Командир: «Зможеш усе збудувати сам? Побачимо. Будуй швидко!»' },
    '6.1': { title: 'Нова земля', brief: 'Ти ввійшов на нову ворожу територію. Будь пильним: ворог викликав підкріплення.' },
    '6.2': { title: 'Перевантаження', brief: 'Чужинці кинули найсильніші машини й готові тебе знищити. Вдар першим!' },
    '6.3': {
      title: 'Вистежи їх',
      brief: 'Їхня база ховається десь за лісом. Розвідай, знайди її і знищ, поки не підійшло підкріплення.',
    },
    '7.1': { title: 'Облога', brief: 'Ворожі машини сходяться з усіх боків. Зміцни стіни й випусти більше танків.' },
    '7.2': { title: 'Останній бій', brief: 'Чужинці кинули в бій останні сили. Довго вони не протримаються, добий їх!' },
    '7.3': { title: 'А тепер куди?', brief: 'Ворог: «Думав, то був останній бій? Ти помилився...»' },
  },
  en: {
    '1.1': {
      title: 'Beginning',
      brief:
        'Welcome to Strategy War. Try building something, drive around and destroy a few enemy buildings: no enemy tanks will bother you here. Your goal is to destroy the enemy headquarters.',
    },
    '1.2': { title: 'Harvest', brief: 'Build a silo, start harvesting the yellow crystals, build some tanks and shoot the enemy down!' },
    '1.3': { title: 'Attack', brief: 'Be careful: the enemy has gathered a lot of crystal by now!' },
    '1.4': { title: 'Escape', brief: 'Warning, alien units everywhere! Destroy their last stronghold here and we will change position.' },
    '2.1': { title: 'Find it', brief: 'Now you will learn to find the enemy base in heavy terrain and destroy it.' },
    '2.2': { title: 'Get me', brief: 'The enemy forces are gaining on us. Build as fast as you can!' },
    '2.3': { title: 'Battle', brief: "The final battle for this area won't be easy." },
    '3.1': { title: 'Search', brief: "Now let's see which way to go." },
    '3.2': { title: 'Operation X', brief: 'What do we do now? Escape?' },
    '3.3': { title: 'Finder', brief: 'Enemy: "Prepare to be smashed! You have no cover!"' },
    '4.1': { title: 'Middle', brief: "Welcome to the arena. Let's see how you fight!" },
    '4.2': {
      title: 'Crossing',
      brief: "We had to change position. Beware: the enemy has sent everything they've got. Let's see if they know how to use it this time.",
    },
    '5.1': { title: 'Open battle', brief: "Now let's see how you do on an open battlefield." },
    '5.2': { title: 'Another war', brief: 'Enemy units have come very close this time. Destroy them!' },
    '5.3': { title: 'Can you?', brief: 'Commander: "Can you build everything yourself? Let\'s see. Build fast!"' },
    '6.1': { title: 'New map', brief: 'You have entered new enemy territory. Beware: the enemy has called for reinforcements.' },
    '6.2': {
      title: 'Overload',
      brief: 'The aliens have sent their strongest units and are ready to wipe you out. Strike before they strike you!',
    },
    '6.3': {
      title: 'Seek them',
      brief: 'Their base is hidden somewhere beyond the forest. Scout ahead, find it and destroy it before their reinforcements arrive.',
    },
    '7.1': { title: 'Holdup', brief: 'Enemy units are closing in from all sides. Make your walls stronger and build more tanks.' },
    '7.2': { title: 'The last', brief: "The aliens have called up every last force they have. They can't hold out much longer: finish them!" },
    '7.3': { title: 'Now where?', brief: 'Enemy: "Did you think that was the last? Well, you were mistaken..."' },
  },
};

export function missionText(lang: Lang, mapIndex: number, missionIndex: number): MissionText {
  return MISSION_TEXT[lang][`${mapIndex + 1}.${missionIndex + 1}`] ?? { title: '?', brief: '' };
}
