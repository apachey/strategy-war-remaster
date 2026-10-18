import '../style.css';
import './studio.css';
import { Application, Container, Sprite } from 'pixi.js';
import { CELL, ObjectType, RACES, spriteName, TEAM_COLOR_GRID, TEAM_HUES, type Race, type TeamColor } from '@sw/data';
import type { Entity } from '@sw/sim';
import { CHARSET, glyph, loadFonts } from '../ui/font';
import { applySkin, skin, type ButtonState } from '../ui/skin';
import { CURSOR_KINDS, cursorCss, cursorImage, SCROLL_DIRS, type CursorKind } from '../ui/cursors';
import { flagHtml } from '../ui/flags';
import { Marks, markOptions, type SelectionStyle } from '../ui/marks';
import { battleScene, outcomeScene, portrait, type Dress, type PixelScene } from '../ui/scene3d';
import { face, type Speaker } from '../ui/faces';
import { groundPiece, loadArt, ART_PX_PER_CELL } from '../assets';
import { t } from '../text';

/**
 * Shardfall Studio: every interface piece of version 1.1 on one page, each with its switches, plus the other threads'
 * before/after material (gameplay pictures, sound samples). Built with `vite --config vite.studio.config.ts build`;
 * the sound and gameplay files are copied next to it into `v11/` when publishing, they are not in the repository.
 */

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

const state = {
  own: { race: 'human', color: 'white', color2: 'olive' } as Dress,
  foe: { race: 'hover', color: 'cyan', color2: 'white' } as Dress,
  k: 2,
  systemFont: false,
};

/** The game page next to the studio: `index.html` in dev, `game.html` once published (the host keeps index for itself). */
const GAME = import.meta.env.DEV ? 'index.html' : 'game.html';

const RACE_UA: Record<Race, string> = { human: 'Хюмани', hover: 'Ховери', walker: 'Ходуни' };
const COLORS: TeamColor[] = TEAM_HUES.flatMap((h) => [...TEAM_COLOR_GRID[h]]);
const KINDS = ['harvester', 'light_tank', 'middle_tank', 'heavy_tank', 'defender', 'hq', 'silo', 'factory', 'wall'];
const KIND_UA: Record<string, string> = {
  harvester: 'Комбайн', light_tank: 'Легкий', middle_tank: 'Середній', heavy_tank: 'Важкий', defender: 'Турель',
  hq: 'Штаб', silo: 'Сховище', factory: 'Завод', wall: 'Стіна',
};

/** A row of toggle buttons; `on` is called with the picked value. */
function toggles<V extends string>(name: string, values: readonly V[], current: V, label: (v: V) => string, on: (v: V) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'toggles';
  row.innerHTML = `<span>${name}</span>` + values.map((v) => `<button data-v="${v}" class="${v === current ? 'active' : ''}">${label(v)}</button>`).join('');
  row.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    $$('button', row).forEach((x) => x.classList.toggle('active', x === b));
    on(b.dataset.v as V);
  });
  return row;
}

function colorSelect(name: string, current: TeamColor, on: (c: TeamColor) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'toggles';
  row.innerHTML = `<span>${name}</span><select>${COLORS.map((c) => `<option value="${c}"${c === current ? ' selected' : ''}>${t().color[c]}</option>`).join('')}</select>`;
  $<HTMLSelectElement>('select', row).addEventListener('change', (ev) => on((ev.target as HTMLSelectElement).value as TeamColor));
  return row;
}

function section(id: string, title: string, note: string): HTMLElement {
  const s = document.createElement('section');
  s.id = id;
  s.className = 'frame';
  s.innerHTML = `<h2>${title}</h2><p class="note">${note}</p><div class="controls"></div><div class="body"></div>`;
  $('#studio').append(s);
  return s;
}

/**
 * The race and colours a section draws, as switches in that section's own controls: your side, and the other side
 * where the section shows both. They are shared by every tab.
 */
