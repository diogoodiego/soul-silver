import { describe, expect, it } from "vitest";
import { readShops } from "../../src/events/shops.ts";

// Spec 023, T011: the common Poké Mart list ((item, rank) u16 pairs) and the special mart pointer
// table (u16 item lists ending in 0xFFFF), read from a synthetic ARM9 (principle II).

const BASE = 0x02000000;

/** A fake ARM9 with the normal list at 0x10, the pointer table at 0x40 and two lists after it. */
function arm9() {
  const b = new Uint8Array(0x100);
  const v = new DataView(b.buffer);
  [4, 1, 3, 3, 2, 6].forEach((x, i) => v.setUint16(0x10 + i * 2, x, true));
  v.setUint32(0x40, BASE + 0x60, true);
  v.setUint32(0x44, BASE + 0x70, true);
  [146, 14, 0xffff].forEach((x, i) => v.setUint16(0x60 + i * 2, x, true));
  [17, 0xffff].forEach((x, i) => v.setUint16(0x70 + i * 2, x, true));
  return b;
}

const layout = { normal: 0x10, normalCount: 3, special: 0x40, specialCount: 2, badgeRank: [1, 2, 2, 3, 3, 4, 4, 5, 6] };

describe("readShops", () => {
  it("turns each rank into the fewest badges that reach it", () => {
    expect(readShops(arm9(), layout)[0]).toEqual({ id: 0, items: [{ item: 4, minBadges: 0 }, { item: 3, minBadges: 3 }, { item: 2, minBadges: 8 }] });
  });

  it("reads special mart n as id n + 1, with no badge requirement", () => {
    expect(readShops(arm9(), layout).slice(1)).toEqual([
      { id: 1, items: [{ item: 146, minBadges: 0 }, { item: 14, minBadges: 0 }] },
      { id: 2, items: [{ item: 17, minBadges: 0 }] },
    ]);
  });

  it("refuses a rank no badge count reaches and a pointer outside the ARM9", () => {
    const bad = arm9();
    new DataView(bad.buffer).setUint16(0x12, 7, true);
    expect(() => readShops(bad, layout)).toThrow(/nível 7/);
    const out = arm9();
    new DataView(out.buffer).setUint32(0x44, BASE + 0x1000, true);
    expect(() => readShops(out, layout)).toThrow(/loja especial 1/);
  });
});
