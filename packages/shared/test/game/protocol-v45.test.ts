import { describe, expect, it } from "vitest";
import { arenaSpec } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// The dev arena can end with a Gym Leader, who comes after the first foe is beaten.

const spec = {
  trainer: { name: "Tester", character: "male" },
  team: [{ species: 155, level: 10, moves: [52] }],
  foe: { kind: "wild", behavior: "idle", team: [{ species: 152, level: 10, moves: [33] }] },
};

describe("protocol v45", () => {
  it("is at least version 45", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(45);
  });

  it("takes an optional trainer id for the arena's gym leader", () => {
    expect(arenaSpec.safeParse(spec).success).toBe(true);
    expect(arenaSpec.safeParse({ ...spec, leader: 20 }).success).toBe(true);
    expect(arenaSpec.safeParse({ ...spec, leader: -1 }).success).toBe(false);
    expect(arenaSpec.safeParse({ ...spec, leader: "20" }).success).toBe(false);
  });
});
