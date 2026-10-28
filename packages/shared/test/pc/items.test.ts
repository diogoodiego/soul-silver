import { describe, expect, it } from "vitest";
import { depositItem, withdrawItem, type ItemStore } from "../../src/pc/items.ts";

// Spec 023 (an addition: HGSS PCs keep no items, see docs/balance-log.md): moves bag items to the PC
// and back; a refusal changes nothing.

const store = (bag: ItemStore["bag"] = [{ item: 17, count: 5 }], pcItems: ItemStore["pcItems"] = []): ItemStore => ({ bag, pcItems });

describe("PC items", () => {
  it("deposits part of a stack and withdraws it back, losing nothing", () => {
    const s = store();
    expect(depositItem(s, 17, 3)).toBeNull();
    expect(s).toEqual({ bag: [{ item: 17, count: 2 }], pcItems: [{ item: 17, count: 3 }] });
    expect(withdrawItem(s, 17, 3)).toBeNull();
    expect(s).toEqual({ bag: [{ item: 17, count: 5 }], pcItems: [] });
  });

  it.each([
    ["depositing more than the bag holds", () => store(), (s: ItemStore) => depositItem(s, 17, 6), "empty"],
    ["depositing an item not in the bag", () => store(), (s: ItemStore) => depositItem(s, 4, 1), "empty"],
    ["withdrawing more than the PC holds", () => store([], [{ item: 17, count: 1 }]), (s: ItemStore) => withdrawItem(s, 17, 2), "empty"],
    ["a 51st kind of item in the PC", () => store([{ item: 999, count: 1 }], Array.from({ length: 50 }, (_, i) => ({ item: i + 1, count: 1 }))), (s: ItemStore) => depositItem(s, 999, 1), "full"],
    ["more than 999 of one item in the PC", () => store([{ item: 17, count: 5 }], [{ item: 17, count: 998 }]), (s: ItemStore) => depositItem(s, 17, 2), "full"],
    ["more than 999 of one item in the bag", () => store([{ item: 17, count: 998 }], [{ item: 17, count: 5 }]), (s: ItemStore) => withdrawItem(s, 17, 2), "full"],
    ["a quantity below 1", () => store(), (s: ItemStore) => depositItem(s, 17, 0), "invalid"],
  ])("refuses %s without changing anything", (_, make, act, reason) => {
    const s = make();
    const before = structuredClone(s);
    expect(act(s)).toBe(reason);
    expect(s).toEqual(before);
  });
});
