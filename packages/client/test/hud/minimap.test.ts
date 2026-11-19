import { describe, expect, it } from "vitest";
import { dexState, fitMap, routeSpecies, toMinimap } from "../../src/hud/minimap";

// Block H: the minimap shows the whole current map and the species of its encounter table, by what the Pokédex knows.

const dex = { seen: [16, 19, 155], caught: [155] };

describe("dexState", () => {
  it("is caught, seen or unknown, caught first", () => {
    expect(dexState(155, dex)).toBe("caught");
    expect(dexState(16, dex)).toBe("seen");
    expect(dexState(25, dex)).toBe("unknown");
  });
});

describe("fitMap", () => {
  it("fits a wide map to the box's width and centres it vertically", () => {
    const fit = fitMap(640, 320, 200, 200);
    expect(fit.scale).toBeCloseTo(200 / 640);
    expect(fit).toMatchObject({ ox: 0, oy: 50, w: 200, h: 100 });
  });

  it("fits a tall map to the box's height and centres it horizontally", () => {
    const fit = fitMap(320, 640, 200, 200);
    expect(fit).toMatchObject({ ox: 50, oy: 0, w: 100, h: 200 });
  });

  it("puts a map pixel at its place in the box", () => {
    const fit = fitMap(640, 320, 200, 200);
    expect(toMinimap(fit, 320, 160)).toEqual({ x: 100, y: 100 });
    expect(toMinimap(fit, 0, 0)).toEqual({ x: 0, y: 50 });
  });
});

describe("routeSpecies", () => {
  const slot = (species: number) => ({ species, form: 0, minLevel: 2, maxLevel: 4, chance: 10 });
  const rates = { walking: 25, surfing: 0, rockSmash: 0, oldRod: 0, goodRod: 0, superRod: 0 };

  it("lists each species of every table once, in table order, with what the Pokédex knows", () => {
    const table = { id: 1, rates, grass: { morning: [slot(16), slot(19)], day: [slot(16), slot(161)], night: [slot(163), slot(19)] }, surf: [slot(60)], oldRod: [slot(129), slot(60)] };
    expect(routeSpecies(table, dex)).toEqual([
      { species: 16, state: "seen" },
      { species: 19, state: "seen" },
      { species: 161, state: "unknown" },
      { species: 163, state: "unknown" },
      { species: 60, state: "unknown" },
      { species: 129, state: "unknown" },
    ]);
  });

  it("marks caught species and skips empty slots (species 0)", () => {
    const table = { id: 2, rates, grass: { morning: [slot(155), slot(0)], day: [], night: [] } };
    expect(routeSpecies(table, dex)).toEqual([{ species: 155, state: "caught" }]);
  });

  it("is empty for a map without a table", () => {
    expect(routeSpecies(undefined, dex)).toEqual([]);
  });
});
