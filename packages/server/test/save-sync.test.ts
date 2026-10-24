import { describe, expect, it } from "vitest";
import { setup } from "./harness";

describe("save sync (FR-006)", () => {
  it("sends the player save every 600 ticks with a growing rev and play time", () => {
    const { session, connect } = setup();
    const c = connect("Gold");
    for (let t = 0; t < 1200; t++) {
      c.input(t, null);
      session.step();
    }
    const saves = c.saves().map((m) => m.save);
    expect(saves).toHaveLength(2);
    expect(saves[0]).toMatchObject({ name: "Gold", rev: 1, playTimeMs: 600 * 50 });
    expect(saves[1]).toMatchObject({ rev: 2, playTimeMs: 1200 * 50 });
  });

  it("carries the position the player has reached", () => {
    const { session, connect } = setup();
    const c = connect("Gold");
    for (let t = 0; t < 10; t++) {
      c.input(t, "east");
      session.step();
    }
    c.conn.send({ type: "leave" });
    const last = c.saves().at(-1)!.save;
    expect(last.x).toBeGreaterThan(24);
    expect(last.area).toBe("a");
  });

  it("sends a final save when a guest leaves", () => {
    const { connect } = setup();
    connect("Host");
    const guest = connect("Gold");
    guest.conn.send({ type: "leave" });
    expect(guest.saves()).toHaveLength(1);
  });

  it("sends a save when the player changes map", () => {
    const { session, connect, entity } = setup();
    const c = connect("Gold");
    session.step();
    const e = entity(c.welcome!.entityId)!;
    session.world.update({ ...e, area: "b" });
    session.step();
    expect(c.saves().at(-1)!.save.area).toBe("b");
  });

  it("starts play time from the save", () => {
    const { session, connect } = setup();
    const c = connect("Gold", undefined, { save: { playTimeMs: 90_000, rev: 7 } });
    for (let t = 0; t < 600; t++) {
      c.input(t, null);
      session.step();
    }
    expect(c.saves()[0]!.save).toMatchObject({ playTimeMs: 90_000 + 600 * 50, rev: 8 });
  });
});
