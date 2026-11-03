import type { WorldLookup } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { startPosition } from "../src/start";

const town = (warps: { tx: number; ty: number; destMap: string }[]) => (() => ({ warps })) as unknown as WorldLookup;

describe("home", () => {
  it("is below the door to the player's house, not the town's first warp", () => {
    expect(startPosition(town([{ tx: 2, ty: 2, destMap: "61" }, { tx: 5, ty: 4, destMap: "63" }]))).toEqual({ area: "60", x: 88, y: 88 });
  });

  it("falls back to the first warp in a town without the house", () => {
    expect(startPosition(town([{ tx: 2, ty: 2, destMap: "61" }]))).toEqual({ area: "60", x: 40, y: 56 });
  });
});
