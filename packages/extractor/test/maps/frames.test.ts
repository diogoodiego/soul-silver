import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { changedRegions } from "../../src/maps/frames.ts";
import type { RgbaImage } from "../../src/maps/png.ts";
import type { LevelLayers } from "../../src/maps/render.ts";

const T = MAP_TILE_PX;
const blank = (tiles: number): RgbaImage => ({ width: tiles * T, height: tiles * T, data: new Uint8Array(tiles * T * tiles * T * 4) });
const paint = (image: RgbaImage, x: number, y: number, value: number) => {
  image.data[(y * image.width + x) * 4] = value;
  return image;
};
const frame = (lower: RgbaImage, upper = blank(3)): LevelLayers[] => [{ level: 0, lower, upper }];

describe("changedRegions", () => {
  it("returns nothing when every frame is identical to the first", () => {
    expect(changedRegions([frame(blank(3)), frame(blank(3))])).toEqual([]);
  });

  it("covers the changed pixels with a tile-aligned box and crops every frame to it", () => {
    const frames = [frame(blank(3)), frame(paint(blank(3), T + 3, 2 * T + 5, 9)), frame(paint(blank(3), 2 * T - 1, T, 7))];
    const [result] = changedRegions(frames);
    expect(result!.region).toEqual({ level: 0, layer: "lower", x: T, y: T, width: T, height: 2 * T });
    expect(result!.crops).toHaveLength(3);
    expect(result!.crops.every((c) => c.width === T && c.height === 2 * T)).toBe(true);
    expect(result!.crops[1]!.data[(1 * T + 5) * T * 4 + 3 * 4]).toBe(9);
    expect(result!.crops[2]!.data[0 * T * 4 + (T - 1) * 4]).toBe(7);
  });

  it("reports the lower and the upper layer separately, per level", () => {
    const upper = paint(blank(3), 0, 0, 1);
    const regions = changedRegions([frame(blank(3)), frame(blank(3), upper)]).map((r) => r.region);
    expect(regions).toEqual([{ level: 0, layer: "upper", x: 0, y: 0, width: T, height: T }]);
  });
});
