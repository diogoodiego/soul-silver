import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 028.2 (contracts/protocol-v23.md): the trade flow's messages.

describe("protocol v23", () => {
  it("is version 23", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(23);
  });

  it("accepts the trade requests", () => {
    for (const msg of [{ type: "trade-propose", to: 2 }, { type: "trade-answer", accept: true }, { type: "trade-offer", offer: { party: [0, 5], items: [{ item: 17, count: 3 }] } }, { type: "trade-confirm" }, { type: "trade-cancel" }]) expect(clientMessage.safeParse(msg).success, JSON.stringify(msg)).toBe(true);
  });

  it.each([
    { type: "trade-offer", offer: { party: [6], items: [] } },
    { type: "trade-offer", offer: { party: [0, 1, 2, 3, 4, 5, 0], items: [] } },
    { type: "trade-offer", offer: { party: [], items: [{ item: 17, count: 0 }] } },
  ])("refuses an offer out of shape: %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });

  it("accepts the trade state and refuses an unknown phase", () => {
    const state = { type: "tradeState", phase: "final", partner: 1, mine: { party: [0], items: [] }, theirs: { party: [], items: [{ item: 4, count: 2 }] }, confirmed: { mine: true, theirs: false } };
    expect(serverMessage.safeParse(state).success).toBe(true);
    expect(serverMessage.safeParse({ ...state, phase: "traded" }).success).toBe(false);
  });
});
