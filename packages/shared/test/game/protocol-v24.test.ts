import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 028.5 (contracts/protocol-v24.md): the duel's messages.

describe("protocol v24", () => {
  it("is version 24 or later", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(24);
  });

  it("accepts the duel requests", () => {
    for (const msg of [{ type: "duel-invite", to: 2, rules: { level: "50", team: 3 } }, { type: "duel-answer", accept: false }, { type: "duel-cancel" }]) expect(clientMessage.safeParse(msg).success, JSON.stringify(msg)).toBe(true);
  });

  it.each([{ level: "100", team: 3 }, { level: "current", team: 0 }, { level: "current", team: 7 }])("refuses rules out of shape: %j", (rules) => {
    expect(clientMessage.safeParse({ type: "duel-invite", to: 2, rules }).success).toBe(false);
  });

  it("accepts the duel state and refuses an unknown result", () => {
    const state = { type: "duelState", phase: "ended", partner: 1, rules: { level: "current", team: 1 }, result: "won" };
    expect(serverMessage.safeParse(state).success).toBe(true);
    expect(serverMessage.safeParse({ ...state, result: "draw" }).success).toBe(false);
  });
});
