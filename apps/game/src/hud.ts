import { campaign, LANGS, ObjectType, RACES, TEAM_COLOR_NAMES, TEAM_COLORS, type Lang, type Race, type TeamColor } from '@sw/data';
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
  UNIT_RULES,
  type BuildingType,
  type Difficulty,
  type Entity,
  type Opponent,
  type UnitType,
} from '@sw/sim';
import { hqType, nextMission, type Commander, type Game, type Setup } from './game';
import { completed, markCompleted, readSave, SLOTS, type Slot } from './storage';
import { getLang, mapName, missionBrief, missionTitle, t } from './text';

const LANG_NAMES: Record<Lang, string> = { uk: 'Українська', en: 'English' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface HudActions {
  /** Opens another setup (a mission or a skirmish); `load` continues a save. */
  open(setup: Setup, load?: Slot): void;
  restart(): void;
  save(slot: Slot): void;
  load(slot: Slot): void;
  setLang(lang: Lang): void;
  setDifficulty(difficulty: Difficulty): void;
  /** The skirmish the "Skirmish" button opens: the last one played. */
  lastSkirmish(): Extract<Setup, { kind: 'skirmish' }>;
}

/** DOM interface over the canvas: top bar, one panel per player, toasts and dialogs. */
export class Hud {
  private shownOutcome = false;
  readonly panels: PlayerPanel[];

  constructor(
    private readonly game: Game,
    private readonly actions: HudActions,
  ) {
    document.body.classList.toggle('duo', game.twoPlayers);
    // Panel titles and money badges in the sides' team colours, a light step so they read on the dark panels.
    document.body.style.setProperty('--player', TEAM_COLORS[game.world.sides.player.color][3]);
    document.body.style.setProperty('--enemy', TEAM_COLORS[game.world.sides.enemy.color][3]);
    this.panels = game.commanders.map((c) => new PlayerPanel(c, game.twoPlayers));
    $('btn-pause').onclick = () => this.togglePause();
    $('btn-missions').onclick = () => this.showMissions();
    $('btn-skirmish').onclick = () => this.actions.open(this.actions.lastSkirmish());
    $('btn-saves').onclick = () => this.showSaves();
    this.applyLang();
    if (game.loaded) game.started = true;
    else this.showBriefing();
  }

  /** Fills the static page text in the current language. */
  applyLang(): void {
    $('btn-missions').textContent = t().missions;
    $('btn-skirmish').textContent = t().skirmish;
    $('btn-saves').textContent = t().saves;
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
    m.innerHTML = `<div class="card">${html}</div>`;
    m.classList.add('show');
    return m;
  }

  private closeModal(): void {
    $('modal').classList.remove('show');
  }

  showBriefing(): void {
    if (this.game.setup.kind === 'skirmish') return this.showSkirmishSetup();
    const g = this.game;
    const T = t();
    const m = this.modal(
      `<div class="kicker">${T.kicker(g.mapIndex + 1, g.missionIndex + 1)} · ${mapName(g.mapIndex)}</div>
       <h1>${missionTitle(g.mapIndex, g.missionIndex)}</h1>
       <p class="brief">${missionBrief(g.mapIndex, g.missionIndex)}</p>
       <p class="goal">${T.goal}</p>
       <div class="options">
         <div class="option"><span>${T.difficultyLabel}</span>${choice('difficulty', DIFFICULTIES, g.difficulty, (d) => T.difficulty[d])}</div>
         <p class="hint">${T.difficultyHint[g.difficulty]}</p>
         <div class="option"><span>${T.languageLabel}</span>${choice('lang', LANGS, getLang(), (l) => LANG_NAMES[l])}</div>
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

  /** The skirmish start screen: map with a preview, opponent, each side's race and colour, starting money. Any change reopens the game. */
  private showSkirmishSetup(): void {
    const s = this.game.setup as Extract<Setup, { kind: 'skirmish' }>;
    const T = t();
    const maps = campaign.maps.map((_, i) => i);
    const m = this.modal(
      `<div class="kicker">${T.skirmish}</div>
       <h1>${mapName(s.mapIndex)}</h1>
       <canvas class="preview" width="1" height="1"></canvas>
       <p class="goal">${s.opponent === 'human' ? T.duoGoal : T.skirmishGoal}</p>
       <div class="options">
         <div class="option"><span>${T.mapLabel}</span>${choice('map', maps.map(String), String(s.mapIndex), (i) => `${Number(i) + 1}. ${mapName(Number(i))}`)}</div>
         <div class="option"><span>${T.opponentLabel}</span>${choice('opponent', OPPONENTS, s.opponent, (o) => T.opponent[o])}</div>
         <p class="hint">${T.opponentHint[s.opponent]}</p>
         ${s.opponent === 'human' ? `<p class="hint pads">${T.helpDuo}</p>` : ''}
         ${[0, 1].map((i) => sideOptions(s, i)).join('')}
         <div class="option"><span>${T.moneyLabel}</span>${choice('money', SKIRMISH_MONEY.map(String), String(s.money), (v) => `$${v}`)}</div>
         <div class="option"><span>${T.languageLabel}</span>${choice('lang', LANGS, getLang(), (l) => LANG_NAMES[l])}</div>
       </div>
       <div class="row"><button data-campaign>${T.campaign}</button><button class="primary" data-go>${T.start}</button></div>`,
    );
    m.querySelector('.card')!.classList.add('wide');
    drawPreview(m.querySelector('canvas')!, s.mapIndex, s.colors);
    const change = (patch: Partial<typeof s>) => this.actions.open({ ...s, ...patch });
    m.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((b) => (b.onclick = () => change({ mapIndex: Number(b.dataset.map) })));
    m.querySelectorAll<HTMLButtonElement>('[data-opponent]').forEach((b) => (b.onclick = () => change({ opponent: b.dataset.opponent as Opponent })));
    for (const i of [0, 1] as const) {
      const pair = <V>(list: [V, V], v: V): [V, V] => (i === 0 ? [v, list[1]] : [list[0], v]);
      m.querySelectorAll<HTMLButtonElement>(`[data-race${i}]`).forEach((b) => (b.onclick = () => change({ races: pair(s.races, b.dataset[`race${i}`] as Race) })));
      m.querySelectorAll<HTMLButtonElement>(`[data-color${i}]`).forEach((b) => (b.onclick = () => change({ colors: pair(s.colors, b.dataset[`color${i}`] as TeamColor) })));
    }
    m.querySelectorAll<HTMLButtonElement>('[data-money]').forEach((b) => (b.onclick = () => change({ money: Number(b.dataset.money) })));
    m.querySelector<HTMLButtonElement>('[data-campaign]')!.onclick = () => this.showMissions();
    this.bindLang(m);
    this.bindGo(m);
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

  private showOutcome(): void {
    const g = this.game;
    const T = t();
    const won = g.world.outcome === 'won';
    if (g.setup.kind === 'skirmish') {
      const title = g.twoPlayers ? T.playerWins(won ? 1 : 2) : won ? T.victory : T.lost;
      const text = g.twoPlayers ? T.duoWinText : won ? T.wonText : T.lostText;
      const m = this.modal(
        `<h1>${title}</h1><p>${text}</p>
         <div class="row"><button data-setup>${T.newSkirmish}</button><button class="primary" data-restart>${T.again}</button></div>`,
      );
      m.querySelector<HTMLButtonElement>('[data-restart]')!.onclick = () => this.actions.restart();
      m.querySelector<HTMLButtonElement>('[data-setup]')!.onclick = () => this.actions.open(g.setup);
      return;
    }
    if (won) markCompleted(g.mapIndex, g.missionIndex);
    const next = won ? nextMission(g.mapIndex, g.missionIndex) : null;
    const last = won && !next;
    const m = this.modal(
      `<h1>${won ? T.won : T.lost}</h1>
       <p>${last ? T.campaignDone : won ? T.wonText : T.lostText}</p>
       <div class="row">
         <button data-restart>${T.retry}</button>
         ${next ? `<button class="primary" data-next>${T.next}</button>` : ''}
       </div>`,
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

/**
 * One side's race and team colour on the skirmish screen. The colour the other side wears cannot be picked, so the
 * two sides never look alike.
 */
function sideOptions(s: Extract<Setup, { kind: 'skirmish' }>, i: number): string {
  const T = t();
  const who = s.opponent === 'human' ? T.playerName(i + 1) : i === 0 ? T.you : T.computer;
  const taken = s.colors[1 - i];
  const swatches = TEAM_COLOR_NAMES.map((c) => {
    const ramp = TEAM_COLORS[c];
    const cls = c === s.colors[i] ? 'swatch active' : 'swatch';
    return `<button class="${cls}" data-color${i}="${c}" title="${T.color[c]}" aria-label="${T.color[c]}" style="--c: ${ramp[2]}; --c-edge: ${ramp[4]}"${c === taken ? ' disabled' : ''}></button>`;
  }).join('');
  return `<div class="option side"><span>${who}</span>${choice(`race${i}`, RACES, s.races[i]!, (r) => T.race[r])}<i class="gap"></i>${swatches}</div>`;
}

/** A small map of the skirmish: forest, crystal fields and the two starts in their team colours. */
function drawPreview(canvas: HTMLCanvasElement, mapIndex: number, colors: readonly [TeamColor, TeamColor]): void {
  const map = campaign.maps[mapIndex]!;
  const { cols, rows, blocked } = buildBlockedGrid(map);
  const layout = skirmishLayout(map);
  const px = Math.max(2, Math.floor(Math.min(470 / cols, 200 / rows)));
  canvas.width = cols * px;
  canvas.height = rows * px;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.fillStyle = '#d8c491';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#2f6b3d';
  for (let i = 0; i < blocked.length; i++) if (blocked[i]) g.fillRect((i % cols) * px, Math.floor(i / cols) * px, px, px);
  g.fillStyle = '#f0c43a';
  for (const f of layout.fields) g.fillRect(f.cx * px, f.cy * px, 2 * px, 2 * px);
  layout.starts.forEach((s, i) => {
    g.fillStyle = TEAM_COLORS[colors[i]!][2];
    g.fillRect(s.cx * px, s.cy * px, 2 * px, 2 * px);
    g.fillStyle = '#ffffff';
    g.font = `bold ${Math.max(9, px * 2)}px Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(i + 1), (s.cx + 1) * px, (s.cy + 1) * px);
  });
}

