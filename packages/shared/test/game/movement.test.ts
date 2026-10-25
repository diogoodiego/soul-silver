import { describe, expect, it } from "vitest";
import type { Entity } from "../../src/game/entity.ts";
import {
  HOP_TICKS,
  MOVE_SPEED_PX,
  RUN_SPEED_PX,
  stepMovement,
  unstick,
  WARP_TICKS,
  type CollisionMap,
  type MoveInput,
} from "../../src/game/movement.ts";
import type { WorldLookup, WorldMap } from "../../src/game/world-map.ts";
import type { CollisionCell } from "../../src/maps/collision.ts";

const free: CollisionCell = { category: "free", raw: 0 };
const wall: CollisionCell = { category: "blocked", raw: 0x8000 };
const water: CollisionCell = { category: "water", raw: 0x10 };
const ledgeSouth: CollisionCell = { category: "ledge", raw: 0x3b, direction: "south" };
const ladder: CollisionCell = { category: "ladder", raw: 0x3d };
const up: CollisionCell = { category: "levelTransition", raw: 0x5e, targetLevel: 1 };

/** Rows of characters: . free, # wall, ~ water, v ledge south, H ladder, U level transition to 1. */
function grid(rows: string[]): CollisionMap {
  const cell: Record<string, CollisionCell> = { ".": free, "#": wall, "~": water, v: ledgeSouth, H: ladder, U: up };
  return { width: rows[0]!.length, height: rows.length, tiles: rows.flatMap((r) => [...r].map((c) => cell[c]!)) };
}

function mapOf(id: string, rows: string[], extra: Partial<WorldMap> = {}): WorldMap {
  const g = grid(rows);
  return { id, levels: [g], warps: [], neighbors: [], widthPx: g.width * 16, heightPx: g.height * 16, ...extra };
}

const lookup = (...maps: WorldMap[]): WorldLookup => {
  const byId = new Map(maps.map((m) => [m.id, m]));
  return (id) => byId.get(id);
};

// 6 x 5 tiles; wall at (3,1), water at (3,3).
const field = mapOf("a", ["......", "...#..", "......", "...~..", "......"]);
const world = lookup(field);

const at = (x: number, y: number, extra: Partial<Entity> = {}): Entity => ({ id: 1, kind: "player", area: "a", x, y, level: 0, facing: "south", data: {}, ...extra });
const go = (x: number, y: number, run = false): MoveInput => ({ move: { x, y }, run });
const repeat = (e: Entity, input: MoveInput | null, ticks: number, w: WorldLookup = world) => {
  for (let i = 0; i < ticks; i++) e = stepMovement(e, input, w);
  return e;
};

describe("stepMovement: speed and direction", () => {
  it("walks a fixed distance per tick and faces the direction", () => {
    expect(stepMovement(at(8, 8), go(1, 0), world)).toMatchObject({ x: 8 + MOVE_SPEED_PX, y: 8, facing: "east" });
  });

  it("runs faster than it walks", () => {
    expect(stepMovement(at(8, 8), go(1, 0, true), world).x).toBe(8 + RUN_SPEED_PX);
    expect(RUN_SPEED_PX).toBeGreaterThan(MOVE_SPEED_PX);
  });

  it("ignores the non-dominant axis instead of moving diagonally", () => {
    // A (1, -1) push is normalized to length 1 first, so the dominant (tied) axis moves at ~71% speed.
    const next = stepMovement(at(8, 72), go(1, -1), world);
    expect(next.x).toBe(8);
    expect(next.y).toBeCloseTo(72 - MOVE_SPEED_PX / Math.sqrt(2), 5);
    expect(next.facing).toBe("north");
  });

  it("scales speed with stick intensity", () => {
    expect(stepMovement(at(8, 8), go(0.5, 0), world).x).toBeCloseTo(8 + MOVE_SPEED_PX / 2, 5);
  });

  it("faces the dominant axis", () => {
    expect(stepMovement(at(40, 72), go(0.3, -0.9), world).facing).toBe("north");
    expect(stepMovement(at(40, 72), go(-0.9, 0.3), world).facing).toBe("west");
  });

  it("stays put, keeping its facing, without input", () => {
    expect(stepMovement(at(8, 8, { facing: "west" }), null, world)).toEqual(at(8, 8, { facing: "west" }));
    expect(stepMovement(at(8, 8, { facing: "west" }), go(0, 0), world)).toEqual(at(8, 8, { facing: "west" }));
  });

  it("is deterministic and does not mutate its input", () => {
    const e = at(8, 8);
    expect(stepMovement(e, go(0.7, 0.2, true), world)).toEqual(stepMovement(e, go(0.7, 0.2, true), world));
    expect(e).toEqual(at(8, 8));
  });
});

