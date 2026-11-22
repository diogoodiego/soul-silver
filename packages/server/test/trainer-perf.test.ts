import { describe, expect, it } from "vitest";
import { arenaSetup, at, FACING, trainer, trainerNpc } from "./trainer-fixture";

// Spec 022, T040: four players in four trainer battles at once stay well inside the 50 ms tick.

describe("trainer battle performance", () => {
  it("four battles with four players cost under 0.5 ms a tick (median)", () => {
    // Four trainers along row 0 look south; each player stands in one's sight, 4 tiles apart.
    const t = arenaSetup({
      trainers: [1, 2, 3, 4].map((id) => trainer(id, ["sentret", "rattata", "hoothoot"])),
      npcs: [1, 2, 3, 4].map((id, i) => trainerNpc(i, 1 + i * 4, 0, id, FACING.south, 5)),
      spawns: [0, 1, 2, 3].map((i) => ({ x: at(1 + i * 4), y: at(3) })),
    });
    const clients = ["A", "B", "C", "D"].map((n) => t.join(n));
    for (const c of clients) t.untilStart(c);
    expect(t.foes()).toHaveLength(4);
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const start = performance.now();
      t.step(1);
      times.push(performance.now() - start);
    }
    // The median, so a scheduler or GC pause does not decide it.
    expect(times.sort((x, y) => x - y)[times.length >> 1]).toBeLessThan(0.5);
  });
});
