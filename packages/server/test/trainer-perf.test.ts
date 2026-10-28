import { describe, expect, it } from "vitest";
import { arenaSetup, at, FACING, trainer, trainerNpc } from "./trainer-fixture";

// Spec 022, T040: four players in four trainer battles at once stay well inside the 50 ms tick.

describe("trainer battle performance", () => {
  it("four battles with four players cost under 0.5 ms a tick on average", () => {
    // Four trainers along row 0 look south; each player stands in one's sight, 4 tiles apart.
    const t = arenaSetup({
      trainers: [1, 2, 3, 4].map((id) => trainer(id, ["sentret", "rattata", "hoothoot"])),
      npcs: [1, 2, 3, 4].map((id, i) => trainerNpc(i, 1 + i * 4, 0, id, FACING.south, 5)),
      spawns: [0, 1, 2, 3].map((i) => ({ x: at(1 + i * 4), y: at(3) })),
    });
    const clients = ["A", "B", "C", "D"].map((n) => t.join(n));
    for (const c of clients) t.untilStart(c);
    expect(t.foes()).toHaveLength(4);
    const ticks = 200;
    const start = performance.now();
    t.step(ticks);
    expect((performance.now() - start) / ticks).toBeLessThan(0.5);
  });
});