describe("stepMovement: collision", () => {
  const overlapsSolid = (e: Entity) => {
    for (const [tx, ty] of [[3, 1], [3, 3]] as const) {
      if (e.x + 6 > tx * 16 && e.x - 6 < tx * 16 + 16 && e.y + 6 > ty * 16 && e.y - 6 < ty * 16 + 16) return true;
    }
    return e.x - 6 < 0 || e.y - 6 < 0 || e.x + 6 > 96 || e.y + 6 > 80;
  };

  it("does not enter a wall", () => {
    const e = repeat(at(24, 24), go(1, 0), 20);
    expect(e.x).toBeLessThanOrEqual(48 - 6);
    expect(e.x).toBeGreaterThan(48 - 6 - 1);
  });

  it("does not enter water", () => {
    expect(repeat(at(24, 56), go(1, 0, true), 20).x).toBeLessThanOrEqual(48 - 6);
  });

  it("does not leave a map with no neighbor", () => {
    expect(repeat(at(8, 8), go(0, -1), 20).y).toBeGreaterThanOrEqual(6);
  });

  it("ignores the secondary axis instead of sliding along a wall", () => {
    const column = lookup(mapOf("a", ["...#..", "...#..", "...#..", "...#..", "......"]));
    const e = repeat(at(24, 24), go(1, 1), 10, column);
    expect(e.x).toBe(24);
    expect(e.y).toBeGreaterThan(24);
  });

  it("never overlaps a solid tile, whatever the input", () => {
    let e = at(24, 40);
    const inputs = [go(1, 0, true), go(1, 1, true), go(0, -1), go(-1, 1, true), go(0.4, -0.9, true), go(1, -0.2)];
    for (let i = 0; i < 300; i++) {
      e = stepMovement(e, inputs[i % inputs.length]!, world);
      expect(overlapsSolid(e)).toBe(false);
    }
  });

  it("treats an unknown map as open ground", () => {
    expect(stepMovement(at(0, 0, { area: "nowhere" }), go(-1, 0), world).x).toBe(-MOVE_SPEED_PX);
  });
});

describe("stepMovement: ledges", () => {
  // Ledge row at y = 2; landing row at y = 3.
  const hill = lookup(mapOf("a", ["....", "....", "vvvv", "....", "...."]));

  it("hops down a ledge in its direction", () => {
    let e = repeat(at(24, 20), go(0, 1), 3, hill);
    expect(e.data["hop"]).toBe(HOP_TICKS);
    e = repeat(e, null, HOP_TICKS, hill);
    expect(e.data["hop"]).toBeUndefined();
    expect(Math.floor(e.y / 16)).toBe(3);
    expect(e.y - 6).toBeGreaterThanOrEqual(48);
  });

  it("ignores input while hopping", () => {
    let e = repeat(at(24, 20), go(0, 1), 3, hill);
    const x = e.x;
    e = repeat(e, go(1, 0, true), 2, hill);
    expect(e.x).toBe(x);
  });

  it("blocks from the other side", () => {
    const e = repeat(at(24, 60), go(0, -1), 20, hill);
    expect(e.y - 6).toBeGreaterThanOrEqual(48);
    expect(e.data["hop"]).toBeUndefined();
  });

  it("does not hop when the landing is solid", () => {
    const blocked = lookup(mapOf("a", ["....", "....", "vvvv", "####", "...."]));
    const e = repeat(at(24, 20), go(0, 1), 10, blocked);
    expect(e.data["hop"]).toBeUndefined();
    expect(e.y + 6).toBeLessThanOrEqual(32);
  });
});

describe("stepMovement: levels", () => {
  const upper = grid(["....", "....", "####"]);
  const lower = grid(["..U.", "....", "...."]);
  const bridge = lookup({ id: "a", levels: [lower, upper], warps: [], neighbors: [], widthPx: 64, heightPx: 48 });

  it("changes level on a level transition tile", () => {
    const e = repeat(at(40, 24), go(0, -1), 4, bridge);
    expect(e.level).toBe(1);
  });

  it("collides only with its own level", () => {
    expect(repeat(at(8, 24), go(0, 1), 10, bridge).y).toBeGreaterThan(32);
    expect(repeat(at(8, 24, { level: 1 }), go(0, 1), 10, bridge).y).toBeLessThanOrEqual(26);
  });

  it("walks a ladder without changing level", () => {
    const ladders = lookup(mapOf("a", ["....", ".HH.", "...."]));
    const e = repeat(at(24, 40), go(0, -1), 5, ladders);
    expect(e.y).toBeLessThan(28);
    expect(e.level).toBe(0);
  });
});

describe("stepMovement: neighbors", () => {
  const westMap = mapOf("w", ["....", "...."], { neighbors: [{ map: "e", dx: 64, dy: 0 }] });
  const eastMap = mapOf("e", ["....", "...."], { neighbors: [{ map: "w", dx: -64, dy: 0 }] });
  const two = lookup(westMap, eastMap);

  it("moves into the neighbor when the feet cross the edge", () => {
    const e = repeat(at(56, 16, { area: "w" }), go(1, 0), 4, two);
    expect(e.area).toBe("e");
    expect(e.x).toBe(56 + 4 * MOVE_SPEED_PX - 64);
  });

  it("comes back to the same place", () => {
    let e = repeat(at(56, 16, { area: "w" }), go(1, 0), 4, two);
    e = repeat(e, go(-1, 0), 4, two);
    expect(e).toMatchObject({ area: "w", x: 56, y: 16 });
  });
});

