import { BUNDLED_COMPANION_CONTENT, buildCompanionData, createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, type Entity } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createGameConnection } from "../../src/net/game-connection";
import { combatData, MOVES, realAction, SPECIES } from "../../../server/test/combat-fixture";

// Block C: the client shows its own actions at once and the server's word arrives later. Real client, real session, the
// real tuning, with the client's and the server's timers out of phase and `latency` ms each way.

const saveOf = (name: string) => ({ schemaVersion: 1, name, character: "male", area: "a", x: 24, y: 24, facing: "south", playTimeMs: 0, savedAt: "2026-10-24T12:00:00.000Z", rev: 0 });
const FRAME = 10;

function fight(latency: number, phase = 20) {
  const session = createSession({ seed: 1, log: () => {}, clock: () => "2026-10-24T12:00:00.000Z", newToken: () => "token", world: () => undefined, combat: combatData(realAction()), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), devArena: true });
  const [server, client] = createMemoryConnectionPair();
  session.connect(server);
  let now = 0;
  const queue: { due: number; go: () => void }[] = [];
  const later = (go: () => void) => queue.push({ due: now + latency, go });
  const game = createGameConnection({
    save: saveOf("Ana"),
    send: (m) => later(() => client.send(m)),
    world: () => undefined,
    protocolVersion: PROTOCOL_VERSION,
    arena: {
      trainer: { name: "Ana", character: "female" },
      team: [{ species: SPECIES.cyndaquil.id, level: 10, moves: [MOVES.tackle.id, MOVES.hyperBeam.id] }],
      foe: { kind: "wild", behavior: "idle", team: [{ species: SPECIES.chikorita.id, level: 60, moves: [MOVES.tackle.id] }] },
    },
  });
  client.onMessage((msg) => later(() => game.receive(msg, now)));
  game.start();
  let held = 0;
  let move = { x: 0, y: 0 };
  const frames: Entity[] = [];
  const run = (ms: number) => {
    for (let end = now + ms; now < end; ) {
      now += FRAME;
      for (const q of queue.splice(0)) if (q.due <= now) q.go(); else queue.push(q);
      if (now % 50 === 0) session.step();
      if (now % 50 === phase) game.sendInput(move, false, now, held);
      const self = game.view(now).self;
      if (self) frames.push(self);
    }
  };
  run(300);
  held = BUTTON.combat;
  run(60);
  held = 0;
  run(1500);
  frames.length = 0;
  return {
    frames,
    run,
    /** The key goes down: the press goes out between two inputs, which carry it from then on. */
    press(buttons: number) {
      held |= buttons;
      game.press(buttons, move, now);
      frames.push(game.view(now).self!);
    },
    release: () => (held = 0),
    push: (x: number, y: number) => (move = { x, y }),
    server: () => session.world.get(game.entityId!)!,
    view: () => game.view(now).self!,
  };
}

const biggestStep = (frames: Entity[]) => Math.max(...frames.slice(1).map((f, i) => Math.hypot(f.x - frames[i]!.x, f.y - frames[i]!.y)));
const off = (f: ReturnType<typeof fight>) => Math.hypot(f.view().x - f.server().x, f.view().y - f.server().y);

describe.each([
  [1, 20],
  [1, 0],
  [40, 30],
  [90, 10],
])("own actions with %i ms each way, timers %i ms apart", (latency, phase) => {
  it("the dodge shows in the frame of the press, runs smoothly and ends where the server's does", () => {
    const f = fight(latency, phase);
    const from = f.view().x;
    f.push(1, 0);
    f.run(17 * FRAME);
    const walked = f.view().x;
    f.press(BUTTON.dash);
    expect(f.frames.at(-1)!.data["dodge"]).toBe(true);
    const at = f.frames.length;
    f.run(60);
    f.release();
    f.run(200);
    f.push(0, 0);
    f.run(600);
    expect(walked).toBeGreaterThan(from);
    expect(off(f)).toBeLessThan(0.5);
    // 8 px a tick is 1.6 a frame; corrections add little.
    expect(biggestStep(f.frames)).toBeLessThan(3.2);
    // It moved at once: the first step is under way 50 ms after the press.
    expect(f.frames[at + 5]!.x - walked).toBeGreaterThan(6);
    // The afterimages never drop out once they began.
    const shown = f.frames.slice(at - 1).map((e) => e.data["dodge"] === true);
    expect(shown.indexOf(false)).toBeGreaterThan(35);
    expect(shown.lastIndexOf(true)).toBeLessThan(shown.indexOf(false));
  });

  it("the parry's pose shows in the frame of the press and holds into the guard", () => {
    const f = fight(latency, phase);
    f.press(BUTTON.guard);
    const at = f.frames.length - 1;
    f.run(900);
    for (const e of f.frames.slice(at)) expect(e.data["parry"] === true || e.data["guard"] === true).toBe(true);
    f.release();
    f.run(400);
    expect(f.view().data["guard"]).toBeUndefined();
  });

  it("a tap shorter than an input still parries", () => {
    const f = fight(latency, phase);
    f.press(BUTTON.guard);
    f.release();
    f.run(300);
    expect(f.server().data["parry"]).toBe(true);
  });

  it("a move's charge shows in the frame of the press and goes on, unbroken, into its leap and its blow", () => {
    const f = fight(latency, phase);
    const used = Number(f.server().data["used"]);
    f.press(1);
    const at = f.frames.length - 1;
    f.run(60);
    f.release();
    f.run(900);
    const shown = f.frames.slice(at).map((e) => (e.data["castShape"] !== undefined ? "charge" : e.data["leap"] !== undefined ? "leap" : "none"));
    expect(shown[0]).toBe("charge");
    expect(shown.filter((s, i) => i === 0 || s !== shown[i - 1])).toEqual(["charge", "leap", "none"]);
    // One charge all along: the same area, which the client does not start over.
    expect(new Set(f.frames.slice(at).filter((e) => e.data["castShape"] !== undefined).map((e) => [e.data["castShape"], e.data["castSize"], e.data["castSpan"], e.data["castType"], e.data["castMs"]].join())).size).toBe(1);
    expect(Number(f.server().data["used"])).toBe(used + 1);
    expect(off(f)).toBeLessThan(0.5);
    expect(biggestStep(f.frames)).toBeLessThan(5);
  });

  it("a special charges at once too", () => {
    const f = fight(latency, phase);
    f.press(1 << 2);
    expect(f.frames.at(-1)!.data).toMatchObject({ casting: 3, castMs: 800 });
    f.run(1500);
    expect(f.server().data["used"]).toBe(1);
  });
});
