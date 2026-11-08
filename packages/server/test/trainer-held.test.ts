import { describe, expect, it } from "vitest";
import { arenaSetup, FACING, member, ORAN, trainer, trainerNpc } from "./trainer-fixture";

// Spec 027, FR-007 (Phase 12, T071): held items count in trainer battles too, on the trainer's team
// (the extracted team item) and on the player's ally in a double battle.

const spotted = (o: Parameters<typeof arenaSetup>[0]) => {
  const t = arenaSetup({ npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)], ...o });
  const a = t.join();
  t.untilStart(a);
  return { t, a };
};

describe("held items in trainer battles", () => {
  it("a trainer's Pokémon holds the item of its team entry", () => {
    const base = trainer(1, ["sentret"]);
    const { t } = spotted({ trainers: [{ ...base, team: [{ ...base.team[0]!, item: ORAN }] }] });
    const [foe] = t.foes();
    expect(t.session.combat!.get(foe!.id)!.held?.item).toBe(ORAN);
  });

  it("the player's ally in a double battle keeps its held item and PP Ups", () => {
    const { t, a } = spotted({ trainers: [trainer(1, ["sentret", "rattata"], { doubleBattle: true })], party: [member("cyndaquil"), { ...member("onix"), held: ORAN, ppUps: [3] }] });
    // Onix (95) is the second member: the ally.
    const ally = t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId) && e.data["species"] === 95)!;
    const c = t.session.combat!.get(ally.id)!;
    expect(c.held?.item).toBe(ORAN);
    expect(c.cooldownMul[0]).toBeCloseTo(1 / 1.6);
  });
});
