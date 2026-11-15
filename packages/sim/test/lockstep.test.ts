import { describe, expect, it } from 'vitest';
import { ObjectType } from '@sw/data';
import { createRng, Lockstep, startWorld, syncHash, verifyReplay, type NetMessage, type ReplayStart, type Side, type Transport } from '../src';

/** Two transports joined in memory; each message arrives 0 to `lag` frames later, in order. */
function pipe(rand: () => number, lag: number): [Transport & { flush(): void }, Transport & { flush(): void }] {
  const make = () => {
    const inbox: { at: number; msg: NetMessage }[] = [];
    let frame = 0;
    const t = {
      onMessage: null as ((m: NetMessage) => void) | null,
      peer: null as unknown as { inbox: typeof inbox; frameOf: () => number },
      send(msg: NetMessage) {
        const box = t.peer.inbox;
        const at = Math.max(box[box.length - 1]?.at ?? 0, t.peer.frameOf() + Math.floor(rand() * (lag + 1)));
        box.push({ at, msg: JSON.parse(JSON.stringify(msg)) as NetMessage });
      },
      flush() {
        frame++;
        while (inbox.length && inbox[0]!.at <= frame) t.onMessage?.(inbox.shift()!.msg);
      },
      inbox,
      frameOf: () => frame,
    };
    return t;
  };
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

const START: ReplayStart = { kind: 'skirmish', mapIndex: 3, options: { opponent: 'human', money: 3000, seed: 7 } };

function match(sabotage = false) {
  const rand = createRng(42);
  const [ta, tb] = pipe(rand, 6);
  const peers = (['player', 'enemy'] as Side[]).map((side, i) => new Lockstep(startWorld(START), START, side, i ? tb : ta));
  let stalls = 0;
  for (let frame = 0; frame < 3000 && peers.some((p) => p.world.tick < 1200 && !p.desync); frame++) {
    ta.flush();
    tb.flush();
    for (const p of peers) {
      // Each person orders their units somewhere new every couple of seconds, and buys a factory early on.
      if (frame % 37 === 0) {
        const ids = p.world.entities.filter((e) => e.team === p.localSide && e.type !== ObjectType.PlayerHQ && e.type !== ObjectType.EnemyHQ).map((e) => e.id);
        p.queue({ kind: 'move', ids, x: Math.floor(rand() * p.world.cols * 15), y: Math.floor(rand() * p.world.rows * 15) });
      }
      if (sabotage && p.localSide === 'enemy' && p.world.tick === 300) p.world.sides.enemy.money += 1;
      if (p.world.tick < 1200 && !p.tryStep()) stalls++;
    }
  }
  return { peers, stalls };
}

describe('online lockstep', () => {
  it('two machines over a laggy line stay identical, and the replay plays back the same game', () => {
    const { peers, stalls } = match();
    const [a, b] = peers as [Lockstep, Lockstep];
    expect(a.desync ?? b.desync).toBeNull();
    expect([a.world.tick, b.world.tick]).toEqual([1200, 1200]);
    expect(stalls).toBeGreaterThan(0);
    expect(syncHash(a.world)).toBe(syncHash(b.world));
    expect(a.recorder.replay.commands.length).toBeGreaterThan(30);
    const check = verifyReplay(JSON.parse(JSON.stringify(a.recorder.replay)));
    expect(check.ok).toBe(true);
    expect(syncHash(check.world)).toBe(syncHash(a.world));
  });

  it('catches a desync within a second', () => {
    const { peers } = match(true);
    const d = peers[0]!.desync ?? peers[1]!.desync;
    expect(d).not.toBeNull();
    expect(d!.tick).toBeGreaterThanOrEqual(300);
    expect(d!.tick).toBeLessThanOrEqual(320);
  });
});
