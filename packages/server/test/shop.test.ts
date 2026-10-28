import { describe, expect, it } from "vitest";
import { buildShopData } from "../src/shop";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 023 US1: a clerk's script opens the shop, the server validates every purchase and sale, the
// script goes on once the player leaves. Synthetic shops and prices (principle II).

const clerk = scriptFile(100, [
  "L1:",
  ["MartBuy", { arg0: 0x8004 }],
  ["SetFlag", { flag: { flag: 320 } }],
  ["End"],
  "L2:",
  ["SetVar", { var: { variable: 0x8004 }, val: 0 }],
  ["SpecialMartBuy", { arg0: 0x8004 }],
  ["End"],
  "L3:",
  ["MartSell"],
  ["End"],
]);
const shops = buildShopData(
  [
    { id: 0, items: [{ item: 4, minBadges: 0 }, { item: 17, minBadges: 0 }, { item: 3, minBadges: 1 }] },
    { id: 1, items: [{ item: 146, minBadges: 0 }] },
  ],
  [
    { id: 4, price: 200, pocket: "balls" },
    { id: 17, price: 300, pocket: "medicine" },
    { id: 3, price: 600, pocket: "balls" },
    { id: 146, price: 50, pocket: "mail" },
    { id: 450, price: 0, pocket: "key-items" },
  ],
);
const data = () => scriptData([clerk], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0), npc(1, 2, 1, 1), npc(2, 0, 1, 2)] }) });

/** Talks to the clerk at (1, 2), below the spawn, or to the sell clerk at (0, 1), west of it. */
function atClerk(save: Record<string, unknown> = {}, players = 1, mode: "buy" | "sell" = "buy") {
  const t = story(data(), { shops });
  const cs = Array.from({ length: players }, () => t.connect(undefined, undefined, { save }));
  t.step();
  for (const c of cs) {
    if (mode === "sell") t.walk(c, { x: -1, y: 0 }, 1);
    t.press(c);
  }
  return { t, cs, c: cs[0]! };
}

describe("Poké Mart (US1)", () => {
  it("opens with the stock this player's badges reach and their prices", () => {
    const { t, c } = atClerk({ money: 3000, badges: 0 });
    expect(t.of(c, "shopOpen").at(-1)).toEqual({ type: "shopOpen", shopId: 0, mode: "buy", money: 3000, stock: [{ item: 4, price: 200 }, { item: 17, price: 300 }] });
    const { t: t1, c: c1 } = atClerk({ badges: 1 });
    expect(t1.of(c1, "shopOpen").at(-1)!.stock.map((s) => s.item)).toEqual([4, 17, 3]);
  });

  it("buys: takes the money, fills the bag and answers the new balance", () => {
    const { t, c } = atClerk({ money: 3000 });
    c.conn.send({ type: "shop-buy", item: 4, qty: 3 });
    t.step();
    expect(t.of(c, "shopResult").at(-1)).toEqual({ type: "shopResult", ok: true, money: 2400 });
    expect(t.of(c, "bag").at(-1)!.items).toContainEqual({ item: 4, count: 3 });
    t.session.close("closed-by-host");
    expect(c.saves().at(-1)!.save).toMatchObject({ money: 2400, bag: [{ item: 4, count: 3 }] });
  });

  it.each([
    ["too little money", { money: 100 }, { type: "shop-buy", item: 4, qty: 1 }, "money"],
    ["an item out of stock for this player", {}, { type: "shop-buy", item: 3, qty: 1 }, "stock"],
    ["selling at the buy counter", { bag: [{ item: 17, count: 1 }] }, { type: "shop-sell", item: 17, qty: 1 }, "invalid"],
    ["selling an item the player does not have", {}, { type: "shop-sell", item: 17, qty: 1 }, "not-owned"],
    ["selling a key item", { bag: [{ item: 450, count: 1 }] }, { type: "shop-sell", item: 450, qty: 1 }, "unsellable"],
  ] as const)("refuses %s and changes nothing", (_, save, msg, reason) => {
    const { t, c } = atClerk({ money: 3000, ...save }, 1, msg.type === "shop-sell" && reason !== "invalid" ? "sell" : "buy");
    c.conn.send(msg);
    t.step();
    expect(t.of(c, "shopResult").at(-1)).toMatchObject({ ok: false, reason });
    t.session.close("closed-by-host");
    expect(c.saves().at(-1)!.save).toMatchObject({ money: "money" in save ? save.money : 3000, bag: "bag" in save ? save.bag : [] });
  });

  it("sells at half price from the sell menu and lists what can be sold", () => {
    const { t: sell, c: s } = atClerk({ money: 0, bag: [{ item: 17, count: 2 }, { item: 450, count: 1 }] }, 1, "sell");
    expect(sell.of(s, "shopOpen").at(-1)).toEqual({ type: "shopOpen", shopId: 0, mode: "sell", money: 0, stock: [{ item: 17, price: 150 }] });
    s.conn.send({ type: "shop-sell", item: 17, qty: 2 });
    sell.step();
    expect(sell.of(s, "shopResult").at(-1)).toEqual({ type: "shopResult", ok: true, money: 300 });
    expect(sell.of(s, "shopOpen").at(-1)!.stock).toEqual([]);
  });

  it("refuses every request without an open shop", () => {
    const t = story(data(), { shops });
    const c = t.connect(undefined, undefined, { save: { money: 3000 } });
    t.step();
    c.conn.send({ type: "shop-buy", item: 4, qty: 1 });
    t.step();
    expect(t.of(c, "shopResult").at(-1)).toEqual({ type: "shopResult", ok: false, reason: "invalid", money: 3000 });
  });

  it("the script goes on after the player leaves the shop", () => {
    const { t, c } = atClerk();
    c.conn.send({ type: "shop-leave" });
    t.step();
    expect(t.of(c, "shopClose")).toHaveLength(1);
    t.session.close("closed-by-host");
    expect(c.saves().at(-1)!.save.flags).toContain(320);
  });

  it("keeps each player's money and bag apart", () => {
    const { t, cs } = atClerk({ money: 1000 }, 2);
    cs[0]!.conn.send({ type: "shop-buy", item: 4, qty: 5 });
    t.step();
    expect(t.of(cs[0]!, "shopResult").at(-1)).toMatchObject({ ok: true, money: 0 });
    expect(t.of(cs[1]!, "shopResult")).toHaveLength(0);
    t.session.close("closed-by-host");
    expect(cs[1]!.saves().at(-1)!.save).toMatchObject({ money: 1000, bag: [] });
  });

  it("closes the shop when the player disconnects", () => {
    const { t, c } = atClerk();
    c.conn.close();
    t.step();
    expect(() => t.step(5)).not.toThrow();
  });
});
