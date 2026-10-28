import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 022, contracts/protocol-v15.md: trainer battles.

describe("protocol v15", () => {
  it("is at least version 15", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(15);
  });

  it.each([
    { type: "trainerSpotted", npcId: 40, trainerId: 3, tiles: 4 },
    { type: "trainerBattleStart", battleId: 1, player: 2, trainerId: 3, arena: { area: "176", x: 96, y: 64, radiusPx: 96 }, music: "trainer", double: false },
    { type: "trainerSendOut", battleId: 1, slot: 0, entityId: 77 },
    { type: "trainerItem", battleId: 1, item: 17, target: 77 },
    { type: "trainerBattleEnd", battleId: 1, result: "won", prize: 48 },
    { type: "trainerBattleEnd", battleId: 1, result: "aborted" },
    { type: "notice", code: "no-escape" },
    { type: "trainerSpotted", npcId: 40, trainerId: 3, tiles: 4, intro: "0728:12" },
    { type: "trainerBattleEnd", battleId: 1, result: "won", prize: 48, defeat: "0728:13" },
    { type: "trainerSay", text: "0728:14" },
    { type: "trainerBattleStart", battleId: 1, player: 2, trainerId: 3, arena: { area: "176", x: 96, y: 64, radiusPx: 96 }, music: "rocket", double: false },
  ])("accepts %j", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(true);
  });

  it("rejects an unknown music or result", () => {
    expect(serverMessage.safeParse({ type: "trainerBattleStart", battleId: 1, player: 2, trainerId: 3, arena: { area: "1", x: 0, y: 0, radiusPx: 96 }, music: "elite", double: false }).success).toBe(false);
    expect(serverMessage.safeParse({ type: "trainerBattleEnd", battleId: 1, result: "draw" }).success).toBe(false);
  });
});
