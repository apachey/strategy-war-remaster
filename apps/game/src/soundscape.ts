import { CELL, ObjectType, RACES, type Race } from '@sw/data';
import { isUnit, isVisibleTo, TICKS_PER_SECOND, type Entity, type GameEvent, type Side } from '@sw/sim';
import type { Placement, SfxName, Sound, VoiceAction, VoiceUnit } from './audio';
import type { Game } from './game';
import { t } from './text';
import type { View } from './view';

/** Seconds of quiet before the battle music gives way to the tension track again. */
const BATTLE_HOLD_S = 25;
/** Seconds between two "base under attack" warnings for the same side. */
const ALERT_GAP_S = 20;
/** Milliseconds the victory or defeat stinger plays before its screen's music comes in. */
const STINGER_MS = 3500;

/** Which voice a unit answers in; turrets and buildings have none. Heavier units speak first in a mixed group. */
const VOICE: Partial<Record<number, VoiceUnit>> = {
  [ObjectType.HeavyTank]: 'heavy',
  [ObjectType.MiddleTank]: 'middle',
  [ObjectType.LightTank]: 'light',
  [ObjectType.EnemyTank]: 'light',
  [ObjectType.Harvester]: 'harvester',
};
const VOICE_RANK: VoiceUnit[] = ['heavy', 'middle', 'light', 'harvester'];

/** What the gun of each object sounds like; the hover race fires its alien energy bolts whatever the object. */
const GUN: Partial<Record<number, SfxName>> = {
  [ObjectType.LightTank]: 'shot_light',
  [ObjectType.EnemyTank]: 'shot_light',
  [ObjectType.MiddleTank]: 'shot_middle',
  [ObjectType.HeavyTank]: 'shot_heavy',
  [ObjectType.Defender]: 'shot_defender',
};

/**
 * Turns the match into sound: sim events into effects placed where they happen (heard only where someone at this Mac
 * has looked), the people's own news (a unit ready, the base under attack) into interface sounds, and the state of
 * the match into music: the main theme on the briefing, tension while building up, battle while fighting. Harvesters
 * at work and the map itself (wind, firs, crystals, the base, a working factory) are loops turned up and down by
 * what is on screen.
 */
export class Soundscape {
  private lastCombatTick = -1e9;
  private readonly lastAlertTick = new Map<Side, number>();
  private readonly hp = new Map<number, number>();
  private ended = false;
  private endedAt = 0;

  constructor(
    private readonly sound: Sound,
    private readonly game: Game,
    private readonly views: View[],
  ) {}

  private get locals(): Side[] {
    return this.game.commanders.map((c) => c.side);
  }

  /** Loudness and stereo position of a map point, from the nearest view; silent where nobody here has looked. */
  placement(x: number, y: number): Placement {
    const w = this.game.world;
    const cell = Math.floor(y / CELL) * w.cols + Math.floor(x / CELL);
    if (!this.locals.some((s) => w.sides[s].explored[cell])) return { gain: 0, pan: 0 };
    let best: Placement = { gain: 0, pan: 0 };
    for (const v of this.views) {
      const p = v.toScreen(x, y);
      const r = v.rect;
      const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
      const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
      const gain = Math.max(0, 1 - Math.hypot(dx, dy) / 700) * (dx || dy ? 0.6 : 1);
      const pan = Math.max(-1, Math.min(1, (p.x - (r.x + r.w / 2)) / (r.w / 2))) * 0.6;
      if (gain > best.gain) best = { gain, pan };
    }
    return best;
  }

  /** Call after every sim step. */
  afterStep(events: readonly GameEvent[]): void {
    const w = this.game.world;
    const locals = this.locals;
    for (const ev of events) {
      if (ev.kind === 'shot') {
        const race = w.sides[ev.team].race;
        const at = this.placement(ev.x, ev.y);
        this.sound.play(race === 'hover' ? 'shot_alien' : (GUN[ev.by] ?? 'shot_middle'), at);
        if (at.gain > 0.3 || locals.includes(ev.team)) this.lastCombatTick = w.tick;
      } else if (ev.kind === 'hit') {
        const at = this.placement(ev.x, ev.y);
        this.sound.play('impact', { gain: at.gain * (ev.weapon === 'gun' ? 0.6 : 1), pan: at.pan });
      } else if (ev.kind === 'destroyed') {
        if (ev.type === ObjectType.ResourceField) continue;
        const big = !isUnit(ev.type) && ev.type !== ObjectType.Wall;
        this.sound.play(big ? 'explosion_big' : 'explosion_small', this.placement(ev.x + ev.size / 2, ev.y + ev.size / 2));
      } else if (ev.kind === 'completed') {
        const e = w.byId.get(ev.id);
        if (!e || !locals.includes(e.team as Side)) continue;
        const unit = VOICE[ev.type];
        if (unit) this.sound.voice(w.sides[e.team as Side].race, unit, 'ready');
        else this.sound.play(isUnit(ev.type) ? 'unit_ready' : 'build_done', { gain: 0.9, pan: 0 });
      }
    }
    for (const e of w.entities) {
      if (!locals.includes(e.team as Side)) continue;
      if (!isUnit(e.type)) {
        const before = this.hp.get(e.id);
        this.hp.set(e.id, e.hp);
        const side = e.team as Side;
        if (before === undefined || e.hp >= before || !e.complete) continue;
        if (w.tick - (this.lastAlertTick.get(side) ?? -1e9) < ALERT_GAP_S * TICKS_PER_SECOND) continue;
        this.lastAlertTick.set(side, w.tick);
        this.sound.play('alert', { gain: 1, pan: 0 });
        this.game.commanders.find((c) => c.side === side)?.onToast(t().underAttack);
      }
    }
  }

