import { MAP_TILE_PX, MESH_VERTEX_FLOATS } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { groundCover } from "../../src/render/ground-cover";

// A 2×1 map whose ground is 0 on the west tile and 16 on the east one.
const file = { width: 2, height: 1, ground: [[0, 16]] };
const T = MAP_TILE_PX;

/** A flat quad over tile `tx` at height `y`, as two triangles. */
const flat = (tx: number, y: number) => {
  const [a, b] = [tx * T, (tx + 1) * T];
  return [[a, y, 0], [b, y, 0], [a, y, T], [b, y, 0], [b, y, T], [a, y, T]];
};
/** A wall standing on the west tile, `h` pixels tall. */
const wall = (h: number) => [[0, 0, 0], [T, 0, 0], [0, h, 0], [T, 0, 0], [T, h, 0], [0, h, 0]];

const mesh = (...parts: number[][][]) => {
  const points = parts.flat();
  const vertices = new Float32Array(points.length * MESH_VERTEX_FLOATS);
  points.forEach((p, i) => vertices.set(p, i * MESH_VERTEX_FLOATS));
  return { vertices, group: { first: 0, count: points.length } };
};

describe("ground cover (flowers and decals lying on the ground)", () => {
  it("is a flat group just above the ground, on every tile it covers", () => {
    const { vertices, group } = mesh(flat(0, 1), flat(1, 18));
    expect(groundCover(file, vertices, group)).toBe(true);
  });

  it("holds for the ground itself", () => {
    const { vertices, group } = mesh(flat(0, 0));
    expect(groundCover(file, vertices, group)).toBe(true);
  });

  it("is not a roof or a bridge, flat but high above the ground", () => {
    const { vertices, group } = mesh(flat(0, 40));
    expect(groundCover(file, vertices, group)).toBe(false);
  });

  it("is not a group with anything standing up", () => {
    const { vertices, group } = mesh(flat(0, 1), wall(16));
    expect(groundCover(file, vertices, group)).toBe(false);
  });
});
