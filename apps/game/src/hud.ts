import {
  campaign,
  CAMPAIGN_FACTIONS,
  CELL as MAP_CELL,
  FACTION_NAME_MAX,
  FACTION_SYMBOLS,
  LANGS,
  ObjectType,
  PRESET_FACTIONS,
  RACES,
  spriteName,
  TEAM_COLOR_GRID,
  TEAM_COLORS,
  TEAM_HUES,
  type Faction,
  type FactionSymbol,
  type Lang,
  type Race,
  type TeamColor,
} from '@sw/data';
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
import { hqType, nextMission, skirmishFactions, type Commander, type Game, type Setup } from './game';
import { completed, loadFactions, markCompleted, readSave, saveFactions, SLOTS, type Slot } from './storage';
import { emblemHtml } from './ui/emblems';
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

const dress = (s: SideState): Dress => ({ race: s.race, color: s.color, color2: s.color2, color3: s.color3 });

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
  /** The faction studio's open faction: which of the player's factions it is (-1 for a new one) and its edits. */
  private studio: { index: number; edit: Faction } | null = null;
  /** The faction last saved since the studio opened, handed to its `back` when it closes. */
  private studioSaved: Faction | null = null;

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
    $('btn-pause').onclick = () => this.togglePause();
    $('btn-menu').onclick = () => this.actions.toMenu();
    $('btn-saves').onclick = () => this.showSaves();
    $('btn-settings').onclick = () => this.showSettings();
    this.applyLang();
    if (game.loaded || startNow) game.started = true;
    else this.showBriefing();
    void scene3dReady.then(() => {
      for (const p of this.panels) p.refresh();
    });
  }

  /** Fills the static page text in the current language. */
  applyLang(): void {
    $('btn-menu').textContent = `☰ ${t().menu}`;
    $('topbar').dataset.paused = t().paused;
    $('btn-saves').textContent = t().saves;
    $('btn-settings').title = t().settings;
    $('btn-settings').setAttribute('aria-label', t().settings);
    $('help').textContent = this.game.twoPlayers ? t().helpDuo : t().help;
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
    const T = t();
    const s = g.setup;
    $('hud').textContent =
      s.kind === 'campaign'
        ? `${mapName(g.mapIndex)} · ${missionTitle(g.mapIndex, g.missionIndex)} · ${T.difficulty[g.difficulty]}`
        : `${T.skirmish} · ${mapName(g.mapIndex)} · ${T.opponent[s.opponent]}`;
    $('btn-pause').textContent = g.paused ? T.resume : T.pause;
    document.body.classList.toggle('paused', g.paused && g.started);
    for (const p of this.panels) p.update();
    if (g.world.outcome !== 'playing' && !this.shownOutcome) {
      this.shownOutcome = true;
      this.showOutcome();
    }
  }

  private modal(html: string): HTMLElement {
    const m = $('modal');
    m.classList.remove('over-scene');
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
           <p class="hint"${s.opponent === 'human' ? ` title="${T.helpDuo}"` : ''}>${T.opponentHint[s.opponent]}</p>
           <div class="option"><span>${T.moneyLabel}</span><div class="money">${choice('money', SKIRMISH_MONEY.map(String), String(s.money), (v) => v)}</div></div>
           <p class="goal">${s.opponent === 'human' ? T.duoGoal : T.skirmishGoal}</p>
         </div>
       </div>
       <div class="sides">${[0, 1].map((i) => sideOptions(s, i, loadFactions())).join('')}</div>
       <footer><button data-campaign>${T.campaign}</button><button class="primary" data-go>${T.start}</button></footer>`,
    );
    m.querySelector('.card')!.classList.add('setup', 'screen');
    drawPreview(m.querySelector('canvas')!, s.mapIndex, [s.factions[0].color, s.factions[1].color]);
    const change = (patch: Partial<SkirmishSetup>) => {
      this.draft = { ...s, ...patch };
      this.showSkirmishSetup();
    };
    m.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((b) => (b.onclick = () => change({ mapIndex: Number(b.dataset.map) })));
    m.querySelectorAll<HTMLButtonElement>('[data-opponent]').forEach((b) => (b.onclick = () => change({ opponent: b.dataset.opponent as Opponent })));
    const choices = [...PRESET_FACTIONS, ...loadFactions()];
    const seat = (i: 0 | 1, f: Faction) => skirmishFactions(i === 0 ? [f, s.factions[1]] : [s.factions[0], f]);
    for (const i of [0, 1] as const) {
      m.querySelectorAll<HTMLButtonElement>(`[data-faction${i}]`).forEach((b) => (b.onclick = () => change({ factions: seat(i, choices[Number(b.dataset[`faction${i}`])]!) })));
      m.querySelector<HTMLButtonElement>(`[data-studio${i}]`)!.onclick = () =>
        this.showFactionStudio((made) => {
          if (made) this.draft = { ...s, factions: seat(i, made) };
          this.showSkirmishSetup();
        }, s.factions[i]);
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
           `<button data-factions>${T.factions}</button>`,
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
    on('factions', () => this.showFactionStudio(() => this.showMenu()));
    on('settings', () => this.showSettings());
    on('exit', () => {
      const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke(cmd: string, args?: unknown): Promise<unknown> } }).__TAURI_INTERNALS__;
      void tauri?.invoke('plugin:window|close', { label: 'main' }).catch(() => window.close());
    });
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

  /**
   * The campaign, one full screen like the skirmish's: the seven maps down the left with a pip per mission (filled when
   * won), the chosen map large in the middle with both sides' starting positions, and its missions on the right, the
   * picked one with its briefing. Missions open in order; Start plays the picked one. Picking only redraws the screen.
   */
  showMissions(): void {
    const close = this.pauseBehind();
    const done = completed();
    // Missions open in order: every completed one, plus the first one not yet completed.
    const state: ('done' | 'open' | 'locked')[][] = [];
    let open = true;
    let next: [number, number] = [0, 0];
    campaign.maps.forEach((map, mi) => {
      state.push(
        map.missions.map((_, si) => {
          if (done.has(`${mi + 1}.${si + 1}`)) return 'done';
          if (!open) return 'locked';
          open = false;
          next = [mi, si];
          return 'open';
        }),
      );
    });
    // From a mission, the screen opens on it; from the main screen, on the first mission not yet won.
    const here = !this.menu && this.game.setup.kind === 'campaign' ? this.game.setup : null;
    let [pm, ps] = here && state[here.mapIndex]?.[here.missionIndex] !== 'locked' ? [here.mapIndex, here.missionIndex] : next;
    const render = () => {
      const T = t();
      const pips = (mi: number) => state[mi]!.map((st) => `<i class="pip ${st}"></i>`).join('');
      const maps = campaign.maps
        .map((_, mi) => {
          const locked = state[mi]![0] === 'locked';
          return `<button class="chapter${mi === pm ? ' active' : ''}" data-cm="${mi}"${locked ? ` disabled title="${T.locked}"` : ''}><span class="no">${mi + 1}</span><span class="name">${mapName(mi)}</span><span class="pips">${pips(mi)}</span></button>`;
        })
        .join('');
      const missions = campaign.maps[pm]!.missions
        .map((_, si) => {
          const st = state[pm]![si]!;
          const mark = st === 'done' ? '<span class="mark">✓</span>' : '';
          return `<button class="mission ${st}${si === ps ? ' active' : ''}" data-cs="${si}"${st === 'locked' ? ` disabled title="${T.locked}"` : ''}><span class="no">${pm + 1}.${si + 1}</span><span class="name">${missionTitle(pm, si)}</span>${mark}</button>`;
        })
        .join('');
      const m = this.modal(
        `<header><div class="kicker">${T.campaign}</div><h1>${mapName(pm)}</h1></header>
         <div class="campaign">
           <nav class="chapters">${maps}</nav>
           <figure class="map"><canvas class="preview" width="1" height="1"></canvas></figure>
           <div class="brief">
             <div class="missions">${missions}</div>
             <h2>${missionTitle(pm, ps)}</h2>
             <p>${missionBrief(pm, ps)}</p>
           </div>
         </div>
         <footer><button data-close>${T.back}</button><button class="primary" data-go>${T.start}</button></footer>`,
      );
      m.querySelector('.card')!.classList.add('campaign-screen', 'screen');
      drawMissionPreview(m.querySelector('canvas')!, pm, ps);
      m.querySelectorAll<HTMLButtonElement>('[data-cm]').forEach((b) => {
        b.onclick = () => {
          pm = Number(b.dataset.cm);
          const st = state[pm]!;
          ps = Math.max(0, st.includes('open') ? st.indexOf('open') : st.lastIndexOf('done'));
          render();
        };
      });
      m.querySelectorAll<HTMLButtonElement>('[data-cs]').forEach((b) => {
        b.onclick = () => {
          ps = Number(b.dataset.cs);
          render();
        };
        b.ondblclick = () => start();
      });
      m.querySelector<HTMLButtonElement>('[data-close]')!.onclick = close;
      m.querySelector<HTMLButtonElement>('[data-go]')!.onclick = () => start();
    };
    const start = () => this.actions.open({ kind: 'campaign', mapIndex: pm, missionIndex: ps, difficulty: this.game.difficulty });
    render();
  }

  /** Volumes, language, and a few words about the game with its version. */
  showSettings(): void {
    const close = this.pauseBehind();
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
        close();
        this.showSettings();
      };
    });
    m.querySelector<HTMLButtonElement>('[data-close]')!.onclick = close;
  }

  /**
   * The faction studio: the player's own factions on the left, the open one large in the middle (its emblem and its
   * army) and its race, name, symbol and three colours on the right. `back` gets the faction that was last saved, or
   * null; `start` is the faction to open (one of the player's, or a new one made from it).
   */
  showFactionStudio(back: (saved: Faction | null) => void, start?: Faction): void {
    const T = t();
    const mine = loadFactions();
    if (!this.studio || start) {
      const k = start ? mine.findIndex((f) => sameFaction(f, start)) : -1;
      this.studio = { index: k, edit: { ...(start ?? PRESET_FACTIONS[0]!) } };
      this.studioSaved = null;
    }
    const st = this.studio;
    const f = st.edit;
    const redraw = () => this.showFactionStudio(back);
    const chip = (c: Faction, attr: string, on: boolean) =>
      `<button class="faction-chip${on ? ' active' : ''}" ${attr}>${emblemHtml(c, 2)}<span>${factionName(c)}</span></button>`;
    const symbols = FACTION_SYMBOLS.map(
      (sym) => `<button class="symbol${sym === f.symbol ? ' active' : ''}" data-symbol="${sym}" title="${T.symbol[sym]}" aria-label="${T.symbol[sym]}">${emblemHtml({ ...f, symbol: sym }, 2)}</button>`,
    ).join('');
    const army = [ObjectType.PlayerHQ, ObjectType.Harvester, ObjectType.LightTank, ObjectType.HeavyTank].map((type) => img(portraitFor(f, type, 96))).join('');
    const m = this.modal(
      `<header><div class="kicker">${T.factionStudio}</div><h1>${factionName(f)}</h1></header>
       <div class="studio-body">
         <nav class="faction-list">
           <span>${T.myFactions}</span>
           ${mine.map((c, k) => chip(c, `data-mine="${k}"`, k === st.index)).join('')}
           <button class="faction-chip new${st.index < 0 ? ' active' : ''}" data-new>+ ${T.newFaction}</button>
           <span>${T.presetFactions}</span>
           ${PRESET_FACTIONS.map((c, k) => chip(c, `data-preset="${k}"`, false)).join('')}
         </nav>
         <figure class="faction-show" style="--c: ${TEAM_COLORS[f.color][1]}">${emblemHtml(f, 6, 'emblem big')}<div class="army">${army}</div></figure>
         <div class="faction-edit">
           <label class="name"><span>${T.nameLabel}</span><input type="text" maxlength="${FACTION_NAME_MAX}" value="${f.name}" placeholder="${T.race[f.race]}" data-name></label>
           <div class="option"><span>${T.raceLabel}</span><div class="races">${choice('race', RACES, f.race, (r) => T.race[r])}</div></div>
           <div class="option"><span>${T.symbolLabel}</span><div class="symbols">${symbols}</div></div>
           <div class="palettes">
             ${swatches('color', T.colorLabel, f.color, null, true)}
             ${swatches('second', T.color2Label, f.color2, null, true)}
             ${swatches('chassis', `${T.color3Label} · ${T.chassisOf[f.race]}`, f.color3, null, true)}
           </div>
         </div>
       </div>
       <footer><button data-back>${T.back}</button><span class="spacer"></span>${st.index >= 0 ? `<button data-delete>${T.deleteFaction}</button>` : ''}<button class="primary" data-save>${T.saveFaction}</button></footer>`,
    );
    m.querySelector('.card')!.classList.add('faction-studio', 'screen');
    const set = (patch: Partial<Faction>) => {
      st.edit = { ...st.edit, ...patch };
      redraw();
    };
    const each = (attr: string, f: (v: string) => void) =>
      m.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) => (b.onclick = () => f(b.getAttribute(`data-${attr}`)!)));
    each('race', (v) => set({ race: v as Race }));
    each('symbol', (v) => set({ symbol: v as FactionSymbol }));
    each('color', (v) => set({ color: v as TeamColor }));
    each('second', (v) => set({ color2: v as TeamColor }));
    each('chassis', (v) => set({ color3: v as TeamColor }));
    each('mine', (v) => ((this.studio = { index: Number(v), edit: { ...mine[Number(v)]! } }), redraw()));
    each('preset', (v) => ((this.studio = { index: -1, edit: { ...PRESET_FACTIONS[Number(v)]! } }), redraw()));
    each('new', () => ((this.studio = { index: -1, edit: { ...f, name: '' } }), redraw()));
    // Typing changes only the draft and the title, so the field keeps its focus.
    const name = m.querySelector<HTMLInputElement>('[data-name]')!;
    name.oninput = () => {
      st.edit = { ...st.edit, name: name.value.replace(/[<>&"|]/g, '') };
      m.querySelector('header h1')!.textContent = factionName(st.edit);
    };
    m.querySelector<HTMLButtonElement>('[data-save]')!.onclick = () => {
      const list = loadFactions();
      const edit = { ...st.edit, name: st.edit.name.trim() };
      if (st.index >= 0 && st.index < list.length) list[st.index] = edit;
      else st.index = list.push(edit) - 1;
      st.edit = edit;
      saveFactions(list);
      this.studioSaved = edit;
      this.toast(T.factionSaved);
      redraw();
    };
    m.querySelector<HTMLButtonElement>('[data-delete]')?.addEventListener('click', () => {
      const list = loadFactions();
      list.splice(st.index, 1);
      saveFactions(list);
      this.studio = { index: -1, edit: { ...f } };
      redraw();
    });
    m.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => {
      this.studio = null;
      back(this.studioSaved);
    };
    if (!scene3d) void scene3dReady.then(() => this.studio === st && $('modal').querySelector('.faction-studio') && redraw());
  }


  showSaves(): void {
    const close = this.pauseBehind();
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
        close();
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

/** A faction's name to show: the player's own, or its race's. */
const factionName = (f: Faction) => f.name || t().race[f.race];
const sameFaction = (a: Faction, b: Faction) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One side on the skirmish screen: its faction's emblem, name and army, and every faction it can play (the ready-made
 * ones, then the player's own from the studio). A faction in the other side's main colour cannot be picked, so the two
 * sides never look alike; the studio button opens the faction studio on this side's faction.
 */
function sideOptions(s: SkirmishSetup, i: number, mine: readonly Faction[]): string {
  const T = t();
  const who = s.opponent === 'human' ? T.playerName(i + 1) : i === 0 ? T.you : T.computer;
  const f = s.factions[i]!;
  const other = s.factions[1 - i]!;
  const army = ARMY.map((type) => img(portraitFor(f, type, 64))).join('');
  const chips = [...PRESET_FACTIONS, ...mine]
    .map((c, k) => {
      const on = sameFaction(c, f);
      return `<button class="faction-chip${on ? ' active' : ''}" data-faction${i}="${k}" title="${factionName(c)}"${!on && c.color === other.color ? ' disabled' : ''}>${emblemHtml(c, 2)}<span>${factionName(c)}</span></button>`;
    })
    .join('');
  return `<div class="side" data-side="${i}"><div class="who"><b>${who}</b>${emblemHtml(f, 2)}<span class="faction-name">${factionName(f)}</span>
    <button class="studio-link" data-studio${i}>${T.factionStudio}</button></div>
    <div class="look"><div class="army" style="--c: ${TEAM_COLORS[f.color][1]}">${army}</div><div class="faction-chips">${chips}</div></div></div>`;
}

/** What the skirmish screen shows of each side's army: its HQ and the three tanks. */
const ARMY = [ObjectType.PlayerHQ, ObjectType.LightTank, ObjectType.MiddleTank, ObjectType.HeavyTank] as const;

/** Where a preview marks something, in cells: crystal fields, starts (numbered squares) and smaller pieces. */
interface PreviewMarks {
  fields: readonly { cx: number; cy: number }[];
  starts: readonly { cx: number; cy: number; color: TeamColor; label: string }[];
  pieces?: readonly { cx: number; cy: number; size: number; color: TeamColor }[];
}

/**
 * A small map in the game's colours, as large as fits a `boxW`×`boxH` box: sand, fir forest, crystal fields drawn as
 * little clusters of yellow crystals (as on the map), and what stands there.
 */
function drawMap(canvas: HTMLCanvasElement, mapIndex: number, marks: PreviewMarks, boxW = 440, boxH = 330): void {
  const map = campaign.maps[mapIndex]!;
  const { cols, rows, blocked } = buildBlockedGrid(map);
  const px = Math.max(3, Math.floor(Math.min(boxW / cols, boxH / rows)));
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
  // A crystal field: three upright crystals of different heights, each with a lit and a shaded half and a dark foot.
  const u = Math.max(1, Math.floor(px / 3));
  for (const f of marks.fields) {
    const cx = Math.round((f.cx + 1) * px);
    const base = Math.round((f.cy + 1) * px + px * 0.7);
    g.fillStyle = 'rgb(90 60 10 / 0.45)';
    g.fillRect(cx - 4 * u, base - u, 8 * u, 2 * u);
    for (const [dx, hgt] of [[-3, 4], [0, 6], [2, 3]] as const) {
      const x = cx + dx * u;
      for (let k = 0; k < hgt; k++) {
        const y = base - (k + 1) * u;
        const tip = k === hgt - 1;
        g.fillStyle = '#ffe27a';
        g.fillRect(x, y, u, u);
        if (!tip) {
          g.fillStyle = '#d29a1c';
          g.fillRect(x + u, y, u, u);
        }
      }
    }
  }
  for (const p of marks.pieces ?? []) {
    const ramp = TEAM_COLORS[p.color];
    g.fillStyle = '#000';
    g.fillRect(p.cx * px - 1, p.cy * px - 1, p.size * px + 2, p.size * px + 2);
    g.fillStyle = ramp[3];
    g.fillRect(p.cx * px, p.cy * px, p.size * px, p.size * px);
  }
  for (const s of marks.starts) {
    const ramp = TEAM_COLORS[s.color];
    g.fillStyle = '#000';
    g.fillRect(s.cx * px - 2, s.cy * px - 2, 2 * px + 4, 2 * px + 4);
    g.fillStyle = ramp[2];
    g.fillRect(s.cx * px, s.cy * px, 2 * px, 2 * px);
    g.fillStyle = ramp[4];
    g.fillRect(s.cx * px, s.cy * px, 2 * px, Math.max(1, Math.floor(px / 3)));
    if (!s.label) continue;
    g.fillStyle = '#fff';
    g.font = `${Math.max(12, Math.floor(px * 1.6))}px Shardfall, Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s.label, (s.cx + 1) * px, (s.cy + 1) * px + 1);
  }
}

