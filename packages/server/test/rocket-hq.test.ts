import { describe, expect, it } from "vitest";
import { SPECIES, MOVES } from "./combat-fixture";
import { at, fieldWorld, mon, wildOptions } from "./field-fixture";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Item 032.4: the Rocket HQ on synthetic maps (principle II). A floor trap of B1F (map 247, RocketTrapBattle from a coord
// trigger) and an Electrode of B2F's generator (map 248): knocked out, its talk script counts it and the onLoad that runs
// after the battle hides it; one that got away stays, uncounted.

const v = (id: number) => ({ variable: id });
const ENGAGING = 164;
const COUNTED = 203;
const GONE = 501;
const TRAP = 0x40b2;

const FILE = scriptFile(100, [
  "L1:",
  ["SetFlag", { flag: { flag: ENGAGING } }],
  ["WildBattle", { species: { species: SPECIES.onix.id }, level: 10, shiny: 0 }],
  ["ClearFlag", { flag: { flag: ENGAGING } }],
  ["StaticWildWonOrCaughtCheck", { arg0: 0x4000, arg1: 0 }],
  ["CompareVarToValue", { var: v(0x4000), val: 1 }],
  ["GoToIf", { condition: 1, dest: { label: "end" } }],
  ["SetFlag", { flag: { flag: COUNTED } }],
  "end:",
  ["End"],
  "L2:",
  ["CheckFlag", { flag: { flag: ENGAGING } }],
  ["GoToIf", { condition: 1, dest: { label: "after" } }],
  ["End"],
  "after:",
  ["StaticWildWonOrCaughtCheck", { arg0: 0x4000, arg1: 1 }],
  ["CompareVarToValue", { var: v(0x4000), val: 1 }],
  ["GoToIf", { condition: 1, dest: { label: "stays" } }],
  ["SetFlag", { flag: { flag: GONE } }],
  ["HidePerson", { arg0: 0 }],
  "stays:",
  ["End"],
  "L3:",
  ["ScrCmd_708", { arg0: 0 }],
  ["RocketTrapBattle", { arg0: SPECIES.onix.id, arg1: 23 }],
  ["SetVar", { var: v(TRAP), val: 1 }],
  ["End"],
]);

function hq() {
  const events = mapEvents({
    npcs: [npc(0, 1, 2, 0, GONE)],
    triggers: [{ script: { id: 3, file: 100, entry: 2 }, x: 3, z: 1, w: 1, h: 1, y: 0, variable: TRAP, value: 0 }],
    levelScripts: { onTransition: null, onResume: null, onLoad: { id: 2, file: 100, entry: 1 }, frames: [] },
  });
  return story(scriptData([FILE], { 60: events }), { world: fieldWorld(), timeoutTicks: 1e9, ...wildOptions(), spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
}
const wilds = (t: ReturnType<typeof hq>) => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild");
const flagsOf = (t: ReturnType<typeof hq>, c: ReturnType<ReturnType<typeof hq>["connect"]>) => {
  t.session.close("closed-by-host");
  return c.saves().at(-1)!.save.flags;
};

describe("the Rocket HQ (item 032.4)", () => {
  it("an Electrode knocked out is counted and hidden", () => {
    const t = hq();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    t.step(2);
    t.press(a);
    t.session.combat!.get(wilds(t)[0]!.id)!.hp = 0;
    t.step(20 * 31);
    expect(flagsOf(t, a)).toEqual(expect.arrayContaining([COUNTED, GONE]));
  });

  it("an Electrode that got away stays, uncounted", () => {
    const t = hq();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    t.step(2);
    t.press(a);
    t.session.combat!.remove(t.session.world, wilds(t)[0]!.id);
    t.step(2);
    const flags = flagsOf(t, a);
    expect(flags).not.toContain(COUNTED);
    expect(flags).not.toContain(GONE);
  });

  it("a floor trap stepped on starts a wild battle with its Pokémon", () => {
    const t = hq();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    t.step(2);
    t.walk(a, { x: 1, y: 0 }, 40);
    expect(wilds(t).map((w) => [w.data["species"], w.data["level"]])).toEqual([[SPECIES.onix.id, 23]]);
    t.session.combat!.get(wilds(t)[0]!.id)!.hp = 0;
    t.step(20 * 31);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.vars[TRAP]).toBe(1);
    expect(t.logs).toEqual([]);
  });
});
