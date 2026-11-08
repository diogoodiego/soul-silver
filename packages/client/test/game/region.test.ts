import { describe, expect, it } from "vitest";
import { regionView } from "../../src/gear/region";

// Spec 026, FR-008: the Pokégear's map drawn from the region's own layout: each visited outdoor map is its
// rectangle of matrix cells (map-areas), and each player a dot where they stand, 512 px to the cell.

describe("regionView", () => {
  it("places the maps and the players' dots in matrix cells, framed with a margin", () => {
    const view = regionView(
      [
        { name: "New Bark", extent: { x: 21, z: 12, w: 1, h: 1 }, here: true },
        { name: "Route 29", extent: { x: 17, z: 12, w: 4, h: 1 }, here: false },
      ],
      [
        { name: "Eu", extent: { x: 21, z: 12, w: 1, h: 1 }, x: 256, y: 128, self: true },
        { name: "B", extent: { x: 17, z: 12, w: 4, h: 1 }, x: 1024, y: 256, self: false },
      ],
    );
    expect(view.rects).toEqual([
      { name: "New Bark", x: 21, y: 12, w: 1, h: 1, here: true },
      { name: "Route 29", x: 17, y: 12, w: 4, h: 1, here: false },
    ]);
    expect(view.dots).toEqual([
      { name: "Eu", x: 21.5, y: 12.25, self: true },
      { name: "B", x: 19, y: 12.5, self: false },
    ]);
    expect(view.viewBox).toBe("16.5 11.5 6 2");
  });

  it("has nothing to frame without places", () => {
    expect(regionView([], [])).toEqual({ rects: [], dots: [], viewBox: undefined });
  });
});
