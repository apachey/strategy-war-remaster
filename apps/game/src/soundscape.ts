import { CELL, ObjectType } from '@sw/data';
import { isUnit, TICKS_PER_SECOND, type GameEvent, type HarvestPhase, type Side } from '@sw/sim';
import type { Placement, SfxName, Sound } from './audio';
import type { Game } from './game';
import { t } from './text';
import type { View } from './view';

/** Seconds of quiet before the battle music gives way to the tension track again. */
const BATTLE_HOLD_S = 25;
/** Seconds between two "base under attack" warnings for the same side. */
const ALERT_GAP_S = 20;

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
 * the match into music: the main theme on the briefing, tension while building up, battle while fighting.
 */
export class Soundscape {
  private lastCombatTick = -1e9;
  private readonly lastAlertTick = new Map<Side, number>();
  private readonly hp = new Map<number, number>();
  private readonly phases = new Map<number, HarvestPhase | null>();
  private ended = false;

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
        if (e && locals.includes(e.team as Side)) this.sound.play(isUnit(ev.type) ? 'unit_ready' : 'build_done', { gain: 0.9, pan: 0 });
      }
    }
    for (const e of w.entities) {
      if (!locals.includes(e.team as Side)) continue;
      if (e.type === ObjectType.Harvester) {
        const before = this.phases.get(e.id);
        if (before !== undefined && before !== e.phase) {
          if (e.phase === 'loading') this.sound.play('harvest', this.placement(e.x + CELL / 2, e.y + CELL / 2));
          if (e.phase === 'unloading') this.sound.play('unload', this.placement(e.x + CELL / 2, e.y + CELL / 2));
        }
        this.phases.set(e.id, e.phase);
      } else if (!isUnit(e.type)) {
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
    if (w.outcome !== 'playing') {
      if (this.ended) return;
      this.ended = true;
      this.sound.music(null);
      // In a two-player game somebody here always wins.
      this.sound.play(w.outcome === 'won' || g.twoPlayers ? 'victory' : 'defeat', { gain: 1, pan: 0 });
      return;
    }
    if (!g.started) this.sound.music('theme');
    else this.sound.music(w.tick - this.lastCombatTick < BATTLE_HOLD_S * TICKS_PER_SECOND ? 'battle' : 'tension');
  }
}
