import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createMemoryConnectionPair } from "../src/connection";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { setup } from "./harness";

const save = { schemaVersion: 1, name: "Arena", character: "male", area: "a", x: 24, y: 24, facing: "south", playTimeMs: 0, savedAt: "2026-10-24T12:00:00.000Z", rev: 0 };
const arena = { a: { species: SPECIES.cyndaquil.id, level: 10, moves: [MOVES.ember.id, MOVES.tackle.id] }, b: { species: SPECIES.chikorita.id, level: 10, moves: [MOVES.tackle.id] } };

function enter(options: Parameters<typeof setup>[0], spec: unknown = arena) {
  const t = setup(options);
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  client.onMessage((m) => got.push(m as ServerMessage));
  t.session.connect(server);
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save, arena: spec });
  return { ...t, client, got };
}

describe("dev arena", () => {
  it("puts the player in control of combatant A, with B as a wild target", () => {
    const t = enter({ combat: combatData(), devArena: true });
    const welcome = t.got.find((m) => m.type === "welcome");
    expect(welcome?.type).toBe("welcome");
    const self = t.session.world.get(welcome?.type === "welcome" ? welcome.entityId : -1)!;
    expect(self.kind).toBe("pokemon");
    expect(self.data).toMatchObject({ species: SPECIES.cyndaquil.id, owner: "1" });
    const others = t.session.world.all().filter((e) => e.id !== self.id && e.kind === "pokemon");
    expect(others).toHaveLength(1);
    expect(others[0]!.data).toMatchObject({ species: SPECIES.chikorita.id, owner: "wild" });
  });

  it("drives moves from input and sends combat events; B stays idle", () => {
    const t = enter({ combat: combatData(), devArena: true });
    const self = t.session.world.all().find((e) => e.data.owner === "1")!;
    const b = t.session.world.all().find((e) => e.data.owner === "wild")!;
    // Aim from A at B.
    const aim = { x: Math.sign(b.x - self.x) || 1, y: 0 };
    t.client.send({ type: "input", seq: 0, move: { x: 0, y: 0 }, run: false, buttons: 1, aim });
    for (let i = 0; i < 40; i++) {
      t.client.send({ type: "input", seq: i + 1, move: { x: 0, y: 0 }, run: false, buttons: 0 });
      t.session.step();
    }
    const events = t.got.flatMap((m) => (m.type === "combat-event" ? m.events : []));
    expect(events.some((e) => e.kind === "hit" && e.target === b.id && e.effectiveness === 2)).toBe(true);
    expect(events.some((e) => e.attacker === b.id)).toBe(false);
  });

  it("never sends saves: the arena does not touch the player's progress", () => {
    const t = enter({ combat: combatData(), devArena: true });
    for (let i = 0; i < 700; i++) {
      t.client.send({ type: "input", seq: i, move: { x: 0, y: 0 }, run: false, buttons: 0 });
      t.session.step();
    }
    t.session.close("closed-by-host");
    expect(t.got.filter((m) => m.type === "save")).toHaveLength(0);
  });

  it("is refused without the dev flag", () => {
    const t = enter({ combat: combatData() });
    expect(t.got).toContainEqual(expect.objectContaining({ type: "reject", code: "invalid-message" }));
  });

  it("refuses an arena with an unknown species or move", () => {
    const t = enter({ combat: combatData(), devArena: true }, { ...arena, b: { species: 999, level: 5, moves: [33] } });
    const reject = t.got.find((m) => m.type === "reject");
    expect(reject).toMatchObject({ code: "invalid-message" });
    expect(reject?.type === "reject" ? reject.message : "").toMatch(/999/);
    expect(t.session.world.all()).toHaveLength(0);
  });

  it("removes both combatants when a guest leaves the arena", () => {
    const t = setup({ combat: combatData(), devArena: true });
    t.connect("Host");
    const [server, client] = createMemoryConnectionPair();
    t.session.connect(server);
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save, arena });
    expect(t.session.world.all()).toHaveLength(3);
    client.send({ type: "leave" });
    expect(t.session.world.all().map((e) => e.kind)).toEqual(["player"]);
  });
});
