import { BAG_ITEM_MAX } from "../economy/trade.ts";
import { canAdd, type PocketOf } from "../items/bag.ts";
import type { PcRefusal } from "../game/protocol.ts";
import { PC_ITEMS_MAX, type Save } from "../save/schema.ts";

// PC item storage (spec 023). An addition: HGSS PCs keep no items (docs/balance-log.md).

export type ItemStore = Pick<Save, "bag" | "pcItems">;
type Stack = { item: number; count: number };

/** Moves `qty` of `item` from one list to the other; checks everything first. */
function move(from: Stack[], to: Stack[], toMaxKinds: number, item: number, qty: number, pocketOf?: PocketOf): PcRefusal | null {
  if (!Number.isInteger(qty) || qty < 1) return "invalid";
  const src = from.find((s) => s.item === item);
  if (!src || src.count < qty) return "empty";
  const dst = to.find((s) => s.item === item);
  // Into the bag with the item data: the pocket's limits (spec 027); the PC keeps its own.
  if (pocketOf ? !canAdd(to, item, qty, pocketOf) : (dst?.count ?? 0) + qty > BAG_ITEM_MAX || (!dst && to.length >= toMaxKinds)) return "full";
  src.count -= qty;
  if (src.count === 0) from.splice(from.indexOf(src), 1);
  if (dst) dst.count += qty;
  else to.push({ item, count: qty });
  return null;
}

export const depositItem = (s: ItemStore, item: number, qty: number) => move(s.bag, s.pcItems, PC_ITEMS_MAX, item, qty);
export const withdrawItem = (s: ItemStore, item: number, qty: number, pocketOf?: PocketOf) => move(s.pcItems, s.bag, Infinity, item, qty, pocketOf);
