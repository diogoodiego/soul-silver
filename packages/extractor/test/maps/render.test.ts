import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import type { RgbaImage } from "../../src/maps/png.ts";
import { OBLIQUE_HEIGHT, renderLayers, UPPER_MIN_HEIGHT, type RenderInput, type SceneTriangle } from "../../src/maps/render.ts";

const T = MAP_TILE_PX;
const solid = (r: number, g: number, b: number): RgbaImage => ({ width: 1, height: 1, data: new Uint8Array([r, g, b, 255]) });

/** Horizontal quad at height y over the world box [x0, x1] x [z0, z1]. */
function flat(x0: number, z0: number, x1: number, z1: number, y: number, texture: RgbaImage, alpha = 1): SceneTriangle[] {
  const v = (x: number, z: number) => ({ position: [x, y, z] as [number, number, number], uv: [0, 0] as [number, number], color: [255, 255, 255] as [number, number, number] });
  const sampler = { image: texture, repeat: [true, true] as [boolean, boolean], flip: [false, false] as [boolean, boolean] };
  return [
    { vertices: [v(x0, z0), v(x1, z0), v(x1, z1)], sampler, alpha },
    { vertices: [v(x0, z0), v(x1, z1), v(x0, z1)], sampler, alpha },
  ];
}

const pixel = (image: RgbaImage, x: number, y: number) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

const COLORS = [solid(255, 0, 0), solid(0, 255, 0), solid(0, 0, 255), solid(255, 255, 0)];

/** One colored ground quad per tile of a 2 x 2 map, at the given ground height. */
function groundMap(height = 0, extra: SceneTriangle[] = []): RenderInput {
  const triangles = [0, 1, 2, 3].flatMap((i) => flat((i % 2) * T, Math.floor(i / 2) * T, (i % 2 + 1) * T, (Math.floor(i / 2) + 1) * T, height, COLORS[i]!));
  return { width: 2, height: 2, origin: [0, 0], levels: 1, ground: () => height, triangles: [...triangles, ...extra] };
}

describe("renderLayers", () => {
  it("makes images of exactly tiles x MAP_TILE_PX, one pair per level", () => {
    const layers = renderLayers(groundMap());
    expect(layers).toHaveLength(1);
    expect([layers[0]!.lower.width, layers[0]!.lower.height, layers[0]!.upper.width, layers[0]!.upper.height]).toEqual([2 * T, 2 * T, 2 * T, 2 * T]);
  });

  it("draws each tile's ground exactly in its block, edges included", () => {
    const { lower } = renderLayers(groundMap())[0]!;
    for (let i = 0; i < 4; i++) {
      const [x0, y0] = [(i % 2) * T, Math.floor(i / 2) * T];
      const expected = [...COLORS[i]!.data];
      for (const [dx, dy] of [[0, 0], [T - 1, 0], [0, T - 1], [T - 1, T - 1], [T / 2, T / 2]]) {
        expect(pixel(lower, x0 + dx!, y0 + dy!)).toEqual(expected);
      }
    }
  });

  it("keeps raised ground aligned with the grid", () => {
    const { lower } = renderLayers(groundMap(48))[0]!;
    expect(pixel(lower, 0, 0)).toEqual([...COLORS[0]!.data]);
    expect(pixel(lower, 2 * T - 1, 2 * T - 1)).toEqual([...COLORS[3]!.data]);
  });

  it("puts geometry above UPPER_MIN_HEIGHT in the upper layer only, shifted up by its height", () => {
    const y = 2 * UPPER_MIN_HEIGHT;
    const canopy = flat(0, T, T, 2 * T, y, solid(0, 128, 0));
    const { lower, upper } = renderLayers(groundMap(0, canopy))[0]!;
    // The canopy covers world rows [T, 2T); on screen it starts OBLIQUE_HEIGHT * y higher.
    const row = Math.round(2 * T - OBLIQUE_HEIGHT * y) - 2;
    expect(row).toBeGreaterThanOrEqual(0);
    expect(pixel(upper, T / 2, row)).toEqual([0, 128, 0, 255]);
    expect(pixel(lower, T / 2, row)).toEqual([...COLORS[row < T ? 0 : 2]!.data]);
    expect(pixel(upper, T + T / 2, T / 2)[3]).toBe(0);
  });

  it("keeps low geometry, like a trunk or a fence, in the lower layer", () => {
    const fence = flat(0, 0, T, T, UPPER_MIN_HEIGHT / 2, solid(90, 60, 30));
    const { lower, upper } = renderLayers(groundMap(0, fence))[0]!;
    expect(pixel(lower, T / 2, 2)).toEqual([90, 60, 30, 255]);
    expect(pixel(upper, T / 2, 2)[3]).toBe(0);
  });

  it("renders a bridge deck above the path on level 0 and as the floor on level 1", () => {
    const deckHeight = 2 * UPPER_MIN_HEIGHT;
    const deck = flat(T, 0, 2 * T, 2 * T, deckHeight, solid(120, 80, 40));
    const input: RenderInput = { ...groundMap(0, deck), levels: 2, ground: (x, _z, level) => (level === 1 && x === 1 ? deckHeight : 0) };
    const [below, above] = renderLayers(input);
    expect(pixel(below!.upper, T + T / 2, 2)).toEqual([120, 80, 40, 255]);
    expect(pixel(below!.lower, T + T / 2, T + T / 2)).toEqual([...COLORS[3]!.data]);
    expect(pixel(above!.lower, T + T / 2, T + T / 2)).toEqual([120, 80, 40, 255]);
    expect(pixel(above!.upper, T + T / 2, T + T / 2)[3]).toBe(0);
  });

  it("blends translucent geometry over what is below it", () => {
    const water = flat(0, 0, T, T, 0.5, solid(0, 0, 255), 0.5);
    const { lower } = renderLayers(groundMap(0, water))[0]!;
    expect(pixel(lower, T / 2, T / 2)).toEqual([128, 0, 128, 255]);
  });

  it("is deterministic", () => {
    const a = renderLayers(groundMap(0, flat(0, T, T, 2 * T, 40, solid(1, 2, 3))));
    const b = renderLayers(groundMap(0, flat(0, T, T, 2 * T, 40, solid(1, 2, 3))));
    expect(a).toEqual(b);
  });
});
