import { BUNDLED_COMPANION_CONTENT, buildCompanionData, createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, MOVE_SPEED_PX } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createGameConnection } from "../../src/net/game-connection";
import { combatData, MOVES, SPECIES } from "../../../server/test/combat-fixture";

/** A save standing where the old fixtures spawned players. */
const saveOf = (name: string) => ({ schemaVersion: 1, name, character: "male", area: "a", x: 24, y: 24, facing: "south", playTimeMs: 0, savedAt: "2026-10-24T12:00:00.000Z", rev: 0 });
const sessionOptions = { seed: 1, log: () => {}, clock: () => "2026-10-24T12:00:00.000Z", newToken: () => "token" };

/** A real session; server -> client messages are held for `lagTicks` ticks. */
function setup(lagTicks: number, protocolVersion = PROTOCOL_VERSION) {
  const session = createSession({ ...sessionOptions, world: () => undefined });
  let now = 0;
  const inFlight: { due: number; msg: unknown }[] = [];
  const [server, client] = createMemoryConnectionPair();
  session.connect(server);
  const game = createGameConnection({ save: saveOf("Ana"), send: (m) => client.send(m), world: () => undefined, protocolVersion });
  client.onMessage((msg) => inFlight.push({ due: session.tick + lagTicks, msg }));
  const deliver = () => {
    while (inFlight.length && inFlight[0]!.due <= session.tick) game.receive(inFlight.shift()!.msg, now);
  };
  game.start();
  deliver();
  const tick = () => {
    now += 50;
    session.step();
    deliver();
  };
  return { session, game, tick, now: () => now };
}

describe("createGameConnection", () => {
  it("plays after welcome and the first state", () => {
    const { game, tick } = setup(0);
    expect(game.status).toBe("connecting");
    tick();
    expect(game.status).toBe("playing");
    expect(game.view(0).self).toMatchObject({ x: 24, y: 24 });
  });

  it("moves the own entity at once with 100 ms of lag and converges to the server", () => {
    const { session, game, tick, now } = setup(2);
    for (let i = 0; i < 4; i++) tick();
    const before = game.view(now()).self!.x;
    game.sendInput({ x: 1, y: 0 }, false, now());
    expect(game.view(now() + 50).self!.x).toBe(before + MOVE_SPEED_PX);
    for (let i = 0; i < 6; i++) tick();
    const server = session.world.get(game.entityId!)!;
    expect(server.x).toBe(before + MOVE_SPEED_PX);
    expect(game.view(now() + 100).self!.x).toBe(server.x);
  });

  it("interpolates other players and exposes the reject message", () => {
    const { session, game, tick } = setup(0);
    const other = createGameConnection({ save: saveOf("Bia"), send: () => {}, world: () => undefined, protocolVersion: 1 });
    other.receive({ type: "reject", code: "protocol-mismatch", message: "versão", serverProtocolVersion: 2 }, 0);
    expect(other.status).toBe("rejected");
    expect(other.rejectMessage).toBe("versão");
    const [s2, c2] = createMemoryConnectionPair();
    session.connect(s2);
    c2.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: saveOf("Bia") });
    tick();
    tick();
    expect(game.view(10_000).others).toHaveLength(1);
  });

  it("drops invalid server messages", () => {
    const { game } = setup(0);
    expect(() => game.receive({ type: "state", tick: "x" }, 0)).not.toThrow();
    expect(game.status).toBe("connecting");
  });

  it("keeps why the session closed", () => {
    const { game } = setup(0);
    game.receive({ type: "session-closed", reason: "host-left" }, 0);
    expect(game.status).toBe("closed");
    expect(game.closeReason).toBe("host-left");
    const dropped = setup(0).game;
    dropped.disconnected();
    expect(dropped.closeReason).toBe("disconnected");
  });

  it("enters the dev arena as its trainer, sends the Pokémon out and hands out combat events", () => {
    const session = createSession({ ...sessionOptions, world: () => undefined, combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), devArena: true });
    const [server, client] = createMemoryConnectionPair();
    session.connect(server);
    const arena = {
      trainer: { name: "Ana", character: "female" as const },
      team: [{ species: SPECIES.cyndaquil.id, level: 10, moves: [MOVES.ember.id] }],
      foe: { kind: "wild" as const, behavior: "idle" as const, team: [{ species: SPECIES.chikorita.id, level: 10, moves: [MOVES.tackle.id] }] },
    };
    const game = createGameConnection({ save: saveOf("Ana"), send: (m) => client.send(m), world: () => undefined, protocolVersion: PROTOCOL_VERSION, arena });
    let now = 0;
    client.onMessage((msg) => game.receive(msg, now));
    game.start();
    const tick = () => {
      now += 50;
      session.step();
    };
    tick();
    expect(game.view(now).self).toMatchObject({ kind: "player", area: "arena" });
    // The combat button sends the Pokémon out; control passes to it, then a move hits the idle target.
    game.sendInput({ x: 0, y: 0 }, false, now, BUTTON.combat);
    tick();
    game.sendInput({ x: 0, y: 0 }, false, now);
    for (let i = 0; i < 10; i++) tick();
    expect(game.view(now).self).toMatchObject({ kind: "pokemon" });
    for (let i = 0; i < 60; i++) {
      game.sendInput({ x: 1, y: 0 }, false, now, i % 4 === 0 ? 1 : 0);
      tick();
    }
    expect(game.takeCombatEvents().some((e) => e.kind === "hit" && e.effectiveness === 2)).toBe(true);
    expect(game.takeCombatEvents()).toEqual([]);
  });
});