function dressBar(s: HTMLElement, foe: boolean): void {
  const bar = document.createElement('div');
  bar.className = 'dress';
  bar.append(
    toggles(foe ? 'Ви' : 'Раса', RACES, state.own.race, (r) => RACE_UA[r], (r) => ((state.own = { ...state.own, race: r }), dressChanged())),
    colorSelect('Колір', state.own.color, (c) => ((state.own = { ...state.own, color: c }), dressChanged())),
    colorSelect('Другий', state.own.color2, (c) => ((state.own = { ...state.own, color2: c }), dressChanged())),
  );
  if (foe)
    bar.append(
      toggles('Ворог', RACES, state.foe.race, (r) => RACE_UA[r], (r) => ((state.foe = { ...state.foe, race: r }), dressChanged())),
      colorSelect('Колір ворога', state.foe.color, (c) => ((state.foe = { ...state.foe, color: c }), dressChanged())),
    );
  $('.controls', s).prepend(bar);
}

/** Work to undo when the tab closes: WebGL contexts, live scenes, sounds. */
const leaving: Array<() => void> = [];
const onLeave = (f: () => void) => leaving.push(f);

const listeners: Array<() => void> = [];
const onDress = (f: () => void) => listeners.push(f);
function dressChanged(): void {
  applySkin(document.body, skin(state.own.race, state.own.color, state.own.color2));
  document.body.style.cursor = cursorCss(state.own.race, state.own.color, 'normal');
  for (const f of listeners) f();
}

// Sections ------------------------------------------------------------------------------------------------------------

function header(): void {
  const h = $('#top');
  h.append(
    toggles('Піксель шрифту', ['2', '3'], String(state.k), (v) => `×${v}`, (v) => {
      state.k = Number(v);
      document.documentElement.style.setProperty('--k', v);
    }),
    toggles('Шрифт', ['pixel', 'system'], 'pixel', (v) => (v === 'pixel' ? 'Shardfall' : 'Системний (до)'), (v) => {
      document.documentElement.classList.toggle('system-font', v === 'system');
    }),
  );
}

function game(): void {
  const s = section('game', 'Гра наживо', 'Справжня збірка гри з усім інтерфейсом 1.1. Раси й кольори тут передаються в скірміш. Клавіші: Q W E R T, A S D F G, X стоп.');
  dressBar(s, true);
  const frame = document.createElement('iframe');
  frame.className = 'game';
  const go = (v: string) => {
    const r = `${state.own.race},${state.foe.race}`;
    const c = `${state.own.color},${state.foe.color}`;
    const c2 = `${state.own.color2},${state.foe.color2}`;
    const dress = `&r=${r}&c=${c}&c2=${c2}`;
    const src: Record<string, string> = {
      menu: GAME,
      campaign: `${GAME}?m=1.1`,
      skirmish: `${GAME}?s=4&vs=normal${dress}`,
      duo: `${GAME}?s=4&vs=human${dress}`,
      won: `${GAME}?s=4&vs=normal${dress}#won`,
      lost: `${GAME}?s=4&vs=normal${dress}#lost`,
    };
    frame.src = src[v]!;
  };
  frame.addEventListener('load', () => {
    const outcome = frame.contentWindow?.location.hash.slice(1);
    if (outcome !== 'won' && outcome !== 'lost') return;
    // Finish the match a moment after it starts so the screen shows real numbers.
    const w = frame.contentWindow as unknown as { __sw?: { game: { world: { outcome: string } } } };
    const tryEnd = (n: number) => {
      if (w.__sw) w.__sw.game.world.outcome = outcome;
      else if (n) setTimeout(() => tryEnd(n - 1), 300);
    };
    setTimeout(() => tryEnd(20), 1500);
  });
  $('.controls', s).append(
    toggles('Екран', ['menu', 'campaign', 'skirmish', 'duo', 'won', 'lost'], 'menu', (v) => ({
      menu: 'Головне меню', campaign: 'Місія 1.1', skirmish: 'Скірміш', duo: 'Удвох', won: 'Перемога', lost: 'Поразка',
    })[v]!, go),
  );
  $('.body', s).append(frame);
  go('menu');
}

