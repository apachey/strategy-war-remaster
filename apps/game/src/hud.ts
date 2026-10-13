import { campaign, LANGS, ObjectType, type Lang } from '@sw/data';
import {
  BUILDING_RULES,
  DIFFICULTIES,
  FACTORY_BUILDS,
  HQ_BUILDS,
  isUnit,
  UNIT_RULES,
  type BuildingType,
  type Difficulty,
  type Entity,
  type UnitType,
} from '@sw/sim';
import { nextMission, SIDE, type Game } from './game';
import { completed, markCompleted, readSave, SLOTS, type Slot } from './storage';
import { getLang, mapName, missionBrief, missionTitle, t } from './text';

const LANG_NAMES: Record<Lang, string> = { uk: 'Українська', en: 'English' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface HudActions {
  startMission(mapIndex: number, missionIndex: number): void;
  restart(): void;
  next(): void;
  save(slot: Slot): void;
  load(slot: Slot): void;
  setLang(lang: Lang): void;
  setDifficulty(difficulty: Difficulty): void;
}

/** DOM interface over the canvas: top bar, selection panel with build buttons, toasts and dialogs. */
export class Hud {
  private panelKey = '';
  private toastTimer = 0;
  private shownOutcome = false;

  constructor(
    private readonly game: Game,
    private readonly actions: HudActions,
  ) {
    game.onToast = (t) => this.toast(t);
    $('panel').onclick = (ev) => this.onPanelClick(ev);
    $('btn-pause').onclick = () => this.togglePause();
    $('btn-missions').onclick = () => this.showMissions();
    $('btn-saves').onclick = () => this.showSaves();
    this.applyLang();
    if (game.loaded) game.started = true;
    else this.showBriefing();
  }

  /** Fills the static page text in the current language. */
  applyLang(): void {
    $('btn-missions').textContent = t().missions;
    $('btn-saves').textContent = t().saves;
    $('help').textContent = t().help;
    this.panelKey = '';
  }

  togglePause(): void {
    if (!this.game.started || this.game.world.outcome !== 'playing') return;
    this.game.paused = !this.game.paused;
  }

  update(): void {
    const g = this.game;
    $('hud').textContent = `${mapName(g.mapIndex)} · ${missionTitle(g.mapIndex, g.missionIndex)} · ${t().difficulty[g.difficulty]}`;
    $('money').textContent = `$${g.money}`;
    $('btn-pause').textContent = g.paused ? t().resume : t().pause;
    document.body.classList.toggle('paused', g.paused && g.started);
    this.updatePanel();
    if (g.world.outcome !== 'playing' && !this.shownOutcome) {
      this.shownOutcome = true;
      this.showOutcome();
    }
  }

  toast(text: string): void {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
  }

  private updatePanel(): void {
    const sel = this.game.selected();
    const key = this.panelSignature(sel);
    if (key === this.panelKey) return;
    this.panelKey = key;
    $('panel').innerHTML = this.panelHtml(sel);
  }

  private panelSignature(sel: Entity[]): string {
    const g = this.game;
    return JSON.stringify([
      getLang(),
      g.money,
      g.placing?.type ?? null,
      sel.map((e) => [e.id, e.hp, e.order.kind, e.phase, e.cargo, e.complete, e.job ? Math.floor(('elapsedMs' in e.job ? e.job.elapsedMs : 0) / 500) : -1, Math.floor(e.buildElapsedMs / 500)]),
    ]);
  }

  private panelHtml(sel: Entity[]): string {
    const T = t();
    const NAMES = T.names;
    if (sel.length === 0) return `<div class="hint">${T.hint}</div>`;
    if (sel.length > 1) {
      const counts = new Map<number, number>();
      for (const e of sel) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      const list = [...counts].map(([type, n]) => `${NAMES[type]} ×${n}`).join(', ');
      return `<div class="title">${T.squad}: ${sel.length}</div><div class="info">${list}</div>${this.unitButtons()}`;
    }
    const e = sel[0]!;
    const own = e.team === SIDE;
    const hp = e.type === ObjectType.ResourceField ? `${T.resource}: ${e.hp}` : `${T.hp}: ${Math.max(0, e.hp)}/${e.maxHp}`;
    let status = '';
    if (isUnit(e.type)) {
      status = e.type === ObjectType.Harvester && e.phase ? T.phase[e.phase] : T.order[e.order.kind];
      if (e.type === ObjectType.Harvester) status += ` · ${T.cargo} ${e.cargo}/50`;
    } else if (!e.complete) status = `${T.building} ${Math.floor((e.buildElapsedMs / e.buildTotalMs) * 100)}%`;
    else if (e.job?.kind === 'produce') status = `${T.producing}: ${NAMES[e.job.unit]} ${Math.floor((e.job.elapsedMs / e.job.totalMs) * 100)}%`;
    else if (e.job?.kind === 'construct') status = T.constructing;
    let html = `<div class="title ${e.team}">${NAMES[e.type]}</div><div class="info">${hp}${status ? ` · ${status}` : ''}</div>`;
    if (!own) return html;
    if (isUnit(e.type)) return html + this.unitButtons();
    if (e.type === ObjectType.PlayerHQ && e.complete) {
      html += '<div class="buttons">';
      for (const t of HQ_BUILDS) html += this.buildButton(t, BUILDING_RULES[t].price, e.job !== null && t !== ObjectType.Wall);
      html += '</div>';
      if (e.job) html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">${T.cancelBuild}</button></div>`;
    } else if (e.type === ObjectType.TankFactory && e.complete) {
      html += '<div class="buttons">';
      for (const t of FACTORY_BUILDS) html += this.produceButton(t, e);
      html += '</div>';
      if (e.job) html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">${T.cancel}</button></div>`;
    } else if (!e.complete) {
      html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">${T.cancel}</button></div>`;
    }
    html += `<div class="buttons"><button class="danger" data-action="destruct" data-id="${e.id}">${T.destruct}</button></div>`;
    return html;
  }

  private buildButton(type: BuildingType, price: number, busy: boolean): string {
    const active = this.game.placing?.type === type ? ' active' : '';
    const disabled = busy || price > this.game.money ? ' disabled' : '';
    return `<button class="build${active}" data-action="place" data-type="${type}"${disabled}>${t().names[type]}<small>$${price}</small></button>`;
  }

  private produceButton(type: UnitType, factory: Entity): string {
    const price = UNIT_RULES[type].price;
    const disabled = factory.job || price > this.game.money ? ' disabled' : '';
    return `<button class="build" data-action="produce" data-type="${type}" data-id="${factory.id}"${disabled}>${t().names[type]}<small>$${price}</small></button>`;
  }

  private unitButtons(): string {
    return `<div class="buttons"><button data-action="stop">${t().stop} <small>S</small></button></div>`;
  }

  private onPanelClick(ev: MouseEvent): void {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn || btn.disabled) return;
    const g = this.game;
    const id = Number(btn.dataset.id);
    const type = Number(btn.dataset.type);
    switch (btn.dataset.action) {
      case 'place':
        if (g.placing?.type === type) g.placing = null;
        else g.startPlacing(type as BuildingType);
        break;
      case 'produce':
        g.run({ kind: 'produce', factoryId: id, unit: type as UnitType });
        break;
      case 'cancel':
        g.run({ kind: 'cancel', id });
        break;
      case 'destruct':
        if (confirm(t().destructConfirm)) g.run({ kind: 'destruct', id });
        break;
      case 'stop':
        g.run({ kind: 'stop', ids: g.ownUnits().map((u) => u.id) });
        break;
    }
    this.panelKey = '';
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
    const g = this.game;
    const T = t();
    const choice = <V extends string>(attr: string, values: readonly V[], current: V, label: (v: V) => string) =>
      values.map((v) => `<button data-${attr}="${v}"${v === current ? ' class="active"' : ''}>${label(v)}</button>`).join('');
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
    m.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => {
      b.onclick = () => {
        this.actions.setLang(b.dataset.lang as Lang);
        this.applyLang();
        this.showBriefing();
      };
    });
    m.querySelector<HTMLButtonElement>('[data-go]')!.onclick = () => {
      this.closeModal();
      g.started = true;
    };
  }

  private showOutcome(): void {
    const g = this.game;
    const T = t();
    const won = g.world.outcome === 'won';
    if (won) markCompleted(g.mapIndex, g.missionIndex);
    const last = won && !nextMission(g.mapIndex, g.missionIndex);
    const m = this.modal(
      `<h1>${won ? T.won : T.lost}</h1>
       <p>${last ? T.campaignDone : won ? T.wonText : T.lostText}</p>
       <div class="row">
         <button data-restart>${T.retry}</button>
         ${won && !last ? `<button class="primary" data-next>${T.next}</button>` : ''}
       </div>`,
    );
    m.querySelector<HTMLButtonElement>('[data-restart]')!.onclick = () => this.actions.restart();
    m.querySelector<HTMLButtonElement>('[data-next]')?.addEventListener('click', () => this.actions.next());
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
      b.onclick = () => this.actions.startMission(Number(b.dataset.m), Number(b.dataset.s));
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
      const info = s
        ? `${s.mapIndex + 1}.${s.missionIndex + 1} ${missionTitle(s.mapIndex, s.missionIndex)} · ${T.difficulty[s.world.world.difficulty]} · ${new Date(s.savedAt).toLocaleString(getLang())}`
        : T.empty;
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
