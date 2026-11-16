import { BUTTON } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
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

/** `companions`: the party can be sent out (and faint), for the blackout. */
function sudowoodo(companions = false) {
  const events = mapEvents({ npcs: [npc(0, 1, 2, 0, GONE)], levelScripts: { onTransition: null, onResume: null, onLoad: { id: 2, file: 100, entry: 1 }, frames: [] } });
  return story(scriptData([FILE], { 60: events }), { world: fieldWorld(), timeoutTicks: 1e9, ...wildOptions(), ...(companions ? { companion: buildCompanionData(BUNDLED_COMPANION_CONTENT) } : {}), spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
}
type Story = ReturnType<typeof sudowoodo>;
type Client = ReturnType<Story["connect"]>;
const MASTER_BALL = 1;
let seq = 1000;
const send = (c: Client, buttons: number, aim?: { x: number; y: number }) => c.conn.send({ type: "input", seq: ++seq, move: { x: 0, y: 0 }, run: false, buttons, ...(aim ? { aim } : {}) });
/** Throws a ball at entity `id` and lets the shakes run. */
function throwAt(t: Story, c: Client, id: number) {
  const w = t.session.world.get(id)!;
  const e = t.session.world.get(c.welcome!.entityId)!;
  const d = Math.hypot(w.x - e.x, w.y - e.y);
  send(c, BUTTON.throw, { x: (w.x - e.x) / d, y: (w.y - e.y) / d });
  t.step();
  send(c, 0);
  t.step(20 * 5);
}
/** The outcome variable and flags of player `c`'s last save, once the session closes. */
function result(t: Story, c: Client) {
  t.session.close("closed-by-host");
  const save = c.saves().at(-1)!.save;
  return { outcome: save.vars[OUTCOME] ?? 0, flags: save.flags };
}
const wilds = (t: Story) => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild");

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
    // Catchable where it fell for faintedSeconds (30 s); then gone, and the script goes on as won.
    t.step(20 * 31);
    t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.flags).toEqual(expect.arrayContaining([GONE, BEATEN]));
    expect(save.flags).not.toContain(ENGAGING);
    expect(save.vars).toMatchObject({ [OUTCOME]: 1 });
    // Each player has their own: the other one's still stands.
    expect(b.saves().at(-1)!.save.flags).not.toContain(GONE);
    expect(t.logs).toEqual([]);
  });

  it("caught: outcome 4 (the Sudowoodo script sets flag 361 on it)", () => {
    const t = sudowoodo();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])], bag: [{ item: MASTER_BALL, count: 1 }] } });
    t.step(2);
    t.press(a);
    throwAt(t, a, wilds(t)[0]!.id);
    expect(wilds(t)).toEqual([]);
    const r = result(t, a);
    expect(r.outcome).toBe(4);
    expect(r.flags).toEqual(expect.arrayContaining([GONE, BEATEN]));
  });

  it("knocked out and then caught while it lies there: outcome 4, not 1", () => {
    const t = sudowoodo();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])], bag: [{ item: MASTER_BALL, count: 1 }] } });
    t.step(2);
    t.press(a);
    const [foe] = wilds(t);
    t.session.combat!.get(foe!.id)!.hp = 0;
    t.step(2);
    throwAt(t, a, foe!.id);
    const r = result(t, a);
    expect(r.outcome).toBe(4);
    expect(r.flags).toEqual(expect.arrayContaining([GONE, BEATEN]));
  });

  it("fled: it left the fight neither knocked out nor caught, outcome 5", () => {
    const t = sudowoodo();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    t.step(2);
    t.press(a);
    // As a despawn does: its combatant gone, the wild rules drop it on the next tick.
    t.session.combat!.remove(t.session.world, wilds(t)[0]!.id);
    t.step(2);
    expect(wilds(t)).toEqual([]);
    const r = result(t, a);
    expect(r.outcome).toBe(5);
    expect(r.flags).toEqual(expect.arrayContaining([BEATEN]));
  });

  it("blackout: the script reads a loss and the Pokémon is gone", () => {
    const t = sudowoodo(true);
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    t.step(2);
    t.press(a);
    send(a, BUTTON.combat);
    t.step();
    send(a, 0);
    t.step();
    const mine = t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId));
    t.session.combat!.get(mine!.id)!.hp = 0;
    t.step(2);
    expect(wilds(t)).toEqual([]);
    const r = result(t, a);
    expect(r.flags).not.toContain(BEATEN);
    expect(r.flags).not.toContain(ENGAGING);
  });

  it("a shiny WildBattle (the red Gyarados, item 032.3) spawns a shiny wild one", () => {
    const shiny = scriptFile(100, ["L1:", ["WildBattle", { species: { species: SPECIES.onix.id }, level: 10, shiny: 1 }], ["End"]]);
    const events = mapEvents({ npcs: [npc(0, 1, 2, 0)] });
    const t = story(scriptData([shiny], { 60: events }), { world: fieldWorld(), timeoutTicks: 1e9, ...wildOptions(), spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    t.step(2);
    t.press(a);
    expect(wilds(t).map((w) => w.data["shiny"])).toEqual([true]);
  });
});
