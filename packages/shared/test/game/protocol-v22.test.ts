import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 028.1 (contracts/protocol-v22.md): each player's map in the session list.

describe("protocol v22", () => {
  it("is version 22", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(22);
  });

  it("refuses a v21 player list, without the map", () => {
    expect(serverMessage.safeParse({ type: "players", players: [{ id: 1, name: "Dio", host: true }] }).success).toBe(false);
    expect(serverMessage.safeParse({ type: "players", players: [{ id: 1, name: "Dio", host: true, area: "60" }] }).success).toBe(true);
  });
});
