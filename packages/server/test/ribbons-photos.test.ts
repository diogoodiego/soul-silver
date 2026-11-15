import type { PartyMember, Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 030, item 030.2 (layer 2): ribbons on party members and Cameron's photo album, through the server and
// into the save. Synthetic script (principle II), shaped like scr_seq 232's: the slot comes in a special var.

const stats = (n: number) => ({ hp: n, attack: n, defense: n, speed: n, specialAttack: n, specialDefense: n });
const mon = (species: number): PartyMember => ({ species, level: 5, moves: [33], hp: 20, friendship: 70, experience: 135, ivs: stats(1), evs: stats(0), nature: 0 });
const photo = { map: 60, spot: 1, species: [155], takenAt: "2026-11-14T12:00:00.000Z" };

const talk = scriptFile(100, [
  "L1:",
  ["SetVar", { var: { variable: 0x8002 }, val: 1 }],
  ["MonHasRibbon", { arg0: 0x800c, arg1: 0x8002, arg2: 63 }],
  ["CompareVarToValue", { var: { variable: 0x800c }, val: 1 }],
  ["GoToIf", { condition: 1, dest: { label: "L2" } }],
  ["GiveRibbon", { arg0: 0x8002, arg1: 63 }],
  "L2:",
  ["PhotoAlbumIsFull", { arg0: 0x800c }],
  ["CompareVarToValue", { var: { variable: 0x800c }, val: 1 }],
  ["GoToIf", { condition: 1, dest: { label: "L3" } }],
  ["CameronPhoto", { arg0: 5 }],
  "L3:",
  ["End"],
]);

function run(save: Partial<Save>, times = 1) {
  const t = story(scriptData([talk], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
  const a = t.connect(undefined, undefined, { save: { party: [mon(155), mon(16)], ...save } });
  t.step();
  for (let i = 0; i < times; i++) {
    t.press(a);
    t.step();
  }
  t.session.close("closed-by-host");
  return a.saves().at(-1)!.save;
}

describe("ribbons and photos (spec 030.2)", () => {
  it("gives the slot's member the ribbon once and adds a photo of the party at the map", () => {
    const s = run({}, 2);
    expect(s.party.map((m) => m.ribbons)).toEqual([undefined, [63]]);
    expect(s.photos).toEqual([expect.objectContaining({ map: 60, spot: 5, species: [155, 16] }), expect.objectContaining({ spot: 5 })]);
  });

  it("takes no photo when the album holds 36", () => {
    const full = Array.from({ length: 36 }, () => photo);
    expect(run({ photos: full }).photos).toEqual(full);
  });
});
