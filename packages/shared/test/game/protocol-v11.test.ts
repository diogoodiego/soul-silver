import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 019, contracts/game-protocol-v11.md: the AI debug overlay.

const row = {
  entityId: 41,
  state: "combat",
  target: 3,
  sight: { rangePx: 80, angleDeg: 110, facing: { x: 1, y: 0 } },
  lastSeen: { x: 512, y: 300 },
  zone: { x: 480, y: 288, radiusPx: 160 },
  scores: [{ slot: 0, move: 52, damage: 11.2, hit: 0.8, utility: 0, score: 9 }],
  chosenSlot: 0,
};

describe("protocol v11", () => {
  it("is version 11", () => {
    expect(PROTOCOL_VERSION).toBe(11);
  });

  it("accepts debugAi on and off", () => {
    expect(clientMessage.safeParse({ type: "debugAi", on: true }).success).toBe(true);
    expect(clientMessage.safeParse({ type: "debugAi", on: false }).success).toBe(true);
  });

  it.each([{ type: "debugAi" }, { type: "debugAi", on: "yes" }, { type: "debugAi", on: true, extra: 1 }])("rejects a malformed debugAi %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });

  it("accepts aiDebug rows, with nothing to point at", () => {
    expect(serverMessage.safeParse({ type: "aiDebug", tick: 1200, ais: [row] }).success).toBe(true);
    expect(serverMessage.safeParse({ type: "aiDebug", tick: 1, ais: [{ ...row, target: null, lastSeen: null, chosenSlot: null, scores: [] }] }).success).toBe(true);
  });

  it("rejects an unknown AI state", () => {
    expect(serverMessage.safeParse({ type: "aiDebug", tick: 1, ais: [{ ...row, state: "dancing" }] }).success).toBe(false);
  });
});