function font(): void {
  const s = section('font', 'Шрифт', 'Власний піксельний шрифт: латиниця, кирилиця з Ґ Є І Ї, значки. Знак $ малюється кристалом ◆. Текст нижче можна редагувати.');
  const sample = 'Шардфол: ґанок, їжак, йорж, щука. The quick brown fox jumps. ◆ 1500 ☠☠☠ ★ ✓ ✕ ⚔ ⚙ ▶ ⏸ ↑↓←→';
  $('.body', s).innerHTML = `
    <p class="sample" contenteditable spellcheck="false">${sample}</p>
    <p class="sample" contenteditable spellcheck="false"><b>${sample}</b></p>
    <p class="sample big" contenteditable spellcheck="false"><b>SHARDFALL · Ремастер · $3000</b></p>
    <div class="glyphs"></div>`;
  const box = $('.glyphs', s);
  const draw = (bold: boolean) => {
    box.innerHTML = '';
    for (const ch of CHARSET) {
      const g = glyph(ch, bold);
      if (!g) continue;
      const c = document.createElement('canvas');
      c.width = g.width + 2;
      c.height = 12;
      c.title = ch;
      const x = c.getContext('2d')!;
      x.fillStyle = '#efe3c2';
      g.rows.forEach((row, y) => [...row].forEach((p, i) => p === '#' && x.fillRect(i + 1, 10 - g.top + y, 1, 1)));
      box.append(c);
    }
  };
  $('.controls', s).append(toggles('Карта гліфів', ['regular', 'bold'], 'regular', (v) => (v === 'bold' ? 'Жирний' : 'Звичайний'), (v) => draw(v === 'bold')));
  draw(false);
}

function skins(): void {
  const s = section('skins', 'Рамки й кнопки рас', 'Хюмани: клепані сталеві плити. Ховери: скошене скло зі світінням. Ходуни: жива мембрана з шипами. Колір рамки береться з командного кольору, мітки з другого.');
  const states: ButtonState[] = ['normal', 'hover', 'down', 'on', 'primary', 'disabled'];
  dressBar(s, false);
  const UA: Record<ButtonState, string> = { normal: 'Звичайна', hover: 'Наведення', down: 'Натиснута', on: 'Вибрана', primary: 'Головна', disabled: 'Вимкнена' };
  const draw = () => {
    const body = $('.body', s);
    body.innerHTML = RACES.map((r) => `<div class="frame demo" data-race-demo="${r}">
        <b class="title">${RACE_UA[r]}</b><p>Міцність 300/300 · їде · ◆ 1500</p>
        <div class="buttons"><button>Звичайна</button><button class="active">Вибрана</button><button class="primary">Почати</button><button disabled>Вимкнена</button>
        <button class="build"><kbd>Q</kbd>Багі<br>$100</button></div>
        <div class="states">${states.map((st) => `<figure><img data-state="${st}"><figcaption>${UA[st]}</figcaption></figure>`).join('')}</div></div>`).join('');
    for (const r of RACES) {
      const el = $(`[data-race-demo="${r}"]`, body);
      const sk = skin(r, state.own.color, state.own.color2);
      applySkin(el, sk);
      $$<HTMLImageElement>('img[data-state]', el).forEach((img) => (img.src = sk.buttons[img.dataset.state as ButtonState]));
    }
  };
  onDress(draw);
  draw();
}

function levels(): void {
  const s = section('levels', 'Складність і суперник', 'Черепи замість слів: класика ★, легко ☠, нормально ☠☠, важко ☠☠☠, удвох ⚔.');
  dressBar(s, false);
  const draw = () => {
    const T = t();
    $('.body', s).innerHTML = `<div class="buttons">${(['classic', 'easy', 'normal', 'hard'] as const)
      .map((d, i) => `<button class="level${i === 2 ? ' active' : ''}"><span class="icons">${['★', '☠', '☠☠', '☠☠☠'][i]}</span>${T.difficulty[d]}</button>`)
      .join('')}<button class="level"><span class="icons">⚔</span>${T.opponent.human}</button></div>`;
  };
  onDress(draw);
  draw();
}