describe("stepMovement: warps", () => {
  const outside = mapOf("out", ["....", "....", "...."], { warps: [{ tx: 1, ty: 0, destMap: "in", destAnchor: 0 }] });
  const inside = mapOf("in", ["....", "....", "...."], { warps: [{ tx: 2, ty: 2, destMap: "out", destAnchor: 0 }] });
  const town = lookup(outside, inside);

  it("starts a transition on entering a warp tile", () => {
    const e = repeat(at(24, 24, { area: "out" }), go(0, -1), 3, town);
    expect(e.data["warping"]).toBe(WARP_TICKS);
    expect(e.area).toBe("out");
  });

  it("ignores input during the transition and arrives at the destination anchor", () => {
    let e = repeat(at(24, 24, { area: "out" }), go(0, -1), 3, town);
    e = repeat(e, go(1, 0, true), WARP_TICKS / 2, town);
    expect(e).toMatchObject({ area: "in", x: 2 * 16 + 8, y: 2 * 16 + 8 });
    e = repeat(e, go(1, 0, true), WARP_TICKS / 2, town);
    expect(e).toMatchObject({ area: "in", x: 2 * 16 + 8, y: 2 * 16 + 8 });
    expect(e.data["warping"]).toBeUndefined();
  });

  it("does not warp back while standing on the arrival tile", () => {
    let e = repeat(at(24, 24, { area: "out" }), go(0, -1), 3, town);
    e = repeat(e, null, WARP_TICKS + 3, town);
    expect(e.area).toBe("in");
    expect(e.data["warping"]).toBeUndefined();
  });

  it("warps again after stepping off and back on", () => {
    let e = repeat(at(24, 24, { area: "out" }), go(0, -1), 3, town);
    e = repeat(e, null, WARP_TICKS, town);
    e = repeat(e, go(0, -1), 6, town);
    e = repeat(e, go(0, 1), 8, town);
    expect(e.data["warping"]).toBeGreaterThan(0);
  });

  // Real HGSS data: outdoor doors are solid warp tiles; indoor mats are walkable with a wall below.
  const street = mapOf("street", ["....", ".#..", "...."], { warps: [{ tx: 1, ty: 1, destMap: "room", destAnchor: 0 }] });
  const room = mapOf("room", ["....", "....", "####"], { warps: [{ tx: 1, ty: 1, destMap: "street", destAnchor: 0 }] });
  const houses = lookup(street, room);

  it("enters a solid door by walking into it", () => {
    let e = repeat(at(24, 40, { area: "street" }), go(0, -1), 1, houses);
    expect(e.data["warping"]).toBe(WARP_TICKS);
    expect(e).toMatchObject({ x: 24, y: 24 });
    e = repeat(e, null, WARP_TICKS, houses);
    expect(e).toMatchObject({ area: "room", x: 24, y: 24 });
  });

  it("leaves by a mat when pushing against the wall below it", () => {
    let e = repeat(at(24, 40, { area: "street" }), go(0, -1), 3, houses);
    e = repeat(e, null, WARP_TICKS, houses);
    e = repeat(e, go(0, 1), 2, houses);
    expect(e.data["warping"]).toBeGreaterThan(0);
  });

  it("does not enter a door brushed by the footprint's corner", () => {
    const e = repeat(at(36, 40, { area: "street" }), go(0, -1), 3, houses);
    expect(e.data["warping"]).toBeUndefined();
  });

  it("arrives below a solid door, facing away from it", () => {
    let e = repeat(at(24, 40, { area: "street" }), go(0, -1), 3, houses);
    e = repeat(e, null, WARP_TICKS, houses);
    e = repeat(e, go(0, 1), 2, houses);
    e = repeat(e, null, WARP_TICKS, houses);
    expect(e).toMatchObject({ area: "street", x: 24, y: 40, facing: "south" });
    expect(e.data["warping"]).toBeUndefined();
  });

  it("stays put when the destination is unknown", () => {
    const broken = lookup(mapOf("out", ["....", "...."], { warps: [{ tx: 1, ty: 0, destMap: "gone", destAnchor: 0 }] }));
    let e = repeat(at(24, 24, { area: "out" }), go(0, -1), 3, broken);
    expect(e.data["warping"]).toBeUndefined();
    e = repeat(e, null, WARP_TICKS, broken);
    expect(e.area).toBe("out");
  });
});

describe("unstick", () => {
  it("leaves a free position alone", () => {
    expect(unstick(at(8, 8), world)).toEqual(at(8, 8));
  });

  it("moves an entity inside a wall to the nearest free tile center", () => {
    const e = unstick(at(56, 24), world);
    expect(Math.abs(e.x - 56) + Math.abs(e.y - 24)).toBeLessThanOrEqual(32);
    expect(stepMovement(e, go(0, 0), world)).toEqual(e);
    expect([e.x % 16, e.y % 16]).toEqual([8, 8]);
  });
});
