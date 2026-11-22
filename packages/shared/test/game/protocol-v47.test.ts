import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// A decided trainer battle tells the player how it ended before it closes.

describe("protocol v47", () => {
  it("is at least version 47", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(47);
  });

  it("has trainerBattleOver, won or lost", () => {
    for (const result of ["won", "lost"]) expect(serverMessage.safeParse({ type: "trainerBattleOver", battleId: 1, result }).success).toBe(true);
    expect(serverMessage.safeParse({ type: "trainerBattleOver", battleId: 1, result: "aborted" }).success).toBe(false);
  });
});
