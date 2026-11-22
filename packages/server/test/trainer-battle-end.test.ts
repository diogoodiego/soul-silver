import { describe, expect, it } from "vitest";
import { arenaSetup, at, FACING, FLAG_BASE, trainer, trainerNpc } from "./trainer-fixture";

// Spec 022 US3, FR-010/FR-011: the prize, the defeated flag, a blackout on a loss, nothing on a disconnect.

const spotted = () => {
  // Class 5 pays 4 per level; the last of the team is level 4: 4 x 4 x 4 = 64.
  const t = arenaSetup({ trainers: [trainer(1, ["sentret", "rattata"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)] });
  const a = t.join();
  t.untilStart(a);
  return { t, a };
};

describe("end of a trainer battle", () => {
  it("a win pays the prize, marks the trainer and it never challenges again", () => {
    const { t, a } = spotted();
    t.knockOut();
    t.step(30);
    t.knockOut();
    t.step(45);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "won", prize: 64 })]);
    t.step(40);
    expect(t.of(a, "trainerSpotted")).toHaveLength(1);
    t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.money).toBe(1064);
    expect(save.flags).toContain(FLAG_BASE + 1);
  });

  it("a loss blacks the player out and leaves the trainer undefeated", () => {
    const { t, a } = spotted();
    const mine = t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId))!;
    t.session.combat!.get(mine.id)!.hp = 0;
    t.step(45);
    expect(t.of(a, "blackout")).toHaveLength(1);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "lost" })]);
    expect(t.foes()).toEqual([]);
    t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.flags).not.toContain(FLAG_BASE + 1);
    // Losing to a trainer costs money, unlike losing to another player.
    expect(save.money).toBeLessThan(1000);
  });

  it("a disconnect ends the battle without marking the trainer", () => {
    // The host (A) stands out of sight; a dropped host would close the whole session.
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)], spawns: [{ x: at(8), y: at(8) }, { x: at(1), y: at(1) }] });
    const a = t.join("A");
    const b = t.join("B");
    t.untilStart(b);
    b.conn.close();
    t.step();
    expect(t.foes()).toEqual([]);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "aborted" })]);
  });
});
