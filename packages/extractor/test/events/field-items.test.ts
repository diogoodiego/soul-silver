import { describe, expect, it } from "vitest";
import { readApricornTrees, readBerryGrowth, readHiddenItems } from "../../src/events/field-items.ts";

// Spec 027: hidden items, apricorn trees and berry growth, from synthetic bytes in the original layout.

function hiddenTable(rows: [item: number, count: number, index: number][], at = 4) {
  const bytes = new Uint8Array(at + rows.length * 8);
  const view = new DataView(bytes.buffer);
  rows.forEach(([item, count, index], i) => {
    view.setUint16(at + i * 8, item, true);
    bytes[at + i * 8 + 2] = count;
    view.setUint16(at + i * 8 + 6, index, true);
  });
  return bytes;
}

describe("field items", () => {
  it("reads hidden items by their script index, with the flag the game uses (800 + index)", () => {
    const arm9 = hiddenTable([
      [17, 1, 0],
      [92, 1, 225],
      [92, 1, 1],
    ]);
    expect(readHiddenItems(arm9, { offset: 4, count: 3 })).toEqual([
      { index: 0, item: 17, count: 1, flag: 800 },
      { index: 1, item: 92, count: 1, flag: 801 },
      { index: 225, item: 92, count: 1, flag: 1025 },
    ]);
  });

  it("refuses a table past the end and a record with no item", () => {
    expect(() => readHiddenItems(hiddenTable([[17, 1, 0]]), { offset: 4, count: 2 })).toThrow(/fora da ARM9/);
    expect(() => readHiddenItems(hiddenTable([[0, 1, 0]]), { offset: 4, count: 1 })).toThrow(/sem item/);
  });

  it("reads one colour per apricorn tree and refuses a colour past black", () => {
    expect(readApricornTrees(new Uint8Array([9, 2, 1, 6, 9]), { offset: 1, count: 3 })).toEqual([2, 1, 6]);
    expect(() => readApricornTrees(new Uint8Array([7]), { offset: 0, count: 1 })).toThrow(/acima de 6/);
  });

  it("reads the hours per stage of each berry, Cheri first", () => {
    const berry = (hours: number) => Uint8Array.from([20, 0, 2, 1, hours, 15, 10, 0, 0, 0, 0, 25]);
    expect(readBerryGrowth([berry(3), berry(4)])).toEqual([
      { item: 149, hoursPerStage: 3 },
      { item: 150, hoursPerStage: 4 },
    ]);
    expect(() => readBerryGrowth([new Uint8Array(4)])).toThrow(/esperado 12/);
  });
});
