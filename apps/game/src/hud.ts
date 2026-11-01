import { campaign, LANGS, ObjectType, RACES, spriteName, TEAM_COLOR_GRID, TEAM_COLORS, TEAM_HUES, type Lang, type Race, type TeamColor } from '@sw/data';
import {
  BUILDING_RULES,
  buildBlockedGrid,
  DIFFICULTIES,
  FACTORY_BUILDS,
  HQ_BUILDS,
  isUnit,
  OPPONENTS,
  raceOf,
  SKIRMISH_MONEY,
  skirmishLayout,
  TICKS_PER_SECOND,
  productionLine,
  QUEUE_MAX,
  UNIT_RULES,
  type BuildingType,
  type Difficulty,
  type Entity,
  type Opponent,
  type SideState,
  type Team,
  type UnitType,
} from '@sw/sim';
import { hqType, nextMission, type Commander, type Game, type Setup } from './game';
import { completed, markCompleted, readSave, SLOTS, type Slot } from './storage';
import { logoHtml } from './ui/logo';
import { flagHtml } from './ui/flags';
import type { Dress, PixelScene } from './ui/scene3d';
import { applySkin, skin } from './ui/skin';
import { getLang, mapName, missionBrief, missionTitle, objectName, siteName, t } from './text';

const LANG_NAMES: Record<Lang, string> = { uk: 'Українська', en: 'English' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The 3D models (three.js) load on their own, after the game is up: portraits appear once they are in. */
let scene3d: typeof import('./ui/scene3d') | null = null;
let faces: typeof import('./ui/faces') | null = null;
const scene3dReady = Promise.all([import('./ui/scene3d'), import('./ui/faces')]).then(([m, f]) => ((faces = f), (scene3d = m)));

const dress = (s: SideState): Dress => ({ race: s.race, color: s.color, color2: s.color2 });

type SkirmishSetup = Extract<Setup, { kind: 'skirmish' }>;

/** A portrait of an object type as a side would build it, `size` art pixels; empty until the models have loaded. */
function portraitOf(s: SideState, type: ObjectType, size = 64): string {
  return portraitFor(dress(s), type, size);
}

function portraitFor(d: Dress, type: ObjectType, size = 64): string {
  if (!scene3d) return '';
  return scene3d.portrait(d, kindOf(d, type), size);
}

/** The kind name of an object type in the art catalog: light_tank, hq, … */
function kindOf(d: Dress, type: ObjectType): string {
  const name = spriteName(d.race, type === ObjectType.EnemyTank ? ObjectType.MiddleTank : type);
  return name.startsWith(`${d.race}_`) ? name.slice(d.race.length + 1) : name;
}

/** Who speaks for an object on the selection panel: its pilot, or the base's advisor; a crystal field shows itself. */
function speakerOf(s: SideState, type: ObjectType): string {
  const d = dress(s);
  const who = faces?.speakerOf(kindOf(d, type));
  if (who) return faces!.faceHtml(d, who);
  return img(portraitFor(d, type, 64), 'portrait');
}

const img = (src: string, cls = '') => (src ? `<img${cls ? ` class="${cls}"` : ''} src="${src}" alt="">` : '');

/** Skull counts on the difficulty and opponent buttons; the original's own pace gets a star. */
const DIFFICULTY_ICONS: Record<Difficulty, string> = { classic: '★', easy: '☠', normal: '☠☠', hard: '☠☠☠' };
const OPPONENT_ICONS: Record<Opponent, string> = { easy: '☠', normal: '☠☠', hard: '☠☠☠', human: '⚔' };

/** Is this the desktop app (Tauri), where the main menu can quit? */
const inApp = () => '__TAURI_INTERNALS__' in window;

/** Closes the desktop app's window, which quits it (the window permission is in apps/desktop's capabilities). */
function quitApp(): void {
  const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke(cmd: string, args?: unknown): Promise<unknown> } }).__TAURI_INTERNALS__;
  if (!tauri) return window.close();
  void tauri.invoke('plugin:window|destroy', { label: 'main' }).catch(() => tauri.invoke('plugin:window|close', { label: 'main' })).catch(() => window.close());
}

export interface HudActions {
  /** Opens another setup (a mission or a skirmish); `load` continues a save. */
  open(setup: Setup, load?: Slot, start?: boolean): void;
  restart(): void;
  save(slot: Slot): void;
  load(slot: Slot): void;
  setLang(lang: Lang): void;
  setDifficulty(difficulty: Difficulty): void;
  /** The skirmish the "Skirmish" button opens: the last one played. */
  lastSkirmish(): SkirmishSetup;
  /** Music and effects volume, 0..1. */
  volumes(): { music: number; sfx: number };
  setVolumes(music: number, sfx: number): void;
  /** Back to the main screen. */
  toMenu(): void;
}

/** The game's version, from apps/desktop/package.json. */
declare const __APP_VERSION__: string;

/** DOM interface over the canvas: top bar, one panel per player, toasts and dialogs. */
export class Hud {
  private shownOutcome = false;
  private scene: PixelScene | null = null;
  readonly panels: PlayerPanel[];
  /** The skirmish screen's choices before Start loads them. */
  private draft: SkirmishSetup | null = null;

  constructor(
    private readonly game: Game,
    private readonly actions: HudActions,
    /** Opened on the main screen rather than a mission or skirmish. */
    private readonly menu = false,
    /** Straight into the match: Start on the skirmish screen loaded it. */
    startNow = false,
  ) {
    document.body.classList.toggle('duo', game.twoPlayers);
    document.body.classList.toggle('menu', menu);
    // The interface wears player 1's race and colours; in a split screen each panel wears its own player's.
    const p1 = game.world.sides[game.commanders[0]!.side];
    applySkin(document.body, skin(p1.race, p1.color, p1.color2));
    // Panel titles and money badges in the sides' team colours, a light step so they read on the dark panels.
    document.body.style.setProperty('--player', TEAM_COLORS[game.world.sides.player.color][3]);
    document.body.style.setProperty('--enemy', TEAM_COLORS[game.world.sides.enemy.color][3]);
    this.panels = game.commanders.map((c) => new PlayerPanel(c, game.twoPlayers));
    this.applyLang();
    if (game.loaded || startNow) game.started = true;
    else this.showBriefing();
    void scene3dReady.then(() => {
      for (const p of this.panels) p.refresh();
    });
  }

  /** Fills the static page text in the current language. */
  applyLang(): void {
    $('paused').textContent = t().paused;
    for (const p of this.panels) p.refresh();
  }

  togglePause(): void {
    if (!this.game.started || this.game.world.outcome !== 'playing') return;
    this.game.paused = !this.game.paused;
  }

  /** Start on the briefing, or pause during play: what a gamepad's Start button does. */
  startOrPause(): void {
    const go = document.querySelector<HTMLButtonElement>('#modal.show [data-go]');
    if (go) go.click();
    else this.togglePause();
  }