function cursors(): void {
  const s = section('cursors', 'Курсори', 'Наведіть мишу на плитку, щоб спробувати курсор наживо. Гра сама вибирає: свій юніт → вибір, ворог → атака, кристали → збір, ліс чи край мапи → не можна, край екрана → стрілка прокрутки.');
  dressBar(s, false);
  const UA: Record<CursorKind, string> = { normal: 'Звичайний', select: 'Вибір', move: 'Рух', attack: 'Атака', harvest: 'Збір', forbidden: 'Не можна', scroll: 'Прокрутка' };
  const draw = () => {
    const { race, color } = state.own;
    const tile = (kind: CursorKind, dir: (typeof SCROLL_DIRS)[number] = 'n', label = UA[kind]) =>
      `<figure class="try" style="cursor: ${cursorCss(race, color, kind, dir)}"><img class="cur" src="${cursorImage(race, color, kind, dir)}"><figcaption>${label}</figcaption></figure>`;
    $('.body', s).innerHTML = `<div class="tiles">${CURSOR_KINDS.filter((k) => k !== 'scroll').map((k) => tile(k)).join('')}</div>
      <div class="tiles">${SCROLL_DIRS.map((d) => tile('scroll', d, d.toUpperCase())).join('')}</div>`;
  };
  onDress(draw);
  draw();
}

function flags(): void {
  const s = section('flags', 'Прапорці мов', 'Піксельні прапорці майорять на кнопках мови: 6 кадрів, кожен стовпчик тканини на хвилі.');
  $('.body', s).innerHTML = `<div class="buttons"><button data-lang="uk" class="active" title="Українська">${flagHtml('uk')}</button><button data-lang="en" title="English">${flagHtml('en')}</button></div>
    <div class="flags-big">${flagHtml('uk')}${flagHtml('en')}</div>`;
  $('.controls', s).append(toggles('Вітер', ['0', '0.9', '0.45'], '0.9', (v) => ({ '0': 'Штиль', '0.9': 'Звичайний', '0.45': 'Сильний' })[v]!, (v) => {
    document.documentElement.style.setProperty('--wave', v === '0' ? 'paused' : 'running');
    document.documentElement.style.setProperty('--wave-time', `${v === '0' ? 0.9 : v}s`);
  }));
}

