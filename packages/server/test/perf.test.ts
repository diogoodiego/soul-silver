import type { CollisionMap } from "@soulsilver/shared/game";
import type { CollisionCell } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { setup } from "./harness";

const free: CollisionCell = { category: "free", raw: 0 };
const map: CollisionMap = { width: 64, height: 64, tiles: Array.from({ length: 64 * 64 }, () => free) };

describe("tick budget (SC-001)", () => {
  it("keeps every tick under 10 ms with 4 players moving for a minute", () => {
    const { session, connect } = setup({ collision: () => map, spawn: (id) => ({ area: "a", x: 100 + id * 50, y: 500 }) });
    const clients = [connect(), connect(), connect(), connect()];
    for (let i = 0; i < 30; i++) session.world.add({ kind: "wild", area: "a", x: i * 20, y: 40, facing: "south", data: { species: i } });
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
