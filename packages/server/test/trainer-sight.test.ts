import { describe, expect, it } from "vitest";
import { arenaSetup, FACING, FLAG_BASE, trainer, trainerNpc } from "./trainer-fixture";

// Spec 022 US1, FR-001/FR-002: a trainer sees the player straight ahead, within its range, unless something blocks the view.

// The player spawns on tile (1, 1); the trainer stands on (1, 5) looking north.
const looking = (sight = 5) => trainerNpc(0, 1, 5, 1, FACING.north, sight);

describe("trainer sight", () => {
  it("spots the player in range and straight ahead", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [looking()] });
    const a = t.join();
    t.step(8);
    expect(t.of(a, "trainerSpotted")).toEqual([expect.objectContaining({ trainerId: 1, tiles: 3 })]);
  });

  it("does not see past its range or behind it", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [looking(3), trainerNpc(1, 1, 0, 1, FACING.north, 5)] });
    const a = t.join();
    t.step(8);
    expect(t.of(a, "trainerSpotted")).toEqual([]);
  });

  it("is blocked by a wall in between", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [looking()], walls: [[1, 3]] });
    const a = t.join();
    t.step(8);
    expect(t.of(a, "trainerSpotted")).toEqual([]);
  });

  it("never challenges again once defeated", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [looking()] });
    const a = t.join(undefined, { flags: [FLAG_BASE + 1] });
    t.step(8);
    expect(t.of(a, "trainerSpotted")).toEqual([]);
  });

  it("two trainers who see the player at once challenge one at a time", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"]), trainer(2, ["rattata"])], npcs: [looking(), trainerNpc(1, 5, 1, 2, FACING.west, 5)] });
    const a = t.join();
    t.step(8);
    expect(t.of(a, "trainerSpotted")).toHaveLength(1);
  });
});
