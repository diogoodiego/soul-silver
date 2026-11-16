import { describe, expect, it } from "vitest";
import { createRng } from "../../src/game/rng.ts";
import { createRoamer, roam, ROAMER_ROUTES, type Roamer } from "../../src/wild/roamer.ts";

// Item 031.2: Raikou (0) and Entei (1) roam the Johto routes, moving each time their player changes map.

describe("roamers (item 031.2)", () => {
  it("CreateRoamer puts the roamer on a Johto route, full, replacing one with the same id", () => {
    const list: Roamer[] = [{ id: 0, area: "33", hp: 10, status: "burn" }];
    createRoamer(list, 0, createRng(1));
    createRoamer(list, 1, createRng(2));
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.id).sort()).toEqual([0, 1]);
    for (const r of list) {
      expect(ROAMER_ROUTES).toContain(r.area);
      expect(r.hp).toBeUndefined();
      expect(r.status).toBeUndefined();
    }
  });

  it("ignores the Kanto roamers (2, 3), not in Johto", () => {
    const list: Roamer[] = [];
    createRoamer(list, 2, createRng(1));
    expect(list).toEqual([]);
  });

  it("moves each roamer to another route on every map change, the same way for the same seed", () => {
    const walk = (seed: number) => {
      const rng = createRng(seed);
      const list: Roamer[] = [{ id: 0, area: "33" }, { id: 1, area: "48", hp: 50 }];
      const seen: string[][] = [];
      for (let i = 0; i < 40; i++) {
        const before = list.map((r) => r.area);
        roam(list, rng);
        list.forEach((r, k) => expect(r.area).not.toBe(before[k]));
        seen.push(list.map((r) => r.area));
      }
      // HP stays as the last encounter left it.
      expect(list[1]!.hp).toBe(50);
      return seen;
    };
    const a = walk(7);
    expect(walk(7)).toEqual(a);
    expect(walk(8)).not.toEqual(a);
    expect(a.flat().every((area) => ROAMER_ROUTES.includes(area))).toBe(true);
    // Over 40 changes they get around the region.
    expect(new Set(a.map((p) => p[0])).size).toBeGreaterThan(8);
  });
});
