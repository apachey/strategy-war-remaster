import type { Race } from '@sw/data';
import sfxList from '../../../assets/sfx/sfx.json';
import battle2Url from '../../../assets/music/battle-2.m4a?url';
import battle3Url from '../../../assets/music/battle-3.m4a?url';
import battleUrl from '../../../assets/music/battle.m4a?url';
import defeatUrl from '../../../assets/music/defeat.m4a?url';
import mainThemeUrl from '../../../assets/music/main-theme.m4a?url';
import tension2Url from '../../../assets/music/tension-2.m4a?url';
import tension3Url from '../../../assets/music/tension-3.m4a?url';
import tensionUrl from '../../../assets/music/tension.m4a?url';
import victoryUrl from '../../../assets/music/victory.m4a?url';

/**
 * Music and sound effects from tools/music. Effects play through Web Audio (short WAVs need sample-accurate starts),
 * each at the gain sfx.json suggests; the music streams from <audio> elements and crossfades between tracks. Browsers
 * and the Mac app only allow sound after the first click or key press, so both wait for one. Loops (harvesting, map
 * ambience) run continuously once started and are only turned up and down. Tension and battle have three tracks
 * each: when one ends the next starts, never the same twice in a row.
 */

export type SfxName =
  | 'shot_light'
  | 'shot_middle'
  | 'shot_heavy'
  | 'shot_defender'
  | 'shot_alien'
  | 'impact'
  | 'explosion_small'
  | 'explosion_big'
  | 'build_start'
  | 'build_done'
  | 'unit_ready'
  | 'select'
  | 'order'
  | 'click'
  | 'error'
  | 'alert'
  | 'self_destruct'
  | 'victory'
  | 'defeat'
  | `voice_${string}`;

export type LoopName = `harvest_${Race}` | 'amb_wind' | 'amb_forest' | 'amb_crystals' | 'amb_base' | 'amb_factory';
export type VoiceUnit = 'harvester' | 'light' | 'middle' | 'heavy';
export type VoiceAction = 'ready' | 'move' | 'attack' | 'harvest';
/** Variants rendered per unit acknowledgement (tools/music/src/voices.ts). */
const VOICE_VARIANTS = 3;

export type Track = 'theme' | 'tension' | 'battle' | 'victory' | 'defeat';

const TRACKS: Record<Track, string[]> = {
  theme: [mainThemeUrl],
  tension: [tensionUrl, tension2Url, tension3Url],
  battle: [battleUrl, battle2Url, battle3Url],
  victory: [victoryUrl],
  defeat: [defeatUrl],
};

