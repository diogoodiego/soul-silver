import { describe, expect, it } from "vitest";
import { cartMax, cartTotal } from "../../src/game/shop-cart";

const stock = [
  { item: 4, price: 200 },
  { item: 17, price: 300 },
];

describe("shop cart", () => {
  it("totals every line", () => {
    expect(cartTotal(new Map([[4, 2], [17, 1]]), stock)).toBe(700);
    expect(cartTotal(new Map(), stock)).toBe(0);
  });

  it("buying, a line grows only while the money left pays for it", () => {
    const cart = new Map([[17, 2]]);
    // 1000 - 600 = 400 left: two more Poké Balls.
    expect(cartMax(cart, stock, 4, { mode: "buy", money: 1000, owned: 0 })).toBe(2);
    expect(cartMax(cart, stock, 17, { mode: "buy", money: 1000, owned: 0 })).toBe(3);
    expect(cartMax(new Map(), stock, 4, { mode: "buy", money: 1_000_000, owned: 0 })).toBe(99);
  });

  it("selling, a line holds at most what the bag has", () => {
    expect(cartMax(new Map(), stock, 17, { mode: "sell", money: 0, owned: 5 })).toBe(5);
  });
});
