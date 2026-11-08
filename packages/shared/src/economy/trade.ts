import type { ShopRecord } from "../events/schemas.ts";
import type { ShopRefusal } from "../game/protocol.ts";
import type { ItemRecord } from "../game-data/items.ts";
import type { Save } from "../save/schema.ts";
import { canAdd } from "../items/bag.ts";

// Buying and selling at a Poké Mart (spec 023, data-model.md): each check runs before anything changes.

export const MONEY_MAX = 999999;
export const BAG_ITEM_MAX = 999;
export const BUY_MAX = 99;

export type Wallet = Pick<Save, "money" | "bag">;
export type PriceInfo = Pick<ItemRecord, "id" | "price" | "pocket">;
export type StockEntry = { item: number; price: number };

/** What this shop offers a player with `badges` badges; items without data are left out. */
export function stockFor(shop: ShopRecord, badges: number, info: (id: number) => PriceInfo | undefined): StockEntry[] {
  return shop.items.flatMap(({ item, minBadges }) => {
    const price = info(item)?.price;
    return minBadges <= badges && price !== undefined ? [{ item, price }] : [];
  });
}

/** Half the price, rounded down; undefined for key items and items without a price. */
export function sellPrice(item: PriceInfo): number | undefined {
  return item.price > 0 && item.pocket !== "key-items" ? Math.floor(item.price / 2) : undefined;
}

/** `info` (spec 027): with the item data, the bag pocket's limits hold too. */
export function buy(w: Wallet, stock: StockEntry[], item: number, qty: number, info?: (id: number) => PriceInfo | undefined): ShopRefusal | null {
  if (!Number.isInteger(qty) || qty < 1 || qty > BUY_MAX) return "invalid";
  const entry = stock.find((s) => s.item === item);
  if (!entry) return "stock";
  const cost = entry.price * qty;
  if (cost > w.money) return "money";
  const row = w.bag.find((b) => b.item === item);
  if ((row?.count ?? 0) + qty > BAG_ITEM_MAX || (info && !canAdd(w.bag, item, qty, (id) => info(id)?.pocket))) return "bag-full";
  w.money -= cost;
  if (row) row.count += qty;
  else w.bag.push({ item, count: qty });
  return null;
}

export function sell(w: Wallet, info: (id: number) => PriceInfo | undefined, item: number, qty: number): ShopRefusal | null {
  if (!Number.isInteger(qty) || qty < 1) return "invalid";
  const row = w.bag.find((b) => b.item === item);
  if (!row || row.count < qty) return "not-owned";
  const data = info(item);
  const price = data && sellPrice(data);
  if (price === undefined) return "unsellable";
  w.money = Math.min(MONEY_MAX, w.money + price * qty);
  row.count -= qty;
  if (row.count === 0) w.bag.splice(w.bag.indexOf(row), 1);
  return null;
}
