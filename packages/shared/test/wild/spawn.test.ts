import { describe, expect, it } from "vitest";
import { createRng } from "../../src/game/rng.ts";
import type { WorldMap } from "../../src/game/world-map.ts";
import type { CollisionCell } from "../../src/maps/collision.ts";
import { pickCell, rollLevel, rollShiny, rollSlot, zoneCells } from "../../src/wild/spawn.ts";

// Synthetic fixture: species ids and slot chances in the shape of Route 29 (Pidgey 16, Sentret 161,
// Rattata 19, Hoothoot 163). Numbers only, nothing read from a ROM (principle II).
const slot = (species: number, chance: number, minLevel = 2, maxLevel = 3) => ({ species, form: 0, minLevel, maxLevel, chance });
const DAY = [slot(16, 20), slot(161, 20), slot(16, 10), slot(161, 10), slot(16, 10), slot(16, 10), slot(161, 5), slot(161, 5), slot(19, 4), slot(16, 4), slot(19, 1), slot(16, 1)];
const NIGHT = [slot(163, 20), slot(163, 20), slot(163, 10), slot(163, 10), slot(163, 10), slot(163, 10), slot(19, 5), slot(19, 5), slot(19, 4), slot(163, 4), slot(19, 1), slot(163, 1)];

/** Chi-square critical values at p = 0.01 by degrees of freedom. */
const CRITICAL_001 = [0, 6.635, 9.21, 11.345];

function chiSquare(slots: typeof DAY, n: number, seed: number): { stat: number; df: number; counts: Map<number, number> } {
  const rng = createRng(seed);
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const s = rollSlot(slots, rng).species;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const expected = new Map<number, number>();
  for (const s of slots) expected.set(s.species, (expected.get(s.species) ?? 0) + (s.chance / 100) * n);
  let stat = 0;
  for (const [species, e] of expected) stat += ((counts.get(species) ?? 0) - e) ** 2 / e;
  return { stat, df: expected.size - 1, counts };
}

describe("rollSlot", () => {
  it.each([
    ["day", DAY],
    ["night", NIGHT],
  ] as const)("matches the %s table in 1000 spawns (chi-square, p ≥ 0.01)", (_, slots) => {
    for (const seed of [1, 2, 3]) {
      const { stat, df } = chiSquare(slots, 1000, seed);
      expect(stat).toBeLessThan(CRITICAL_001[df]!);
    }
  });

  it("never spawns a night-only species by day, nor a day-only one at night", () => {
    const day = chiSquare(DAY, 1000, 7).counts;
    const night = chiSquare(NIGHT, 1000, 7).counts;
    expect(day.has(163)).toBe(false);
    expect(night.has(16)).toBe(false);
    expect(night.has(161)).toBe(false);
  });
});

describe("rollLevel", () => {
  it("stays within the slot's range and reaches both ends", () => {
    const rng = createRng(4);
    const seen = new Set(Array.from({ length: 200 }, () => rollLevel(slot(16, 1, 2, 5), rng)));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
});

describe("rollShiny", () => {
  it("is close to 1 in 8192", () => {
    const rng = createRng(5);
    let shiny = 0;
    for (let i = 0; i < 1_000_000; i++) if (rollShiny(8192, rng)) shiny++;
    // Expected 122; 4 standard deviations either side.
    expect(shiny).toBeGreaterThan(78);
    expect(shiny).toBeLessThan(166);
  });
});

const cell = (category: CollisionCell["category"]): CollisionCell => ({ category, raw: 0 });

function map(width: number, height: number, at: (x: number, y: number) => CollisionCell["category"], areaType?: WorldMap["areaType"]): WorldMap {
  const tiles = Array.from({ length: width * height }, (_, i) => cell(at(i % width, Math.floor(i / width))));
  return { id: "1", levels: [{ width, height, tiles }], warps: [], neighbors: [], widthPx: width * 16, heightPx: height * 16, areaType };
}

describe("zoneCells", () => {
  it("is the tall grass of an outdoor map", () => {
    const m = map(4, 2, (x) => (x === 1 ? "tallGrass" : "free"));
    expect(zoneCells(m)).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it("is every free cell of a cave", () => {
    const m = map(3, 1, (x) => (x === 0 ? "blocked" : x === 1 ? "free" : "water"), "cave");
    expect(zoneCells(m)).toEqual([{ x: 1, y: 0 }]);
  });

  it("is empty with no grass", () => {
    expect(zoneCells(map(3, 3, () => "water"))).toEqual([]);
  });
});

describe("pickCell", () => {
  const view = { viewHalfTiles: { x: 8, y: 6 }, viewMarginTiles: 2, maxTries: 16 };
  const cells = Array.from({ length: 60 * 40 }, (_, i) => ({ x: i % 60, y: Math.floor(i / 60) }));

  it("never picks a cell a player could see, in 1000 picks", () => {
    const rng = createRng(6);
    const players = [
      { x: 10 * 16, y: 10 * 16 },
      { x: 40 * 16, y: 25 * 16 },
    ];
    for (let i = 0; i < 1000; i++) {
      const c = pickCell(cells, players, view, rng);
      if (!c) continue;
      for (const p of players) {
        const visible = Math.abs(c.x * 16 + 8 - p.x) <= 10 * 16 && Math.abs(c.y * 16 + 8 - p.y) <= 8 * 16;
        expect(visible).toBe(false);
      }
    }
  });

  it("gives up after maxTries when every cell is in view", () => {
    const near = cells.filter((c) => c.x < 5 && c.y < 5);
    expect(pickCell(near, [{ x: 40, y: 40 }], view, createRng(1))).toBeUndefined();
  });

  it("has nothing to pick from an empty zone", () => {
    expect(pickCell([], [], view, createRng(1))).toBeUndefined();
  });
});