async function marks(): Promise<void> {
  const s = section('marks', 'Виділення й смужки', 'Рамка виділення по сітці спрайтів з темним контуром, як у самих спрайтів, або еліпс на землі. Сегментна смужка міцності зеленіє, жовтіє, червоніє; під нею тонка смужка будівництва, виробництва чи вантажу. Пунктир показує дальність зброї свого юніта.');
  dressBar(s, true);
  const app = new Application();
  await app.init({ width: 8 * CELL, height: 5 * CELL, background: 0x14110c, antialias: false, resolution: 1 });
  onLeave(() => app.destroy(true, { children: true }));
  // Recolouring the atlas is heavy: once per pair of colours.
  const arts = new Map<string, ReturnType<typeof loadArt>>();
  const artFor = (key: string, make: () => ReturnType<typeof loadArt>) => arts.get(key) ?? (arts.set(key, make()), arts.get(key)!);
  app.canvas.className = 'marks';
  $('.body', s).append(app.canvas);
  const zoom = { v: 4 };
  const hp = { v: 0.7 };
  const ART = CELL / ART_PX_PER_CELL;
  const world = new Container();
  app.stage.addChild(world);
  const fake = (type: number, team: string, x: number, y: number, size: number, extra: Partial<Entity> = {}) =>
    ({ id: 1, type, team, x, y, size, hp: 100, maxHp: 100, dir: 3, complete: true, buildElapsedMs: 0, buildTotalMs: 0, job: null, cargo: 0, ...extra }) as unknown as Entity;
  const draw = async () => {
    const key = [state.own.color, state.own.color2, state.foe.color, state.foe.color2].join();
    const art = await artFor(key, () => loadArt([[state.own.color, state.own.color2], [state.foe.color, state.foe.color2]]));
    if (app.renderer === null) return;
    world.removeChildren();
    app.renderer.resize(8 * CELL * zoom.v, 5 * CELL * zoom.v);
    world.scale.set(zoom.v);
    for (let cy = 0; cy < 5; cy++)
      for (let cx = 0; cx < 8; cx++) {
        const g = new Sprite(groundPiece(art.terrain, 'sand', cx, cy));
        g.scale.set(ART);
        g.position.set(cx * CELL, cy * CELL);
        world.addChild(g);
      }
    const things = [
      fake(ObjectType.LightTank, 'player', CELL * 1, CELL * 3.2, CELL, { hp: hp.v * 100 }),
      fake(ObjectType.Harvester, 'player', CELL * 0.6, CELL * 1.2, CELL, { cargo: 30, hp: 100 }),
      fake(ObjectType.TankFactory, 'player', CELL * 3, CELL * 1.4, CELL * 2, { hp: Math.max(5, hp.v * 100), job: { kind: 'produce', unit: ObjectType.LightTank, elapsedMs: 600, totalMs: 1000, price: 100 } } as Partial<Entity>),
      fake(ObjectType.HeavyTank, 'enemy', CELL * 6, CELL * 3, CELL, { hp: 25 }),
    ];
    const m = new Marks();
    world.addChild(m.under);
    for (const e of things) {
      const dress = e.team === 'player' ? state.own : state.foe;
      const sheet = art.sheet(dress.color, dress.color2);
      const base = spriteName(dress.race, e.type);
      const tex = sheet.textures[`${base}/idle/s`] ?? sheet.textures[`${base}/move0/se`] ?? sheet.textures[`${base}/idle`];
      if (!tex) continue;
      const sp = new Sprite(tex);
      sp.scale.set(ART);
      sp.position.set(e.x + e.size / 2, e.y + e.size / 2);
      world.addChild(sp);
    }
    world.addChild(m.over);
    for (const e of things) {
      m.selection(e, e.x, e.y, 'player');
      m.bars(e, e.x, e.y);
    }
  };
  onDress(() => void draw());
  const slider = document.createElement('label');
  slider.className = 'toggles';
  slider.innerHTML = '<span>Міцність легкого</span><input type="range" min="0.05" max="1" step="0.05" value="0.7">';
  $('input', slider).addEventListener('input', (ev) => ((hp.v = Number((ev.target as HTMLInputElement).value)), void draw()));
  $('.controls', s).append(
    toggles<SelectionStyle>('Виділення', ['corners', 'ellipse'], 'corners', (v) => (v === 'corners' ? 'Кутики' : 'Еліпс'), (v) => ((markOptions.selection = v), void draw())),
    toggles('Зум', ['2', '4', '6'], '4', (v) => `×${v}`, (v) => ((zoom.v = Number(v)), void draw())),
    slider,
  );
  await draw();
}

function portraits(): void {
  const s = section('portraits', 'Портрети', 'Обличчя на панелі вибору, як у StarCraft: кожен юніт показує свого пілота, кожна будівля радника бази. Хюмани: колоністи в шоломах, база говорить через робота-адʼютанта. Ходуни: рій із хітиновими пілотами, над базою володар. Ховери: машини без екіпажу, кожним корпусом керує власне ядро-дрон, база одна ЕОМ з оком на екрані. Нижче моделі, з яких рендеряться кнопки будівництва.');
  dressBar(s, true);
  const size = { v: 64 };
  const WHO: Record<Speaker, string> = { harvester: 'Комбайн', light_tank: 'Легкий', middle_tank: 'Середній', heavy_tank: 'Важкий', advisor: 'Радник бази' };
  const draw = () => {
    const people = (d: Dress) =>
      `<div class="tiles faces">${(Object.keys(WHO) as Speaker[]).map((w) => `<figure><img class="portrait" src="${face(d, w, size.v)}"><figcaption>${WHO[w]}</figcaption></figure>`).join('')}</div>`;
    const models = (d: Dress) =>
      `<div class="tiles">${KINDS.map((k) => `<figure><img class="portrait small" src="${portrait(d, k, size.v)}"><figcaption>${KIND_UA[k]}</figcaption></figure>`).join('')}</div>`;
    $('.body', s).innerHTML = `<h3>Персонажі: ${RACE_UA[state.own.race]}</h3>${people(state.own)}<h3>Персонажі: ${RACE_UA[state.foe.race]}</h3>${people(state.foe)}
      <h3>Моделі</h3>${models(state.own)}${models(state.foe)}`;
  };
  $('.controls', s).append(toggles('Роздільність', ['32', '48', '64'], '64', (v) => `${v} px`, (v) => ((size.v = Number(v)), draw())));
  onDress(draw);
  draw();
}

