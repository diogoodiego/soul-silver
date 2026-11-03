import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 024 US4: the rival's name is each player's own and lasts, and ScrCmd_729 reads the real companion.

type Test = ReturnType<typeof story>;
type Client = ReturnType<Test["connect"]>;

const naming = scriptFile(100, ["L1:", ["NameRival", { arg0: 0x800c }], ["BufferRivalsName", { slot: 0 }], ["NPCMsg", { msg_id: 1 }], ["End"]]);
const data = () => ({ ...scriptData([naming], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), defaultRival: "Heart" });
const lastSave = (c: Client) => {
  c.conn.send({ type: "leave" });
  return c.saves().at(-1)!.save;
};

/** Talks to the person, answers the naming screen and returns the rival's name in the next message. */
function name(t: Test, c: Client, text: string) {
  t.press(c);
  c.conn.send({ type: "script-answer", id: t.of(c, "script").at(-1)!.id, text });
  t.step();
  const say = t.of(c, "script").at(-1)!;
  c.conn.send({ type: "script-answer", id: say.id });
  t.step();
  return say.request.kind === "say" ? say.request.buffers[0] : undefined;
}

describe("the rival's name", () => {
  it("is each player's own, in the messages and in the save", () => {
    const t = story(data());
    const a = t.connect();
    const b = t.connect();
    t.step();
    expect(name(t, a, "Blue")).toEqual({ kind: "rival", name: "Blue" });
    expect(name(t, b, "")).toEqual({ kind: "rival", name: "Heart" });
    expect([lastSave(a).rivalName, lastSave(b).rivalName]).toEqual(["Blue", "Heart"]);
  });

  it("comes back with the save", () => {
    const greet = scriptFile(100, ["L1:", ["BufferRivalsName", { slot: 0 }], ["NPCMsg", { msg_id: 1 }], ["End"]]);
    const t = story({ ...scriptData([greet], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), defaultRival: "Heart" });
    const a = t.connect("A", undefined, { save: { rivalName: "Blue", rev: 2, playTimeMs: 1000 } });
    t.step();
    t.press(a);
    expect(t.of(a, "script").at(-1)!.request).toMatchObject({ buffers: { 0: { kind: "rival", name: "Blue" } } });
  });
});

describe("ScrCmd_729", () => {
  const member = (hp: number): PartyMember => ({ species: SPECIES.cyndaquil.id, level: 10, moves: [MOVES.tackle.id], hp, friendship: 70, experience: 1000, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 });
  const follow = scriptFile(100, ["L1:", ["ScrCmd_729", { arg0: 0x4100 }], ["End"]]);
  const check = (hp: number) => {
    const t = story(scriptData([follow], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), { combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT) });
    const a = t.connect("A", undefined, { save: { party: [member(hp)], rev: 2, playTimeMs: 1000 } });
    t.step(3);
    t.press(a);
    return lastSave(a).vars[String(0x4100)] ?? 0;
  };

  it("is 1 with the companion out", () => {
    expect(check(999)).toBe(1);
  });

  it("is 0 with a Pokémon in the party but none able to follow", () => {
    expect(check(0)).toBe(0);
  });
});
