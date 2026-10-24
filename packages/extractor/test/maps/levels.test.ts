import { parseMapFile, PIECE_TILES } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { buildCollision } from "../../src/maps/levels.ts";
import { readPiece } from "../../src/maps/piece.ts";
import { buildLand, FLAT_GROUND, type PlateSpec } from "../fixtures/maps/build-land.ts";

const tile = (x: number, z: number) => z * PIECE_TILES + x;
/** World box of tiles [x0, x1] x [z0, z1] (inclusive). */
const box = (x0: number, z0: number, x1: number, z1: number): Pick<PlateSpec, "from" | "to"> => ({
  from: [-256 + x0 * 16, -256 + z0 * 16],
  to: [-256 + (x1 + 1) * 16, -256 + (z1 + 1) * 16],
});
const level = (y: number, area: Pick<PlateSpec, "from" | "to">): PlateSpec => ({ ...area, normal: [0, 1, 0], d: -y });

function collision(plates: PlateSpec[], permissions: number[] = []) {
  return buildCollision(7, [{ x: 0, z: 0, piece: readPiece(buildLand({ plates, permissions })) }]);
}

describe("buildCollision", () => {
  it("classifies every tile row by row, in a file that passes the schema", () => {
    const permissions: number[] = [];
    permissions[tile(2, 0)] = 0x8000;
    permissions[tile(0, 1)] = 0x0002;
    const { levels } = collision([FLAT_GROUND], permissions);
    expect(levels).toHaveLength(1);
    const file = levels[0]!;
    expect([file.map, file.level, file.width, file.height]).toEqual([7, 0, 32, 32]);
    expect([file.tiles[tile(2, 0)]!.category, file.tiles[tile(0, 1)]!.category, file.tiles[0]!.category]).toEqual(["blocked", "tallGrass", "free"]);
    expect(parseMapFile("map-collision", file, "0.json").ok).toBe(true);
  });

  it("frees the top row of a blocked area 2+ tiles tall, so the player can walk behind it", () => {
    const permissions: number[] = [];
    for (const z of [5, 6, 7]) permissions[tile(4, z)] = 0x8000; // a building, 3 tall
    permissions[tile(8, 5)] = 0x8000; // a sign, 1 tall
    const tiles = collision([FLAT_GROUND], permissions).levels[0]!.tiles;
    expect([5, 6, 7].map((z) => tiles[tile(4, z)]!.category)).toEqual(["free", "blocked", "blocked"]);
    expect(tiles[tile(8, 5)]!.category).toBe("blocked");
  });

  it("makes one grid per level, the upper one taking the deck tiles and sharing the rest", () => {
    const { levels } = collision([FLAT_GROUND, level(32, box(4, 0, 4, 9))]);
    expect(levels.map((l) => l.level)).toEqual([0, 1]);
    expect(levels[1]!.tiles[tile(20, 20)]).toEqual(levels[0]!.tiles[tile(20, 20)]);
  });

  it("marks the bridge entrance both ways, but not the ground beside or under the bridge", () => {
    const ground = level(0, box(0, 0, 31, 9));
    const hill = level(32, box(0, 10, 31, 31));
    const deck = level(32, box(4, 0, 4, 9));
    const { levels } = collision([ground, hill, deck]);
    const [below, above] = levels;
    expect(below!.tiles[tile(4, 10)]).toMatchObject({ category: "levelTransition", targetLevel: 1 });
    expect(above!.tiles[tile(4, 10)]).toMatchObject({ category: "levelTransition", targetLevel: 0 });
    expect(below!.tiles[tile(5, 5)]!.category).toBe("free");
    expect(below!.tiles[tile(5, 10)]!.category).toBe("free");
  });

  it("warns about tiles with more than two surfaces", () => {
    const { warnings } = collision([FLAT_GROUND, level(32, box(1, 1, 1, 1)), level(64, box(1, 1, 1, 1))]);
    expect(warnings).toContainEqual({ code: "ambiguous-height", detail: "1 tile(s) with more than 2 surfaces" });
  });

  it("lists the behaviors left without a category, keeping their raw value", () => {
    const permissions: number[] = [];
    permissions[tile(0, 0)] = 0x0465;
    permissions[tile(1, 0)] = 0x0065;
    permissions[tile(2, 0)] = 0x0069;
    const { levels, warnings } = collision([FLAT_GROUND], permissions);
    expect(levels[0]!.tiles[0]).toEqual({ category: "special", raw: 0x0465 });
    expect(warnings).toContainEqual({ code: "unknown-permission", detail: "0x65, 0x69" });
  });
});
