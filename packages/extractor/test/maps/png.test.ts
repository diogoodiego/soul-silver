import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng } from "../../src/maps/png.ts";

function chunks(png: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const found = new Map<string, Uint8Array>();
  for (let offset = 8; offset < png.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    found.set(type, type === "IDAT" && found.has("IDAT") ? new Uint8Array([...found.get("IDAT")!, ...data]) : data);
    offset += 12 + length;
  }
  return found;
}

describe("encodePng", () => {
  const image = { width: 2, height: 2, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]) };

  it("writes the PNG signature and RGBA dimensions", () => {
    const png = encodePng(image);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = chunks(png).get("IHDR")!;
    const view = new DataView(ihdr.buffer, ihdr.byteOffset);
    expect([view.getUint32(0), view.getUint32(4), ihdr[8], ihdr[9]]).toEqual([2, 2, 8, 6]);
    expect(chunks(png).has("IEND")).toBe(true);
  });

  it("stores the pixels row by row, unfiltered", () => {
    const raw = inflateSync(chunks(encodePng(image)).get("IDAT")!);
    expect([...raw]).toEqual([0, ...image.data.subarray(0, 8), 0, ...image.data.subarray(8)]);
  });

  it("is deterministic", () => {
    expect(encodePng(image)).toEqual(encodePng(image));
  });

  it("refuses data that does not match the dimensions", () => {
    expect(() => encodePng({ width: 3, height: 2, data: image.data })).toThrow(RangeError);
  });
});
