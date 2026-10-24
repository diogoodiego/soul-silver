import { describe, expect, it } from "vitest";
import { setup } from "./harness";

const twoAreas = { spawn: (playerId: number) => ({ area: playerId % 2 ? "a" : "b", x: 24, y: 24 }) };

describe("relevance", () => {
  it("never sends entities from another area", () => {
    const { session, connect } = setup(twoAreas);
    const clients = [connect(), connect(), connect(), connect()];
    session.world.add({ kind: "wild", area: "b", x: 0, y: 0, level: 0, facing: "south", data: {} });
    for (let t = 0; t < 5; t++) {
      clients.forEach((c) => c.input(t, "south"));
      session.step();
    }
    for (const c of clients) {
      const myArea = session.world.get(c.welcome!.entityId)!.area;
      for (const s of c.states()) {
        for (const e of s.spawned) expect(e.area).toBe(myArea);
        for (const d of s.changed) expect(session.world.get(d.id)!.area).toBe(myArea);
      }
    }
  });

  it("spawns an entity entering the area and removes one leaving it", () => {
    const { session, connect } = setup(twoAreas);
    const a = connect();
    session.step();
    const wild = session.world.add({ kind: "wild", area: "b", x: 0, y: 0, level: 0, facing: "south", data: {} });
    session.step();
    session.world.update({ ...wild, area: "a" });
    session.step();
    expect(a.lastState()?.spawned).toEqual([{ ...wild, area: "a" }]);
    session.world.update({ ...wild, area: "b" });
    session.step();
    expect(a.lastState()?.removed).toEqual([wild.id]);
  });

  it("resends full state when the player's own area changes", () => {
    const { session, connect } = setup(twoAreas);
    const a = connect();
    session.step();
    const me = session.world.get(a.welcome!.entityId)!;
    session.world.update({ ...me, area: "b" });
    session.step();
    expect(a.lastState()?.full).toBe(true);
  });
});
