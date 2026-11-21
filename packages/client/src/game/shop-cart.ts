import { BUY_MAX } from "@soulsilver/shared/economy";

// The shop totem's cart: how many of each item the player picked before confirming. The server still checks
// every purchase and sale; this only keeps the counters within what can go through.

export type Cart = ReadonlyMap<number, number>;
type Stock = readonly { item: number; price: number }[];

const priceOf = (stock: Stock, item: number) => stock.find((s) => s.item === item)?.price ?? 0;

export function cartTotal(cart: Cart, stock: Stock): number {
  let total = 0;
  for (const [item, qty] of cart) total += priceOf(stock, item) * qty;
  return total;
}

/** The most of `item` the cart may hold: buying, while the money left pays for it (at most BUY_MAX); selling, what the bag holds. */
export function cartMax(cart: Cart, stock: Stock, item: number, at: { mode: "buy" | "sell"; money: number; owned: number }): number {
  if (at.mode === "sell") return at.owned;
  const price = priceOf(stock, item);
  const has = cart.get(item) ?? 0;
  if (price === 0) return has;
  return Math.min(BUY_MAX, has + Math.floor((at.money - cartTotal(cart, stock)) / price));
}
