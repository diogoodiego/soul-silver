import { describe, expect, it } from "vitest";
import { arenaSpec } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// The dev arena can be fought in the ring (item V.3) of an indoor map the tester picks.

const spec = {
  trainer: { name: "Tester", character: "male" },
  team: [{ species: 155, level: 10, moves: [52] }],
  foe: { kind: "wild", behavior: "idle", team: [{ species: 152, level: 10, moves: [33] }] },
};

describe("protocol v39", () => {
  it("is at least version 39", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(39);
  });

  it("takes an optional map id for the arena's ring", () => {
    expect(arenaSpec.safeParse(spec).success).toBe(true);
    expect(arenaSpec.safeParse({ ...spec, ring: 52 }).success).toBe(true);
    expect(arenaSpec.safeParse({ ...spec, ring: -1 }).success).toBe(false);
    expect(arenaSpec.safeParse({ ...spec, ring: "52" }).success).toBe(false);
  });
});
