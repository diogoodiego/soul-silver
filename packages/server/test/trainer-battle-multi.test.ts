import { describe, expect, it } from "vitest";
import { SPECIES } from "./combat-fixture";
import { arenaSetup, at, FLAG_BASE, trainer } from "./trainer-fixture";

// Item 032.5: MultiBattle (Lance in the Rocket HQ, script 90:3): an NPC trainer (arg0) fights beside the player against two
// trainers (arg1, arg2), its Pokémon driven by the combat AI, in the same arena; they win or lose together.

const ALLY = 3;

function multi(allyTeam: (keyof typeof SPECIES)[] = ["onix"]) {
  const t = arenaSetup({
    trainers: [trainer(1, ["sentret", "rattata"]), trainer(2, ["hoothoot"]), trainer(ALLY, allyTeam)],
    script: ["L1:", ["MultiBattle", { arg0: ALLY, arg1: 1, arg2: 2, arg3: 1 }], ["CheckBattleWon", { var: { variable: 0x4001 } }], ["End"]],
    spawns: [{ x: at(0), y: at(1) }],
  });
  const a = t.join(undefined, { facing: "north" });
  t.step();
  t.press(a, t.BUTTON.interact);
  t.step();
  // On the player's side, called out by the ally trainer (class 5) and not by the player.
  const allies = () => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId) && e.data["trainerPic"] === 5);
  const species = () => t.foes().map((e) => t.session.combat!.get(e.id)!.species).sort();
  const result = () => {
    t.session.close("closed-by-host");
    return a.saves().at(-1)!.save;
  };
  return { t, a, allies, species, result };
}

describe("a double battle beside an NPC trainer (MultiBattle)", () => {
  it("both foes send one each, the ally fights for the player, and the win marks both trainers", () => {
    const { t, a, allies, species, result } = multi();
    expect(t.of(a, "trainerBattleStart")).toEqual([expect.objectContaining({ trainerId: 1, double: true })]);
    // One Pokémon of each opposing trainer, not the first two of one team.
    expect(species()).toEqual([SPECIES.sentret.id, SPECIES.hoothoot.id].sort());
    expect(allies().map((e) => e.data)).toEqual([expect.objectContaining({ owner: String(a.welcome!.playerId), species: SPECIES.onix.id })]);
    expect(t.session.combat!.get(allies()[0]!.id)!.owner).toBe(a.welcome!.playerId);
    t.knockOut();
    t.step(40);
    // The first trainer's next one comes out; the second trainer has none left.
    expect(species()).toEqual([SPECIES.rattata.id]);
    t.knockOut();
    t.step(45);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "won" })]);
    expect(allies()).toEqual([]);
    const save = result();
    expect(save.vars).toMatchObject({ "16385": 1 });
    expect(save.flags).toEqual(expect.arrayContaining([FLAG_BASE + 1, FLAG_BASE + 2]));
    expect(save.flags).not.toContain(FLAG_BASE + ALLY);
  });

  it("the player's defeat is the ally's too: blackout, the ally and the foes leave", () => {
    const { t, a, allies, result } = multi();
    const mine = t.session.world.all().find((e) => e.kind === "pokemon" && e.data["trainerPic"] === 0 && e.data["owner"] === String(a.welcome!.playerId))!;
    t.session.combat!.get(mine.id)!.hp = 0;
    t.step(45);
    expect(t.of(a, "blackout")).toHaveLength(1);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "lost" })]);
    expect(allies()).toEqual([]);
    expect(t.foes()).toEqual([]);
    const save = result();
    expect(save.vars["16385"] ?? 0).toBe(0);
    expect(save.flags).not.toContain(FLAG_BASE + 1);
  });

  it("the ally's defeat leaves the player fighting on, and the win is still shared", () => {
    const { t, a, allies, result } = multi(["onix", "sentret"]);
    t.session.combat!.get(allies()[0]!.id)!.hp = 0;
    t.step(40);
    // Its next Pokémon comes out, as a trainer's does.
    expect(allies().map((e) => e.data["species"])).toEqual([SPECIES.sentret.id]);
    t.session.combat!.get(allies()[0]!.id)!.hp = 0;
    t.step(40);
    expect(allies()).toEqual([]);
    expect(t.of(a, "trainerBattleEnd")).toEqual([]);
    for (let i = 0; i < 3 && t.of(a, "trainerBattleEnd").length === 0; i++) {
      t.knockOut();
      t.step(40);
    }
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "won" })]);
    expect(result().vars).toMatchObject({ "16385": 1 });
  });
});
