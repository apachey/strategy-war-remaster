import { campaign, ObjectType } from '@sw/data';
import { BUILDING_RULES, FACTORY_BUILDS, HQ_BUILDS, isUnit, UNIT_RULES, type BuildingType, type Entity, type UnitType } from '@sw/sim';
import { SIDE, type Game } from './game';
import { NAMES, ORDER_TEXT, PHASE_TEXT } from './text';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface HudActions {
  startMission(mapIndex: number, missionIndex: number): void;
  restart(): void;
  next(): void;
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
    this.showBriefing();
  }

  togglePause(): void {
    if (!this.game.started || this.game.world.outcome !== 'playing') return;
    this.game.paused = !this.game.paused;
  }

  update(): void {
    const g = this.game;
    $('hud').textContent = `${g.map.name} · ${g.mission.title}`;
    $('money').textContent = `$${g.money}`;
    $('btn-pause').textContent = g.paused ? '▶ Далі' : '⏸ Пауза';
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
      g.money,
      g.placing?.type ?? null,
      sel.map((e) => [e.id, e.hp, e.order.kind, e.phase, e.cargo, e.complete, e.job ? Math.floor(('elapsedMs' in e.job ? e.job.elapsedMs : 0) / 500) : -1, Math.floor(e.buildElapsedMs / 500)]),
    ]);
  }

  private panelHtml(sel: Entity[]): string {
    if (sel.length === 0) return `<div class="hint">Виділіть юніт або будівлю. ПКМ дає наказ.</div>`;
    if (sel.length > 1) {
      const counts = new Map<number, number>();
      for (const e of sel) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      const list = [...counts].map(([t, n]) => `${NAMES[t]} ×${n}`).join(', ');
      return `<div class="title">Загін: ${sel.length}</div><div class="info">${list}</div>${this.unitButtons()}`;
    }
    const e = sel[0]!;
    const own = e.team === SIDE;
    const hp = e.type === ObjectType.ResourceField ? `Ресурс: ${e.hp}` : `Міцність: ${Math.max(0, e.hp)}/${e.maxHp}`;
    let status = '';
    if (isUnit(e.type)) {
      status = e.type === ObjectType.Harvester && e.phase ? PHASE_TEXT[e.phase] : ORDER_TEXT[e.order.kind];
      if (e.type === ObjectType.Harvester) status += ` · вантаж ${e.cargo}/50`;
    } else if (!e.complete) status = `будується ${Math.floor((e.buildElapsedMs / e.buildTotalMs) * 100)}%`;
    else if (e.job?.kind === 'produce') status = `випускає: ${NAMES[e.job.unit]} ${Math.floor((e.job.elapsedMs / e.job.totalMs) * 100)}%`;
    else if (e.job?.kind === 'construct') status = 'будує';
    let html = `<div class="title ${e.team}">${NAMES[e.type]}</div><div class="info">${hp}${status ? ` · ${status}` : ''}</div>`;
    if (!own) return html;
    if (isUnit(e.type)) return html + this.unitButtons();
    if (e.type === ObjectType.PlayerHQ && e.complete) {
      html += '<div class="buttons">';
      for (const t of HQ_BUILDS) html += this.buildButton(t, BUILDING_RULES[t].price, e.job !== null && t !== ObjectType.Wall);
      html += '</div>';
      if (e.job) html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">✕ Скасувати будівництво</button></div>`;
    } else if (e.type === ObjectType.TankFactory && e.complete) {
      html += '<div class="buttons">';
      for (const t of FACTORY_BUILDS) html += this.produceButton(t, e);
      html += '</div>';
      if (e.job) html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">✕ Скасувати</button></div>`;
    } else if (!e.complete) {
      html += `<div class="buttons"><button data-action="cancel" data-id="${e.id}">✕ Скасувати</button></div>`;
    }
    html += `<div class="buttons"><button class="danger" data-action="destruct" data-id="${e.id}">Самознищення</button></div>`;
    return html;
  }

  private buildButton(t: BuildingType, price: number, busy: boolean): string {
    const active = this.game.placing?.type === t ? ' active' : '';
    const disabled = busy || price > this.game.money ? ' disabled' : '';
    return `<button class="build${active}" data-action="place" data-type="${t}"${disabled}>${NAMES[t]}<small>$${price}</small></button>`;
  }

  private produceButton(t: UnitType, factory: Entity): string {
    const price = UNIT_RULES[t].price;
    const disabled = factory.job || price > this.game.money ? ' disabled' : '';
    return `<button class="build" data-action="produce" data-type="${t}" data-id="${factory.id}"${disabled}>${NAMES[t]}<small>$${price}</small></button>`;
  }

  private unitButtons(): string {
    return `<div class="buttons"><button data-action="stop">■ Стоп <small>S</small></button></div>`;
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
        if (confirm('Знищити обʼєкт?')) g.run({ kind: 'destruct', id });
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
    const brief = g.mission.brief || 'Без брифінгу. Знищте ворожий штаб.';
    const m = this.modal(
      `<div class="kicker">Мапа ${g.mapIndex + 1} · місія ${g.missionIndex + 1}</div>
       <h1>${g.mission.title}</h1>
       <p class="brief">${brief}</p>
       <p class="goal">Мета: знищити ворожий штаб. Не втратьте свій.</p>
       <div class="row"><button class="primary" data-go>Почати</button></div>`,
    );
    m.querySelector<HTMLButtonElement>('[data-go]')!.onclick = () => {
      this.closeModal();
      g.started = true;
    };
  }

  private showOutcome(): void {
    const won = this.game.world.outcome === 'won';
    const m = this.modal(
      `<h1>${won ? 'Місію виконано' : 'Поразка'}</h1>
       <p>${won ? 'Ворожий штаб знищено.' : 'Ваш штаб знищено.'}</p>
       <div class="row">
         <button data-restart>Ще раз</button>
         ${won ? '<button class="primary" data-next>Наступна місія</button>' : ''}
       </div>`,
    );
    m.querySelector<HTMLButtonElement>('[data-restart]')!.onclick = () => this.actions.restart();
    m.querySelector<HTMLButtonElement>('[data-next]')?.addEventListener('click', () => this.actions.next());
  }

  showMissions(): void {
    const wasPaused = this.game.paused;
    this.game.paused = true;
    let list = '';
    campaign.maps.forEach((map, mi) => {
      list += `<div class="map"><b>${mi + 1}. ${map.name}</b>`;
      map.missions.forEach((ms, si) => {
        list += `<button data-m="${mi}" data-s="${si}">${si + 1}. ${ms.title}</button>`;
      });
      list += '</div>';
    });
    const m = this.modal(`<h1>Місії</h1><div class="missions">${list}</div><div class="row"><button data-close>Закрити</button></div>`);
    m.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => {
      b.onclick = () => this.actions.startMission(Number(b.dataset.m), Number(b.dataset.s));
    });
    m.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => {
      this.closeModal();
      this.game.paused = wasPaused;
      if (!this.game.started) this.showBriefing();
    };
  }
}
