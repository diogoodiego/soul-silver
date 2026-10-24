import { parseMapFile } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { MatrixFormatError, readMatrix } from "../../src/maps/grid.ts";
import { ByteWriter } from "../fixtures/byte-writer.ts";

/** Matrix in the layout confirmed in research.md R0. */
function matrix(width: number, height: number, name: string, land: number[], maps?: number[], heights?: number[]) {
  const w = new ByteWriter().u8(width).u8(height).u8(maps ? 1 : 0).u8(heights ? 1 : 0).u8(name.length).ascii(name);
  for (const m of maps ?? []) w.u16(m);
  for (const h of heights ?? []) w.u8(h);
  for (const l of land) w.u16(l);
  return w.toBytes();
}

describe("readMatrix", () => {
  it("reads a 2 x 2 matrix with map and height grids", () => {
    const area = readMatrix(matrix(2, 2, "map", [5, 6, 0xffff, 8], [60, 60, 33, 0xffff], [0, 1, 2, 3]), 4);
    expect(area).toEqual({ id: 4, name: "map", width: 2, height: 2, pieces: [5, 6, null, 8], heights: [0, 1, 2, 3], maps: [60, 60, 33, null] });
  });

  it("reads a single-map matrix without the optional grids", () => {
    expect(readMatrix(matrix(1, 1, "single", [1]), 0)).toEqual({ id: 0, name: "single", width: 1, height: 1, pieces: [1], heights: null, maps: null });
  });

  it("gives records that pass the schema", () => {
    const area = readMatrix(matrix(2, 1, "m", [1, 2], [3, 3], [0, 0]), 0);
    expect(parseMapFile("map-areas", { kind: "map-areas", formatVersion: 1, records: [area] }, "a.json").ok).toBe(true);
  });

  it("refuses a matrix whose grids do not fill the file", () => {
    expect(() => readMatrix(matrix(2, 2, "map", [1, 2, 3]), 0)).toThrow(MatrixFormatError);
    expect(() => readMatrix(new Uint8Array([2, 2]), 0)).toThrow(MatrixFormatError);
  });
});