/**
 * One person's part of the interface: the selection panel with build buttons, their money and their toasts.
 * In a two-player game each half of the screen has its own; a gamepad moves a highlight over the buttons.
 */
export class PlayerPanel {
  private key = '';
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
    this.panel.onclick = (ev) => this.onClick(ev);
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
    const key = this.signature(sel);
    if (key === this.key) return;
    this.key = key;
    this.panel.innerHTML = this.html(sel);
    const buttons = this.focusable();
    buttons.forEach((b, i) => b.classList.toggle('pad-focus', c.cursor !== null && i === c.focus % buttons.length));
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
      c.focus,
      c.cursor !== null,
      sel.map((e) => [e.id, e.hp, e.order.kind, e.phase, e.cargo, e.complete, e.job ? Math.floor(('elapsedMs' in e.job ? e.job.elapsedMs : 0) / 500) : -1, Math.floor(e.buildElapsedMs / 500)]),
    ]);
  }

  /** The object's name; the other side's objects also name their race, as in "HQ · hovers". */
  private name(e: Entity): string {
    const T = t();
    const race = this.c.isFoe(e) ? raceOf(this.c.world, e.team) : null;
    return race ? `${T.names[e.type]} · ${T.raceOf[race]}` : T.names[e.type]!;
  }

  private html(sel: Entity[]): string {
    const T = t();
    const c = this.c;
    if (sel.length === 0) return `<div class="hint">${c.cursor ? T.padHint : T.hint}</div>`;
    if (sel.length > 1) {
      const counts = new Map<number, number>();
      for (const e of sel) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      const list = [...counts].map(([type, n]) => `${T.names[type]} ×${n}`).join(', ');
      return `<div class="title">${T.squad}: ${sel.length}</div><div class="info">${list}</div>${this.unitButtons()}`;
    }
    const e = sel[0]!;
    const own = c.isOwn(e);
    const hp = e.type === ObjectType.ResourceField ? `${T.resource}: ${e.hp}` : `${T.hp}: ${Math.max(0, e.hp)}/${e.maxHp}`;
    let status = '';
    if (isUnit(e.type)) {
      status = e.type === ObjectType.Harvester && e.phase ? T.phase[e.phase] : T.order[e.order.kind];
      if (e.type === ObjectType.Harvester) status += ` · ${T.cargo} ${e.cargo}/50`;
    } else if (!e.complete) status = `${T.building} ${Math.floor((e.buildElapsedMs / e.buildTotalMs) * 100)}%`;
    else if (e.job?.kind === 'produce') status = `${T.producing}: ${T.names[e.job.unit]} ${Math.floor((e.job.elapsedMs / e.job.totalMs) * 100)}%`;
    else if (e.job?.kind === 'construct') status = T.constructing;
    const team = e.team === 'neutral' ? '' : own ? 'own' : 'foe';
    let html = `<div class="title ${team}">${this.name(e)}</div><div class="info">${hp}${status ? ` · ${status}` : ''}</div>`;
    if (!own) return html;
    if (isUnit(e.type)) return html + this.unitButtons();
    if (e.type === hqType(c.side) && e.complete) {
      html += '<div class="buttons">';
      for (const type of HQ_BUILDS) html += this.buildButton(type, BUILDING_RULES[type].price, e.job !== null && type !== ObjectType.Wall);
      html += '</div>';
      if (e.job) html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">${T.cancelBuild}</button></div>`;
    } else if (e.type === ObjectType.TankFactory && e.complete) {
      html += '<div class="buttons">';
      for (const type of FACTORY_BUILDS) html += this.produceButton(type, e);
      html += '</div>';
      if (e.job) html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">${T.cancel}</button></div>`;
    } else if (!e.complete) {
      html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">${T.cancel}</button></div>`;
    }
    html += `<div class="buttons"><button class="danger" data-action="destruct" data-id="${e.id}">${T.destruct}</button></div>`;
    return html;
  }

  private buildButton(type: BuildingType, price: number, busy: boolean): string {
    const active = this.c.placing?.type === type ? ' active' : '';
    const disabled = busy || price > this.c.money ? ' disabled' : '';
    return `<button class="build${active}" data-action="place" data-type="${type}"${disabled}>${t().names[type]}<small>$${price}</small></button>`;
  }

  private produceButton(type: UnitType, factory: Entity): string {
    const price = UNIT_RULES[type].price;
    const disabled = factory.job || price > this.c.money ? ' disabled' : '';
    return `<button class="build" data-action="produce" data-type="${type}" data-id="${factory.id}"${disabled}>${t().names[type]}<small>$${price}</small></button>`;
  }

  private unitButtons(): string {
    return `<div class="buttons"><button data-action="stop">${t().stop} <small>${this.c.cursor ? '↓' : 'S'}</small></button></div>`;
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
        if (confirm(t().destructConfirm)) c.run({ kind: 'destruct', id });
        break;
      case 'stop':
        c.run({ kind: 'stop', ids: c.ownUnits().map((u) => u.id) });
        break;
    }
    this.key = '';
  }
}

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
