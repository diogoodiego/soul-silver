import type { PartyMember, Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData } from "../src/progression";
import type { NpcTrade } from "../src/scripts";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Item 030.10: in-game trades and Kenya's loan through the server and into the save. Synthetic species,
// trades and names (principle II): trade 1 gives species 66 for 96; trade 7 lends species 21 holding item 137.

const stats = (n: number) => ({ hp: n, attack: n, defense: n, speed: n, specialAttack: n, specialDefense: n });
const mon = (species: number, level: number): PartyMember => ({ species, level, moves: [33], hp: 20, friendship: 70, experience: 135, ivs: stats(1), evs: stats(0), nature: 0 });
const progression = buildProgressionData({
  // Species 66 is female below 63 in the personality's low byte; 21 is always male.
  species: [
    { id: 66, gender: { raw: 63 } },
    { id: 21, gender: { raw: 0 } },
    { id: 96 },
    { id: 155 },
  ].map((s) => ({ baseStats: stats(40), baseExperience: 60, evYield: stats(0), growthRate: "medium-fast" as const, baseFriendship: 70, ...s })) as never,
  learnsets: [66, 21, 96, 155].map((id) => ({ id, levelUp: [{ level: 1, move: 43 }, { level: 7, move: 2 }], machines: [] })),
  evolutions: [],
});
const trade = (id: number, give: number, ask: number, extra: Partial<NpcTrade> = {}): NpcTrade => ({ id, give, ask, ivs: stats(20), pid: 0x0000_1f00 + 52, otId: 1, heldItem: 0, otGender: 0, nickname: `Nick${id}`, ...extra });
const npcTrades = new Map([
  [1, trade(1, 66, 96)],
  [7, trade(7, 21, 21, { heldItem: 137, otGender: 1 })],
]);

const v = (id: number) => ({ variable: id });
// Talks: trade slot 1 in trade 1, then borrow Kenya at level 20 and check for its mail.
const script = scriptFile(100, [
  "L1:",
  ["LoadNPCTrade", { arg0: 1 }],
  ["SetVar", { var: v(0x8004), val: 1 }],
  ["NPCTradeExec", { arg0: 0x8004 }],
  ["NPCTradeEnd"],
  ["KenyaCheckPartyOrMailbox", { arg0: 0x4001 }],
  ["GiveLoanMon", { arg0: 7, arg1: 20, arg2: 101 }],
  ["KenyaCheckPartyOrMailbox", { arg0: 0x4002 }],
  ["End"],
]);

function talk(): Save {
  const data = { ...scriptData([script], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), npcTrades };
  const t = story(data, { progression });
  const a = t.connect(undefined, undefined, { save: { party: [mon(155, 9), mon(96, 12)] } });
  t.step();
  t.press(a);
  t.step();
  t.session.close("closed-by-host");
  return a.saves().at(-1)!.save;
}

describe("in-game trades (item 030.10)", () => {
  const s = talk();

  it("swaps the member for the trade's Pokémon at its level, with the trade's IVs, nature, gender and nickname", () => {
    expect(s.party[1]).toMatchObject({ species: 66, level: 12, ivs: stats(20), nature: (0x1f00 + 52) % 25, gender: "female", nickname: "Nick1", trade: 1 });
    expect(s.party[1]!.held).toBeUndefined();
    expect(s.party[1]!.mail).toBeUndefined();
    expect(s.party[1]!.hp).toBeGreaterThan(0);
    expect(s.party[0]!.species).toBe(155);
  });

  it("lends Kenya holding its trainer's mail; the check finds the mail only after", () => {
    expect(s.party[2]).toMatchObject({ species: 21, level: 20, held: 137, nickname: "Nick7", trade: 7, mail: 7, gender: "male" });
    expect(s.vars).toEqual({ "16386": 1 }); // no mail before the loan: 0, which the save leaves out
  });

  it("records the Pokémon received in the Pokédex", () => {
    expect(s.pokedex.caught).toEqual(expect.arrayContaining([66, 21]));
  });
});