  /** Call every frame: picks the music, and plays the stinger once the match is decided. */
  update(): void {
    const g = this.game;
    const w = g.world;
    // In a two-player game somebody here always wins.
    const won = w.outcome === 'won' || g.twoPlayers;
    if (w.outcome !== 'playing') {
      if (!this.ended) {
        this.ended = true;
        this.endedAt = performance.now();
        this.sound.music(null);
        this.silence();
        this.sound.play(won ? 'victory' : 'defeat', { gain: 1, pan: 0 });
      } else if (performance.now() - this.endedAt > STINGER_MS) this.sound.music(won ? 'victory' : 'defeat');
      return;
    }
    if (g.started) this.loops();
    else this.silence();
    if (!g.started) this.sound.music('theme');
    else this.sound.music(w.tick - this.lastCombatTick < BATTLE_HOLD_S * TICKS_PER_SECOND ? 'battle' : 'tension');
  }

  /** A group of this side's units answering an order: the heaviest of them speaks for all. */
  acknowledge(side: Side, ids: number[], action: 'move' | 'attack' | 'harvest'): void {
    const w = this.game.world;
    let lead: VoiceUnit | null = null;
    for (const id of ids) {
      const u = VOICE[w.byId.get(id)?.type ?? -1];
      if (u && (!lead || VOICE_RANK.indexOf(u) < VOICE_RANK.indexOf(lead))) lead = u;
    }
    if (!lead) return this.sound.play('order', { gain: 0.7, pan: 0 });
    // Harvesters cannot attack and tanks do not harvest: either one simply moves off.
    const said: VoiceAction = action === (lead === 'harvester' ? 'attack' : 'harvest') ? 'move' : action;
    this.sound.voice(w.sides[side].race, lead, said);
  }

  private silence(): void {
    for (const r of RACES) this.sound.loop(`harvest_${r}`, 0);
    for (const a of ['amb_wind', 'amb_forest', 'amb_crystals', 'amb_base', 'amb_factory'] as const) this.sound.loop(a, 0);
  }

  /** Harvesting and ambience loops from what the people here can see. */
  private loops(): void {
    const w = this.game.world;
    const locals = this.locals;
    // Harvesters: one loop per race, as loud as the nearest one; more of them only thicken it a little.
    const dig = new Map<Race, { at: Placement; n: number }>();
    for (const e of w.entities) {
      if (e.type !== ObjectType.Harvester || e.phase !== 'loading' || e.hidden) continue;
      if (!locals.some((s) => isVisibleTo(w, s, e))) continue;
      const race = w.sides[e.team as Side].race;
      const at = this.placement(e.x + CELL / 2, e.y + CELL / 2);
      const d = dig.get(race);
      if (!d) dig.set(race, { at, n: 1 });
      else {
        d.n++;
        if (at.gain > d.at.gain) d.at = at;
      }
    }
    for (const r of RACES) {
      const d = dig.get(r);
      this.sound.loop(`harvest_${r}`, d ? d.at.gain * Math.min(1.3, 1 + 0.1 * (d.n - 1)) : 0, d?.at.pan ?? 0);
    }
    // Ambience from what is inside the views: the share of fir cells, crystal fields, own buildings, a busy factory.
    let forest = 0;
    let crystals = 0;
    let base = 0;
    let factory: Placement = { gain: 0, pan: 0 };
    for (const v of this.views) {
      const a = v.toWorld(v.rect.x, v.rect.y);
      const b = v.toWorld(v.rect.x + v.rect.w, v.rect.y + v.rect.h);
      const c0 = Math.max(0, Math.floor(a.x / CELL));
      const c1 = Math.min(w.cols, Math.ceil(b.x / CELL));
      const r0 = Math.max(0, Math.floor(a.y / CELL));
      const r1 = Math.min(w.rows, Math.ceil(b.y / CELL));
      let firs = 0;
      for (let r = r0; r < r1; r++) {
        for (let c = c0; c < c1; c++) {
          const i = r * w.cols + c;
          if (w.blocked[i] && locals.some((s) => w.sides[s].explored[i])) firs++;
        }
      }
      forest = Math.max(forest, Math.min(1, (firs / Math.max(1, (c1 - c0) * (r1 - r0))) * 4));
      const inside = (e: Entity) => e.x + e.size > a.x && e.x < b.x && e.y + e.size > a.y && e.y < b.y;
      let fields = 0;
      let own = 0;
      for (const e of w.entities) {
        if (!inside(e)) continue;
        if (e.type === ObjectType.ResourceField) {
          if (locals.some((s) => isVisibleTo(w, s, e))) fields++;
        } else if (!isUnit(e.type) && e.type !== ObjectType.Wall && e.complete && locals.includes(e.team as Side)) {
          own++;
          if (e.type === ObjectType.TankFactory && e.job?.kind === 'produce') {
            const at = this.placement(e.x + e.size / 2, e.y + e.size / 2);
            if (at.gain > factory.gain) factory = at;
          }
        }
      }
      crystals = Math.max(crystals, Math.min(1, fields / 6));
      base = Math.max(base, Math.min(1, own / 4));
    }
    this.sound.loop('amb_wind', 1 - 0.4 * Math.max(forest, base));
    this.sound.loop('amb_forest', forest);
    this.sound.loop('amb_crystals', crystals);
    this.sound.loop('amb_base', base);
    this.sound.loop('amb_factory', factory.gain, factory.pan);
  }
}
