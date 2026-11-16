import { BUTTON } from "@soulsilver/shared/game";
import { ROAMER_KNOCKED_OUT, ROAMER_ROUTES, ROAMER_STATE_VAR } from "@soulsilver/shared/wild";
import { describe, expect, it } from "vitest";
import aiTemperaments from "../../../content/ai/temperaments.json" with { type: "json" };
import wildTemperaments from "../../../content/wild/temperaments.json" with { type: "json" };
import { MOVES, SPECIES } from "./combat-fixture";
import { at, fieldWorld, mon, wildOptions } from "./field-fixture";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Item 031.2: Raikou (CreateRoamer 0) roams the Johto routes for each player, moving on every map change, and shows up
// in a route's grass as a wild Pokémon; what an encounter leaves (HP) is there at the next. Synthetic maps, all grass.

const FILE = scriptFile(100, ["L1:", ["CreateRoamer", { arg0: 0 }], ["End"]]);
const grass = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`${i % 16},${Math.floor(i / 16)}`, 0x02]));

function roamers() {
  return story(scriptData([FILE], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), { world: fieldWorld(grass), timeoutTicks: 1e9, ...wildOptions(), spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
}
type Story = ReturnType<typeof roamers>;
type Client = ReturnType<Story["connect"]>;

const raikous = (t: Story) => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["species"] === SPECIES.raikou.id);
/** Puts the player on `area`, as a warp would, and lets the tick see the change. */
function goTo(t: Story, c: Client, area: string) {
  const e = t.session.world.get(c.welcome!.entityId)!;
  t.session.world.update({ ...e, area });
  t.step();
}
/** Back and forth between two routes until Raikou is on the player's; its entity. */
function findRaikou(t: Story, c: Client) {
  for (let i = 0; i < 200; i++) {
    goTo(t, c, i % 2 === 0 ? "33" : "34");
    const [r] = raikous(t);
    if (r) return r;
  }
  throw new Error("Raikou never came");
}
const lastSave = (c: Client) => c.saves().at(-1)!.save;

describe("roamers (item 031.2)", () => {
  it("CreateRoamer sends Raikou roaming for that player only", () => {
    const t = roamers();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    const b = t.connect("B", undefined, { save: { party: [mon([MOVES.tackle.id])] } });
    t.step(2);
    t.press(a);
    goTo(t, a, "61");
    expect(lastSave(a).roamers).toEqual([{ id: 0, area: expect.any(String) as unknown }]);
    expect(ROAMER_ROUTES).toContain(lastSave(a).roamers![0]!.area);
    goTo(t, b, "61");
    expect(lastSave(b).roamers).toEqual([]);
    expect(t.logs).toEqual([]);
  });

  it("keeps the HP an encounter left for the next one, out of the save too", () => {
    const t = roamers();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])], roamers: [{ id: 0, area: "40" }] } });
    t.step(2);
    const first = findRaikou(t, a);
    const c = t.session.combat!.get(first.id)!;
    expect(c.hp).toBe(c.stats.hp);
    c.hp -= 30;
    const left = c.hp;
    // Leaving the route takes it off the map with its HP.
    goTo(t, a, "61");
    expect(raikous(t)).toEqual([]);
    expect(lastSave(a).roamers).toEqual([{ id: 0, area: expect.any(String) as unknown, hp: left }]);
    const again = findRaikou(t, a);
    expect(again.id).not.toBe(first.id);
    expect(t.session.combat!.get(again.id)!.hp).toBe(left);
  });

  it("Raikou and Entei flee on sight, as the original's roamers run from battle", () => {
    const species: Record<string, string> = wildTemperaments.value.species;
    const temperaments: Record<string, { onSeePlayer: string }> = aiTemperaments.value;
    for (const id of ["243", "244"]) expect(temperaments[species[id]!]!.onSeePlayer).toBe("alert-flee");
  });

  it("knocked out, it roams no more and its state variable reads 2", () => {
    const t = roamers();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])], roamers: [{ id: 0, area: "40" }] } });
    t.step(2);
    const r = findRaikou(t, a);
    t.session.combat!.get(r.id)!.hp = 0;
    t.step(20 * 31);
    goTo(t, a, "61");
    expect(lastSave(a).roamers).toEqual([]);
    expect(lastSave(a).vars).toMatchObject({ [ROAMER_STATE_VAR]: ROAMER_KNOCKED_OUT });
  });

  it("caught, it is in the party and roams no more", () => {
    const t = roamers();
    const a = t.connect("A", undefined, { save: { party: [mon([MOVES.tackle.id])], bag: [{ item: 1, count: 1 }], roamers: [{ id: 0, area: "40" }] } });
    t.step(2);
    const r = findRaikou(t, a);
    // It spawned out of view: the player walks up beside it and throws.
    const w = t.session.world.get(r.id)!;
    t.session.world.update({ ...t.session.world.get(a.welcome!.entityId)!, x: w.x - 32, y: w.y });
    a.conn.send({ type: "input", seq: 5000, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.throw, aim: { x: 1, y: 0 } });
    t.step();
    a.conn.send({ type: "input", seq: 5001, move: { x: 0, y: 0 }, run: false, buttons: 0 });
    t.step(20 * 5);
    goTo(t, a, "61");
    expect(lastSave(a).party.map((m) => m.species)).toContain(SPECIES.raikou.id);
    expect(lastSave(a).roamers).toEqual([]);
    expect(lastSave(a).vars[ROAMER_STATE_VAR]).toBeUndefined();
  });
});
