import { describe, expect, it } from "vitest";
import { readFlyPoints } from "../../src/events/fly-points.ts";

// Spec 025, T011: the spawn table (sSpawnMaps, unk_0203BA5C.s) of 18-byte records, from a synthetic ARM9
// (principle II). A record is u16 flags (low byte the FLYPOINT id, bit 9 "is a fly point"), the death
// warp map and tile, then the fly map and tile and the special warp map and tile.

const RECORD = 18;

function table(records: { flags: number; flyMap: number; x: number; y: number }[], at = 0x10) {
  const b = new Uint8Array(at + records.length * RECORD);
  const v = new DataView(b.buffer);
  records.forEach((r, i) => {
    const o = at + i * RECORD;
    [r.flags, 1, 0x0806, r.flyMap, r.x, r.y, r.flyMap, r.x, r.y].forEach((n, k) => v.setUint16(o + k * 2, n, true));
  });
  return b;
}

describe("readFlyPoints", () => {
  it("reads the fly points and skips the records that are not", () => {
    const arm9 = table([
      { flags: 0x30b, flyMap: 60, x: 0x2b7, y: 0x18d }, // New Bark
      { flags: 0x123, flyMap: 9, x: 5, y: 6 }, // bit 9 clear: only a blackout spawn
      { flags: 0x200, flyMap: 49, x: 0x409, y: 0x16c }, // Pallet, FLYPOINT 0
    ]);
    expect(readFlyPoints(arm9, { offset: 0x10, count: 3 })).toEqual([
      { flypoint: 11, map: 60, tx: 0x2b7, ty: 0x18d },
      { flypoint: 0, map: 49, tx: 0x409, ty: 0x16c },
    ]);
  });

  it("refuses a table past the end", () => {
    expect(() => readFlyPoints(table([{ flags: 0x30b, flyMap: 60, x: 1, y: 1 }]), { offset: 0x10, count: 2 })).toThrow(/pontos de voo/);
  });

  it("refuses a fly point above 37", () => {
    expect(() => readFlyPoints(table([{ flags: 0x226, flyMap: 60, x: 1, y: 1 }]), { offset: 0x10, count: 1 })).toThrow(/pontos de voo.*38/);
  });
});
