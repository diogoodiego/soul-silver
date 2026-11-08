import { describe, expect, it } from "vitest";
import type { ItemRecord } from "../../src/game-data/items.ts";
import { itemCoverage, type ItemEffects } from "../../src/items/index.ts";

// Spec 027, FR-017: the coverage report lists items with no effect, and which of them the player can get.

const blank = "0".repeat(40);
const rec = (id: number, pocket: ItemRecord["pocket"], params = blank, hold = 0) => ({ id, pocket, partyUse: { kind: 1, params }, holdEffect: { id: hold, parameter: 0 } });
const effects: ItemEffects = { use: { "92": { archetype: "none", reason: "sell" } }, held: { "69": { trigger: "regen", fraction: 0.0625 } } };

describe("item coverage", () => {
  it("lists an item with no use and no hold effect; a mapped, held, passive or key item is not listed", () => {
    const records = [rec(17, "medicine", "0000000000040000000000000014000000000000"), rec(92, "items"), rec(234, "items", blank, 69), rec(468, "key-items"), rec(99, "items"), rec(300, "items", blank, 70)];
    expect(itemCoverage(records, effects, new Set())).toEqual({ unmapped: [99, 300], obtainableUnmapped: [] });
  });

  it("flags the unmapped items the player can get", () => {
    const records = [rec(99, "items"), rec(100, "items")];
    expect(itemCoverage(records, effects, new Set([100, 17])).obtainableUnmapped).toEqual([100]);
  });
});