  toast(text: string): void {
    this.panels[0]!.toast(text);
  }

  update(): void {
    const g = this.game;
    document.body.classList.toggle('paused', g.paused && g.started);
    $('paused').classList.toggle('show', g.paused && g.started && !$('modal').classList.contains('show'));
    for (const p of this.panels) p.update();
    if (g.world.outcome !== 'playing' && !this.shownOutcome) {
      this.shownOutcome = true;
      this.showOutcome();
    }
  }

  /** What is being played: the mission, or the skirmish's map and opponent. */
  private matchTitle(): string {
    const g = this.game;
    const T = t();
    const s = g.setup;
    return s.kind === 'campaign'
      ? `${mapName(g.mapIndex)} · ${missionTitle(g.mapIndex, g.missionIndex)} · ${T.difficulty[g.difficulty]}`
      : `${T.skirmish} · ${mapName(g.mapIndex)} · ${T.opponent[s.opponent]}`;
  }

  /** Is a dialog open over the game? */
  get dialogOpen(): boolean {
    return $('modal').classList.contains('show');
  }

  /**
   * What Escape does once the game runs: opens the pause menu, or closes the dialog that is open (a dialog opened
   * from the pause menu goes back to it).
   */
  escape(): void {
    if (!this.game.started || this.game.world.outcome !== 'playing') return;
    const m = $('modal');
    if (!m.classList.contains('show')) return this.showPauseMenu();
    (m.querySelector<HTMLButtonElement>('[data-no]') ?? m.querySelector<HTMLButtonElement>('[data-close]') ?? m.querySelector<HTMLButtonElement>('[data-resume]'))?.click();
  }

  /**
   * The pause menu: the game stops under a light shade, and from here the player continues, saves, changes the
   * settings, restarts, or leaves for the main screen or the desktop. Leaving and restarting ask first.
   */
  showPauseMenu(): void {
    if (!this.game.started || this.game.world.outcome !== 'playing') return;
    const close = this.pauseBehind();
    const T = t();
    const back = () => this.showPauseMenu();
    const m = this.modal(
      `<div class="kicker">${this.matchTitle()}</div><h1>${T.paused}</h1>
       <div class="menu-buttons">
         <button class="primary" data-resume>${T.continueGame}</button>
         <button data-saves>${T.saves}</button>
         <button data-settings>${T.settings}</button>
         <button data-restart>${T.restartMission}</button>
         <button data-menu>${T.toMenu}</button>
         ${inApp() ? `<button data-exit>${T.exitGame}</button>` : ''}
       </div>`,
    );
    m.classList.add('dim');
    m.querySelector('.card')!.classList.add('pause');
    const on = (attr: string, f: () => void) => m.querySelector<HTMLButtonElement>(`[data-${attr}]`)?.addEventListener('click', f);
    on('resume', close);
    on('saves', () => {
      close();
      this.showSaves(back);
    });
    on('settings', () => {
      close();
      this.showSettings(back);
    });
    const ask = (question: string, yes: () => void) => () => {
      const q = this.modal(
        `<h1>${question}</h1><p class="hint">${T.unsavedLost}</p><div class="row"><button data-no>${T.no}</button><button class="primary" data-yes>${T.yes}</button></div>`,
      );
      q.classList.add('dim');
      q.querySelector<HTMLButtonElement>('[data-no]')!.onclick = () => {
        close();
        back();
      };
      q.querySelector<HTMLButtonElement>('[data-yes]')!.onclick = yes;
    };
    on('restart', ask(T.askRestart, () => this.actions.restart()));
    on('menu', ask(T.askMenu, () => this.actions.toMenu()));
    on('exit', ask(T.askExit, quitApp));
  }

  private modal(html: string): HTMLElement {
    const m = $('modal');
    m.classList.remove('over-scene', 'dim');
    m.innerHTML = `<div class="card">${html}</div>`;
    m.classList.add('show');
    return m;
  }

  private closeModal(): void {
    $('modal').classList.remove('show');
  }

  showBriefing(): void {
    if (this.menu) return this.showMenu();
    if (this.game.setup.kind === 'skirmish') return this.showSkirmishSetup();
    const g = this.game;
    const T = t();
    const m = this.modal(
      `<div class="kicker">${T.kicker(g.mapIndex + 1, g.missionIndex + 1)} · ${mapName(g.mapIndex)}</div>
       <h1>${missionTitle(g.mapIndex, g.missionIndex)}</h1>
       <p class="brief">${missionBrief(g.mapIndex, g.missionIndex)}</p>
       <p class="goal">${T.goal}</p>
       <div class="options">
         <div class="option"><span>${T.difficultyLabel}</span>${levels('difficulty', DIFFICULTIES, g.difficulty, (d) => T.difficulty[d], DIFFICULTY_ICONS)}</div>
         <p class="hint">${T.difficultyHint[g.difficulty]}</p>
         <div class="option"><span>${T.languageLabel}</span>${choice('lang', LANGS, getLang(), (l) => `${flagHtml(l)}<span class="sr">${LANG_NAMES[l]}</span>`)}</div>
       </div>
       <div class="row"><button class="primary" data-go>${T.start}</button></div>`,
    );
    m.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((b) => {
      b.onclick = () => {
        this.actions.setDifficulty(b.dataset.difficulty as Difficulty);
        this.showBriefing();
      };
    });
    this.bindLang(m);
    this.bindGo(m);
  }

