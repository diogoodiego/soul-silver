import { PIECE_TILES } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { PieceFormatError, readPiece } from "../../src/maps/piece.ts";
import { buildLand, FLAT_GROUND } from "../fixtures/maps/build-land.ts";

const tile = (x: number, z: number) => z * PIECE_TILES + x;

describe("readPiece", () => {
  it("reads the 32 x 32 permissions row by row, keeping unknown values", () => {
    const permissions: number[] = [];
    permissions[tile(1, 0)] = 0x8000;
    permissions[tile(0, 1)] = 0x0465;
    const piece = readPiece(buildLand({ permissions }));
    expect(piece.permissions).toHaveLength(1024);
    expect([piece.permissions[tile(1, 0)], piece.permissions[tile(0, 1)], piece.permissions[tile(0, 0)]]).toEqual([0x8000, 0x0465, 0]);
  });

  it("reads buildings with model, position and scale in world units", () => {
    const piece = readPiece(buildLand({ buildings: [{ model: 21, position: [-24, 16, -128], scale: [1, 2, 1] }] }));
    expect(piece.buildings).toEqual([{ model: 21, position: [-24, 16, -128], scale: [1, 2, 1] }]);
  });

  it("keeps the model bytes, empty when the piece has none", () => {
    expect(readPiece(buildLand({ model: new Uint8Array([1, 2, 3, 4]) })).model).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(readPiece(buildLand()).model).toHaveLength(0);
  });

  it("samples one height per surface at each tile center", () => {
    const piece = readPiece(buildLand());
    expect(piece.tileHeights).toHaveLength(1024);
    expect(piece.tileHeights.every((h) => h.length === 1 && h[0] === 0)).toBe(true);
  });

  it("gives two heights where a bridge crosses over the ground, lowest first", () => {
    // Bridge over tiles x 4..5 (world -192..-160), height 32, across the whole piece in z.
    const bridge = { from: [-192, -256], to: [-160, 256], normal: [0, 1, 0], d: -32 } as const;
    const piece = readPiece(buildLand({ plates: [FLAT_GROUND, { ...bridge, from: [...bridge.from], to: [...bridge.to], normal: [...bridge.normal] }] }));
    expect(piece.tileHeights[tile(4, 10)]).toEqual([0, 32]);
    expect(piece.tileHeights[tile(5, 10)]).toEqual([0, 32]);
    expect(piece.tileHeights[tile(6, 10)]).toEqual([0]);
  });

  it("evaluates sloped plates from their plane", () => {
    // y = -(0 * x + -0.5 * z + 0) / 1 = z / 2: rising toward the south.
    const piece = readPiece(buildLand({ plates: [{ from: [-256, -256], to: [256, 256], normal: [0, 1, -0.5], d: 0 }] }));
    expect(piece.tileHeights[tile(0, 16)]).toEqual([4]);
  });

  it("leaves a tile with no surface empty", () => {
    const piece = readPiece(buildLand({ plates: [{ from: [-256, -256], to: [0, 256], normal: [0, 1, 0], d: 0 }] }));
    expect(piece.tileHeights[tile(31, 0)]).toEqual([]);
  });

  it("refuses data without the HGSS extra block", () => {
    const bytes = buildLand();
    bytes[0x10] = 0;
    expect(() => readPiece(bytes)).toThrow(PieceFormatError);
  });

  it("refuses sections that do not add up to the file size", () => {
    expect(() => readPiece(buildLand().subarray(0, 100))).toThrow(PieceFormatError);
  });
});
