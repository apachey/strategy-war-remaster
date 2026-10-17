import sfxList from '../../../assets/sfx/sfx.json';
import battleUrl from '../../../assets/music/battle.m4a?url';
import mainThemeUrl from '../../../assets/music/main-theme.m4a?url';
import tensionUrl from '../../../assets/music/tension.m4a?url';

/**
 * Music and sound effects from tools/music. Effects play through Web Audio (short WAVs need sample-accurate starts),
 * each at the gain sfx.json suggests; the music streams from <audio> elements and crossfades between tracks. Browsers
 * and the Mac app only allow sound after the first click or key press, so both wait for one.
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
  | 'harvest'
  | 'unload'
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
  | 'defeat';

export type Track = 'theme' | 'tension' | 'battle';

const TRACKS: Record<Track, string> = { theme: mainThemeUrl, tension: tensionUrl, battle: battleUrl };

const sfxUrls = import.meta.glob('../../../assets/sfx/*.wav', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const GAIN = new Map((sfxList as Array<{ name: string; gain: number }>).map((s) => [s.name, s.gain]));

/** The shortest gap between two starts of the same effect: a volley of ten guns is one bang, not a buzz. */
const MIN_GAP_MS: Partial<Record<SfxName, number>> = { impact: 90, shot_light: 70, shot_alien: 70, harvest: 400, unload: 400, select: 60 };
const DEFAULT_GAP_MS = 50;
const FADE_MS = 1500;

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
  private readonly players = new Map<Track, HTMLAudioElement>();
  private current: Track | null = null;
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
      if (this.wanted && !this.current) this.music(this.wanted);
      else if (this.current) void this.players.get(this.current)?.play().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
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
    if (this.current) this.players.get(this.current)!.volume = music;
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

  /** Switches the music to `track` (null: silence), fading the old one out and the new one in. */
  music(track: Track | null): void {
    this.wanted = track;
    if (track === this.current || !this.unlocked) return;
    const old = this.current ? this.players.get(this.current) : null;
    this.current = track;
    let next: HTMLAudioElement | null = null;
    if (track) {
      next = this.players.get(track) ?? null;
      if (!next) {
        next = new Audio(TRACKS[track]);
        next.loop = true;
        this.players.set(track, next);
      }
      next.volume = 0;
      void next.play().catch(() => {});
    }
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
