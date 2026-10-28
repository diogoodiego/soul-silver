import { describe, expect, it } from "vitest";
import { createNpc, NPC_WALK_PX, npcOccupied, patternFor, stepNpc } from "../../src/npc/index.ts";

// Spec 021, US1: the movement patterns of map objects.

const open = () => true;
const T = 16;
const centre = (t: number) => t * T + T / 2;

function run(npc: ReturnType<typeof createNpc>, ticks: number, free: (tx: number, ty: number) => boolean = open) {
  const seen = { dirs: new Set<string>(), tiles: new Set<string>() };
  for (let i = 0; i < ticks; i++) {
    stepNpc(npc, free);
    seen.dirs.add(npc.facing);
    seen.tiles.add(`${Math.floor(npc.x / T)},${Math.floor(npc.y / T)}`);
  }
  return seen;
}

describe("patternFor", () => {
  it.each([0, 14, 15, 19])("keeps movement %i still", (m) => {
    expect(patternFor(m, 0, 0)).toEqual({ kind: "still" });
  });
  it("makes movement 2 look around in four directions", () => {
    expect(patternFor(2, 0, 0)).toMatchObject({ kind: "look" });
  });
  it("makes movement 3 and the ranged ones wander", () => {
    expect(patternFor(3, 1, 0)).toEqual({ kind: "wander", xRange: 1, yRange: 0 });
    expect(patternFor(44, 10, 5)).toEqual({ kind: "wander", xRange: 10, yRange: 5 });
  });
  it("makes movement 20 walk back and forth along its range", () => {
    expect(patternFor(20, 3, 0)).toEqual({ kind: "path", steps: [{ dir: "east", count: 3 }, { dir: "west", count: 3 }] });
    expect(patternFor(20, 0, 2)).toEqual({ kind: "path", steps: [{ dir: "south", count: 2 }, { dir: "north", count: 2 }] });
  });
  it("falls back to still for an unknown movement, and warns", () => {
    const warn: number[] = [];
    expect(patternFor(999, 0, 0, (m) => warn.push(m))).toEqual({ kind: "still" });
    expect(warn).toEqual([999]);
  });
});

describe("stepNpc", () => {
  const make = (pattern: Parameters<typeof createNpc>[0]["pattern"], extra = {}) => createNpc({ person: 1, pattern, tx: 5, ty: 5, facing: "south", seed: 7, ...extra });

  it("never moves or turns a still NPC", () => {
    const npc = make({ kind: "still" });
    const seen = run(npc, 500);
    expect([...seen.dirs]).toEqual(["south"]);
    expect([...seen.tiles]).toEqual(["5,5"]);
  });

  it("turns a look NPC among its directions without leaving the tile", () => {
    const npc = make({ kind: "look", directions: ["north", "south", "east", "west"] });
    const seen = run(npc, 2000);
    expect(seen.dirs.size).toBeGreaterThan(1);
    expect([...seen.tiles]).toEqual(["5,5"]);
  });

  it("keeps a wanderer inside its range and stops it at blocked tiles", () => {
    const npc = make({ kind: "wander", xRange: 1, yRange: 1 });
    const seen = run(npc, 5000);
    for (const t of seen.tiles) {
      const [tx, ty] = t.split(",").map(Number) as [number, number];
      expect(Math.abs(tx - 5)).toBeLessThanOrEqual(1);
      expect(Math.abs(ty - 5)).toBeLessThanOrEqual(1);
    }
    expect(seen.tiles.size).toBeGreaterThan(1);

    const blocked = make({ kind: "wander", xRange: 3, yRange: 3 });
    const none = run(blocked, 2000, (tx, ty) => tx === 5 && ty === 5);
    expect([...none.tiles]).toEqual(["5,5"]);
  });

  it("walks a path in a cycle and lands on tile centres", () => {
    const npc = make({ kind: "path", steps: [{ dir: "east", count: 2 }, { dir: "west", count: 2 }] }, { facing: "east" });
    const visited: number[] = [];
    for (let i = 0; i < 600; i++) {
      stepNpc(npc, open);
      if (!npc.moving) visited.push(Math.floor(npc.x / T));
    }
    expect(Math.min(...visited)).toBe(5);
    expect(Math.max(...visited)).toBe(7);
    expect(npc.x % T === T / 2 || npc.moving !== undefined).toBe(true);
  });

  it("makes a path NPC wait when the next tile is blocked, then resume", () => {
    const npc = make({ kind: "path", steps: [{ dir: "east", count: 1 }, { dir: "west", count: 1 }] });
    run(npc, 200, (tx) => tx !== 6);
    expect(npc.x).toBe(centre(5));
    run(npc, 200);
    expect(Math.floor(npc.x / T)).toBeGreaterThanOrEqual(5);
    const seen = run(npc, 200);
    expect(seen.tiles.has("6,5")).toBe(true);
  });

  it("walks at the player's walking speed", () => {
    const npc = make({ kind: "path", steps: [{ dir: "east", count: 1 }, { dir: "west", count: 1 }] });
    let moved = 0;
    for (let i = 0; i < 100 && moved === 0; i++) {
      const before = npc.x;
      stepNpc(npc, open);
      moved = Math.abs(npc.x - before);
    }
    expect(moved).toBe(NPC_WALK_PX);
  });

  it("is deterministic for the same seed", () => {
    const a = make({ kind: "wander", xRange: 2, yRange: 2 });
    const b = make({ kind: "wander", xRange: 2, yRange: 2 });
    for (let i = 0; i < 1000; i++) {
      stepNpc(a, open);
      stepNpc(b, open);
      expect([a.x, a.y, a.facing]).toEqual([b.x, b.y, b.facing]);
    }
  });
});

describe("npcOccupied", () => {
  const npc = (x: number, y: number, extra = {}) => ({ id: 1, kind: "npc" as const, area: "a", x, y, level: 0, facing: "east" as const, data: extra });

  it("holds the standing tile, and the tile ahead while walking", () => {
    const held = npcOccupied([npc(40, 40), npc(120, 40, { moving: 1 })], "a");
    expect(held(2, 2)).toBe(true);
    expect(held(3, 2)).toBe(false);
    expect(held(7, 2)).toBe(true);
    expect(held(8, 2)).toBe(true);
  });

  it("ignores other areas and other kinds", () => {
    const held = npcOccupied([{ ...npc(40, 40), area: "b" }, { ...npc(40, 40), kind: "player" as const }], "a");
    expect(held(2, 2)).toBe(false);
  });
});

