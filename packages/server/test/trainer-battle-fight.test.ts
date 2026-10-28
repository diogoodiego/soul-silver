import { describe, expect, it } from "vitest";
import { arenaSetup, at, FACING, member, POTION, trainer, trainerNpc } from "./trainer-fixture";

// Spec 022 US2, FR-005 to FR-009: the original team in order, the arena, the AI's switches and items,
// no ball and no running, and double battles.

const spotted = (o: Parameters<typeof arenaSetup>[0]) => {
  const t = arenaSetup({ npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)], ...o });
  const a = t.join();
  t.untilStart(a);
  return { t, a };
};

describe("fighting the team", () => {
  it("sends the team out in order, one at a time, and the last faint wins", () => {
    const { t, a } = spotted({ trainers: [trainer(1, ["sentret", "rattata"])] });
    expect(t.of(a, "trainerSendOut").map((m) => m.slot)).toEqual([0]);
    t.knockOut();
    t.step(30);
    expect(t.of(a, "trainerSendOut").map((m) => m.slot)).toEqual([0, 1]);
    expect(t.of(a, "trainerBattleEnd")).toEqual([]);
    t.knockOut();
    t.step(2);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "won" })]);
    expect(t.foes()).toEqual([]);
  });

  it("keeps the player's Pokémon inside the arena", () => {
    const { t, a } = spotted({ trainers: [trainer(1, ["sentret"])] });
    const [start] = t.of(a, "trainerBattleStart");
    const mine = t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId))!;
    t.session.world.update({ ...mine, x: start!.arena.x + 400 });
    t.step();
    const after = t.session.world.get(mine.id)!;
    expect(Math.hypot(after.x - start!.arena.x, after.y - start!.arena.y)).toBeLessThanOrEqual(start!.arena.radiusPx + 0.01);
  });

  it("uses a potion below the threshold, with the item delay", () => {
    const { t, a } = spotted({ trainers: [trainer(1, ["sentret"], { items: [POTION] })] });
    const [foe] = t.foes();
    const c = t.session.combat!.get(foe!.id)!;
    c.hp = 2;
    for (let i = 0; i < 120 && t.of(a, "trainerItem").length === 0; i++) t.step();
    expect(t.of(a, "trainerItem")).toEqual([expect.objectContaining({ item: POTION, target: foe!.id })]);
    // It stands still for itemUseS (1.5 s), then the HP comes back.
    t.step(29);
    expect(c.hp).toBe(2);
    t.step(2);
    expect(c.hp).toBeGreaterThan(2);
  });

  it("switches out of a type disadvantage when its profile allows it", () => {
    // Expert flag (bit 2): switching on. Chikorita (grass) against Cyndaquil (fire) is at a disadvantage; Rattata is not.
    const { t, a } = spotted({ trainers: [trainer(1, ["chikorita", "rattata"], { aiFlags: 1 << 2 })] });
    t.step(80);
    expect(t.of(a, "trainerSendOut").map((m) => m.slot)).toEqual([0, 1]);
  });
});

describe("trainer battle rules", () => {
  it("refuses the ball with the original message", () => {
    const { t, a } = spotted({ trainers: [trainer(1, ["sentret"])] });
    t.press(a, t.BUTTON.throw);
    // "The Trainer blocked the Ball!" and "Don't be a thief!" from the battle text bank.
    expect(t.of(a, "trainerSay").map((m) => m.text)).toEqual(["0197:859", "0197:860"]);
  });

  it("there is no running", () => {
    const { t, a } = spotted({ trainers: [trainer(1, ["sentret"])] });
    t.press(a, t.BUTTON.recall);
    expect(t.of(a, "notice")).toContainEqual({ type: "notice", code: "no-escape" });
    expect(t.foes()).toHaveLength(1);
    expect(t.of(a, "trainerBattleEnd")).toEqual([]);
  });

  it("the trainer cannot be hit: it is not a combatant", () => {
    const { t } = spotted({ trainers: [trainer(1, ["sentret"])] });
    const npc = t.session.world.all().find((e) => e.kind === "npc")!;
    expect(t.session.combat!.get(npc.id)).toBeUndefined();
  });
});

/** The player's Pokémon of this species out in the world (combat rewrites entity data, so no role tag). */
const outOf = (t: ReturnType<typeof spotted>["t"], a: ReturnType<typeof spotted>["a"], species: number) =>
  t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId) && e.data["species"] === species);

describe("double battles", () => {
  it("both foes come out together and the second party member fights as an AI ally", () => {
    const { t, a } = spotted({ trainers: [trainer(1, ["sentret", "rattata"], { doubleBattle: true })], party: [member("cyndaquil"), member("onix")] });
    expect(t.of(a, "trainerSendOut").map((m) => m.slot)).toEqual([0, 1]);
    const ally = outOf(t, a, 95);
    expect(ally).toBeDefined();
    expect(t.session.combat!.get(ally!.id)!.battle).toBe(t.of(a, "trainerBattleStart")[0]!.battleId);
  });

  it("goes on with the player's Pokémon alone after the ally faints", () => {
    const { t, a } = spotted({ trainers: [trainer(1, ["sentret", "rattata"], { doubleBattle: true })], party: [member("cyndaquil"), member("onix")], spawns: [{ x: at(1), y: at(1) }] });
    const ally = outOf(t, a, 95)!;
    t.session.combat!.get(ally.id)!.hp = 0;
    t.step(2);
    expect(t.session.world.get(ally.id)).toBeUndefined();
    expect(t.of(a, "trainerBattleEnd")).toEqual([]);
  });
});