function scenes(): void {
  const s = section('scenes', 'Сцени перемоги, поразки й меню', 'Живий низькополігональний 3D у низькій роздільності, з землею мапи. Перемога: ваша армія стоїть перед палаючим штабом ворога. Поразка: ваш штаб у руїнах, довкола ворожі танки. Меню: бій двох рас. Ялинки виходять за обрій, у лісі земля оливкова.');
  dressBar(s, true);
  const opts = { scene: 'won', ground: 'sand' as 'sand' | 'plates' | 'forest', forest: true, res: 480 };
  let live: PixelScene | null = null;
  onLeave(() => live?.dispose());
  const canvas = document.createElement('canvas');
  canvas.className = 'scene';
  $('.body', s).append(canvas);
  const draw = async () => {
    live?.dispose();
    const fresh = document.createElement('canvas');
    fresh.className = 'scene';
    $('.body', s).replaceChildren(fresh);
    const w = opts.res;
    const h = Math.round((w * 9) / 16);
    live =
      opts.scene === 'menu'
        ? await battleScene(fresh, state.own, state.foe, w, h)
        : await outcomeScene(fresh, { won: opts.scene === 'won', own: state.own, foe: state.foe, ground: opts.ground, forest: opts.forest }, w, h);
    live.start();
  };
  $('.controls', s).append(
    toggles('Сцена', ['won', 'lost', 'menu'], 'won', (v) => ({ won: 'Перемога', lost: 'Поразка', menu: 'Меню' })[v]!, (v) => ((opts.scene = v), void draw())),
    toggles('Земля', ['sand', 'plates', 'forest'], 'sand', (v) => ({ sand: 'Пісок', plates: 'Плити', forest: 'Ліс' })[v]!, (v) => ((opts.ground = v), void draw())),
    toggles('Ялинки', ['on', 'off'], 'on', (v) => (v === 'on' ? 'Є' : 'Немає'), (v) => ((opts.forest = v === 'on'), void draw())),
    toggles('Роздільність', ['320', '480', '640'], '480', (v) => `${v}×${Math.round((Number(v) * 9) / 16)}`, (v) => ((opts.res = Number(v)), void draw())),
  );
  onDress(() => void draw());
  void draw();
}