  /**
   * The skirmish start screen, one full screen: the map list, a large preview and the match options on top, then both
   * sides next to each other (race, how their army will look, main and secondary colour grids). It fits a 1280×720
   * window without scrolling. Choices change a draft and redraw only this screen; Start loads the match when the draft
   * differs from the one already loaded.
   */
  private showSkirmishSetup(): void {
    const s = (this.draft ??= { ...(this.game.setup as SkirmishSetup) });
    const T = t();
    const maps = campaign.maps.map((_, i) => i);
    const m = this.modal(
      `<header><div class="kicker">${T.skirmish}</div><h1>${mapName(s.mapIndex)}</h1>
         <div class="lang">${choice('lang', LANGS, getLang(), (l) => `${flagHtml(l)}<span class="sr">${LANG_NAMES[l]}</span>`)}</div></header>
       <div class="top">
         <nav class="maps"><span>${T.mapLabel}</span>${choice('map', maps.map(String), String(s.mapIndex), (i) => `${Number(i) + 1}. ${mapName(Number(i))}`)}</nav>
         <figure class="map"><canvas class="preview" width="1" height="1"></canvas></figure>
         <div class="match">
           <div class="option"><span>${T.opponentLabel}</span><div class="levels">${levels('opponent', OPPONENTS, s.opponent, (o) => T.opponent[o], OPPONENT_ICONS)}</div></div>
           <p class="hint">${T.opponentHint[s.opponent]}${s.opponent === 'human' ? ` ${T.helpDuo}` : ''}</p>
           <div class="option"><span>${T.moneyLabel}</span><div class="money">${choice('money', SKIRMISH_MONEY.map(String), String(s.money), (v) => `$${v}`)}</div></div>
           <p class="goal">${s.opponent === 'human' ? T.duoGoal : T.skirmishGoal}</p>
         </div>
       </div>
       <div class="sides">${[0, 1].map((i) => sideOptions(s, i)).join('')}</div>
       <footer><button data-campaign>${T.campaign}</button><button class="primary" data-go>${T.start}</button></footer>`,
    );
    m.querySelector('.card')!.classList.add('setup', 'screen');
    drawPreview(m.querySelector('canvas')!, s.mapIndex, s.colors);
    const change = (patch: Partial<SkirmishSetup>) => {
      this.draft = { ...s, ...patch };
      this.showSkirmishSetup();
    };
    m.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((b) => (b.onclick = () => change({ mapIndex: Number(b.dataset.map) })));
    m.querySelectorAll<HTMLButtonElement>('[data-opponent]').forEach((b) => (b.onclick = () => change({ opponent: b.dataset.opponent as Opponent })));
    for (const i of [0, 1] as const) {
      const pair = <V>(list: [V, V], v: V): [V, V] => (i === 0 ? [v, list[1]] : [list[0], v]);
      m.querySelectorAll<HTMLButtonElement>(`[data-race${i}]`).forEach((b) => (b.onclick = () => change({ races: pair(s.races, b.dataset[`race${i}`] as Race) })));
      m.querySelectorAll<HTMLButtonElement>(`[data-color${i}]`).forEach((b) => (b.onclick = () => change({ colors: pair(s.colors, b.dataset[`color${i}`] as TeamColor) })));
      m.querySelectorAll<HTMLButtonElement>(`[data-second${i}]`).forEach((b) => (b.onclick = () => change({ colors2: pair(s.colors2, b.dataset[`second${i}`] as TeamColor) })));
    }
    m.querySelectorAll<HTMLButtonElement>('[data-money]').forEach((b) => (b.onclick = () => change({ money: Number(b.dataset.money) })));
    m.querySelector<HTMLButtonElement>('[data-campaign]')!.onclick = () => this.showMissions();
    this.bindLang(m);
    m.querySelector<HTMLButtonElement>('[data-go]')!.onclick = () => {
      if (JSON.stringify(s) === JSON.stringify(this.game.setup)) {
        this.closeModal();
        this.game.started = true;
      } else this.actions.open(s, undefined, true);
    };
    // The army previews need the 3D models; draw them once those are in.
    if (!scene3d) void scene3dReady.then(() => this.draft === s && $('modal').querySelector('.setup') && this.showSkirmishSetup());
  }

