import type { PartyMember, Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData } from "../src/progression";
import type { NpcTrade } from "../src/scripts";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Item 031.7: the Cianwood Shuckle's return (CheckReturnLoanMon, ReturnLoanMon) and the Moomoo farm's seals, through the
// server and into the save. Synthetic species and trades (principle II): trade 6 lends species 21.

const stats = (n: number) => ({ hp: n, attack: n, defense: n, speed: n, specialAttack: n, specialDefense: n });
const mon = (species: number, extra: Partial<PartyMember> = {}): PartyMember => ({ species, level: 10, moves: [33], hp: 20, friendship: 70, experience: 135, ivs: stats(1), evs: stats(0), nature: 0, ...extra });
const progression = buildProgressionData({
  species: [{ id: 21 }, { id: 155 }].map((s) => ({ baseStats: stats(40), baseExperience: 60, evYield: stats(0), growthRate: "medium-fast" as const, baseFriendship: 70, ...s })),
  learnsets: [21, 155].map((id) => ({ id, levelUp: [{ level: 1, move: 43 }], machines: [] })),
  evolutions: [],
});
const npcTrades = new Map<number, NpcTrade>([[6, { id: 6, give: 21, ask: 21, ivs: stats(20), pid: 52, otId: 1, heldItem: 0, otGender: 0, nickname: "Nick6" }]]);

const v = (id: number) => ({ variable: id });
// Checks each party slot in 0x4000+slot, then returns slot 1; gives 3 of seal 29 and 120 of seal 30 (kept at 99).
const script = scriptFile(100, [
  "L1:",
  ["SetVar", { var: v(0x8004), val: 0 }],
  ["CheckReturnLoanMon", { arg0: 6, arg1: 0x8004, arg2: 0x4000 }],
  ["SetVar", { var: v(0x8004), val: 1 }],
  ["CheckReturnLoanMon", { arg0: 6, arg1: 0x8004, arg2: 0x4001 }],
  ["SetVar", { var: v(0x8004), val: 2 }],
  ["CheckReturnLoanMon", { arg0: 6, arg1: 0x8004, arg2: 0x4002 }],
  ["SetVar", { var: v(0x8004), val: 1 }],
  ["ReturnLoanMon", { arg0: 0x8004 }],
  ["SetVar", { var: v(0x8004), val: 0 }],
  ["CheckReturnLoanMon", { arg0: 6, arg1: 0x8004, arg2: 0x4003 }],
  ["SetVar", { var: v(0x8005), val: 29 }],
  ["SetVar", { var: v(0x8006), val: 3 }],
  ["GiveOrTakeSeal", { arg0: 0x8005, arg1: 0x8006 }],
  ["SetVar", { var: v(0x8005), val: 30 }],
  ["SetVar", { var: v(0x8006), val: 120 }],
  ["GiveOrTakeSeal", { arg0: 0x8005, arg1: 0x8006 }],
  ["GetSealQuantity", { arg0: 0x8005, arg1: 0x4004 }],
  ["End"],
]);

function talk(party: PartyMember[]): Save {
  const data = { ...scriptData([script], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), npcTrades };
  const t = story(data, { progression });
  const a = t.connect(undefined, undefined, { save: { party } });
  t.step();
  t.press(a);
  t.step();
  t.session.close("closed-by-host");
  return a.saves().at(-1)!.save;
}

describe("the loan's return and the Seal Case (item 031.7)", () => {
  const s = talk([mon(21, { trade: 6 }), mon(21, { trade: 6, held: 137 }), mon(155)]);

  it("tells the loan apart: 0 it can go back (which the save leaves out), 2 it holds an item, 1 not the loan", () => {
    expect(s.vars).toEqual({ "16385": 2, "16386": 1, "16388": 99 });
  });

  it("ReturnLoanMon takes the member out of the party", () => {
    expect(s.party.map((m) => m.species)).toEqual([21, 155]);
  });

  it("keeps the seals in the save, at most 99 of a kind", () => {
    expect(s.seals).toEqual({ "29": 3, "30": 99 });
    expect(s.vars["16388"]).toBe(99);
  });

  it("reads 4 for the only member", () => {
    expect(talk([mon(21, { trade: 6 })]).vars["16384"]).toBe(4);
  });
});
