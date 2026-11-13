import { describe, expect, it } from "vitest";
import { clientMessage, hitEvent, scriptRequest, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 027, contracts/protocol-v21.md: items in combat, held items, Berry Pots, the Apricorn Box and the Dowsing MCHN.

describe("protocol v21", () => {
  it("is version 21", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(21);
  });

  it.each([
    { type: "use-item-combat", item: 17 },
    { type: "use-item", item: 38, partyIndex: 0, moveIndex: 3 },
    { type: "use-item", item: 17, partyIndex: 5 },
    { type: "set-held", partyIndex: 0, item: 155 },
    { type: "set-held", partyIndex: 2, item: null },
    { type: "berry-plant", pot: 3, item: 155 },
    { type: "berry-harvest", pot: 0 },
  ])("client sends %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    ["a move slot of 4", { type: "use-item", item: 38, partyIndex: 0, moveIndex: 4 }],
    ["a combat item with a party index (the one out is the target)", { type: "use-item-combat", item: 17, partyIndex: 0 }],
    ["a held item without a party index", { type: "set-held", item: 155 }],
    ["a fifth pot", { type: "berry-plant", pot: 4, item: 155 }],
    ["an unknown field", { type: "berry-harvest", pot: 0, all: true }],
  ])("client is refused %s", (_, msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });

  it.each([
    { type: "items-state", useEndsTick: 120, cooldownUntilTick: 240 },
    { type: "items-state", repelEndsAt: "2026-11-07T10:00:26.000Z" },
    { type: "items-state" },
    { type: "dowse", dir: 359, near: 0.5 },
    { type: "dowse" },
    { type: "berry-pots", pots: [{ berry: 155, stage: "ripe" }, null, null, null] },
    { type: "apricorn-box", counts: [1, 0, 0, 0, 0, 0, 2] },
    { type: "party", members: [{ species: 155, level: 5, hp: 20, hpMax: 20, held: 155, ppUps: [1, 0, 0, 0] }] },
  ])("server sends %j", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    ["a bearing of 360", { type: "dowse", dir: 360, near: 0.5 }],
    ["a closeness above 1", { type: "dowse", dir: 10, near: 1.5 }],
    ["three pots", { type: "berry-pots", pots: [null, null, null] }],
    ["an unknown berry stage", { type: "berry-pots", pots: [{ berry: 155, stage: "rotten" }, null, null, null] }],
  ])("server is refused %s", (_, msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(false);
  });

  it("a held item that acted is a combat event with the item", () => {
    expect(hitEvent.safeParse({ kind: "held", attacker: 3, target: 3, move: 0, amount: 10, effectiveness: 1, crit: false, push: { x: 0, y: 0 }, item: 155 }).success).toBe(true);
  });

  it("Kurt asks for an apricorn colour from the box", () => {
    expect(scriptRequest.safeParse({ kind: "apricorn", counts: [0, 2, 0, 0, 0, 0, 0] }).success).toBe(true);
    expect(scriptRequest.safeParse({ kind: "apricorn", counts: [0, 2] }).success).toBe(false);
  });
});
