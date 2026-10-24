import { describe, expect, it } from "vitest";
import { decodeDisplayList, GxFormatError, IDENTITY, type Matrix } from "../../src/maps/gx.ts";
import { displayList, fx, texcoord as tex, vtx16 } from "../fixtures/maps/build-gx.ts";

const ten = (v: number, scale: number) => Math.round(v * scale) & 0x3ff;

describe("decodeDisplayList", () => {
  it("splits a quad into two triangles with positions and texture coordinates", () => {
    const list = displayList([
      [0x40, 1],
      tex(0, 0), vtx16(0, 0, 0),
      tex(8, 0), vtx16(1, 0, 0),
      tex(8, 8), vtx16(1, 0, 1),
      tex(0, 8), vtx16(0, 0, 1),
      [0x41],
    ]);
    const triangles = decodeDisplayList(list, () => IDENTITY);
    expect(triangles).toHaveLength(2);
    expect(triangles[0]!.map((v) => v.position)).toEqual([[0, 0, 0], [1, 0, 0], [1, 0, 1]]);
    expect(triangles[1]!.map((v) => v.position)).toEqual([[0, 0, 0], [1, 0, 1], [0, 0, 1]]);
    expect(triangles[0]!.map((v) => v.uv)).toEqual([[0, 0], [8, 0], [8, 8]]);
  });

  it("builds triangle and quad strips", () => {
    const strip = (mode: number, count: number) =>
      decodeDisplayList(
        displayList([[0x40, mode], ...Array.from({ length: count }, (_, i) => vtx16(i, 0, 0)), [0x41]]),
        () => IDENTITY,
      ).map((t) => t.map((v) => v.position[0]));
    expect(strip(2, 5)).toEqual([[0, 1, 2], [2, 1, 3], [2, 3, 4]]);
    expect(strip(3, 6)).toEqual([[0, 1, 3], [0, 3, 2], [2, 3, 5], [2, 5, 4]]);
  });

  it("decodes the short vertex forms relative to the previous vertex", () => {
    const list = displayList([
      [0x40, 0],
      vtx16(1, 2, 3),
      [0x24, ten(0.5, 64) | (ten(-1, 64) << 10) | (ten(2, 64) << 20)],
      [0x25, fx(4) | (fx(5) << 16)],
      [0x40, 0],
      [0x26, fx(6) | (fx(7) << 16)],
      [0x27, fx(3) | (fx(4) << 16)],
      [0x28, ten(0.0625, 4096) | (ten(0, 4096) << 10) | (ten(-0.0625, 4096) << 20)],
      [0x41],
    ]);
    const triangles = decodeDisplayList(list, () => IDENTITY);
    expect(triangles.map((t) => t.map((v) => v.position))).toEqual([
      [[1, 2, 3], [0.5, -1, 2], [4, 5, 2]],
      [[6, 5, 7], [6, 3, 4], [6.0625, 3, 3.9375]],
    ]);
  });

  it("applies the matrix chosen by MTX_RESTORE", () => {
    const shifted: Matrix = [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0];
    const list = displayList([[0x14, 3], [0x40, 0], vtx16(1, 0, 0), vtx16(2, 0, 0), vtx16(3, 0, 0), [0x41]]);
    const triangles = decodeDisplayList(list, (index) => (index === 3 ? shifted : undefined));
    expect(triangles[0]!.map((v) => v.position[0])).toEqual([11, 12, 13]);
  });

  it("scales the current matrix with MTX_SCALE", () => {
    const list = displayList([[0x1b, 2 * 4096, 3 * 4096, 4096 / 2], [0x40, 0], vtx16(1, 1, 1), vtx16(1, 0, 0), vtx16(0, 1, 0), [0x41]]);
    expect(decodeDisplayList(list, () => IDENTITY)[0]![0].position).toEqual([2, 3, 0.5]);
  });

  it("carries the vertex color (5 bits per channel) to the following vertices", () => {
    const list = displayList([[0x20, 31 | (0 << 5) | (16 << 10)], [0x40, 0], vtx16(0, 0, 0), vtx16(1, 0, 0), vtx16(0, 1, 0), [0x41]]);
    expect(decodeDisplayList(list, () => IDENTITY)[0]![2].color).toEqual([255, 0, 132]);
  });

  it("ignores lighting and attribute commands but refuses unknown ones", () => {
    const lit = displayList([[0x21, 0], [0x30, 0], [0x31, 0], [0x29, 0]]);
    expect(decodeDisplayList(lit, () => IDENTITY)).toEqual([]);
    expect(() => decodeDisplayList(displayList([[0x7f]]), () => IDENTITY)).toThrow(GxFormatError);
  });

  it("refuses a restore to a matrix the model never stored", () => {
    expect(() => decodeDisplayList(displayList([[0x14, 9]]), () => undefined)).toThrow(GxFormatError);
  });
});