const sfxUrls = import.meta.glob('../../../assets/sfx/*.wav', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const GAIN = new Map((sfxList as Array<{ name: string; gain: number }>).map((s) => [s.name, s.gain]));

/** The shortest gap between two starts of the same effect: a volley of ten guns is one bang, not a buzz. */
const MIN_GAP_MS: Partial<Record<SfxName, number>> = { impact: 90, shot_light: 70, shot_alien: 70, select: 60 };
const DEFAULT_GAP_MS = 50;
const FADE_MS = 1500;
/** The shortest gap between two unit acknowledgements, so a box of tanks answers once. */
const VOICE_GAP_MS = 180;

/** Where a sound comes from: how loud (0..1) and how far left or right (-1..1) the listener hears it. */
export interface Placement {
  gain: number;
  pan: number;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly lastStart = new Map<string, number>();
  private readonly loops = new Map<string, { gain: GainNode; pan: StereoPannerNode; target: number }>();
  private readonly lastVariant = new Map<string, number>();
  private lastVoice = -1e9;
  private readonly players = new Map<string, HTMLAudioElement>();
  private current: HTMLAudioElement | null = null;
  private mood: Track | null = null;
  private wanted: Track | null = null;
  private unlocked = false;
  private fadeTimer = 0;

  constructor(
    private musicVolume: number,
    private sfxVolume: number,
  ) {
    const unlock = () => {
      this.unlocked = true;
      this.ensureContext();
      void this.ctx?.resume();
      if (this.wanted && !this.mood) this.music(this.wanted);
      else void this.current?.play().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    // A tension or battle track about to end hands over to another one of its mood.
    window.setInterval(() => {
      const c = this.current;
      if (!c || !this.mood || TRACKS[this.mood].length < 2 || !Number.isFinite(c.duration)) return;
      if (c.duration - c.currentTime < FADE_MS / 1000 + 0.2) this.crossfade(this.pick(this.mood));
    }, 250);
  }

  private ensureContext(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.ctx.destination);
      for (const [path, url] of Object.entries(sfxUrls)) {
        const name = path.split('/').pop()!.replace('.wav', '');
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((data) => this.ctx!.decodeAudioData(data))
          .then((buffer) => this.buffers.set(name, buffer))
          .catch(() => {});
      }
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.sfxBus) this.sfxBus.gain.value = sfx;
    if (this.current) this.current.volume = music;
  }

  /** Plays an effect, `at` a place on the map (quieter and to one side when off screen), or in the interface. */
  play(name: SfxName, at: Placement = { gain: 1, pan: 0 }): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !buffer || !this.sfxBus || at.gain <= 0.02 || this.sfxVolume <= 0) return;
    const now = performance.now();
    if (now - (this.lastStart.get(name) ?? -1e9) < (MIN_GAP_MS[name] ?? DEFAULT_GAP_MS)) return;
    this.lastStart.set(name, now);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = (GAIN.get(name) ?? 0.6) * at.gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, at.pan));
    src.connect(gain).connect(pan).connect(this.sfxBus);
    src.start();
  }

  /** A unit acknowledging an order or reporting ready, in its race's radio language; a different variant each time. */
  voice(race: Race, unit: VoiceUnit, action: VoiceAction): void {
    const now = performance.now();
    if (now - this.lastVoice < VOICE_GAP_MS) return;
    this.lastVoice = now;
    const key = `voice_${race}_${unit}_${action}` as const;
    const v = this.variant(key, VOICE_VARIANTS);
    this.play(`${key}_${v}`, { gain: 0.9, pan: 0 });
  }

  /** A random index below `count`, never the one `key` got last time. */
  private variant(key: string, count: number): number {
    const last = this.lastVariant.get(key);
    let v = Math.floor(Math.random() * (last === undefined ? count : count - 1));
    if (last !== undefined && v >= last) v++;
    this.lastVariant.set(key, v);
    return v;
  }

  /** Keeps a loop running at `gain` (0..1, 0 silences it) and `pan`; call every frame, changes glide in smoothly. */
  loop(name: LoopName, gain: number, pan = 0): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !buffer || !this.sfxBus) return;
    let l = this.loops.get(name);
    if (!l) {
      if (gain <= 0.01) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = ctx.createStereoPanner();
      src.connect(g).connect(p).connect(this.sfxBus);
      src.start();
      l = { gain: g, pan: p, target: 0 };
      this.loops.set(name, l);
    }
    const target = (GAIN.get(name) ?? 0.2) * Math.max(0, gain);
    if (Math.abs(target - l.target) < 0.004) return;
    l.target = target;
    l.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
    l.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime, 0.3);
  }

  /** Switches the music to `track` (null: silence), fading the old one out and the new one in. */
  music(track: Track | null): void {
    this.wanted = track;
    if (track === this.mood || !this.unlocked) return;
    this.mood = track;
    this.crossfade(track ? this.pick(track) : null);
  }

  /** One of the mood's tracks, not the one playing now. */
  private pick(track: Track): string {
    const list = TRACKS[track];
    return list[this.variant(`music_${track}`, list.length)]!;
  }

  private crossfade(url: string | null): void {
    const old = this.current;
    let next: HTMLAudioElement | null = null;
    if (url) {
      next = this.players.get(url) ?? null;
      if (!next) {
        next = new Audio(url);
        this.players.set(url, next);
      }
      // Moods with one track loop it; the others hand over to the next track when it ends.
      next.loop = !this.mood || TRACKS[this.mood].length < 2;
      if (next !== old) {
        next.currentTime = 0;
        next.volume = 0;
      }
      void next.play().catch(() => {});
    }
    this.current = next;
    if (next === old) return;
    // A fade cut short leaves its old track behind: stop everything but the two in this fade.
    for (const p of this.players.values()) if (p !== old && p !== next) p.pause();
    clearInterval(this.fadeTimer);
    const started = performance.now();
    const from = old?.volume ?? 0;
    this.fadeTimer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - started) / FADE_MS);
      if (old) old.volume = from * (1 - k);
      if (next) next.volume = this.musicVolume * k;
      if (k >= 1) {
        clearInterval(this.fadeTimer);
        old?.pause();
      }
    }, 50);
  }
}
