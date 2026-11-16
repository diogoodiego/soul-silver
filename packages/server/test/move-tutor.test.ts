import type { PartyMember, Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData } from "../src/progression";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Item 030.10: the Ilex Forest Headbutt tutor through the server and into the save. Synthetic species and
// tutor list (principle II): tutor 1 teaches move 29 at area 3 (the Headbutt tutor), tutor 0 another area's move.

const stats = (n: number) => ({ hp: n, attack: n, defense: n, speed: n, specialAttack: n, specialDefense: n });
const mon = (species: number, moves: number[], extra: Partial<PartyMember> = {}): PartyMember => ({ species, level: 5, moves, hp: 20, friendship: 70, experience: 135, ivs: stats(1), evs: stats(0), nature: 0, ...extra });
const progression = buildProgressionData({
  species: [155, 16].map((id) => ({ id, baseStats: stats(40), baseExperience: 60, evYield: stats(0), growthRate: "medium-fast" as const, baseFriendship: 70 })),
  learnsets: [
    { id: 155, levelUp: [{ level: 1, move: 33 }], machines: [], tutors: [0, 1] },
    { id: 16, levelUp: [{ level: 1, move: 33 }], machines: [], tutors: [0] },
  ],
  evolutions: [],
  tutors: [
    { id: 0, move: 7, cost: 64, area: 0 },
    { id: 1, move: 29, cost: 0, area: 3 },
  ],
});

describe("tutor moves", () => {
  it("lists the moves a species learns from one tutor", () => {
    expect([progression.tutorMoves(155, 3), progression.tutorMoves(155, 0), progression.tutorMoves(16, 3)]).toEqual([[29], [7], []]);
  });
});

// Slot 0 asks whether it can learn Headbutt and, if so, learns it over its second move.
const tutor = scriptFile(100, [
  "L1:",
  ["ScrCmd_656", { arg0: 0, arg1: 0x4001 }],
  ["CompareVarToValue", { var: { variable: 0x4001 }, val: 1 }],
  ["GoToIf", { condition: 5, dest: { label: "L2" } }],
  ["SetMonMove", { arg0: 0, arg1: 1, arg2: 29 }],
  "L2:",
  ["End"],
]);

function talk(party: PartyMember[]): Save {
  const t = story(scriptData([tutor], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), { progression });
  const a = t.connect(undefined, undefined, { save: { party } });
  t.step();
  t.press(a);
  t.step();
  t.session.close("closed-by-host");
  return a.saves().at(-1)!.save;
}

describe("Headbutt tutor (item 030.10)", () => {
  it("teaches Headbutt over the chosen move, clearing its PP Ups", () => {
    const s = talk([mon(155, [33, 45, 10], { ppUps: [1, 2, 3] })]);
    expect(s.vars).toEqual({ "16385": 1 });
    expect(s.party[0]).toMatchObject({ moves: [33, 29, 10], ppUps: [1, 0, 3] });
  });

  it("teaches nothing to a species the tutor cannot teach, or to one that knows it", () => {
    expect(talk([mon(16, [33, 45])]).party[0]!.moves).toEqual([33, 45]);
    expect(talk([mon(155, [33, 29])]).party[0]!.moves).toEqual([33, 29]);
  });
});