function sound(): void {
  const s = section('sound', 'Звук 1.1', 'Матеріал треду «Звук 1.1»: голоси юнітів для кожної раси (по 3 варіанти, щоразу випадковий), петлі збору, фон мапи й нові треки.');
  const units = ['harvester', 'light', 'middle', 'heavy'];
  const UNIT: Record<string, string> = { harvester: 'Комбайн', light: 'Легкий', middle: 'Середній', heavy: 'Важкий' };
  const ACT: Record<string, string> = { ready: 'Готовий', move: 'Їду', attack: 'Атакую', harvest: 'Збираю' };
  const voice = (race: Race, u: string, a: string) => `v11/sound/sfx/voice_${race}_${u}_${a}_${Math.floor(Math.random() * 3)}.wav`;
  let playing: HTMLAudioElement | null = null;
  const play = (src: string, loop = false) => {
    playing?.pause();
    playing = new Audio(src);
    onLeave(() => playing?.pause());
    playing.loop = loop;
    void playing.play();
  };
  const body = $('.body', s);
  body.innerHTML = `
    <h3>Голоси</h3>
    <div class="voices">${RACES.map((r) => `<div class="frame demo" data-race-demo="${r}"><b class="title">${RACE_UA[r]}</b>${units
      .map((u) => `<div class="row"><span>${UNIT[u]}</span>${(u === 'harvester' ? ['ready', 'move', 'harvest'] : ['ready', 'move', 'attack'])
        .map((a) => `<button data-voice="${r}/${u}/${a}">▶ ${ACT[a]}</button>`).join('')}</div>`).join('')}</div>`).join('')}</div>
    <h3>Петлі</h3>
    <div class="buttons">${['harvest_human', 'harvest_hover', 'harvest_walker', 'amb_wind', 'amb_forest', 'amb_crystals', 'amb_base', 'amb_factory']
      .map((n) => `<button data-loop="${n}">▶ ${({ harvest_human: 'Збір: бур', harvest_hover: 'Збір: всмоктування', harvest_walker: 'Збір: щелепи', amb_wind: 'Вітер', amb_forest: 'Ліс', amb_crystals: 'Кристали', amb_base: 'База', amb_factory: 'Завод' } as Record<string, string>)[n]}</button>`)
      .join('')}<button data-stop>■ Стоп</button></div>
    <h3>Музика</h3>
    <div class="music">${['tension-2', 'tension-3', 'battle-2', 'battle-3', 'victory', 'defeat']
      .map((n) => `<figure><figcaption>${n}</figcaption><audio controls preload="none" src="v11/sound/music/${n}.m4a"></audio></figure>`).join('')}</div>`;
  for (const r of RACES) applySkin($(`[data-race-demo="${r}"]`, body), skin(r, state.own.color, state.own.color2));
  body.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.voice) {
      const [r, u, a] = b.dataset.voice.split('/') as [Race, string, string];
      play(voice(r, u, a));
    } else if (b.dataset.loop) play(`v11/sound/sfx/${b.dataset.loop}.wav`, true);
    else if ('stop' in b.dataset) playing?.pause();
  });
}

function gameplay(): void {
  const s = section('gameplay', 'Геймплей 1.1: до і після', 'Матеріал треду «Геймплей 1.1». Місія 1.1 на старті: огляд 4 клітинки замість 2, ворота заросли лісом, до ворога лише крізь його стіну. Потягніть повзунок.');
  $('.body', s).innerHTML = `${compare('v11/gameplay/mission-1-1-before.png', 'v11/gameplay/mission-1-1-after.png')}
    <figure class="shot"><img src="v11/gameplay/factory-queue-after.png" alt=""><figcaption>Черга заводу: два «Багі» чекають, гроші списано лише за перший; праворуч точка збору. Правий клік по іконці в черзі скасовує її.</figcaption></figure>
    <ul class="changes">
      <li>Дальність на клітинку менша: легкий 2, середній і важкий 3, турель 4.</li>
      <li>Снаряди летять з упередженням у рухому ціль; крізь ліс ніхто не стріляє.</li>
      <li>Танк без наказу сам їде до ворога в межах 6 клітинок і повертається.</li>
      <li>Атака в русі (Option + ПКМ) і маршрут з кількох точок (Shift + ПКМ).</li>
      <li>Коли б’ють базу чи комбайн: червона мітка на мінікарті, Пробіл переносить туди камеру.</li>
      <li>Комп’ютер шле вільні танки на того, хто б’є його будівлі.</li>
    </ul>`;
  wireCompare(s);
}

/** A before/after picture with a slider that moves the cut between them. */
function compare(before: string, after: string): string {
  return `<div class="compare" style="--cut: 50%">
      <img src="${after}" alt="Після">
      <img class="before" src="${before}" alt="До">
      <i class="cut"></i><b class="tag l">До</b><b class="tag r">Після</b>
      <input type="range" min="0" max="100" value="50" aria-label="До / після">
    </div>`;
}

