import { describe, expect, it } from "vitest";
import { BUTTON, hitEvent, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Block C: the guard button, the missed, evaded and parried events, and which moves a new one may replace.

const event = { attacker: 1, target: 2, move: 33, amount: 0, effectiveness: 1, crit: false, push: { x: 0, y: 0 } };

describe("protocol v44", () => {
  it("is at least version 44", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(44);
  });

  it("has a guard bit apart from the others", () => {
    const others = Object.entries(BUTTON).filter(([k]) => k !== "guard").map(([, v]) => v);
    expect(others.every((b) => (b & BUTTON.guard) === 0)).toBe(true);
    expect(BUTTON.guard & 0b1111).toBe(0);
  });

  it("carries missed, evaded and parried", () => {
    for (const kind of ["missed", "evaded", "parried"]) expect(hitEvent.safeParse({ kind, ...event }).success).toBe(true);
  });

  it("tells the moves a learnt one may replace", () => {
    const msg = { type: "progression", item: { kind: "learn", member: 0, move: 52 }, moves: [33, 10, 63, 14], replaceable: [0, 1] };
    expect(serverMessage.safeParse(msg).success).toBe(true);
    expect(serverMessage.safeParse({ ...msg, replaceable: [4] }).success).toBe(false);
  });
});