/** The skirmish's map with its crystal fields and the two numbered starts in the sides' colours. */
function drawPreview(canvas: HTMLCanvasElement, mapIndex: number, colors: readonly [TeamColor, TeamColor]): void {
  const layout = skirmishLayout(campaign.maps[mapIndex]!);
  drawMap(canvas, mapIndex, { fields: layout.fields, starts: layout.starts.map((s, i) => ({ ...s, color: colors[i]!, label: String(i + 1) })) }, 340, 340);
}

/** A campaign mission's map: its crystal fields, both headquarters and every other building and unit, in the campaign's colours. */
function drawMissionPreview(canvas: HTMLCanvasElement, mapIndex: number, missionIndex: number): void {
  const objects = campaign.maps[mapIndex]!.missions[missionIndex]!.objects;
  const [me, foe] = CAMPAIGN_FACTIONS;
  const cell = (o: { x: number; y: number }) => ({ cx: Math.floor(o.x / MAP_CELL), cy: Math.floor(o.y / MAP_CELL) });
  const enemy = (o: (typeof objects)[number]) => o.type === ObjectType.EnemyHQ || o.type === ObjectType.EnemyTank || (!isUnit(o.type) && o.enemy);
  const hq = (o: (typeof objects)[number]) => o.type === ObjectType.PlayerHQ || o.type === ObjectType.EnemyHQ;
  drawMap(
    canvas,
    mapIndex,
    {
      fields: objects.filter((o) => o.type === ObjectType.ResourceField).map(cell),
      starts: objects.filter(hq).map((o) => ({ ...cell(o), color: enemy(o) ? foe.color : me.color, label: '' })),
      pieces: objects
        .filter((o) => !hq(o) && o.type !== ObjectType.ResourceField)
        .map((o) => ({ ...cell(o), size: isUnit(o.type) || o.type === ObjectType.Wall || o.type === ObjectType.Defender ? 1 : 2, color: enemy(o) ? foe.color : me.color })),
    },
    560,
    470,
  );
}

