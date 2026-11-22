import { stepMovement, type CollisionMap, type Entity } from "@soulsilver/shared/game";
import type { CollisionCell } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { flatWorld, setup } from "./harness";

const free: CollisionCell = { category: "free", raw: 0 };
const map: CollisionMap = { width: 64, height: 64, tiles: Array.from({ length: 64 * 64 }, () => free) };

describe("tick budget (SC-001)", () => {
  // A scheduler or GC pause must not decide it; a slow tick fails every attempt.
  it("keeps every tick under 10 ms with 4 players moving for a minute", { retry: 2 }, () => {
    const { session, connect } = setup({ world: flatWorld(map), spawn: (id) => ({ area: "a", x: 100 + id * 50, y: 500 }) });
    const clients = [connect(), connect(), connect(), connect()];
    for (let i = 0; i < 30; i++) session.world.add({ kind: "wild", area: "a", x: i * 20, y: 40, level: 0, facing: "south", data: { species: i } });
    const dirs = ["east", "south", "west", "north"] as const;
    let worst = 0;
    for (let t = 0; t < 1200; t++) {
      clients.forEach((c, i) => c.input(t, dirs[(Math.floor(t / 40) + i) % 4]!));
      const start = performance.now();
      session.step();
      worst = Math.max(worst, performance.now() - start);
    }
    expect(worst).toBeLessThan(10);
  });
});

describe("movement step cost (spec 011)", () => {
  it("averages under 0.1 ms per entity", () => {
    const world = flatWorld(map);
    let e: Entity = { id: 1, kind: "player", area: "a", x: 500, y: 500, level: 0, facing: "south", data: {} };
    const inputs = [
      { move: { x: 1, y: 0.4 }, run: true },
      { move: { x: -0.3, y: 1 }, run: false },
      { move: { x: -1, y: -1 }, run: true },
      { move: { x: 0.2, y: -1 }, run: false },
    ];
    const steps = 20_000;
    const start = performance.now();
    for (let i = 0; i < steps; i++) e = stepMovement(e, inputs[Math.floor(i / 50) % 4]!, world);
    expect((performance.now() - start) / steps).toBeLessThan(0.1);
  });
});
