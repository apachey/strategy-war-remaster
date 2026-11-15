import { campaign } from '@sw/data';
import { createSkirmish, type SkirmishOptions } from './skirmish';
import { createWorld, issue, SIDES, step, type Command, type CommandResult, type Side, type World, type WorldOptions } from './world';

// ---------------------------------------------------------------------------------------------------------------
// Replays and desync checks: the base of online play. Two machines that start from the same world and apply the
// same commands on the same ticks stay identical, because the sim is deterministic. A replay is exactly that:
// how the world started, every command with its tick, and a fingerprint of the world every HASH_EVERY ticks.

/** How often the world is fingerprinted, in ticks: once a second. */
export const HASH_EVERY = 20;

/** Bumped whenever the replay shape changes. */
export const REPLAY_VERSION = 1;

/** How a world was made, so another machine (or a replay) can make the identical one. */
export type ReplayStart =
  | { kind: 'skirmish'; mapIndex: number; options: SkirmishOptions }
  | { kind: 'campaign'; mapIndex: number; missionIndex: number; seed: number; options: WorldOptions };

/** A command as the sim applied it: before the step of `tick`, for `side`. */
export interface StampedCommand {
  tick: number;
  side: Side;
  cmd: Command;
}

export interface Replay {
  version: typeof REPLAY_VERSION;
  start: ReplayStart;
  commands: StampedCommand[];
  /** [tick, syncHash] pairs, taken before the commands of that tick were applied. */
  hashes: [number, number][];
  /** How many ticks were played. */
  ticks: number;
}

export function startWorld(start: ReplayStart): World {
  if (start.kind === 'skirmish') return createSkirmish(start.mapIndex, start.options);
  const map = campaign.maps[start.mapIndex];
  if (!map) throw new Error(`No map ${start.mapIndex + 1}`);
  return createWorld(map, start.missionIndex, start.seed, start.options);
}

/**
 * A full-precision fingerprint of the world, for desync checks. Unlike hashWorld it mixes every bit of the
 * fractional positions and timers, and the RNG state, so the smallest drift between two machines shows.
 */
