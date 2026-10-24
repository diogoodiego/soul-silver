import { WARP_TICKS, type CollisionMap, type WorldLookup, type WorldMap } from "@soulsilver/shared/game";
import type { CollisionCell } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { setup } from "./harness";

// Warps and map borders through a whole session (spec 011, US2 and US3).

const free: CollisionCell = { category: "free", raw: 0 };
const grid: CollisionMap = { width: 4, height: 4, tiles: Array<CollisionCell>(16).fill(free) };
const map = (id: string, extra: Partial<WorldMap>): WorldMap => ({ id, levels: [grid], warps: [], neighbors: [], widthPx: 64, heightPx: 64, ...extra });

const maps = new Map([
  ["town", map("town", { warps: [{ tx: 1, ty: 0, destMap: "house", destAnchor: 0 }], neighbors: [{ map: "route", dx: 64, dy: 0 }] })],
  ["route", map("route", { neighbors: [{ map: "town", dx: -64, dy: 0 }] })],
  ["house", map("house", { warps: [{ tx: 2, ty: 3, destMap: "town", destAnchor: 0 }] })],
]);
const world: WorldLookup = (id) => maps.get(id);

describe("session world", () => {
  it("warps a player and replicates them in the new map", () => {
    const { session, connect, entity } = setup({ world, spawn: () => ({ area: "town", x: 24, y: 24 }) });
    const c = connect();
    for (let t = 0; t < 3; t++) {
      c.input(t, "north");
      session.step();
    }
    expect(entity(c.welcome!.entityId)?.data["warping"]).toBe(WARP_TICKS);
    // No more input: the transition runs out by itself.
    for (let t = 0; t < WARP_TICKS; t++) session.step();
    expect(entity(c.welcome!.entityId)).toMatchObject({ area: "house", x: 40, y: 56 });
    const id = c.welcome!.entityId;
    expect(c.states().some((s) => s.changed.some((d) => d.id === id && d.area === "house") || s.spawned.some((e) => e.id === id && e.area === "house"))).toBe(true);
  });

  it("ignores input during the transition", () => {
    const { session, connect, entity } = setup({ world, spawn: () => ({ area: "town", x: 24, y: 24 }) });
    const c = connect();
    for (let t = 0; t < 3; t++) {
      c.input(t, "north");
      session.step();
    }
    for (let t = 3; t < 3 + WARP_TICKS; t++) {
      c.input(t, "east", true);
      session.step();
    }
    expect(entity(c.welcome!.entityId)).toMatchObject({ area: "house", x: 40, y: 56 });
  });

  it("moves a player across a border into the neighbor without losing input", () => {
    const { session, connect, entity } = setup({ world, spawn: () => ({ area: "town", x: 56, y: 40 }) });
    const c = connect();
    for (let t = 0; t < 6; t++) {
      c.input(t, "east");
      session.step();
    }
    expect(entity(c.welcome!.entityId)).toMatchObject({ area: "route", x: 56 + 18 - 64 });
    expect(c.lastState()?.lastInput).toBe(5);
  });
});