function wireCompare(root: HTMLElement): void {
  for (const box of $$('.compare', root))
    $('input', box).addEventListener('input', (ev) => box.style.setProperty('--cut', `${(ev.target as HTMLInputElement).value}%`));
}

function graphics(): void {
  const s = section('graphics', 'Графіка мапи 1.1: до і після', 'Матеріал треду «Графіка мапи 1.1». Нові кольори кампанії (оливкові хюмани з бірюзою, червоні ховери з білим), бахрома лісу, декор піску, туман війни з дизерингом, безшовні стіни, башти, що ціляться окремо від корпусу, ефекти пострілів і пожеж.');
  const shot = (f: string, text: string) => `<figure class="shot"><img src="v11/graphics/${f}" alt=""><figcaption>${text}</figcaption></figure>`;
  $('.body', s).innerHTML = `<h3>Місія 1.1</h3>${compare('v11/graphics/before-1-1.png', 'v11/graphics/after-1-1.png')}
    <h3>Місія 6.2</h3>${compare('v11/graphics/before-6-2.png', 'v11/graphics/after-6-2.png')}
    ${shot('battle.png', 'Бій: башти ціляться, влучання, сліди гусениць.')}
    ${shot('fog-1-1.png', 'Туман війни вчетверо дрібніший, з дизерингом; розвідана земля поза оглядом напівтемна й ховає ворожі юніти.')}
    ${shot('turrets.png', 'Танки й турелі трьох рас: корпус і окрема башта.')}
    ${shot('walls.png', 'Безшовні стіни трьох рас з діагональними стиками, 47 форм.')}
    ${shot('fx.png', 'Атлас ефектів: вибухи, дим, пил, влучання кожної раси, вогонь, кіптява, сліди, відблиски.')}
    ${shot('burning-hq.png', 'Пошкоджена будівля: дим нижче 50% міцності, вогонь нижче 25%.')}
    <p class="note">У живій грі ще видно: анімацію комбайна, хитання ялинок, відблиски кристалів, піщаний вітер, плавний зум.</p>`;
  wireCompare(s);
}

/** One tab per part of the interface; only the open one is built, so the page never holds more than one 3D view. */
const TABS: Array<[id: string, title: string, build: () => void | Promise<void>]> = [
  ['game', 'Гра наживо', game],
  ['font', 'Шрифт', font],
  ['skins', 'Рамки й кнопки', skins],
  ['levels', 'Складність', levels],
  ['cursors', 'Курсори', cursors],
  ['flags', 'Прапорці', flags],
  ['marks', 'Виділення й смужки', marks],
  ['portraits', 'Портрети', portraits],
  ['scenes', 'Сцени', scenes],
  ['sound', 'Звук 1.1', sound],
  ['gameplay', 'Геймплей 1.1', gameplay],
  ['graphics', 'Графіка мапи 1.1', graphics],
];

async function openTab(id: string): Promise<void> {
  for (const f of leaving.splice(0)) f();
  listeners.length = 0;
  $('#studio').replaceChildren();
  const tab = TABS.find(([t]) => t === id) ?? TABS[0]!;
  $$('#toc a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab[0]));
  history.replaceState(null, '', `#${tab[0]}`);
  document.body.dataset.ready = 'false';
  await tab[2]();
  document.body.dataset.ready = 'true';
}

async function main(): Promise<void> {
  await loadFonts();
  document.documentElement.style.setProperty('--k', String(state.k));
  header();
  $('#toc').innerHTML = TABS.map(([id, title]) => `<a href="#${id}" data-tab="${id}">${title}</a>`).join('');
  $('#toc').addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>('a[data-tab]');
    if (!a) return;
    ev.preventDefault();
    void openTab(a.dataset.tab!);
  });
  applySkin(document.body, skin(state.own.race, state.own.color, state.own.color2));
  await openTab(location.hash.slice(1));
}
void main();
