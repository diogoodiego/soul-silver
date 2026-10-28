import { describe, expect, it } from "vitest";
import { arenaSetup, at, FACING, FLAG_BASE, trainer, trainerNpc } from "./trainer-fixture";

// Spec 022, FR-002/FR-010: the trainer's own lines (bank 728) at the challenge, at the end of a battle
// it loses, and when talked to afterwards; talking to one not yet beaten starts the battle.

describe("trainer lines", () => {
  it("challenges with its line, and the line when it loses goes to the winner", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)] });
    const a = t.join();
    t.untilStart(a);
    expect(t.of(a, "trainerSpotted")).toEqual([expect.objectContaining({ intro: "0728:10" })]);
    t.knockOut();
    t.step(2);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "won", defeat: "0728:11" })]);
  });

  it("the battle waits until the player has read the challenge line", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)] });
    const a = t.join();
    t.step(8);
    // Well past the "!" and the walk (1 s + 3 tiles x 0.25 s), the line is still open.
    t.idle(a, 200);
    expect(t.of(a, "trainerBattleStart")).toEqual([]);
    a.conn.send({ type: "trainer-ready" });
    t.step();
    expect(t.of(a, "trainerBattleStart")).toHaveLength(1);
  });

  it("a client that never answers does not hold the battle forever", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)] });
    const a = t.join();
    t.idle(a, 8 + 35 + 20 * 30 + 2);
    expect(t.of(a, "trainerBattleStart")).toHaveLength(1);
  });

  it("an answer before the trainer has walked up does not skip the walk", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)] });
    const a = t.join();
    t.step(8);
    a.conn.send({ type: "trainer-ready" });
    t.step(5);
    expect(t.of(a, "trainerBattleStart")).toEqual([]);
  });

  it("talking to a trainer not yet beaten starts the battle", () => {
    // Facing north, the player stands right under the trainer, out of its sight (it looks north too).
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 0, 1, FACING.north, 5)], spawns: [{ x: at(1), y: at(1) }] });
    const a = t.join(undefined, { facing: "north" });
    t.step();
    t.press(a, t.BUTTON.interact);
    expect(t.of(a, "trainerSpotted")).toEqual([expect.objectContaining({ trainerId: 1, tiles: 0 })]);
  });

  it("a beaten trainer says its after-battle line", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 0, 1, FACING.north, 5)], spawns: [{ x: at(1), y: at(1) }] });
    const a = t.join(undefined, { facing: "north", flags: [FLAG_BASE + 1] });
    t.step();
    t.press(a, t.BUTTON.interact);
    expect(t.of(a, "trainerSay")).toEqual([{ type: "trainerSay", text: "0728:12" }]);
    expect(t.of(a, "trainerSpotted")).toEqual([]);
  });
});
