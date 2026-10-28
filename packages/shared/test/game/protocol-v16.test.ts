import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 023, contracts/protocol-v16.md: shops and the PC.

describe("protocol v16", () => {
  it("is at least version 16", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(16);
  });

  it.each([
    { type: "shopOpen", shopId: 1, mode: "buy", money: 3000, stock: [{ item: 4, price: 200 }] },
    { type: "shopResult", ok: true, money: 2400 },
    { type: "shopResult", ok: false, reason: "money", money: 10 },
    { type: "shopClose" },
    { type: "pcOpen" },
    { type: "pcResult", ok: false, reason: "last-fighter" },
    { type: "pcClose" },
    { type: "script", id: 3, request: { kind: "menu", items: ["0191:321", "0191:322", "0191:323"], cancel: true } },
  ])("server accepts %j", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    { type: "shop-buy", item: 4, qty: 3 },
    { type: "shop-sell", item: 4, qty: 1 },
    { type: "shop-leave" },
    { type: "pc-move", from: { where: "party", index: 1 }, to: { where: "box", box: 0, index: 29 } },
    { type: "pc-rename", box: 17, name: "Bugs" },
    { type: "pc-items", dir: "deposit", item: 17, qty: 2 },
    { type: "pc-leave" },
    { type: "script-answer", id: 3, answer: 20 },
  ])("client accepts %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    { type: "shop-buy", item: 4, qty: 0 },
    { type: "shop-buy", item: 4, qty: 100 },
    { type: "pc-move", from: { where: "box", box: 18, index: 0 }, to: { where: "party", index: 0 } },
    { type: "pc-move", from: { where: "box", box: 0, index: 30 }, to: { where: "party", index: 0 } },
    { type: "pc-rename", box: 0, name: "" },
    { type: "pc-rename", box: 0, name: "123456789" },
    { type: "pc-items", dir: "drop", item: 17, qty: 2 },
  ])("client rejects %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });

  it("rejects an unknown refusal reason", () => {
    expect(serverMessage.safeParse({ type: "shopResult", ok: false, reason: "broke", money: 0 }).success).toBe(false);
  });
});
