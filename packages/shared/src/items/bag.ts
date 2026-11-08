import type { PocketKey } from "../game-data/items.ts";

// The only way into and out of the bag (spec 027, research R1): scripts, marts, the PC, the ground,
// Kurt and the companion all add through here, so no path forgets a pocket's limit.

/** HGSS bag (bag.c): kinds each pocket holds, and the most of one item. Engine limits, like PC_ITEMS_MAX. */
export const POCKET_LIMITS: Record<PocketKey, { kinds: number; stack: number }> = {
  items: { kinds: 165, stack: 999 },
  medicine: { kinds: 40, stack: 999 },
  balls: { kinds: 24, stack: 999 },
  machines: { kinds: 101, stack: 99 },
  berries: { kinds: 64, stack: 999 },
  mail: { kinds: 12, stack: 999 },
  "battle-items": { kinds: 30, stack: 999 },
  "key-items": { kinds: 50, stack: 999 },
};

export type BagRow = { item: number; count: number };
/** The pocket of an item, undefined when the extraction does not know it. */
export type PocketOf = (item: number) => PocketKey | undefined;

export const countOf = (bag: readonly BagRow[], item: number) => bag.find((b) => b.item === item)?.count ?? 0;

export function canAdd(bag: readonly BagRow[], item: number, count: number, pocketOf: PocketOf): boolean {
  const pocket = pocketOf(item);
  if (!pocket || !Number.isInteger(count) || count < 1) return false;
  const limit = POCKET_LIMITS[pocket];
  const have = countOf(bag, item);
  if (have + count > limit.stack) return false;
  return have > 0 || bag.filter((b) => pocketOf(b.item) === pocket).length < limit.kinds;
}

/** Adds `count` of `item`; false, with the bag unchanged, when it does not fit. */
export function addItem(bag: BagRow[], item: number, count: number, pocketOf: PocketOf): boolean {
  if (!canAdd(bag, item, count, pocketOf)) return false;
  const row = bag.find((b) => b.item === item);
  if (row) row.count += count;
  else bag.push({ item, count });
  return true;
}

/** Takes `count` of `item`; false, with the bag unchanged, when there is not that many. */
export function removeItem(bag: BagRow[], item: number, count: number): boolean {
  const row = bag.find((b) => b.item === item);
  if (!row || !Number.isInteger(count) || count < 1 || row.count < count) return false;
  row.count -= count;
  if (row.count === 0) bag.splice(bag.indexOf(row), 1);
  return true;
}