  private bindLang(m: HTMLElement): void {
    m.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => {
      b.onclick = () => {
        this.actions.setLang(b.dataset.lang as Lang);
        this.applyLang();
        this.showBriefing();
      };
    });
  }

  private bindGo(m: HTMLElement): void {
    m.querySelector<HTMLButtonElement>('[data-go]')!.onclick = () => {
      this.closeModal();
      this.game.started = true;
    };
  }

  /** A live 3D scene behind the dialogs: the main screen's battle, or the end of a match. */
  private async showScene(make: (m: typeof import('./ui/scene3d'), canvas: HTMLCanvasElement) => Promise<PixelScene>): Promise<void> {
    const m = await scene3dReady;
    let canvas = document.getElementById('scene') as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'scene';
      document.body.appendChild(canvas);
    }
    this.scene?.dispose();
    this.scene = await make(m, canvas);
    this.scene.start();
  }

  /**
   * The main screen: the name over a slow battle between the campaign's humans and hovers, and the way into every
   * part of the game.
   */
  showMenu(): void {
    const T = t();
    const last = this.actions.lastSkirmish();
    const m = this.modal(
      `<h1 class="logo">${logoHtml()}</h1>
       <div class="menu-buttons">
         ${[
           readSave('quick') ? `<button class="primary" data-continue>${T.continueGame}</button>` : '',
           `<button data-campaign>${T.campaign}</button>`,
           `<button data-skirmish>${T.skirmish}</button>`,
           `<button data-duo>${T.duo}</button>`,
           `<button data-saves>${T.load}</button>`,
           `<button data-settings>${T.settings}</button>`,
           inApp() ? `<button data-exit>${T.exit}</button>` : '',
         ]
           .filter(Boolean)
           .map((b, i) => b.replace('>', `><i class="no">0${i + 1}</i>`))
           .join('')}
       </div>
       <div class="option lang">${choice('lang', LANGS, getLang(), (l) => `${flagHtml(l)}<span class="sr">${LANG_NAMES[l]}</span>`)}</div>
       <p class="tagline"><span>${T.subtitle}</span><span>v${__APP_VERSION__}</span></p>`,
    );
    m.classList.add('over-scene');
    m.querySelector('.card')!.classList.add('menu');
    const on = (attr: string, f: () => void) => m.querySelector<HTMLButtonElement>(`[data-${attr}]`)?.addEventListener('click', f);
    on('continue', () => this.actions.load('quick'));
    on('campaign', () => this.showMissions());
    on('skirmish', () => this.actions.open({ ...last, opponent: last.opponent === 'human' ? 'normal' : last.opponent }));
    on('duo', () => this.actions.open({ ...last, opponent: 'human' }));
    on('saves', () => this.showSaves());
    on('settings', () => this.showSettings());
    on('exit', quitApp);
    this.bindLang(m);
    if (!this.scene) void this.showScene((s3, canvas) => s3.battleScene(canvas));
  }

  /**
   * Victory or defeat: a live scene in the winner's or loser's race on the map's ground, the match's numbers and
   * the ways on. In a two-player game the scene is the winner's.
   */
  private showOutcome(): void {
    const g = this.game;
    const T = t();
    const won = g.world.outcome === 'won';
    const sides = g.world.sides;
    const own = g.twoPlayers && !won ? sides.enemy : sides.player;
    const foe = own === sides.player ? sides.enemy : sides.player;
    const forest = g.world.blocked.reduce((n, b) => n + b, 0) > g.world.blocked.length * 0.05;
    document.body.classList.add('outcome');
    void this.showScene((s3, canvas) =>
      s3.outcomeScene(canvas, { won: won || g.twoPlayers, own: dress(own), foe: dress(foe), ground: own.race === 'hover' ? 'plates' : 'sand', forest }),
    );
    const secs = Math.floor(g.world.tick / TICKS_PER_SECOND);
    const st = own.stats;
    const stats = `<div class="stats">
      <span>${T.stats.time}</span><span>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</span>
      <span>${T.stats.harvested}</span><span>$ ${st.harvested}</span>
      <span>${T.stats.built}</span><span>${st.built}</span>
      <span>${T.stats.killed}</span><span>${st.killed}</span>
      <span>${T.stats.lost}</span><span>${st.lost}</span>
      <span>${T.stats.buildingsLost}</span><span>${st.buildingsLost}</span>
    </div>`;
    const card = (title: string, text: string, buttons: string) => {
      const m = this.modal(`<h1>${title}</h1><p>${text}</p>${stats}<div class="row"><button data-menu>${T.toMenu}</button>${buttons}</div>`);
      m.classList.add('over-scene');
      m.querySelector('.card')!.classList.add('outcome');
      m.querySelector<HTMLButtonElement>('[data-menu]')!.onclick = () => this.actions.toMenu();
      return m;
    };
    if (g.setup.kind === 'skirmish') {
      const title = g.twoPlayers ? T.playerWins(won ? 1 : 2) : won ? T.victory : T.lost;
      const text = g.twoPlayers ? T.duoWinText : won ? T.wonText : T.lostText;
      const m = card(title, text, `<button data-setup>${T.newSkirmish}</button><button class="primary" data-restart>${T.again}</button>`);
      m.querySelector<HTMLButtonElement>('[data-restart]')!.onclick = () => this.actions.restart();
      m.querySelector<HTMLButtonElement>('[data-setup]')!.onclick = () => this.actions.open(g.setup);
      return;
    }
    if (won) markCompleted(g.mapIndex, g.missionIndex);
    const next = won ? nextMission(g.mapIndex, g.missionIndex) : null;
    const last = won && !next;
    const m = card(
      won ? T.won : T.lost,
      last ? T.campaignDone : won ? T.wonText : T.lostText,
      `<button data-restart${next ? '' : ' class="primary"'}>${T.retry}</button>${next ? `<button class="primary" data-next>${T.next}</button>` : ''}`,
    );
    m.querySelector<HTMLButtonElement>('[data-restart]')!.onclick = () => this.actions.restart();
    m.querySelector<HTMLButtonElement>('[data-next]')?.addEventListener('click', () =>
      this.actions.open({ kind: 'campaign', ...next!, difficulty: g.difficulty }),
    );
  }

  /** Pauses the game behind a dialog and returns a function that closes it and restores the pause state. */
  private pauseBehind(): () => void {
    const wasPaused = this.game.paused;
    this.game.paused = true;
    return () => {
      this.closeModal();
      this.game.paused = wasPaused;
      if (!this.game.started) this.showBriefing();
    };
  }

  showMissions(): void {
    const close = this.pauseBehind();
    const T = t();
    const done = completed();
    let list = '';
    let open = true;
    campaign.maps.forEach((map, mi) => {
      list += `<div class="map"><b>${mi + 1}. ${mapName(mi)}</b>`;
      map.missions.forEach((_, si) => {
        // Missions open in order: every completed one, plus the first one not yet completed.
        const isDone = done.has(`${mi + 1}.${si + 1}`);
        const locked = !isDone && !open;
        if (!isDone) open = false;
        list += `<button data-m="${mi}" data-s="${si}"${locked ? ` disabled title="${T.locked}"` : ''}>${si + 1}. ${missionTitle(mi, si)}${isDone ? ' ✓' : ''}</button>`;
      });
      list += '</div>';
    });
    const m = this.modal(`<h1>${T.missions}</h1><div class="missions">${list}</div><div class="row"><button data-close>${T.close}</button></div>`);
    m.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => {
      b.onclick = () => this.actions.open({ kind: 'campaign', mapIndex: Number(b.dataset.m), missionIndex: Number(b.dataset.s), difficulty: this.game.difficulty });
    });
    m.querySelector<HTMLButtonElement>('[data-close]')!.onclick = close;
  }

  /** Volumes, language, and a few words about the game with its version. */
  showSettings(back?: () => void): void {
    const shut = this.pauseBehind();
    const close = () => {
      shut();
      back?.();
    };
    const T = t();
    const v = this.actions.volumes();
    const slider = (id: string, label: string, value: number) =>
      `<label class="volume"><span>${label}</span><input type="range" min="0" max="100" step="5" value="${Math.round(value * 100)}" data-volume="${id}" aria-label="${label}"><output>${Math.round(value * 100)}%</output></label>`;
    const m = this.modal(
      `<h1>${T.settings}</h1>
       <div class="options">
         ${slider('music', T.musicLabel, v.music)}
         ${slider('sfx', T.sfxLabel, v.sfx)}
         <div class="option"><span>${T.languageLabel}</span>${choice('lang', LANGS, getLang(), (l) => `${flagHtml(l)}<span class="sr">${LANG_NAMES[l]}</span>`)}</div>
       </div>
       <h2>${T.about}</h2>
       <p class="about">${T.title} · ${T.subtitle} · ${T.version(__APP_VERSION__)}</p>
       <p class="hint">${T.credits}</p>
       <div class="row"><button data-close>${T.close}</button></div>`,
    );
    m.querySelectorAll<HTMLInputElement>('[data-volume]').forEach((input) => {
      input.oninput = () => {
        const get = (id: string) => Number(m.querySelector<HTMLInputElement>(`[data-volume="${id}"]`)!.value) / 100;
        input.nextElementSibling!.textContent = `${input.value}%`;
        this.actions.setVolumes(get('music'), get('sfx'));
      };
    });
    m.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => {
      b.onclick = () => {
        this.actions.setLang(b.dataset.lang as Lang);
        this.applyLang();
        shut();
        this.showSettings(back);
      };
    });
    m.querySelector<HTMLButtonElement>('[data-close]')!.onclick = close;
  }

  showSaves(back?: () => void): void {
    const shut = this.pauseBehind();
    const close = () => {
      shut();
      back?.();
    };
    const T = t();
    const canSave = this.game.started && this.game.world.outcome === 'playing';
    let rows = '';
    for (const slot of SLOTS) {
      const s = readSave(slot);
      const name = slot === 'quick' ? `${T.quick} (F5/F9)` : T.slot(Number(slot));
      let info: string = T.empty;
      if (s) {
        const what =
          s.setup.kind === 'campaign'
            ? `${s.setup.mapIndex + 1}.${s.setup.missionIndex + 1} ${missionTitle(s.setup.mapIndex, s.setup.missionIndex)} · ${T.difficulty[s.world.world.difficulty]}`
            : `${T.skirmish} · ${mapName(s.setup.mapIndex)} · ${T.opponent[s.setup.opponent]}`;
        info = `${what} · ${new Date(s.savedAt).toLocaleString(getLang())}`;
      }
      rows += `<div class="slot"><b>${name}</b><span>${info}</span>
        <button data-save="${slot}"${canSave ? '' : ' disabled'}>${T.save}</button>
        <button data-load="${slot}"${s ? '' : ' disabled'}>${T.load}</button></div>`;
    }
    const m = this.modal(`<h1>${T.saves}</h1><div class="slots">${rows}</div><div class="row"><button data-close>${T.close}</button></div>`);
    m.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => {
      b.onclick = () => {
        this.actions.save(b.dataset.save as Slot);
        shut();
      };
    });
    m.querySelectorAll<HTMLButtonElement>('[data-load]').forEach((b) => {
      b.onclick = () => this.actions.load(b.dataset.load as Slot);
    });
    m.querySelector<HTMLButtonElement>('[data-close]')!.onclick = close;
  }
}

