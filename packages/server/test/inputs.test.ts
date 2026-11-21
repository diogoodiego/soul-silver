import { MOVE_SPEED_PX } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { setup } from "./harness";

describe("inputs", () => {
  it("applies one input per tick and reports the last applied seq", () => {
    const { session, connect, entity } = setup();
    const c = connect();
    c.input(0, "east");
    c.input(1, "east");
    session.step();
    expect(entity(c.welcome!.entityId)?.x).toBe(24 + MOVE_SPEED_PX);
    expect(c.lastState()?.lastInput).toBe(0);
    session.step();
    expect(c.lastState()?.lastInput).toBe(1);
  });

  it("ignores duplicates and inputs already applied", () => {
    const { session, connect, entity } = setup();
    const c = connect();
    c.input(0, "east");
    session.step();
    c.input(0, "east");
    c.input(0, "east");
    session.step();
    expect(entity(c.welcome!.entityId)?.x).toBe(24 + MOVE_SPEED_PX);
  });

  it("applies out-of-order inputs by seq", () => {
    const { session, connect, entity } = setup();
    const c = connect();
    c.input(1, "south");
    c.input(0, "east");
    session.step();
    expect(c.lastState()?.lastInput).toBe(0);
    expect(entity(c.welcome!.entityId)?.facing).toBe("east");
    session.step();
    expect(entity(c.welcome!.entityId)?.facing).toBe("south");
  });

  it("keeps at most 2 queued inputs, so a burst after a stall does not leave a standing delay", () => {
    const { session, connect, logs } = setup();
    const c = connect();
    for (let seq = 0; seq < 15; seq++) c.input(seq, "east");
    session.step();
    expect(c.lastState()?.lastInput).toBe(13);
    session.step();
    expect(c.lastState()?.lastInput).toBe(14);
    expect(logs.some((l) => l.includes("dropped"))).toBe(true);
  });

  it("keeps the buttons of the inputs it drops", () => {
    const applied: [number, number][] = [];
    const { session, connect } = setup({ onRecord: (r) => r.kind === "input" && applied.push([r.input.seq, r.input.buttons]) });
    const c = connect();
    c.conn.send({ type: "input", seq: 0, move: { x: 0, y: 0 }, run: false, buttons: 4 });
    c.input(1, "east");
    c.input(2, "east");
    session.step();
    session.step();
    expect(applied).toEqual([
      [1, 4],
      [2, 0],
    ]);
  });

  it("stands still on ticks without input", () => {
    const { session, connect, entity } = setup();
    const c = connect();
    session.step();
    expect(entity(c.welcome!.entityId)).toMatchObject({ x: 24, y: 24 });
    expect(c.lastState()?.lastInput).toBe(-1);
  });
});
