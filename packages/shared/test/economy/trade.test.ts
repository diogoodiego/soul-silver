import { describe, expect, it } from "vitest";
import { buy, MONEY_MAX, sell, sellPrice, stockFor, type PriceInfo, type Wallet } from "../../src/economy/trade.ts";

// Spec 023, data-model.md "Validações": a refusal changes nothing.

const item = (id: number, price: number, pocket: PriceInfo["pocket"] = "medicine"): PriceInfo => ({ id, price, pocket });
const ITEMS = new Map([
  [4, item(4, 200, "balls")],
  [17, item(17, 300)],
  [3, item(3, 600, "balls")],
  [1, item(1, 0, "balls")],
  [450, item(450, 1000, "key-items")],
]);
const prices = (id: number) => ITEMS.get(id);
const shop = { id: 0, items: [{ item: 4, minBadges: 0 }, { item: 17, minBadges: 0 }, { item: 3, minBadges: 3 }] };
const wallet = (money = 3000, bag: Wallet["bag"] = []): Wallet => ({ money, bag });

describe("stock", () => {
  it("lists the items this many badges reach, with their prices", () => {
    expect(stockFor(shop, 0, prices)).toEqual([{ item: 4, price: 200 }, { item: 17, price: 300 }]);
    expect(stockFor(shop, 3, prices)).toEqual([{ item: 4, price: 200 }, { item: 17, price: 300 }, { item: 3, price: 600 }]);
  });
});

describe("sellPrice", () => {
  it("is half the price, rounded down; key items and priceless items do not sell", () => {
    expect(sellPrice(item(17, 300))).toBe(150);
    expect(sellPrice(item(9, 35))).toBe(17);
    expect(sellPrice(item(1, 0))).toBeUndefined();
    expect(sellPrice(item(450, 1000, "key-items"))).toBeUndefined();
  });
});

describe("buy", () => {
  it("takes qty × price and puts the items in the bag", () => {
    const w = wallet(3000, [{ item: 4, count: 2 }]);
    expect(buy(w, stockFor(shop, 0, prices), 4, 3)).toBeNull();
    expect(w).toEqual({ money: 2400, bag: [{ item: 4, count: 5 }] });
    expect(buy(w, stockFor(shop, 0, prices), 17, 1)).toBeNull();
    expect(w.bag).toContainEqual({ item: 17, count: 1 });
  });

  it.each([
    ["too little money", wallet(599), 4, 3, "money"],
    ["an item the shop does not sell to this player", wallet(), 3, 1, "stock"],
    ["a quantity below 1", wallet(), 4, 0, "invalid"],
    ["a quantity above 99", wallet(99999), 4, 100, "invalid"],
    ["a bag that cannot hold that many", wallet(3000, [{ item: 4, count: 998 }]), 4, 2, "bag-full"],
  ])("refuses %s without changing anything", (_, w, id, qty, reason) => {
    const before = structuredClone(w);
    expect(buy(w, stockFor(shop, 0, prices), id, qty)).toBe(reason);
    expect(w).toEqual(before);
  });
});

describe("sell", () => {
  it("pays half the price per item and takes them from the bag", () => {
    const w = wallet(100, [{ item: 17, count: 3 }]);
    expect(sell(w, prices, 17, 2)).toBeNull();
    expect(w).toEqual({ money: 400, bag: [{ item: 17, count: 1 }] });
    expect(sell(w, prices, 17, 1)).toBeNull();
    expect(w.bag).toEqual([]);
  });

  it("keeps the money at the cap", () => {
    const w = wallet(MONEY_MAX - 100, [{ item: 17, count: 2 }]);
    expect(sell(w, prices, 17, 2)).toBeNull();
    expect(w.money).toBe(MONEY_MAX);
  });

  it.each([
    ["an item not in the bag", wallet(), 17, 1, "not-owned"],
    ["more than the player has", wallet(0, [{ item: 17, count: 1 }]), 17, 2, "not-owned"],
    ["a key item", wallet(0, [{ item: 450, count: 1 }]), 450, 1, "unsellable"],
    ["a priceless item", wallet(0, [{ item: 1, count: 1 }]), 1, 1, "unsellable"],
    ["an unknown item", wallet(0, [{ item: 9999, count: 1 }]), 9999, 1, "unsellable"],
    ["a quantity below 1", wallet(0, [{ item: 17, count: 1 }]), 17, 0, "invalid"],
  ])("refuses %s without changing anything", (_, w, id, qty, reason) => {
    const before = structuredClone(w);
    expect(sell(w, prices, id, qty)).toBe(reason);
    expect(w).toEqual(before);
  });
});
