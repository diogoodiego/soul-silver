import { describe, expect, it } from "vitest";
import { arenaSetup, at, FACING, trainer, trainerNpc } from "./trainer-fixture";

// Spec 022 US1, FR-002 to FR-004: "!", the player held while the trainer walks up, then the arena; a script's TrainerBattle goes the same way.

describe("starting a trainer battle", () => {
  it("holds the player through the approach, then opens the arena", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)] });
    const a = t.join();
    t.step(8);
    expect(t.of(a, "trainerSpotted")).toHaveLength(1);
    const before = t.session.world.get(a.welcome!.entityId)!;
    // Trying to walk away during the "!" does nothing.
    for (let i = 0; i < 5; i++) {
      t.send(a, 0, { x: -1, y: 0 });
      t.step();
    }
    expect(t.session.world.get(a.welcome!.entityId)!.x).toBe(before.x);
    t.untilStart(a);
    const [start] = t.of(a, "trainerBattleStart");
    expect(start).toMatchObject({ trainerId: 1, player: a.welcome!.playerId, music: "trainer", double: false, arena: { area: "60", radiusPx: 96 } });
    // The arena lies toward the trainer, south of the player.
    expect(start!.arena.y).toBeGreaterThan(before.y);
    expect(t.foes()).toHaveLength(1);
  });

  it("a script's TrainerBattle starts the same battle and waits for it", () => {
    const t = arenaSetup({
      trainers: [trainer(7, ["sentret"])],
      script: ["L1:", ["TrainerBattle", { trainer: { trainer: 7 }, arg1: 0, arg2: 0, arg3: 0 }], ["CheckBattleWon", { var: { variable: 0x4001 } }], ["End"]],
      spawns: [{ x: at(0), y: at(1) }],
    });
    const a = t.join(undefined, { facing: "north" });
    t.step();
    t.press(a, t.BUTTON.interact);
    t.step();
    expect(t.of(a, "trainerBattleStart")).toEqual([expect.objectContaining({ trainerId: 7 })]);
    t.knockOut();
    t.step(3);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "won" })]);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.vars).toMatchObject({ "16385": 1 });
  });
});
