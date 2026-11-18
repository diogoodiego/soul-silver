import { describe, expect, it } from "vitest";
import { dexState, fitMap, toMinimap, wildMarkers } from "../../src/hud/minimap";

// Block H: the minimap shows the whole current map and its wild Pokémon, by what the Pokédex knows of them.

const dex = { seen: [16, 19, 155], caught: [155] };
const wild = (id: number, species: number, over: object = {}) => ({ id, kind: "pokemon", area: "29", x: 160, y: 80, data: { owner: "wild", species }, ...over });

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

describe("wildMarkers", () => {
  const fit = fitMap(320, 160, 160, 80);

  it("marks the wild Pokémon of the area, with their place and what the Pokédex knows", () => {
    expect(wildMarkers([wild(1, 155), wild(2, 16, { x: 0, y: 0 }), wild(3, 25)], "29", dex, fit)).toEqual([
      { id: 1, species: 155, state: "caught", x: 80, y: 40 },
      { id: 2, species: 16, state: "seen", x: 0, y: 0 },
      { id: 3, species: 25, state: "unknown", x: 80, y: 40 },
    ]);
  });

  it("leaves out other areas, trainers' and players' Pokémon, players and Pokémon without a species", () => {
    const others = [
      wild(1, 16, { area: "30" }),
      { id: 2, kind: "pokemon", area: "29", x: 0, y: 0, data: { owner: 1, species: 155 } },
      { id: 3, kind: "pokemon", area: "29", x: 0, y: 0, data: { owner: "trainer", species: 16 } },
      { id: 4, kind: "player", area: "29", x: 0, y: 0, data: { owner: "wild" } },
      { id: 5, kind: "pokemon", area: "29", x: 0, y: 0, data: { owner: "wild" } },
    ];
    expect(wildMarkers(others, "29", dex, fit)).toEqual([]);
  });
});
