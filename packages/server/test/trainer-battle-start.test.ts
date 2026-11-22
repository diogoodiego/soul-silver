import { describe, expect, it } from "vitest";
import { SCRIPT_TIMEOUT_TICKS } from "../src/scripts";
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
    // The trainer's sprite (its class) calls out the moves.
    expect(t.foes()[0]!.data).toMatchObject({ trainerPic: 5 });
    // Knocked out of the arena, the trainer's Pokémon is put back on its edge.
    t.session.world.update({ ...t.foes()[0]!, x: start!.arena.x + 500 });
    t.step();
    const foe = t.foes()[0]!;
    expect(Math.hypot(foe.x - start!.arena.x, foe.y - start!.arena.y)).toBeLessThanOrEqual(start!.arena.radiusPx + 1e-9);
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
    t.step(45);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "won" })]);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.vars).toMatchObject({ "16385": 1 });
  });

  it("a script waits out a battle longer than the script timeout (spec 024: Elder Li's fight)", () => {
    const t = arenaSetup({
      trainers: [trainer(7, ["sentret"])],
      script: ["L1:", ["TrainerBattle", { trainer: { trainer: 7 }, arg1: 0, arg2: 0, arg3: 0 }], ["CheckBattleWon", { var: { variable: 0x4001 } }], ["End"]],
      spawns: [{ x: at(0), y: at(1) }],
    });
    const a = t.join(undefined, { facing: "north" });
    t.step();
    t.press(a, t.BUTTON.interact);
    t.idle(a, SCRIPT_TIMEOUT_TICKS + 10);
    expect(t.logs.filter((l) => l.includes("script timed out"))).toEqual([]);
    t.knockOut();
    t.step(45);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.vars).toMatchObject({ "16385": 1 });
  });

  it("sends the trainer's Pokémon out on the last walkable tile toward the trainer (spec 024: Elder Li's altar)", () => {
    // The talker at (0, 0) stands on the map's top row: a full arena radius north is off the map, in the wall.
    const t = arenaSetup({
      trainers: [trainer(7, ["sentret"])],
      script: ["L1:", ["TrainerBattle", { trainer: { trainer: 7 }, arg1: 0, arg2: 0, arg3: 0 }], ["End"]],
      spawns: [{ x: at(0), y: at(1) }],
    });
    const a = t.join(undefined, { facing: "north" });
    t.step();
    t.press(a, t.BUTTON.interact);
    t.idle(a, 40);
    const foe = t.foes()[0]!;
    expect(foe.y).toBeGreaterThanOrEqual(0);
    expect(foe.y).toBeLessThan(at(1));
  });
});
