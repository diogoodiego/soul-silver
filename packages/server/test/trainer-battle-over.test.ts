import { describe, expect, it } from "vitest";
import { arenaSetup, at, FACING, FLAG_BASE, member, trainer, trainerNpc } from "./trainer-fixture";

// A trainer battle holds for endS (2 s) once a side has nobody left, so the player sees how it ended.

const HELD_TICKS = 40;
const battle = (over: Partial<Parameters<typeof arenaSetup>[0]> = {}) => {
  const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)], ...over });
  const a = t.join();
  t.untilStart(a);
  const mine = () => t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId))!;
  return { t, a, mine, ends: () => t.of(a, "trainerBattleEnd").map((m) => m.result), over: () => t.of(a, "trainerBattleOver").map((m) => m.result) };
};

describe("a decided trainer battle", () => {
  it("won: says so at once, the last foe lies on the field, and it ends endS later", () => {
    const { t, ends, over } = battle();
    t.knockOut();
    t.step(1);
    expect(over()).toEqual(["won"]);
    t.step(HELD_TICKS - 2);
    expect(ends()).toEqual([]);
    expect(t.foes()).toHaveLength(1);
    t.step(3);
    expect(ends()).toEqual(["won"]);
    expect(over()).toEqual(["won"]);
    expect(t.foes()).toEqual([]);
  });

  it("is not decided while the trainer has another Pokémon", () => {
    const { t, ends, over } = battle({ trainers: [trainer(1, ["sentret", "rattata"])] });
    t.knockOut();
    t.step(30);
    expect(over()).toEqual([]);
    expect(ends()).toEqual([]);
    expect(t.foes()).toHaveLength(1);
  });

  it("pays and marks the trainer once", () => {
    const { t, a } = battle();
    t.knockOut();
    t.step(HELD_TICKS + 20);
    t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.flags.filter((f: number) => f === FLAG_BASE + 1)).toHaveLength(1);
    expect(save.money).toBe(1048);
  });

  it("stays won if the player's Pokémon would faint meanwhile (poison)", () => {
    const { t, a, mine, ends } = battle();
    t.knockOut();
    t.step(2);
    t.session.combat!.get(mine().id)!.hp = 0;
    t.step(HELD_TICKS + 5);
    expect(ends()).toEqual(["won"]);
    expect(t.of(a, "blackout")).toEqual([]);
    expect(t.of(a, "party").at(-1)!.members[0]!.hp).toBeGreaterThan(0);
  });

  it("stays won if the player leaves meanwhile", () => {
    const { t, a } = battle();
    t.knockOut();
    t.step(2);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toContain(FLAG_BASE + 1);
  });

  it("lost: says so at once, and the blackout comes endS later", () => {
    const { t, a, mine, ends, over } = battle();
    t.session.combat!.get(mine().id)!.hp = 0;
    t.step(1);
    expect(over()).toEqual(["lost"]);
    // It lies on the field, still the one the player's camera follows.
    expect(t.session.combat!.get(mine().id)?.hp).toBe(0);
    t.step(HELD_TICKS - 2);
    expect(t.of(a, "blackout")).toEqual([]);
    expect(ends()).toEqual([]);
    t.step(3);
    expect(t.of(a, "blackout")).toHaveLength(1);
    expect(ends()).toEqual(["lost"]);
    expect(over()).toEqual(["lost"]);
  });

  it("stays lost if the last foe faints meanwhile", () => {
    const { t, a, mine, ends } = battle();
    t.session.combat!.get(mine().id)!.hp = 0;
    t.step(2);
    t.knockOut();
    t.step(HELD_TICKS + 5);
    expect(ends()).toEqual(["lost"]);
    expect(t.of(a, "trainerBattleEnd")[0]!.prize).toBeUndefined();
  });

  it("stays lost, healed and paid for, if the player leaves meanwhile", () => {
    const { t, a, mine } = battle();
    t.session.combat!.get(mine().id)!.hp = 0;
    t.step(2);
    t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.money).toBeLessThan(1000);
    expect(save.party[0]!.hp).toBeGreaterThan(0);
    expect(save.flags).not.toContain(FLAG_BASE + 1);
  });

  it("goes on while the player has another Pokémon to send", () => {
    const { t, a, mine, over } = battle({ party: [member("cyndaquil"), member("chikorita")] });
    t.session.combat!.get(mine().id)!.hp = 0;
    t.step(HELD_TICKS + 5);
    expect(over()).toEqual([]);
    expect(t.of(a, "fainted")).toEqual([expect.objectContaining({ canContinue: true })]);
  });

  it("tells only the player who fights", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)], spawns: [{ x: at(8), y: at(8) }, { x: at(1), y: at(1) }] });
    const a = t.join("A");
    const b = t.join("B");
    t.untilStart(b);
    t.knockOut();
    t.step(2);
    expect(t.of(b, "trainerBattleOver")).toHaveLength(1);
    expect(t.of(a, "trainerBattleOver")).toEqual([]);
  });
});