export function syncHash(world: World): number {
  let h = 2166136261;
  const mixInt = (v: number) => {
    h = Math.imul(h ^ v, 16777619);
  };
  const view = new DataView(new ArrayBuffer(8));
  const mix = (v: number) => {
    view.setFloat64(0, v);
    mixInt(view.getUint32(0));
    mixInt(view.getUint32(4));
  };
  mix(world.tick);
  mix(world.rngState);
  mix(world.nextId);
  for (const side of SIDES) mix(world.sides[side].money);
  for (const e of world.entities) {
    for (const v of [e.id, e.type, e.x, e.y, e.hp, e.dir, e.turretDir, e.targetId, e.moveMs, e.reloadMs, e.cargo, e.buildElapsedMs, e.path.length, e.queue.length])
      mix(v);
    mixInt(e.team === 'player' ? 1 : e.team === 'enemy' ? 2 : 3);
  }
  for (const p of world.projectiles) for (const v of [p.id, p.x, p.y, p.vx, p.vy, p.left, p.damage]) mix(v);
  return h >>> 0;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Plays a world and writes down everything needed to play it again. */
export class Recorder {
  readonly replay: Replay;

  constructor(
    readonly world: World,
    start: ReplayStart,
  ) {
    this.replay = { version: REPLAY_VERSION, start: clone(start), commands: [], hashes: [], ticks: 0 };
  }

  /** Applies a command now, before the next step, and records it. Failed commands are recorded too: they fail again. */
  issue(side: Side, cmd: Command): CommandResult {
    this.replay.commands.push({ tick: this.world.tick, side, cmd: clone(cmd) });
    return issue(this.world, side, cmd);
  }

  /** Call before the tick's commands; records a fingerprint on every HASH_EVERY-th tick. Returns it, or null. */
  checkpoint(): number | null {
    const tick = this.world.tick;
    if (tick % HASH_EVERY !== 0) return null;
    const last = this.replay.hashes[this.replay.hashes.length - 1];
    if (last && last[0] === tick) return last[1];
    const hash = syncHash(this.world);
    this.replay.hashes.push([tick, hash]);
    return hash;
  }

  step(): void {
    this.checkpoint();
    step(this.world);
    this.replay.ticks++;
  }
}

export type ReplayCheck = { ok: true; world: World } | { ok: false; tick: number; expected: number; actual: number; world: World };

/** Plays a replay from its start and compares every fingerprint; the first mismatch is a desync. */
export function verifyReplay(replay: Replay): ReplayCheck {
  if (replay.version !== REPLAY_VERSION) throw new Error(`Unsupported replay version ${String(replay.version)}`);
  const world = startWorld(replay.start);
  const expected = new Map(replay.hashes);
  let next = 0;
  for (let t = 0; t < replay.ticks; t++) {
    const want = expected.get(world.tick);
    if (want !== undefined) {
      const actual = syncHash(world);
      if (actual !== want) return { ok: false, tick: world.tick, expected: want, actual, world };
    }
    while (next < replay.commands.length && replay.commands[next]!.tick === world.tick) {
      const c = replay.commands[next++]!;
      issue(world, c.side, clone(c.cmd));
    }
    step(world);
  }
  return { ok: true, world };
}

// ---------------------------------------------------------------------------------------------------------------
// Lockstep: each machine runs the whole world and only commands travel. A command given on tick T is sent at
// once and applied on tick T + inputDelay on both machines; a machine steps tick T only when it has the other's
// turn for T (an empty turn says "nothing from me"). The delay hides the network latency: 3 ticks are 150 ms.

/** What two machines send each other. A turn carries one side's commands for one tick. */
export type NetMessage = { t: 'turn'; tick: number; cmds: Command[]; hash?: [tick: number, hash: number] };

/** Any reliable channel between the two machines: a WebRTC data channel, a relay socket, or memory in tests. */
export interface Transport {
  send(msg: NetMessage): void;
  /** The lockstep sets this to receive the other machine's messages. */
  onMessage: ((msg: NetMessage) => void) | null;
}

export const DEFAULT_INPUT_DELAY = 3;

export interface Desync {
  tick: number;
  local: number;
  remote: number;
}

export class Lockstep {
  readonly recorder: Recorder;
  readonly remoteSide: Side;
  readonly inputDelay: number;
  /** Set when the two worlds were found to differ; the match cannot go on. */
  desync: Desync | null = null;
  onDesync: (d: Desync) => void = () => {};
  /** Turns by tick, per side. */
  private readonly turns: Record<Side, Map<number, Command[]>> = { player: new Map(), enemy: new Map() };
  private readonly localHashes = new Map<number, number>();
  private readonly remoteHashes = new Map<number, number>();
  private readonly sentHashes = new Set<number>();
  private pending: Command[] = [];
  /** The next tick a local turn will be sent for. */
  private sentUpTo: number;

  constructor(
    readonly world: World,
    start: ReplayStart,
    readonly localSide: Side,
    private readonly transport: Transport,
    inputDelay = DEFAULT_INPUT_DELAY,
  ) {
    this.recorder = new Recorder(world, start);
    this.remoteSide = localSide === 'player' ? 'enemy' : 'player';
    this.inputDelay = Math.max(1, Math.floor(inputDelay));
    transport.onMessage = (msg) => this.receive(msg);
    this.sentUpTo = world.tick;
    // The first ticks have no local commands yet: send them empty so nobody waits.
    while (this.sentUpTo < world.tick + this.inputDelay) this.sendTurn([]);
  }

  /** Queues a local command; it goes out with the next turn and takes effect inputDelay ticks later. */
  queue(cmd: Command): void {
    this.pending.push(clone(cmd));
  }

  /** True while the other machine's turn for the current tick has not arrived. */
  get waiting(): boolean {
    return !this.turns[this.remoteSide].has(this.world.tick);
  }

  /** Steps one tick when both turns are in; returns false (and does nothing) while waiting or after a desync. */
  tryStep(): boolean {
    if (this.desync) return false;
    const tick = this.world.tick;
    // Send the local turn for tick + inputDelay first, so the other machine never waits on us.
    if (this.sentUpTo <= tick + this.inputDelay) {
      this.sendTurn(this.pending);
      this.pending = [];
    }
    if (this.waiting) return false;
    const hash = this.recorder.checkpoint();
    if (hash !== null) {
      this.localHashes.set(tick, hash);
      this.compare(tick);
      if (this.desync) return false;
    }
    // Both sides' commands in a fixed order, the same on both machines.
    for (const side of SIDES) {
      for (const cmd of this.turns[side].get(tick) ?? []) this.recorder.issue(side, clone(cmd));
      this.turns[side].delete(tick);
    }
    this.recorder.step();
    return true;
  }

  private sendTurn(cmds: Command[]): void {
    const tick = this.sentUpTo++;
    this.turns[this.localSide].set(tick, cmds);
    // Each turn carries the newest local fingerprint the other machine has not had yet.
    const last = this.recorder.replay.hashes[this.recorder.replay.hashes.length - 1];
    const msg: NetMessage = { t: 'turn', tick, cmds };
    if (last && !this.sentHashes.has(last[0])) {
      this.sentHashes.add(last[0]);
      msg.hash = [last[0], last[1]];
    }
    this.transport.send(msg);
  }

  private receive(msg: NetMessage): void {
    if (msg.t !== 'turn') return;
    this.turns[this.remoteSide].set(msg.tick, msg.cmds);
    if (msg.hash) {
      this.remoteHashes.set(msg.hash[0], msg.hash[1]);
      this.compare(msg.hash[0]);
    }
  }

  private compare(tick: number): void {
    const local = this.localHashes.get(tick);
    const remote = this.remoteHashes.get(tick);
    if (local === undefined || remote === undefined) return;
    this.localHashes.delete(tick);
    this.remoteHashes.delete(tick);
    if (local !== remote && !this.desync) {
      this.desync = { tick, local, remote };
      this.onDesync(this.desync);
    }
  }
}
