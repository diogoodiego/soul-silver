import { describe, expect, it } from "vitest";
import { readItem, readItemMap } from "../../src/data/readers/item.ts";
import { item, itemMap } from "../fixtures/game-data/builders.ts";

const at = (offset: number, bytes: Uint8Array) => {
  const buffer = new Uint8Array(offset + bytes.length + 8);
  buffer.set(bytes, offset);
  return buffer;
};

describe("readItemMap", () => {
  it("returns the data index of each item id, starting at id 0", () => {
    expect(readItemMap(at(0x20, itemMap([0, 1, 2, 0, 3])), 0x20, 4, 4)).toEqual([0, 1, 2, 0, 3]);
  });

  it("throws when id 0 does not point to data 0", () => {
    expect(() => readItemMap(at(0, itemMap([1, 1, 2])), 0, 2, 3)).toThrow(/mapa de itens/i);
  });

  it("throws when an index is beyond the last data member", () => {
    expect(() => readItemMap(at(0, itemMap([0, 1, 9])), 0, 2, 3)).toThrow(/mapa de itens/i);
  });

  it("throws when the table runs past the code", () => {
    expect(() => readItemMap(new Uint8Array(8), 0, 5, 9)).toThrow(/mapa de itens/i);
  });
});

describe("readItem", () => {
  it("decodes every field", () => {
    const bytes = item({
      price: 300,
      holdEffect: 70,
      holdParam: 20,
      pluck: 3,
      flingEffect: 4,
      flingPower: 30,
      naturalGiftPower: 60,
      naturalGiftType: 12,
      preventToss: true,
      selectable: true,
      pocket: 1,
      battlePockets: 4,
      fieldUse: 1,
      battleUse: 2,
      partyUseKind: 5,
      partyParams: [0x14, 0xab],
    });
    expect(readItem(bytes, 17, 9)).toEqual({
      id: 17,
      dataIndex: 9,
      name: { catalog: "item-names", index: 17 },
      price: 300,
      pocket: "medicine",
      battlePockets: 4,
      holdEffect: { id: 70, parameter: 20 },
      fling: { effect: 4, power: 30 },
      naturalGift: { power: 60, type: 12 },
      pluckEffect: 3,
      preventToss: true,
      selectable: true,
      fieldUse: 1,
      battleUse: 2,
      partyUse: { kind: 5, params: `14ab${"00".repeat(18)}` },
    });
  });

  it.each([
    [0, "items"],
    [1, "medicine"],
    [2, "balls"],
    [3, "machines"],
    [4, "berries"],
    [5, "mail"],
    [6, "battle-items"],
    [7, "key-items"],
  ] as const)("maps pocket %i to %s", (raw, key) => {
    expect(readItem(item({ pocket: raw }), 1, 1).pocket).toBe(key);
  });

  it("throws for a pocket the game does not have", () => {
    expect(() => readItem(item({ pocket: 9 }), 5, 5)).toThrow(/bolso.*5/i);
  });

  it("keeps a price of 0 and the natural gift 'none' type as stored", () => {
    expect(readItem(item(), 1, 1)).toMatchObject({ price: 0, naturalGift: { power: 0, type: 31 } });
  });

  it("throws when the record is shorter than 34 bytes", () => {
    expect(() => readItem(item().subarray(0, 33), 1, 1)).toThrow(/34/);
  });
});
