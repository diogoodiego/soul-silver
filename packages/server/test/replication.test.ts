import { describe, expect, it } from "vitest";
import { setup } from "./harness";

describe("replication", () => {
  it("sends the full relevant state first", () => {
    const { session, connect } = setup();
    const a = connect();
    const b = connect();
    session.step();
    const first = b.states()[0]!;
    expect(first.full).toBe(true);
    expect(first.spawned.map((e) => e.id).sort()).toEqual([a.welcome!.entityId, b.welcome!.entityId].sort());
  });

  it("then sends only changed fields", () => {
    const { session, connect } = setup();
    const a = connect();
    const b = connect();
    session.step();
    a.input(0, "east");
    session.step();
    const second = b.lastState()!;
    expect(second.full).toBe(false);
    expect(second.spawned).toEqual([]);
    expect(second.changed).toEqual([{ id: a.welcome!.entityId, x: 27, facing: "east" }]);
  });

  it("sends nothing for unchanged entities", () => {
    const { session, connect } = setup();
    const a = connect();
    session.step();
    session.step();
    expect(a.lastState()).toMatchObject({ full: false, spawned: [], changed: [], removed: [] });
  });

  it("spawns entities that appear later", () => {
    const { session, connect } = setup();
    const a = connect();
    session.step();
    const wild = session.world.add({ kind: "wild", area: "a", x: 0, y: 0, facing: "south", data: { species: 16 } });
    session.step();
    expect(a.lastState()?.spawned).toEqual([wild]);
  });
});
