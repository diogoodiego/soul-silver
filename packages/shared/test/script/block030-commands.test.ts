import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript, type FakeHost } from "./fixture.ts";

// Item 030.10: the commands block 030's maps still lacked (National Park, Route 35/36 gates, Goldenrod,
// the flower shop and the Ilex Forest Headbutt tutor). Synthetic scripts and host (principle II).

const OUT = 0x4001;
const run = (h: FakeHost, lines: Parameters<typeof makeScript>[0]) => {
  const r = createRunner(h, SCRIPT_HANDLERS, { file: makeScript([...lines, ["End"]]), entry: 0 });
  return { r, state: r.step() };
};

/** A host whose party knows moves, with the Headbutt tutor (npc 3) teaching move 29 to species 1. */
function tutorHost(moves: number[][], egg = false): FakeHost & { moves: number[][] } {
  const h = fakeHost() as FakeHost & { moves: number[][] };
  h.moves = moves;
  h.party = moves.map(() => ({ species: 1, level: 10, hp: 10, egg }));
  h.partyIsEgg = (slot) => h.party[slot]?.egg === true;
  h.partyMoves = (slot) => h.moves[slot] ?? [];
  h.setPartyMove = (slot, at, move) => {
    const m = h.moves[slot]!;
    m[Math.min(at, m.length)] = move;
  };
  h.tutorMoves = (slot, npc) => (h.party[slot]?.species === 1 && npc === 3 ? [29] : []);
  return h;
}

describe("block 030 commands (item 030.10)", () => {
  it("ScriptOverlayCmd and ScrCmd_607 run without ending the script", () => {
    const { state } = run(fakeHost(), [["ScriptOverlayCmd", { arg0: 1, arg1: 0 }], ["ScrCmd_607"]]);
    expect(state.kind).toBe("done");
  });

  it("IsBugContestantRegistered: no contest runs, so no one is registered", () => {
    const h = fakeHost();
    run(h, [["IsBugContestantRegistered", { arg0: 3, arg1: OUT }]]);
    expect(h.vars.get(OUT)).toBe(0);
  });

  it("ScrCmd_522 reads the hour", () => {
    const h = fakeHost();
    h.hour = () => 17;
    run(h, [["ScrCmd_522", { arg0: OUT }]]);
    expect(h.vars.get(OUT)).toBe(17);
  });

  it("GetPartySlotWithFatefulEncounter finds none: no event Pokémon exists in this game", () => {
    const h = fakeHost({ party: [{ species: 492, level: 30, hp: 10 }] });
    run(h, [["GetPartySlotWithFatefulEncounter", { arg0: OUT, arg1: 492 }]]);
    expect(h.vars.get(OUT)).toBe(255);
  });

  it("PartySelectUI asks for a party member; GetPartySelection reads it, 255 when cancelled", () => {
    for (const [answer, slot] of [[1, 1], [7, 255]] as const) {
      const h = tutorHost([[33], [33]]);
      const { r, state } = run(h, [["PartySelectUI"], ["GetPartySelection", { arg0: OUT }]]);
      expect(state).toMatchObject({ kind: "blocked", request: { kind: "party" } });
      r.resume(answer);
      expect(h.vars.get(OUT)).toBe(slot);
    }
  });

  it("MonHasMove and CountMonMoves read the member's moves; an egg knows none", () => {
    const h = tutorHost([[33, 29, 45]]);
    run(h, [["MonHasMove", { arg0: OUT, arg1: 29, arg2: 0 }], ["CountMonMoves", { arg0: 0x4002, arg1: 0 }]]);
    expect([h.vars.get(OUT), h.vars.get(0x4002)]).toEqual([1, 3]);
    const egg = tutorHost([[33, 29]], true);
    run(egg, [["MonHasMove", { arg0: OUT, arg1: 29, arg2: 0 }], ["CountMonMoves", { arg0: 0x4002, arg1: 0 }]]);
    expect([egg.vars.get(OUT), egg.vars.get(0x4002)]).toEqual([0, 0]);
  });

  it("ScrCmd_656: 1 when the Headbutt tutor has a move the member can learn and does not know", () => {
    const h = tutorHost([[33], [33, 29]]);
    h.party.push({ species: 2, level: 10, hp: 10 });
    h.moves.push([33]);
    const can = (slot: number) => {
      run(h, [["ScrCmd_656", { arg0: slot, arg1: OUT }]]);
      return h.vars.get(OUT);
    };
    expect([can(0), can(1), can(2)]).toEqual([1, 0, 0]);
  });

  it("PokemonSummaryScreen lists the four moves and the new one; GetMoveSelection reads the slot, 4 to keep them", () => {
    for (const [answer, slot] of [[2, 2], [4, 4], [5, 4]] as const) {
      const h = tutorHost([[33, 45, 10, 39]]);
      const { r, state } = run(h, [["PokemonSummaryScreen", { arg0: 1, arg1: 0, arg2: 29 }], ["GetMoveSelection", { arg0: 1, arg1: OUT }]]);
      expect(state).toMatchObject({ kind: "blocked", request: { kind: "menu", items: ["0750:33", "0750:45", "0750:10", "0750:39", "0750:29"], cancel: true } });
      r.resume(answer);
      expect(h.vars.get(OUT)).toBe(slot);
    }
  });

  it("BufferPartyMonMoveName buffers the move in a slot; SetMonMove replaces it, or adds it to a free slot", () => {
    const h = tutorHost([[33, 45]]);
    const { r } = run(h, [["BufferPartyMonMoveName", { slot: 1, party_pos: 0, move_pos: 1 }], ["NPCMsg", { msg_id: 1 }], ["SetMonMove", { arg0: 0, arg1: 1, arg2: 29 }], ["SetMonMove", { arg0: 0, arg1: 2, arg2: 10 }]]);
    expect(r.state).toMatchObject({ kind: "blocked", request: { kind: "say", buffers: { 1: { kind: "move", id: 45 } } } });
    r.resume();
    expect(h.moves[0]).toEqual([33, 29, 10]);
  });

  it("GiveSpikyEarPichu: a level 30 Pichu with its four moves, only with room in the party", () => {
    const h = tutorHost([[33]]);
    const given: unknown[] = [];
    h.giveMon = (species, level, item, form) => {
      given.push({ species, level, item, form });
      h.party.push({ species, level, hp: 10 });
      h.moves.push([84]);
      return true;
    };
    run(h, [["GiveSpikyEarPichu"]]);
    expect(given).toEqual([{ species: 172, level: 30, item: 300, form: 1 }]);
    expect(h.moves[1]).toEqual([270, 344, 207, 220]);
    h.party.push(...Array.from({ length: 4 }, () => ({ species: 1, level: 1, hp: 1 })));
    run(h, [["GiveSpikyEarPichu"]]);
    expect(given).toHaveLength(1);
  });

  it("ScrCmd_810 (Celebi's time travel) runs without ending the script", () => {
    expect(run(fakeHost(), [["ScrCmd_810"]]).state.kind).toBe("done");
  });
});

