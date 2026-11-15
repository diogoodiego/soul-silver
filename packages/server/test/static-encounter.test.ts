import { describe, expect, it } from "vitest";
import { MOVES, SPECIES } from "./combat-fixture";
import { at, fieldWorld, mon, wildOptions } from "./field-fixture";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 030.9: a static encounter (WildBattle) as the Sudowoodo of Route 36 runs it (scr_seq 243): the overworld
// Pokémon becomes a wild one fought by that player; the map's onLoad then runs as when the original's field comes back
// from the battle, and hides it by its flag.

const v = (id: number) => ({ variable: id });
const ENGAGING = 164;
const GONE = 450;
const BEATEN = 181;
const OUTCOME = 0x4001;

const FILE = scriptFile(100, [
  "L1:",
  ["SetFlag", { flag: { flag: ENGAGING } }],
  ["WildBattle", { species: { species: SPECIES.onix.id }, level: 10, shiny: 0 }],
  ["ClearFlag", { flag: { flag: ENGAGING } }],
  ["CheckBattleWon", { var: v(0x800c) }],
  ["CompareVarToValue", { var: v(0x800c), val: 0 }],
  ["GoToIf", { condition: 1, dest: { label: "lost" } }],
  ["GetStaticEncounterOutcome", { arg0: OUTCOME }],
  ["SetFlag", { flag: { flag: BEATEN } }],
  "lost:",
  ["End"],
  "L2:",
  ["CheckFlag", { flag: { flag: ENGAGING } }],
  ["GoToIf", { condition: 1, dest: { label: "gone" } }],
  ["End"],
  "gone:",
  ["SetFlag", { flag: { flag: GONE } }],
  ["HidePerson", { arg0: 0 }],
  ["End"],
]);

function sudowoodo() {
  const events = mapEvents({ npcs: [npc(0, 1, 2, 0, GONE)], levelScripts: { onTransition: null, onResume: null, onLoad: { id: 2, file: 100, entry: 1 }, frames: [] } });
  return story(scriptData([FILE], { 60: events }), { world: fieldWorld(), ...wildOptions(), spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
}
const wilds = (t: ReturnType<typeof sudowoodo>) => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild");

describe("static encounters (spec 030.9)", () => {
  it("the talked-to Pokémon turns wild; knocked out, the script goes on as won and the map's onLoad hides it", () => {
    const t = sudowoodo();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    const b = t.connect("B", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    t.step(2);
    t.press(a);
    const [foe] = wilds(t);
    expect(foe?.data["species"]).toBe(SPECIES.onix.id);
    // Where the person stood, one tile south of the player (its AI may have taken a step since).
    expect(Math.hypot(foe!.x - at(1), foe!.y - at(2))).toBeLessThanOrEqual(24);
    t.session.combat!.get(foe!.id)!.hp = 0;
    t.step(2);
    t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.flags).toEqual(expect.arrayContaining([GONE, BEATEN]));
    expect(save.flags).not.toContain(ENGAGING);
    expect(save.vars).toMatchObject({ [OUTCOME]: 1 });
    // Each player has their own: the other one's still stands.
    expect(b.saves().at(-1)!.save.flags).not.toContain(GONE);
    expect(t.logs).toEqual([]);
  });
});