function choice<V extends string>(attr: string, values: readonly V[], current: V, label: (v: V) => string): string {
  return values.map((v) => `<button data-${attr}="${v}"${v === current ? ' class="active"' : ''}>${label(v)}</button>`).join('');
}

/** Big buttons with an icon line (skulls) over the name, for difficulty and opponent. */
function levels<V extends string>(attr: string, values: readonly V[], current: V, label: (v: V) => string, icons: Record<V, string>): string {
  return values
    .map((v) => `<button class="level${v === current ? ' active' : ''}" data-${attr}="${v}"><span class="icons">${icons[v]}</span>${label(v)}</button>`)
    .join('');
}

/** Rows of the colour grid, top to bottom: light shades, base colours, dark shades (index into TEAM_COLOR_GRID). */
const GRID_ROWS = [2, 1, 0] as const;

/**
 * A grid of colour swatches, a column per hue in rainbow order and a row per shade (light on top, dark at the bottom);
 * `attr` names the data attribute, `taken` is a colour that cannot be picked.
 */
function swatches(attr: string, label: string, current: TeamColor, taken: TeamColor | null, small = false): string {
  const T = t();
  const cells = GRID_ROWS.flatMap((row) => TEAM_HUES.map((hue) => TEAM_COLOR_GRID[hue][row])).map((c) => {
    const ramp = TEAM_COLORS[c];
    const cls = c === current ? 'swatch active' : 'swatch';
    return `<button class="${cls}" data-${attr}="${c}" title="${T.color[c]}" aria-label="${T.color[c]}" aria-pressed="${c === current}" style="--c: ${ramp[2]}; --c-edge: ${ramp[4]}"${c === taken ? ' disabled' : ''}></button>`;
  });
  return `<div class="colors${small ? ' small' : ''}"><span>${label}</span><div class="grid" role="group" aria-label="${label}">${cells.join('')}</div></div>`;
}

/**
 * One side's race, team colour and secondary colour on the skirmish screen. The colour the other side wears cannot be
 * picked, so the two sides never look alike (other shades of its hue can); any secondary colour can, also one already worn.
 */
function sideOptions(s: SkirmishSetup, i: number): string {
  const T = t();
  const who = s.opponent === 'human' ? T.playerName(i + 1) : i === 0 ? T.you : T.computer;
  const look: Dress = { race: s.races[i]!, color: s.colors[i]!, color2: s.colors2[i]! };
  const army = ARMY.map((type) => img(portraitFor(look, type, 64))).join('');
  return `<div class="side" data-side="${i}"><div class="who"><b>${who}</b><div class="races">${choice(`race${i}`, RACES, s.races[i]!, (r) => T.race[r])}</div></div>
    <div class="look"><div class="army" style="--c: ${TEAM_COLORS[look.color][1]}">${army}</div>
    <div class="palettes">${swatches(`color${i}`, T.colorLabel, s.colors[i]!, s.colors[1 - i]!)}${swatches(`second${i}`, T.color2Label, s.colors2[i]!, null, true)}</div></div></div>`;
}

/** What the skirmish screen shows of each side's army: its HQ and the three tanks. */
const ARMY = [ObjectType.PlayerHQ, ObjectType.LightTank, ObjectType.MiddleTank, ObjectType.HeavyTank] as const;