describe("in-game trades (item 030.10)", () => {
  /** Trade 1 gives species 66 for 96; trade 7 is Kenya's loan. */
  function tradeHost() {
    const h = fakeHost({ party: [{ species: 155, level: 9, hp: 10 }, { species: 96, level: 12, hp: 10 }] });
    const traded: [number, number][] = [];
    const loans: [number, number, boolean][] = [];
    h.npcTrade = (id) => (id === 1 ? { give: 66, ask: 96 } : undefined);
    h.tradeMon = (id, slot) => void traded.push([id, slot]);
    h.giveLoanMon = (id, level, mail) => void loans.push([id, level, mail]);
    return { h, traded, loans };
  }
  // The Goldenrod trade's shape (scr_seq 903): pick, load, compare species, trade, end.
  const trade = [
    ["ScrCmd_566"],
    ["GetPartySelection", { arg0: 0x800c }],
    ["CompareVarToValue", { var: { variable: 0x800c }, val: 255 }],
    ["GoToIf", { condition: 1, dest: { label: "L9" } }],
    ["LoadNPCTrade", { arg0: 1 }],
    ["CopyVar", { dst: { variable: 0x8004 }, src: { variable: 0x800c } }],
    ["GetPartyMonSpecies", { slot: 0x8004, var: { variable: 0x8005 } }],
    ["NPCTradeGetReqSpecies", { arg0: 0x800c }],
    ["CompareVarToVar", { a: 0x8005, b: 0x800c }],
    ["GoToIf", { condition: 5, dest: { label: "L8" } }],
    ["NPCTradeExec", { arg0: 0x8004 }],
    ["NPCTradeEnd"],
    ["SetVar", { var: { variable: OUT }, val: 1 }],
    ["End"],
    "L8:",
    ["NPCTradeEnd"],
    ["SetVar", { var: { variable: OUT }, val: 2 }],
    ["End"],
    "L9:",
    ["SetVar", { var: { variable: OUT }, val: 3 }],
  ] as Parameters<typeof makeScript>[0];

  it("trades the member picked when it is the species asked for", () => {
    const { h, traded } = tradeHost();
    const { r } = run(h, trade);
    expect(r.state).toMatchObject({ kind: "blocked", request: { kind: "party" } });
    r.resume(1);
    expect([traded, h.vars.get(OUT)]).toEqual([[[1, 1]], 1]);
  });

  it("refuses another species, and does nothing when the menu is cancelled", () => {
    const wrong = tradeHost();
    run(wrong.h, trade).r.resume(0);
    expect([wrong.traded, wrong.h.vars.get(OUT)]).toEqual([[], 2]);
    const cancel = tradeHost();
    run(cancel.h, trade).r.resume(7);
    expect([cancel.traded, cancel.h.vars.get(OUT)]).toEqual([[], 3]);
  });

  it("GiveLoanMon lends the trade's Pokémon at the level given, with mail only for Kenya", () => {
    const { h, loans } = tradeHost();
    run(h, [["GiveLoanMon", { arg0: 7, arg1: 20, arg2: 101 }]]);
    run(h, [["GiveLoanMon", { arg0: 1, arg1: 9, arg2: 101 }]]);
    expect(loans).toEqual([[7, 20, true], [1, 9, false]]);
  });

  it("KenyaCheckPartyOrMailbox is 1 while Kenya's mail is with the player", () => {
    const h = fakeHost();
    run(h, [["KenyaCheckPartyOrMailbox", { arg0: OUT }]]);
    expect(h.vars.get(OUT)).toBe(0);
    h.hasTradeMail = (id) => id === 7;
    run(h, [["KenyaCheckPartyOrMailbox", { arg0: OUT }]]);
    expect(h.vars.get(OUT)).toBe(1);
  });
});
