import { describe, expect, it } from "vitest";
import { MOVES } from "./combat-fixture";
import { arenaSetup, at, FACING, trainer, trainerNpc } from "./trainer-fixture";

// Spec 022 US4, FR-013/FR-014: one player per battle; the others see it but cannot touch it; the same
// trainer can fight two players at once.

describe("trainer battles in multiplayer", () => {
  it("another player's Pokémon cannot hurt the ones in the battle", () => {
    // A spawns where the trainer sees them; B stands out of its sight.
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)], spawns: [{ x: at(1), y: at(1) }, { x: at(8), y: at(8) }] });
    const a = t.join("A");
    const b = t.join("B");
    t.untilStart(a);
    expect(t.of(b, "trainerBattleStart")).toHaveLength(1);
    expect(t.of(b, "trainerSpotted")).toEqual([]);
    // B sends a Pokémon out and stands it on the trainer's; it attacks every tick.
    t.press(b, t.BUTTON.combat);
    t.step(20);
    const mineB = t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(b.welcome!.playerId))!;
    const [foe] = t.foes();
    const hpBefore = t.session.combat!.get(foe!.id)!.hp;
    for (let i = 0; i < 40; i++) {
      t.session.world.update({ ...t.session.world.get(mineB.id)!, x: foe!.x - 12, y: foe!.y });
      t.send(b, i % 2 === 0 ? 1 : 0);
      t.step();
    }
    expect(t.session.combat!.get(mineB.id)!.moves[0]!.id).toBe(MOVES.tackle.id);
    expect(t.session.combat!.get(foe!.id)!.hp).toBe(hpBefore);
  });

  it("the same trainer fights two players at once, in separate arenas", () => {
    // The trainer looks west along row 5; A and B stand on it at different distances.
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 6, 5, 1, FACING.west, 6)], spawns: [{ x: at(2), y: at(5) }, { x: at(4), y: at(5) }] });
    const a = t.join("A");
    const b = t.join("B");
    t.untilStart(a);
    t.untilStart(b);
    const ids = [t.of(a, "trainerBattleStart"), t.of(b, "trainerBattleStart")].map((list) => list.find((m) => m.player !== undefined && m.trainerId === 1));
    const own = (c: typeof a) => t.of(c, "trainerBattleStart").find((m) => m.player === c.welcome!.playerId)!;
    expect(ids.every(Boolean)).toBe(true);
    expect(own(a).battleId).not.toBe(own(b).battleId);
    expect(t.foes()).toHaveLength(2);
  });
});