/** A small map of the skirmish in the game's colours: sand, fir forest, crystal fields and the two starts. */
function drawPreview(canvas: HTMLCanvasElement, mapIndex: number, colors: readonly [TeamColor, TeamColor]): void {
  const map = campaign.maps[mapIndex]!;
  const { cols, rows, blocked } = buildBlockedGrid(map);
  const layout = skirmishLayout(map);
  const px = Math.max(3, Math.floor(Math.min(440 / cols, 330 / rows)));
  canvas.width = cols * px;
  canvas.height = rows * px;
  const g = canvas.getContext('2d');
  if (!g) return;
  const noise = (i: number) => ((i * 2654435761) >>> 0) % 7;
  for (let i = 0; i < blocked.length; i++) {
    const x = (i % cols) * px;
    const y = Math.floor(i / cols) * px;
    if (blocked[i]) {
      g.fillStyle = noise(i) < 3 ? '#1f4a40' : '#24564a';
      g.fillRect(x, y, px, px);
      // A fir: a light dot on its sunny side.
      g.fillStyle = '#3f8a72';
      g.fillRect(x + Math.floor(px / 3), y + Math.floor(px / 4), Math.max(1, Math.floor(px / 3)), Math.max(1, Math.floor(px / 3)));
    } else {
      g.fillStyle = ['#d8c491', '#d2bd88', '#dcc999', '#d5c08c', '#d8c491', '#cfb984', '#dbc795'][noise(i)]!;
      g.fillRect(x, y, px, px);
    }
  }
  for (const f of layout.fields) {
    const cx = (f.cx + 1) * px;
    const cy = (f.cy + 1) * px;
    g.fillStyle = '#a87a12';
    g.beginPath();
    g.moveTo(cx, cy - px * 1.1);
    g.lineTo(cx + px * 0.9, cy);
    g.lineTo(cx, cy + px * 1.1);
    g.lineTo(cx - px * 0.9, cy);
    g.fill();
    g.fillStyle = '#f0c43a';
    g.fillRect(cx - px * 0.3, cy - px * 0.6, px * 0.6, px * 0.9);
  }
  layout.starts.forEach((s, i) => {
    const ramp = TEAM_COLORS[colors[i]!];
    g.fillStyle = '#000';
    g.fillRect(s.cx * px - 2, s.cy * px - 2, 2 * px + 4, 2 * px + 4);
    g.fillStyle = ramp[2];
    g.fillRect(s.cx * px, s.cy * px, 2 * px, 2 * px);
    g.fillStyle = ramp[4];
    g.fillRect(s.cx * px, s.cy * px, 2 * px, Math.max(1, Math.floor(px / 3)));
    g.fillStyle = '#fff';
    g.font = `${Math.max(12, Math.floor(px * 1.6))}px Shardfall, Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(i + 1), (s.cx + 1) * px, (s.cy + 1) * px + 1);
  });
}

/**
 * One person's part of the interface: a bar along the bottom of their view with the minimap and their crystals on
 * the left, the selection in the middle (every selected unit, or one object's portrait with its bars) and a fixed
 * grid of icon buttons on the right. Names, prices and hotkeys live in tooltips. The bar never changes size, so
 * nothing jumps when the selection changes. In a two-player game each half of the screen has its own.
 */
export class PlayerPanel {
  private key = '';
  private toastTimer = 0;
  private readonly panel: HTMLElement;
  private readonly money: HTMLElement;
  private readonly info: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly mm: HTMLElement;
  private readonly toastEl: HTMLElement;
  /** Self-destruct waits for a second press on the same object within ARM_MS. */
  private armed: { id: number; at: number } | null = null;
  private infoShown = '';
  private gridShown = '';

  constructor(
    private readonly c: Commander,
    duo: boolean,
  ) {
    const n = c.number;
    const id = (base: string) => (n === 1 ? base : `${base}-${n}`);
    this.panel = ensure('section', id('panel'), `panel side-${n}`);
    this.panel.innerHTML = `<div class="mm"><div class="money" id="${id('money')}"></div><div class="mm-slot"></div></div><div class="info"></div><div class="grid"></div>`;
    this.money = this.panel.querySelector('.money')!;
    this.mm = this.panel.querySelector('.mm-slot')!;
    this.info = this.panel.querySelector('.info')!;
    this.grid = this.panel.querySelector('.grid')!;
    this.toastEl = ensure('div', id('toast'), `toast side-${n}`);
    c.onToast = (text) => this.toast(text);
    this.panel.oncontextmenu = (ev) => this.onRightClick(ev);
    if (duo) {
      const look = skin(this.own.race, this.own.color, this.own.color2);
      for (const el of [this.panel, this.toastEl]) applySkin(el, look);
    }
    // Buttons act on press: the panel redraws while something is being built, and a redraw between press and
    // release used to swallow the click. Gamepad and keyboard presses come as clicks with no pointer behind them.
    this.panel.onpointerdown = (ev) => {
      if (ev.button === 0) this.onClick(ev);
    };
    this.panel.onclick = (ev) => {
      if (ev.detail === 0) this.onClick(ev);
    };
    this.panel.onpointerover = (ev) => showTip((ev.target as HTMLElement).closest<HTMLElement>('[data-name]'));
    this.panel.onpointerleave = () => showTip(null);
  }

  private get own(): SideState {
    return this.c.world.sides[this.c.side];
  }

  get element(): HTMLElement {
    return this.panel;
  }

  /** Puts the view's minimap into the bar's left corner. */
  mountMinimap(canvas: HTMLCanvasElement): void {
    this.mm.appendChild(canvas);
  }

  refresh(): void {
    this.key = '';
  }

  toast(text: string): void {
    const el = this.toastEl;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
  }

  update(): void {
    const c = this.c;
    if (this.armed && performance.now() - this.armed.at > ARM_MS) this.armed = null;
    const sel = c.selected();
    const key = this.signature(sel);
    if (key === this.key) return;
    this.key = key;
    this.money.innerHTML = `${CRYSTAL}<span>${c.money}</span>`;
    this.money.dataset.name = t().crystals;
    // Only replace what changed: a button that stays the same element keeps a press that lands mid-redraw.
    const info = this.infoHtml(sel);
    if (info !== this.infoShown) this.info.innerHTML = this.infoShown = info;
    const grid = this.gridHtml(sel);
    if (grid !== this.gridShown) {
      this.grid.innerHTML = this.gridShown = grid;
      this.assignKeys();
    }
    const buttons = this.focusable();
    buttons.forEach((b, i) => b.classList.toggle('pad-focus', c.cursor !== null && i === c.focus % buttons.length));
    // The redraw replaced the button under the mouse: point the tooltip at its successor.
    const tip = document.getElementById('tip');
    if (tip?.classList.contains('show')) showTip(this.panel.querySelector<HTMLElement>('[data-name]:hover'));
  }

  /** Hotkeys by place in the grid, not by name: Q W E R T, A S D F G, Z X C V B. Self-destruct has none. */
  private assignKeys(): void {
    if (this.c.number !== 1) return;
    this.grid.querySelectorAll<HTMLButtonElement>('button[data-cell]').forEach((b) => {
      if (b.classList.contains('danger')) return;
      b.dataset.key = KEYS[Number(b.dataset.cell)];
    });
  }

  /** Presses the panel button bound to a letter key; true when the key belongs to a button (even a disabled one). */
  pressKey(letter: string): boolean {
    const b = this.panel.querySelector<HTMLButtonElement>(`button[data-key="${letter}"]`);
    if (!b) return false;
    if (!b.disabled) b.click();
    return true;
  }

  /** Buttons a gamepad can reach; self-destruct needs the mouse, to rule out accidents. */
  focusable(): HTMLButtonElement[] {
    return [...this.panel.querySelectorAll<HTMLButtonElement>('.grid button:not(.danger), .queue button')];
  }

  /** Moves the gamepad highlight by `delta` buttons. */
  moveFocus(delta: number): void {
    const n = this.focusable().length;
    if (n === 0) return;
    this.c.focus = (((this.c.focus + delta) % n) + n) % n;
    this.key = '';
  }

  /** Presses the highlighted button. */
  pressFocus(): void {
    const buttons = this.focusable();
    const b = buttons[this.c.focus % Math.max(1, buttons.length)];
    if (b && !b.disabled) b.click();
  }

  private signature(sel: Entity[]): string {
    const c = this.c;
    return JSON.stringify([
      getLang(),
      c.money,
      c.placing?.type ?? null,
      c.aiming,
      c.focus,
      c.cursor !== null,
      this.armed?.id ?? null,
      sel.map((e) => [e.id, e.hp, e.order.kind, e.phase, e.cargo, e.complete, e.queue.length, e.job ? Math.floor(('elapsedMs' in e.job ? e.job.elapsedMs : 0) / 500) : -1, Math.floor(e.buildElapsedMs / 500)]),
    ]);
  }

  /**
   * The object's name in its race's words. Races mostly name things differently; where the other side's name is the
   * same as this person's own race would use (a mirror match, the shared harvester), it adds the race: "HQ · humans".
   */
  private name(e: Entity): string {
    const race = raceOf(this.c.world, e.team);
    const name = objectName(race, e.type);
    if (!race || !this.c.isFoe(e)) return name;
    return name === objectName(this.ownRace, e.type) ? `${name} · ${t().raceOf[race]}` : name;
  }

  private get ownRace() {
    return this.c.world.sides[this.c.side].race;
  }

  /** The middle of the bar: nothing, every selected unit, or one object in detail. */
  private infoHtml(sel: Entity[]): string {
    const T = t();
    const c = this.c;
    if (sel.length === 0) return c.cursor ? `<div class="hint">${T.padHint}</div>` : '';
    if (sel.length > 1) {
      // A squad: a portrait per unit with its hit points underneath; a click picks that one.
      const faces = sel
        .slice(0, SQUAD_MAX)
        .map((e) => `<button class="mini" data-pick="${e.id}" data-name="${this.name(e)}">${img(portraitOf(this.sideOf(e.team), e.type, 40))}${meter(e.hp / e.maxHp, hpTone(e))}</button>`)
        .join('');
      const more = sel.length > SQUAD_MAX ? `<span class="more">+${sel.length - SQUAD_MAX}</span>` : '';
      return `<div class="squad">${faces}${more}</div>`;
    }
    const e = sel[0]!;
    const own = c.isOwn(e);
    const team = e.team === 'neutral' ? 'neutral' : own ? 'own' : 'foe';
    const bars: string[] = [];
    if (e.type === ObjectType.ResourceField) bars.push(bar(CRYSTAL, e.hp / Math.max(e.hp, e.maxHp), 'cargo', `${e.hp}`, T.resource));
    else bars.push(bar(PIX.hp, e.hp / e.maxHp, hpTone(e), `${Math.max(0, e.hp)}/${e.maxHp}`, T.hp));
    if (e.type === ObjectType.Harvester) bars.push(bar(CRYSTAL, e.cargo / 50, 'cargo', `${e.cargo}/50`, T.cargo));
    const about: string[] = [`<div class="title ${team}">${this.name(e)}</div>`];
    if (isUnit(e.type)) {
      about.push(chip(e.type === ObjectType.Harvester && e.phase ? T.phase[e.phase] : T.order[e.order.kind], e.order.kind === 'idle' && !e.phase));
    } else if (!e.complete) {
      about.push(bar(PIX.build, e.buildElapsedMs / e.buildTotalMs, 'work', `${Math.floor((e.buildElapsedMs / e.buildTotalMs) * 100)}%`, siteName(raceOf(c.world, e.team) ?? 'human')));
    } else if (e.job?.kind === 'construct') about.push(chip(T.constructing, false));
    if (own && e.type === ObjectType.TankFactory) about.push(this.queue(e));
    return `<div class="one"><div class="pic">${speakerOf(this.sideOf(e.team), e.type)}${bars.join('')}</div><div class="about">${about.join('')}</div></div>`;
  }

  /**
   * The button grid, three rows of five: the top two rows build, produce or command; the bottom row controls
   * (Stop, Cancel, Self-destruct), set apart. Empty cells stay, so the grid never moves.
   */
  private gridHtml(sel: Entity[]): string {
    const T = t();
    const c = this.c;
    const cells: string[] = Array(15).fill('');
    const e = sel[0];
    const ownUnits = sel.filter((s) => c.isOwn(s) && isUnit(s.type));
    if (ownUnits.length > 0) {
      const armed = c.ownUnits().some((u) => UNIT_RULES[u.type as UnitType].weapon);
      cells[0] = this.button(0, 'move', PIX.move, T.move, { active: c.aiming === 'move' });
      cells[1] = this.button(1, 'attack', PIX.attack, T.attack, { active: c.aiming === 'attack', disabled: !armed });
      cells[11] = this.button(11, 'stop', PIX.stop, T.stop);
    } else if (e && sel.length === 1 && c.isOwn(e)) {
      if (e.type === hqType(c.side) && e.complete) {
        HQ_BUILDS.forEach((type, i) => {
          const price = BUILDING_RULES[type].price;
          const busy = e.job !== null && type !== ObjectType.Wall;
          cells[i] = this.button(i, 'place', img(portraitOf(this.own, type, 40)), objectName(this.ownRace, type), {
            type,
            price,
            active: c.placing?.type === type,
            disabled: busy || price > c.money,
          });
        });
        if (e.job) cells[10] = this.button(10, 'cancel', PIX.cancel, T.cancelBuild, { id: e.id });
      } else if (e.type === ObjectType.TankFactory && e.complete) {
        const line = productionLine(e).length;
        FACTORY_BUILDS.forEach((type, i) => {
          const price = UNIT_RULES[type].price;
          cells[i] = this.button(i, 'produce', img(portraitOf(this.own, type, 40)), objectName(this.ownRace, type), {
            type,
            price,
            id: e.id,
            disabled: line >= QUEUE_MAX || (line === 0 && price > c.money),
          });
        });
        if (line > 0) cells[10] = this.button(10, 'cancel', PIX.cancel, T.cancel, { id: e.id });
      } else if (!e.complete) cells[10] = this.button(10, 'cancel', PIX.cancel, T.cancel, { id: e.id });
      const armedHere = this.armed?.id === e.id;
      cells[14] = this.button(14, 'destruct', PIX.destruct, armedHere ? T.destructConfirm : T.destruct, { id: e.id, danger: true, active: armedHere });
    }
    const fill = (from: number, to: number) => cells.slice(from, to).map((h) => h || '<span class="cell"></span>').join('');
    return `<div class="group">${fill(0, 10)}</div><div class="group ctl">${fill(10, 15)}</div>`;
  }

  private button(
    cell: number,
    action: string,
    icon: string,
    name: string,
    o: { type?: number; price?: number; id?: number; active?: boolean; disabled?: boolean; danger?: boolean } = {},
  ): string {
    const cls = ['cmd', o.active ? 'active' : '', o.danger ? 'danger' : ''].filter(Boolean).join(' ');
    const label = o.price === undefined ? name : `${name} ${o.price}`;
    return `<button class="${cls}" data-cell="${cell}" data-action="${action}" data-name="${name}"${o.price === undefined ? '' : ` data-price="${o.price}"`}${o.type === undefined ? '' : ` data-type="${o.type}"`}${o.id === undefined ? '' : ` data-id="${o.id}"`} aria-label="${label}"${o.disabled ? ' disabled' : ''}>${icon}</button>`;
  }

  /** The side an entity belongs to (a neutral field is shown in this player's colours). */
  private sideOf(team: Team): SideState {
    return this.c.world.sides[team === 'neutral' ? this.c.side : team];
  }

  /**
   * The factory's queue: the tank being built with its progress, then the ones waiting. Right click on one cancels it.
   */
  private queue(factory: Entity): string {
    const job = factory.job?.kind === 'produce' ? factory.job : null;
    const waiting = factory.queue;
    if (!job && waiting.length === 0) return '';
    const T = t();
    const icon = (type: UnitType, i: number, progress: number | null) =>
      `<button class="slot" data-queue="${i}" data-id="${factory.id}" data-name="${objectName(this.ownRace, type)}" data-note="${T.queueCancel}">${img(portraitOf(this.own, type, 40))}${progress === null ? '' : `<i style="width: ${Math.floor(progress * 100)}%"></i>`}</button>`;
    let html = '<div class="queue">';
    if (job) html += icon(job.unit, 0, job.elapsedMs / job.totalMs);
    waiting.forEach((type, i) => (html += icon(type, i + (job ? 1 : 0), null)));
    return `${html}</div>`;
  }

  private onRightClick(ev: MouseEvent): void {
    ev.preventDefault();
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-queue]');
    if (!btn) return;
    // `index` counts along the factory's production line, the running tank first.
    this.c.run({ kind: 'cancel', id: Number(btn.dataset.id), index: Number(btn.dataset.queue) });
    this.key = '';
  }

  private onClick(ev: MouseEvent): void {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn || btn.disabled) return;
    const c = this.c;
    const id = Number(btn.dataset.id);
    const type = Number(btn.dataset.type);
    if (btn.dataset.pick) {
      c.select([Number(btn.dataset.pick)]);
      this.key = '';
      return;
    }
    switch (btn.dataset.action) {
      case 'place':
        if (c.placing?.type === type) c.placing = null;
        else c.startPlacing(type as BuildingType);
        break;
      case 'produce':
        c.run({ kind: 'produce', factoryId: id, unit: type as UnitType });
        break;
      case 'cancel':
        c.run({ kind: 'cancel', id });
        break;
      case 'destruct':
        // No browser dialog (the desktop app's web view has none): the button arms, a second press destroys.
        if (this.armed?.id === id && performance.now() - this.armed.at <= ARM_MS) {
          this.armed = null;
          c.run({ kind: 'destruct', id });
        } else this.armed = { id, at: performance.now() };
        break;
      case 'stop':
        c.aiming = null;
        c.run({ kind: 'stop', ids: c.ownUnits().map((u) => u.id) });
        break;
      case 'move':
      case 'attack':
        c.aiming = c.aiming === btn.dataset.action ? null : btn.dataset.action;
        break;
    }
    this.key = '';
  }
}

const KEYS = 'QWERTASDFGZXCVB';
const ARM_MS = 3000;
const SQUAD_MAX = 24;

/** The tooltip over the bar: a name, a price in crystals and a hotkey. */
function showTip(el: HTMLElement | null): void {
  const tip = document.getElementById('tip') ?? ensure('div', 'tip', 'tip');
  if (!el) {
    tip.classList.remove('show');
    return;
  }
  const { name, price, key, note } = el.dataset;
  tip.innerHTML = `<b>${name}</b>${price ? `<span class="price">${CRYSTAL}${price}</span>` : ''}${key ? `<kbd>${key}</kbd>` : ''}${note ? `<small>${note}</small>` : ''}`;
  tip.classList.add('show');
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  tip.style.left = `${Math.round(Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2)))}px`;
  tip.style.top = `${Math.round(r.top - tip.offsetHeight - 6)}px`;
}

/**
 * Pixel icons: rows of palette letters, one rect per pixel. `c` is the button's text colour (currentColor), the
 * rest fixed colours, so the crystal stays the colour of the fields on the map whatever the race's skin.
 */
const PALETTE: Record<string, string> = {
  c: 'currentColor', a: 'var(--accent)', r: '#e05a3a', R: '#ff8a6a', k: '#1a1410', w: '#fff6d8', g: '#6ee06e', G: '#2f8f3a',
  y: '#ffe27a', Y: '#f0c43a', o: '#b9831c', O: '#6d4a12',
};
function pixelIcon(rows: string[], cls = 'icon'): string {
  const w = rows[0]!.length;
  const rects = rows.flatMap((row, y) => [...row].map((ch, x) => (PALETTE[ch] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${PALETTE[ch]}"/>` : ''))).join('');
  return `<svg class="${cls}" viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

/** The crystal: a yellow shard with a lit face and a dark one, the currency of the game. */
const CRYSTAL = pixelIcon(['...y...', '..yyY..', '.yywYY.', '.ywyYo.', 'yywYYoo', '.yyYoo.', '.yYYoO.', '..YoO..', '...O...'], 'icon crystal');

const PIX = {
  move: pixelIcon(['.........', '.........', 'aa...aa..', '.aa...aa.', '..aa...aa', '.aa...aa.', 'aa...aa..', '.........', '.........']),
  attack: pixelIcon(['....r....', '..rrrrr..', '.r..r..r.', '.r.....r.', 'rrrr.rrrr', '.r.....r.', '.r..r..r.', '..rrrrr..', '....r....']),
  stop: pixelIcon(['.........', '.ccccccc.', '.c.....c.', '.c.ccc.c.', '.c.ccc.c.', '.c.ccc.c.', '.c.....c.', '.ccccccc.', '.........']),
  cancel: pixelIcon(['.........', '.cc...cc.', '..cc.cc..', '...ccc...', '....c....', '...ccc...', '..cc.cc..', '.cc...cc.', '.........']),
  /** A bomb with a lit fuse. */
  destruct: pixelIcon(['......y.Y', '.....Y.y.', '....o....', '...kkk...', '..kkkkk..', '.kkwkkkk.', '.kwkkkkk.', '.kkkkkkk.', '..kkkkk..'], 'icon bomb'),
  hp: pixelIcon(['.......', '..ggg..', '..gGg..', 'gggGggg', 'gGGGGGg', 'gggGggg', '..gGg..', '..ggg..', '.......'], 'icon small'),
  build: pixelIcon(['.......', '.cc....', 'cccc...', '.cccc..', '..cccc.', '...cc.c', '....ccc', '.....c.', '.......'], 'icon small'),
};

type Tone = 'good' | 'mid' | 'bad' | 'cargo' | 'work';

/** Health colour by what is left, as on the map's bars. */
const hpTone = (e: Entity): Tone => (e.hp / e.maxHp > 0.6 ? 'good' : e.hp / e.maxHp > 0.3 ? 'mid' : 'bad');

/** A segmented bar filled to `value` (0..1). */
const meter = (value: number, tone: Tone) =>
  `<span class="meter ${tone}"><i style="width: ${Math.round(Math.min(1, Math.max(0, value)) * 100)}%"></i></span>`;

/** An icon and a tall bar with its number written on it; the word for it is the tooltip. */
const bar = (icon: string, value: number, tone: Tone, text: string, name: string) =>
  `<div class="bar" data-name="${name}">${icon}<span class="meter big ${tone}"><i style="width: ${Math.round(Math.min(1, Math.max(0, value)) * 100)}%"></i><b>${text}</b></span></div>`;

/** A status light: what the object is doing, dimmed while it waits. */
const chip = (text: string, idle: boolean) => `<div class="chip${idle ? ' idle' : ''}">${text}</div>`;

/** The element with this id, created under <body> when the page does not have it yet. */
function ensure(tag: string, id: string, className: string): HTMLElement {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    document.body.appendChild(el);
  }
  el.className = className;
  return el;
}
