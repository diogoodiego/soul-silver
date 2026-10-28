import { describe, expect, it } from "vitest";
import { createNpcs } from "../src/npcs";
import { createWorld } from "../src/world";

// Spec 021, plan: 40 NPCs and 4 players cost at most 1 ms per tick (mean, so one slow tick does not fail it).

describe("npcs perf", () => {
  it("steps 40 wandering NPCs beside 4 players within 1 ms on average", () => {
    const free = { category: "free" as const, raw: 0 };
    const map = { id: "a", levels: [{ width: 40, height: 40, tiles: Array.from({ length: 1600 }, () => free) }], warps: [], neighbors: [], widthPx: 640, heightPx: 640 };
    const world = createWorld();
    const npcs = createNpcs({ world, lookup: (id) => (id === "a" ? map : undefined), seed: 3, log: () => undefined });
    for (let i = 0; i < 40; i++) {
      const tx = 2 + (i % 8) * 4;
      const ty = 2 + Math.floor(i / 8) * 4;
      const e = world.add({ kind: "npc", area: "a", x: tx * 16 + 8, y: ty * 16 + 8, level: 0, facing: "south", data: { person: i } });
      npcs.add(e.id, { person: i, movement: 3, xRange: 2, yRange: 2, tx, ty });
    }
    for (let i = 0; i < 4; i++) world.add({ kind: "player", area: "a", x: 100 + i * 40, y: 100, level: 0, facing: "south", data: {} });
    for (let i = 0; i < 200; i++) npcs.step();
    const start = performance.now();
    for (let i = 0; i < 2000; i++) npcs.step();
    expect((performance.now() - start) / 2000).toBeLessThan(1);
  });
});
