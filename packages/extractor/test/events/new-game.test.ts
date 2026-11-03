import { describe, expect, it } from "vitest";
import { readNewGameStart, readStdMessageBanks } from "../../src/events/new-game.ts";

// Spec 024, T009: sLocation_PlayerRoom ({ mapId, warpId, x, y, direction } as u32) from a synthetic
// ARM9, and the GetStdMsgNaix bank table (u16) from a synthetic overlay 1 (principle II).

function location(map: number, x: number, y: number, dir: number, warp = 0xffffffff) {
  const b = new Uint8Array(0x40);
  const v = new DataView(b.buffer);
  [map, warp, x, y, dir].forEach((n, i) => v.setUint32(0x10 + i * 4, n, true));
  return b;
}

describe("readNewGameStart", () => {
  it.each([
    [0, "north"],
    [1, "south"],
    [2, "west"],
    [3, "east"],
  ])("reads the map, the tile and direction %i as %s", (dir, facing) => {
    expect(readNewGameStart(location(64, 6, 6, dir), 0x10)).toEqual({ map: 64, tx: 6, ty: 6, facing });
  });

  it.each([
    ["a warp id instead of a free position", location(64, 6, 6, 1, 0)],
    ["a direction outside 0 to 3", location(64, 6, 6, 4)],
    ["an offset past the end", new Uint8Array(0x18)],
  ])("refuses %s", (_, bytes) => {
    expect(() => readNewGameStart(bytes, 0x10)).toThrow(/posição inicial/);
  });
});

describe("readStdMessageBanks", () => {
  it("reads the table in order", () => {
    const b = new Uint8Array(0x20);
    const v = new DataView(b.buffer);
    [752, 211, 30, 435].forEach((n, i) => v.setUint16(0x8 + i * 2, n, true));
    expect(readStdMessageBanks(b, { offset: 0x8, count: 4 })).toEqual([752, 211, 30, 435]);
  });

  it("refuses a table past the end of the overlay", () => {
    expect(() => readStdMessageBanks(new Uint8Array(0x8), { offset: 0x4, count: 4 })).toThrow(/mensagens/);
  });
});
