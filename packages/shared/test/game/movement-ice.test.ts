import { describe, expect, it } from "vitest";
import type { Entity } from "../../src/game/entity.ts";
import { stepMovement, type MoveInput } from "../../src/game/movement.ts";
import type { WorldLookup, WorldMap } from "../../src/game/world-map.ts";
import { isIce, type CollisionCell } from "../../src/maps/collision.ts";

// Item 032.6: ice (tile behavior 0x20) slides the player on in the facing direction until something stops them.
const free: CollisionCell = { category: "free", raw: 0 };
const wall: CollisionCell = { category: "blocked", raw: 0x8000 };
const ice: CollisionCell = { category: "special", raw: 0x20 };
/** A rock on the ice: the ROM sets the blocked flag on an ice tile (0x8020). */
const rock: CollisionCell = { category: "blocked", raw: 0x8020 };

// Row 1: free (1–2), ice (3–6), wall. Row 2: free (1–2), ice (3–5), free (6), wall. Row 3: ice with a rock at (4, 3).
const rows = ["#########", "#..IIII##", "#..III.##", "#..IRII.#", "#########"];
const cell: Record<string, CollisionCell> = { ".": free, "#": wall, I: ice, R: rock };
const g = { width: rows[0]!.length, height: rows.length, tiles: rows.flatMap((r) => [...r].map((c) => cell[c]!)) };
const map: WorldMap = { id: "gym", levels: [g], warps: [], neighbors: [], widthPx: g.width * 16, heightPx: g.height * 16 };
const world: WorldLookup = (id) => (id === "gym" ? map : undefined);

const center = (t: number) => t * 16 + 8;
const at = (tx: number, ty: number, extra: Partial<Entity> = {}): Entity => ({ id: 1, kind: "player", area: "gym", x: center(tx), y: center(ty), level: 0, facing: "south", data: {}, ...extra });
const go = (x: number, y: number): MoveInput => ({ move: { x, y }, run: false });
const still = go(0, 0);
const tile = (e: Entity) => [Math.floor(e.x / 16), Math.floor(e.y / 16)];

/** Pushes `input` until the feet leave the tile, then lets go for `ticks` ticks (zero input). */
function push(e: Entity, input: MoveInput, ticks = 30): Entity {
  const from = tile(e).join();
  for (let i = 0; i < 20 && tile(e).join() === from; i++) e = stepMovement(e, input, world);
  for (let i = 0; i < ticks; i++) e = stepMovement(e, still, world);
  return e;
}

describe("ice (item 032.6)", () => {
  it("reads ice from the tile behavior, not from a rock on it", () => {
    expect(isIce(ice)).toBe(true);
    expect(isIce(rock)).toBe(false);
    expect(isIce(free)).toBe(false);
  });

  it("slides on without input until an obstacle, at the center of the last tile", () => {
    const e = push(at(2, 1), go(1, 0));
    expect(e).toMatchObject({ x: center(6), y: center(1), facing: "east" });
  });

  it("stops at the center of the first tile off the ice", () => {
    expect(push(at(2, 2), go(1, 0))).toMatchObject({ x: center(6), y: center(2) });
  });

  it("stops against a rock on the ice", () => {
    expect(push(at(7, 3), go(-1, 0))).toMatchObject({ x: center(5), y: center(3), facing: "west" });
  });

  it("ignores input while sliding, the other axis included", () => {
    let e = push(at(2, 1), go(1, 0), 0);
    const x = e.x;
    for (let i = 0; i < 5; i++) e = stepMovement(e, go(-1, 1), world);
    expect(e).toMatchObject({ y: center(1), facing: "east" });
    expect(e.x).toBeGreaterThan(x);
  });

  it("takes input again once stopped, and slides the other way", () => {
    const stopped = push(at(2, 1), go(1, 0));
    expect(push(stopped, go(-1, 0))).toMatchObject({ x: center(2), y: center(1), facing: "west" });
  });

  it("slides on the tile's lane even when it stepped on off center", () => {
    const e = push(at(2, 2, { y: center(2) + 3 }), go(1, 0));
    expect(e).toMatchObject({ x: center(6), y: center(2) });
  });

  it("holds the slide while the server holds the player (null input)", () => {
    const sliding = push(at(2, 1), go(1, 0), 0);
    expect(stepMovement(sliding, null, world)).toEqual(sliding);
  });
});