/** How long a pressed self-destruct button waits for the confirming second press. */
const DESTRUCT_CONFIRM_MS = 3000;

/**
 * One person's part of the interface: the selection panel with build buttons, their money and their toasts.
 * In a two-player game each half of the screen has its own; a gamepad moves a highlight over the buttons.
 */
export class PlayerPanel {
  private key = '';
  /** Self-destruct pressed once: the button asks to be pressed again to confirm. */
  private destructArmed: { id: number; at: number } | null = null;

  private armedId(): number {
    const a = this.destructArmed;
    return a && performance.now() - a.at < DESTRUCT_CONFIRM_MS ? a.id : 0;
  }
  private toastTimer = 0;
  private readonly panel: HTMLElement;
  private readonly money: HTMLElement;
  private readonly toastEl: HTMLElement;

  constructor(
    private readonly c: Commander,
    duo: boolean,
  ) {
    const n = c.number;
    const id = (base: string) => (n === 1 ? base : `${base}-${n}`);
    this.panel = ensure('section', id('panel'), `panel side-${n}`);
    this.toastEl = ensure('div', id('toast'), `toast side-${n}`);
    this.money = n === 1 && !duo ? $('money') : ensure('div', `badge-${n}`, `badge side-${n}`);
    $('money').hidden = duo;
    c.onToast = (text) => this.toast(text);
    this.panel.oncontextmenu = (ev) => this.onRightClick(ev);
    if (duo) {
      const look = skin(this.own.race, this.own.color, this.own.color2);
      for (const el of [this.panel, this.money, this.toastEl]) applySkin(el, look);
    }
    // Buttons act on press: the panel redraws while something is being built, and a redraw between press and
    // release used to swallow the click. Gamepad and keyboard presses come as clicks with no pointer behind them.
    this.panel.onpointerdown = (ev) => {
      if (ev.button === 0) this.onClick(ev);
    };
    this.panel.onclick = (ev) => {
      if (ev.detail === 0) this.onClick(ev);
    };
  }

