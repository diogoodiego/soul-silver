import { describe, expect, it } from "vitest";
import { arenaSpec } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// The dev arena can end with a legendary Pokémon instead of a Gym Leader.

const spec = {
  trainer: { name: "Tester", character: "male" },
  team: [{ species: 155, level: 10, moves: [52] }],
  foe: { kind: "wild", behavior: "idle", team: [{ species: 152, level: 10, moves: [33] }] },
};

describe("protocol v48", () => {
  it("is at least version 48", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(48);
  });

  it("takes an optional species for the arena's legendary, not along with a leader", () => {
    expect(arenaSpec.safeParse({ ...spec, legendary: 249 }).success).toBe(true);
    expect(arenaSpec.safeParse({ ...spec, legendary: -1 }).success).toBe(false);
    expect(arenaSpec.safeParse({ ...spec, legendary: 249, leader: 20 }).success).toBe(false);
  });
});
