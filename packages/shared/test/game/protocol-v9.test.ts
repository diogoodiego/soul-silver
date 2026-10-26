import { describe, expect, it } from "vitest";
import { clientMessage, NOTICE_CODES, serverMessage } from "../../src/game/protocol";

// Spec 017, contracts/game-protocol-v9.md.

const ok = (msg: unknown) => clientMessage.safeParse(msg).success;

describe("protocol v9", () => {
  it("accepts menu open and close", () => {
    expect(ok({ type: "menu", open: true })).toBe(true);
    expect(ok({ type: "menu", open: false })).toBe(true);
    expect(ok({ type: "menu" })).toBe(false);
    expect(ok({ type: "menu", open: "yes" })).toBe(false);
  });

  it("accepts reorder-party with indexes 0–5", () => {
    expect(ok({ type: "reorder-party", from: 0, to: 5 })).toBe(true);
    expect(ok({ type: "reorder-party", from: 0, to: 6 })).toBe(false);
    expect(ok({ type: "reorder-party", from: -1, to: 1 })).toBe(false);
    expect(ok({ type: "reorder-party", from: 1.5, to: 1 })).toBe(false);
  });

  it("accepts use-item with an item id and a party index 0–5", () => {
    expect(ok({ type: "use-item", item: 17, partyIndex: 0 })).toBe(true);
    expect(ok({ type: "use-item", item: 17, partyIndex: 6 })).toBe(false);
    expect(ok({ type: "use-item", item: -1, partyIndex: 0 })).toBe(false);
    expect(ok({ type: "use-item", item: 17 })).toBe(false);
  });

  it("adds the menu and item notices", () => {
    expect(NOTICE_CODES).toEqual(expect.arrayContaining(["menu-blocked", "action-refused", "item-unavailable"]));
  });

  it("sends party details for the party screen", () => {
    const detail = { moves: [33, 45], stats: { hp: 30, attack: 12, defense: 11, speed: 10, specialAttack: 9, specialDefense: 13 }, nature: 3, ability: 65, exp: 560, expNext: 742 };
    expect(serverMessage.safeParse({ type: "party", members: [{ species: 152, level: 10, hp: 30, hpMax: 30, ...detail }] }).success).toBe(true);
    // Details stay optional: older fixtures and a missing species still parse.
    expect(serverMessage.safeParse({ type: "party", members: [{ species: 152, level: 10, hp: 30, hpMax: 30 }] }).success).toBe(true);
  });
});