  private get own(): SideState {
    return this.c.world.sides[this.c.side];
  }

  get element(): HTMLElement {
    return this.panel;
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
    const duo = c.game.twoPlayers;
    this.money.textContent = duo ? `${t().playerName(c.number)} · $${c.money}` : `$${c.money}`;
    const sel = c.selected();
    const key = `${this.signature(sel)}|${this.armedId()}`;
    if (key === this.key) return;
    this.key = key;
    this.panel.innerHTML = this.html(sel);
    this.assignKeys();
    const buttons = this.focusable();
    buttons.forEach((b, i) => b.classList.toggle('pad-focus', c.cursor !== null && i === c.focus % buttons.length));
  }

  /**
   * Hotkeys by place, not by name: the first row of buttons is Q W E R T, the second A S D F G, so the hand never
   * hunts for a letter. Stop is always X. Self-destruct has none. Only the keyboard player's panel shows them.
   */
  private assignKeys(): void {
    if (this.c.number !== 1) return;
    const letters = ['QWERT', 'ASDFG'];
    let row = 0;
    for (const group of this.panel.querySelectorAll('.buttons')) {
      const buttons = [...group.querySelectorAll<HTMLButtonElement>('button:not(.danger)')];
      if (buttons.length === 0) continue;
      buttons.forEach((b, i) => {
        const key = b.dataset.action === 'stop' ? 'X' : letters[row]?.[i];
        if (!key) return;
        b.dataset.key = key;
        b.insertAdjacentHTML('beforeend', `<kbd>${key}</kbd>`);
      });
      if (buttons.some((b) => b.dataset.action !== 'stop')) row++;
    }
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
    return [...this.panel.querySelectorAll<HTMLButtonElement>('button:not(.danger)')];
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
      sel.map((e) => [e.id, e.hp, e.order.kind, e.phase, e.cargo, e.complete, e.job ? Math.floor(('elapsedMs' in e.job ? e.job.elapsedMs : 0) / 500) : -1, Math.floor(e.buildElapsedMs / 500)]),
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

  private html(sel: Entity[]): string {
    const T = t();
    const c = this.c;
    if (sel.length === 0) return `<div class="hint">${c.cursor ? T.padHint : T.hint}</div>`;
    if (sel.length > 1) {
      // A squad: a small portrait per unit with its hit points underneath, the commands on the right.
      const faces = sel
        .slice(0, 12)
        .map((e) => `<span class="mini">${img(portraitOf(this.sideOf(e.team), e.type, 24))}${meter(e.hp / e.maxHp, hpTone(e))}</span>`)
        .join('');
      const more = sel.length > 12 ? `<span class="more">+${sel.length - 12}</span>` : '';
      return `<div class="sel"><div class="stats"><div class="title">${T.squad}: ${sel.length}</div><div class="squad">${faces}${more}</div></div>${this.unitButtons()}</div>`;
    }
    const e = sel[0]!;
    const own = c.isOwn(e);
    const team = e.team === 'neutral' ? 'neutral' : own ? 'own' : 'foe';
    const face = speakerOf(this.sideOf(e.team), e.type);
    const rows: string[] = [];
    if (e.type === ObjectType.ResourceField) rows.push(gauge(T.resource, e.hp / Math.max(e.hp, e.maxHp), 'cargo', `${e.hp}`));
    else rows.push(gauge(T.hp, e.hp / e.maxHp, hpTone(e), `${Math.max(0, e.hp)}/${e.maxHp}`));
    if (isUnit(e.type)) {
      rows.push(chip(e.type === ObjectType.Harvester && e.phase ? T.phase[e.phase] : T.order[e.order.kind], e.order.kind === 'idle' && !e.phase));
      if (e.type === ObjectType.Harvester) rows.push(gauge(T.cargo, e.cargo / 50, 'cargo', `${e.cargo}/50`));
    } else if (!e.complete) {
      rows.push(gauge(siteName(raceOf(this.c.world, e.team) ?? 'human'), e.buildElapsedMs / e.buildTotalMs, 'work', `${Math.floor((e.buildElapsedMs / e.buildTotalMs) * 100)}%`));
    } else if (e.job?.kind === 'produce') {
      rows.push(gauge(`${T.producing}: ${objectName(raceOf(this.c.world, e.team), e.job.unit)}${e.queue.length > 0 ? ` (+${e.queue.length})` : ''}`, e.job.elapsedMs / e.job.totalMs, 'work', `${Math.floor((e.job.elapsedMs / e.job.totalMs) * 100)}%`));
    } else if (e.job?.kind === 'construct') rows.push(chip(T.constructing, false));
    const cmds = own && isUnit(e.type) ? this.unitButtons() : '';
    let html = `<div class="sel">${face}<div class="stats"><div class="title ${team}">${this.name(e)}</div>${rows.join('')}</div>${cmds}</div>`;
    if (!own) return html;
    if (isUnit(e.type)) return html;
    if (e.type === hqType(c.side) && e.complete) {
      html += '<div class="buttons">';
      for (const type of HQ_BUILDS) html += this.buildButton(type, BUILDING_RULES[type].price, e.job !== null && type !== ObjectType.Wall);
      html += '</div>';
      if (e.job) html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">${T.cancelBuild}</button></div>`;
    } else if (e.type === ObjectType.TankFactory && e.complete) {
      html += '<div class="buttons">';
      for (const type of FACTORY_BUILDS) html += this.produceButton(type, e);
      html += '</div>';
      html += this.queue(e);
      if (productionLine(e).length > 0) html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">${T.cancel}</button></div>`;
    } else if (!e.complete) {
      html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">${T.cancel}</button></div>`;
    }
    const armed = this.armedId() === e.id;
    html += `<div class="buttons"><button class="danger${armed ? ' active' : ''}" data-action="destruct" data-id="${e.id}">${armed ? T.destructConfirm : T.destruct}</button></div>`;
    return html;
  }

  private buildButton(type: BuildingType, price: number, busy: boolean): string {
    const active = this.c.placing?.type === type ? ' active' : '';
    const disabled = busy || price > this.c.money ? ' disabled' : '';
    return `<button class="build${active}" data-action="place" data-type="${type}"${disabled}>${img(portraitOf(this.own, type, 24))}<span>${objectName(this.ownRace, type)}</span><small>$ ${price}</small></button>`;
  }

  private produceButton(type: UnitType, factory: Entity): string {
    const price = UNIT_RULES[type].price;
    const line = productionLine(factory).length;
    const disabled = line >= QUEUE_MAX || (line === 0 && price > this.c.money) ? ' disabled' : '';
    return `<button class="build" data-action="produce" data-type="${type}" data-id="${factory.id}"${disabled}>${img(portraitOf(this.own, type, 24))}<span>${objectName(this.ownRace, type)}</span><small>$ ${price}</small></button>`;
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
      `<button class="slot" data-queue="${i}" data-id="${factory.id}" title="${objectName(this.ownRace, type)} · ${T.queueCancel}">${img(portraitOf(this.own, type, 24))}${progress === null ? '' : `<i style="width: ${Math.floor(progress * 100)}%"></i>`}</button>`;
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

  /** Move, Attack and Stop as a column of icon buttons on the right of the panel; Move and Attack then wait for a click. */
  private unitButtons(): string {
    const T = t();
    const armed = this.c.ownUnits().some((u) => UNIT_RULES[u.type as UnitType].weapon);
    const cmd = (action: 'move' | 'attack' | 'stop', label: string, disabled = false) =>
      `<button class="cmd${this.c.aiming === action ? ' active' : ''}" data-action="${action}"${disabled ? ' disabled' : ''}>${ICONS[action]}<span>${label}</span>${action === 'stop' && this.c.cursor ? '<small>↓</small>' : ''}</button>`;
    return `<div class="buttons cmds">${cmd('move', T.move)}${cmd('attack', T.attack, !armed)}${cmd('stop', T.stop)}</div>`;
  }

  private onClick(ev: MouseEvent): void {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn || btn.disabled) return;
    const c = this.c;
    const id = Number(btn.dataset.id);
    const type = Number(btn.dataset.type);
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
        // window.confirm() does nothing in the macOS app's web view, so the button asks itself: a second press
        // within a few seconds confirms.
        if (this.destructArmed?.id === id && performance.now() - this.destructArmed.at < DESTRUCT_CONFIRM_MS) {
          this.destructArmed = null;
          c.run({ kind: 'destruct', id });
        } else {
          this.destructArmed = { id, at: performance.now() };
        }
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

/** Pixel icons for the unit commands, 9 × 9, drawn in the button's text colour. */
const ICONS = Object.fromEntries(
  Object.entries({
    move: ['.........', '.........', '##...##..', '.##...##.', '..##...##', '.##...##.', '##...##..', '.........', '.........'],
    attack: ['....#....', '..#####..', '.#..#..#.', '.#.....#.', '####.####', '.#.....#.', '.#..#..#.', '..#####..', '....#....'],
    stop: ['.........', '.#######.', '.#.....#.', '.#.###.#.', '.#.###.#.', '.#.###.#.', '.#.....#.', '.#######.', '.........'],
  }).map(([name, rows]) => {
    const rects = rows.flatMap((row, y) => [...row].map((ch, x) => (ch === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('');
    return [name, `<svg class="icon" viewBox="0 0 9 9" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`];
  }),
) as Record<'move' | 'attack' | 'stop', string>;

type Tone = 'good' | 'mid' | 'bad' | 'cargo' | 'work';

/** Health colour by what is left, as on the map's bars. */
const hpTone = (e: Entity): Tone => (e.hp / e.maxHp > 0.6 ? 'good' : e.hp / e.maxHp > 0.3 ? 'mid' : 'bad');

/** A segmented bar filled to `value` (0..1). */
const meter = (value: number, tone: Tone) =>
  `<span class="meter ${tone}"><i style="width: ${Math.round(Math.min(1, Math.max(0, value)) * 100)}%"></i></span>`;

/** A labelled bar: the label and the number above, the bar below. */
const gauge = (label: string, value: number, tone: Tone, text: string) =>
  `<div class="gauge"><span class="label">${label}</span><b>${text}</b>${meter(value, tone)}</div>`;

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
