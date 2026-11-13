import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";

// The session's player list, for the Online tab beside the game screen.

describe("protocol v12", () => {
  it("accepts the player list", () => {
    expect(serverMessage.safeParse({ type: "players", players: [{ id: 1, name: "Dio", host: true, area: "60" }, { id: 2, name: "Lyra", host: false, area: "61" }] }).success).toBe(true);
  });

  it.each([{ type: "players", players: [{ id: 1, name: "", host: true, area: "60" }] }, { type: "players", players: Array.from({ length: 5 }, (_, i) => ({ id: i, name: "A", host: false, area: "60" })) }])("rejects %j", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(false);
  });
});
