import { describe, expect, it } from "vitest";
import { SPECIES } from "./combat-fixture";
import { at, fieldStory, mon, obstacle, wildOptions } from "./field-fixture";

// Spec 025 US1 (FR-013): a smashed rock or a headbutted tree may let out a wild Pokémon from the
// map's tables (pokeheartgold rock_smash_item.c, headbutt.c), with the session's seeded generator.

type Test = ReturnType<typeof fieldStory>;
type Client = ReturnType<Test["connect"]>;

function answerAll(t: Test, c: Client) {
  for (let answered = 0; t.of(c, "script").length > answered; answered++) {
    c.conn.send({ type: "script-answer", id: t.of(c, "script").at(-1)!.id, answer: 0 });
    t.step(12);
  }
}

const wilds = (t: Test) => [...t.session.world.all()].filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild");

describe("Rock Smash (spec 025)", () => {
  it("breaks the rock and lets out a Pokémon of the map's rock smash table", () => {
    const t = fieldStory([obstacle(6, 1, 2, 10001)], {}, { ...wildOptions(), spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
    const a = t.connect("A", undefined, { save: { party: [mon([249])], badgeSet: 1 } });
    t.step(2);
    const before = wilds(t).length;
    t.press(a);
    answerAll(t, a);
    const out = wilds(t).slice(before);
    expect(out).toHaveLength(1);
    expect(out[0]!.data["species"]).toBe(SPECIES.onix.id);
    // Out of the rock's tile (its AI may have taken a step since).
    expect(Math.abs(out[0]!.y - at(2))).toBeLessThanOrEqual(24);
    expect(t.logs.filter((l) => l.includes("missing"))).toEqual([]);
  });
});

describe("Headbutt (spec 025)", () => {
  // Tree tiles: blocked, with the headbutt behavior; (5,2) is a regular tree, (7,2) a secret one, (9,2) neither.
  const trees = { "5,2": 0x8006, "7,2": 0x8006, "9,2": 0x8006 };
  const shake = (x: number) => {
    const t = fieldStory([], trees, { ...wildOptions(), spawn: () => ({ area: "60", x: at(x), y: at(1) }) });
    const a = t.connect("A", undefined, { save: { party: [mon([29])] } });
    t.step(2);
    const before = wilds(t).length;
    t.press(a);
    answerAll(t, a);
    return { t, out: wilds(t).slice(before) };
  };

  it("a regular tree uses its table by the trainer id; a secret one the secret table", () => {
    expect(shake(5).out.map((e) => e.data["species"])).toEqual([SPECIES.hoothoot.id]);
    expect(shake(7).out.map((e) => e.data["species"])).toEqual([SPECIES.rattata.id]);
  });

  it("a tree in no group lets nothing out", () => {
    expect(shake(9).out).toEqual([]);
  });

  it("needs Headbutt in the party, no badge", () => {
    const t = fieldStory([], trees, { ...wildOptions(), spawn: () => ({ area: "60", x: at(5), y: at(1) }) });
    const a = t.connect("A", undefined, { save: { party: [mon([33])] } });
    t.step(2);
    t.press(a);
    answerAll(t, a);
    expect(t.of(a, "script").map((m) => m.request.kind)).toEqual(["say"]);
  });
});
