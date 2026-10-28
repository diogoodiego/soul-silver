import { describe, expect, it } from "vitest";
import type { WorldLookup, WorldMap } from "@soulsilver/shared/game";
import { createNpcs } from "../src/npcs";
import { createWorld } from "../src/world";

// Spec 021, US1: NPCs collide with the world, with each other and with players.

const free = { category: "free" as const, raw: 0 };
const wall = { category: "blocked" as const, raw: 0x8000 };
const T = 16;
const tileOf = (v: number) => Math.floor(v / T);

function lookupOf(rows: string[]): WorldLookup {
  const map: WorldMap = {
    id: "a",
    levels: [{ width: rows[0]!.length, height: rows.length, tiles: rows.flatMap((r) => [...r].map((c) => (c === "#" ? wall : free))) }],
    warps: [],
    neighbors: [],
    widthPx: rows[0]!.length * T,
    heightPx: rows.length * T,
  };
  return (id) => (id === "a" ? map : undefined);
}

const open = ["........", "........", "........", "........", "........"];

function setup(rows = open) {
  const world = createWorld();
  const npcs = createNpcs({ world, lookup: lookupOf(rows), seed: 1, log: () => undefined });
  const add = (person: number, tx: number, ty: number, movement: number, xRange = 0, yRange = 0) => {
    const e = world.add({ kind: "npc", area: "a", x: tx * T + 8, y: ty * T + 8, level: 0, facing: "south", data: { sprite: 1, person } });
    npcs.add(e.id, { person, movement, xRange, yRange, tx, ty });
    return e.id;
  };
  return { world, npcs, add };
}

describe("createNpcs", () => {
  it("keeps still NPCs where they are", () => {
    const { world, npcs, add } = setup();
    const id = add(1, 2, 2, 0);
    for (let i = 0; i < 300; i++) npcs.step();
    expect(world.get(id)).toMatchObject({ x: 40, y: 40, facing: "south" });
  });

  it("never lets a wanderer into a wall or off its range", () => {
    const { world, npcs, add } = setup(["#######.", "#......#", "#......#", "#......#", ".#######"]);
    const id = add(1, 3, 2, 3, 1, 1);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      npcs.step();
      const e = world.get(id)!;
      seen.add(`${tileOf(e.x)},${tileOf(e.y)}`);
    }
    for (const t of seen) {
      const [tx, ty] = t.split(",").map(Number) as [number, number];
      expect(Math.abs(tx - 3)).toBeLessThanOrEqual(1);
      expect(Math.abs(ty - 2)).toBeLessThanOrEqual(1);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("does not step onto a tile another NPC holds", () => {
    const { world, npcs, add } = setup(["....", "....", "....", "...."]);
    const a = add(1, 0, 0, 3, 3, 3);
    const b = add(2, 1, 0, 0);
    for (let i = 0; i < 3000; i++) {
      npcs.step();
      const ea = world.get(a)!;
      const eb = world.get(b)!;
      expect(`${tileOf(ea.x)},${tileOf(ea.y)}`).not.toBe(`${tileOf(eb.x)},${tileOf(eb.y)}`);
    }
  });

  it("does not step onto a player's tile", () => {
    const { world, npcs, add } = setup(["....", "...."]);
    add(1, 0, 0, 20, 3, 0); // walks east along row 0
    world.add({ kind: "player", area: "a", x: 24, y: 8, level: 0, facing: "south", data: {} });
    for (let i = 0; i < 400; i++) {
      npcs.step();
      const e = world.all().find((n) => n.kind === "npc")!;
      expect(tileOf(e.x)).toBe(0);
    }
  });

  it("lists the tiles NPCs hold, including the one they are walking to", () => {
    const { world, npcs, add } = setup();
    const id = add(1, 1, 1, 20, 2, 0);
    let walking = false;
    for (let i = 0; i < 300 && !walking; i++) {
      npcs.step();
      walking = world.get(id)!.data["moving"] === 1;
    }
    expect(walking).toBe(true);
    const e = world.get(id)!;
    const held = npcs.heldTiles("a");
    expect(held.has(`${tileOf(e.x)},${tileOf(e.y)}`)).toBe(true);
    expect(held.size).toBe(2);
  });
});
