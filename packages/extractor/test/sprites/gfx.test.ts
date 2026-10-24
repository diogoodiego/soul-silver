import { describe, expect, it } from "vitest";
import { crop, pixelIndices, toRgba } from "../../src/sprites/decode.ts";
import { decompressLz10 } from "../../src/sprites/lz10.ts";
import { decryptPokemonPixels, GraphicsFormatError, readNclr, readNcgr } from "../../src/sprites/nitro-gfx.ts";
import { bgr555, buildLz10, buildNclr, buildNcgr, encryptPokemonPixels } from "../fixtures/sprites/builders.ts";

describe("LZ10", () => {
  it("decodes literals", () => {
    const plain = new Uint8Array([1, 2, 3, 4, 5]);
    expect(decompressLz10(buildLz10(plain))).toEqual(plain);
  });

  it("decodes back-references, including overlapping ones", () => {
    const plain = new Uint8Array([7, 8, 7, 8, 7, 8, 7, 8, 9]);
    const packed = buildLz10(plain, [{ at: 2, length: 6, distance: 2 }]);
    expect(decompressLz10(packed)).toEqual(plain);
  });

  it("rejects a stream without the header and a truncated one", () => {
    expect(() => decompressLz10(new Uint8Array([0x11, 1, 0, 0, 0]))).toThrow("LZ10");
    expect(() => decompressLz10(new Uint8Array([0x10, 9, 0, 0, 0, 1]))).toThrow("ends");
  });
});

describe("NCGR / NCLR", () => {
  it("reads size, depth and pixels of an NCGR", () => {
    const gfx = readNcgr(buildNcgr({ tilesWide: 1, tilesHigh: 1, data: new Array(32).fill(0x21) }));
    expect(gfx).toMatchObject({ tilesWide: 1, tilesHigh: 1, bitsPerPixel: 4, scanned: false });
    expect(gfx.data).toHaveLength(32);
  });

  it("reads the BGR555 colors of an NCLR", () => {
    expect(readNclr(buildNclr([0, bgr555(31, 0, 0), bgr555(0, 31, 0)]))).toEqual([0, 31, 31 << 5]);
  });

  it("rejects the wrong magic naming the expected file", () => {
    expect(() => readNcgr(buildNclr([0]))).toThrow(GraphicsFormatError);
    expect(() => readNclr(buildNcgr({ tilesWide: 1, tilesHigh: 1, data: new Array(32).fill(0) }))).toThrow("RLCN");
  });

  it("decrypts what encryptPokemonPixels encrypted", () => {
    const plain = new Uint8Array(64).map((_, i) => (i < 2 ? 0 : i * 3));
    expect(decryptPokemonPixels(encryptPokemonPixels(plain))).toEqual(plain);
  });
});

describe("decode", () => {
  const palette = [0, bgr555(31, 0, 0), bgr555(0, 31, 0)];

  it("reads scanned 4 bpp pixels, low nibble first", () => {
    const gfx = readNcgr(buildNcgr({ tilesWide: 1, tilesHigh: 1, scanned: true, data: new Array(32).fill(0).map((_, i) => (i === 0 ? 0x21 : 0)) }));
    const idx = pixelIndices(gfx);
    expect([idx[0], idx[1], idx[2]]).toEqual([1, 2, 0]);
  });

  it("reads tiled 4 bpp pixels tile by tile", () => {
    // Two tiles side by side; the second tile starts at byte 32 and is all color 2.
    const data = new Array(64).fill(0).map((_, i) => (i >= 32 ? 0x22 : 0));
    const idx = pixelIndices(readNcgr(buildNcgr({ tilesWide: 2, tilesHigh: 1, data })));
    expect(idx[7]).toBe(0);
    expect(idx[8]).toBe(2);
    expect(idx[15 + 7 * 16]).toBe(2);
  });

  it("makes color 0 transparent and expands BGR555 exactly", () => {
    const img = toRgba(new Uint8Array([0, 1, 2, 1]), 2, 2, palette, "t");
    expect([...img.data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...img.data.subarray(4, 8)]).toEqual([255, 0, 0, 255]);
    expect([...img.data.subarray(8, 12)]).toEqual([0, 255, 0, 255]);
  });

  it("fails naming the sprite when the palette is too short", () => {
    expect(() => toRgba(new Uint8Array([5]), 1, 1, palette, "battle/1")).toThrow("battle/1");
  });

  it("crops a region", () => {
    const img = toRgba(new Uint8Array([1, 2, 2, 1]), 2, 2, palette, "t");
    expect([...crop(img, 1, 0, 1, 2).data]).toEqual([0, 255, 0, 255, 255, 0, 0, 255]);
  });
});
