import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript, type FakeHost } from "./fixture.ts";

// Spec 029, item 029.1: the Day Care lady's commands (scr_seq 265), after pokeheartgold scrcmd_daycare.c,
// scrcmd_party.c and scrcmd_c.c (ScrCmd_551/552). Synthetic scripts and host (principle II).

type Kept = { species: number; nickname?: string; level: number; gained: number; gender: "male" | "female" | undefined };

/** A fake host with a Day Care: deposits keep the member at its level; the test says what each slot has gained. */
function dayCareHost(over: Partial<FakeHost> = {}) {
  const kept: Kept[] = [];
  const host = fakeHost({
    party: [{ species: 155, level: 5, hp: 20 }, { species: 16, level: 3, hp: 0, nickname: "Pidge" }, { species: 19, level: 4, hp: 9 }],
    wallet: 500,
    ...over,
  });
  host.daycare = () => kept;
  host.daycareDeposit = (slot) => {
    const [m] = host.party.splice(slot, 1);
    kept.push({ species: m!.species, ...(m!.nickname ? { nickname: m!.nickname } : {}), level: m!.level, gained: 0, gender: undefined });
  };
  host.daycareRetrieve = (index) => {
    const [k] = kept.splice(index, 1);
    host.party.push({ species: k!.species, level: k!.level, hp: 1 });
    return k!.species;
  };
  host.aliveMons = (except) => host.party.filter((m, i) => m.hp > 0 && i !== except).length;
  host.boxMonCount = () => 2;
  return { host, kept };
}

const run = (lines: Parameters<typeof makeScript>[0], host: FakeHost) => createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 });

describe("Day Care commands (spec 029)", () => {
  it("GetDaycareState is 0 empty, 2 with one and 3 with two", () => {
    const { host, kept } = dayCareHost();
    const state = () => {
      run([["GetDaycareState", { arg0: 0x800c }], ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x800c } }], ["End"]], host).step();
      return host.vars.get(0x4001);
    };
    expect(state()).toBe(0);
    kept.push({ species: 1, level: 5, gained: 0, gender: undefined });
    expect(state()).toBe(2);
    kept.push({ species: 2, level: 5, gained: 0, gender: undefined });
    expect(state()).toBe(3);
  });

  it("ScrCmd_551 asks the client for a party member and ScrCmd_552 gives the slot, never the summary", () => {
    const { host } = dayCareHost();
    const lines: Parameters<typeof makeScript>[0] = [
      ["ScrCmd_551", { arg0: 0x800c }],
      ["ScrCmd_552", { arg0: 0x8000, arg1: 0x800c }],
      ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x8000 } }],
      ["CopyVar", { dst: { variable: 0x4002 }, src: { variable: 0x800c } }],
      ["End"],
    ];
    const picked = run(lines, host);
    expect(picked.step()).toEqual({ kind: "blocked", request: { kind: "party" } });
    picked.resume(2);
    expect([host.vars.get(0x4001), host.vars.get(0x4002)]).toEqual([2, 0]);
    // B, or anything past the party, is 255: the lady's cancel.
    const cancelled = run(lines, host);
    cancelled.step();
    cancelled.resume(7);
    expect(host.vars.get(0x4001)).toBe(255);
  });

  it("CountAliveMons skips a slot, CountAliveMonsAndPC adds the boxes, DaycareSanitizeMon lets the member go", () => {
    const { host } = dayCareHost();
    run(
      [
        ["CountAliveMons", { var: { variable: 0x4001 }, except: 0 }],
        ["CountAliveMonsAndPC", { arg0: 0x4002 }],
        ["SetVar", { var: { variable: 0x8000 }, val: 2 }],
        ["DaycareSanitizeMon", { arg0: 0x8000, arg1: 0x4003 }],
        ["End"],
      ],
      host,
    ).step();
    // Alive: slots 0 and 2 (Pidge fainted).
    expect([host.vars.get(0x4001), host.vars.get(0x4002), host.vars.get(0x4003) ?? 0]).toEqual([1, 4, 0]);
  });

  it("PutMonInDaycare leaves the member and GetTailDaycareMonSpeciesAndNick names the last one left", () => {
    const { host, kept } = dayCareHost();
    const state = run(
      [
        ["SetVar", { var: { variable: 0x8000 }, val: 1 }],
        ["PutMonInDaycare", { arg0: 0x8000 }],
        ["GetTailDaycareMonSpeciesAndNick", { arg0: 0x8001 }],
        ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x8001 } }],
        ["NPCMsg", { msg_id: 23 }],
        ["End"],
      ],
      host,
    ).step();
    expect(kept.map((k) => k.species)).toEqual([16]);
    expect(host.party.map((m) => m.species)).toEqual([155, 19]);
    expect(host.vars.get(0x4001)).toBe(16);
    expect(state).toMatchObject({ request: { kind: "say", buffers: { 0: { kind: "name", name: "Pidge" } } } });
  });

  it("BufferDaycareMonGrowth gives the levels gained, 0 for an empty slot", () => {
    const { host, kept } = dayCareHost();
    kept.push({ species: 16, nickname: "Pidge", level: 9, gained: 6, gender: undefined });
    const state = run(
      [
        ["SetVar", { var: { variable: 0x8000 }, val: 0 }],
        ["BufferDaycareMonGrowth", { arg0: 0x800c, arg1: 0x8000 }],
        ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x800c } }],
        ["SetVar", { var: { variable: 0x8000 }, val: 1 }],
        ["BufferDaycareMonGrowth", { arg0: 0x800c, arg1: 0x8000 }],
        ["CopyVar", { dst: { variable: 0x4002 }, src: { variable: 0x800c } }],
        ["NPCMsg", { msg_id: 31 }],
        ["End"],
      ],
      host,
    ).step();
    expect([host.vars.get(0x4001), host.vars.get(0x4002) ?? 0]).toEqual([6, 0]);
    expect(state).toMatchObject({ request: { buffers: { 0: { kind: "name", name: "Pidge" }, 1: { kind: "number", value: 6 } } } });
  });

  it("BufferDaycareMonStats names each slot with the level it has now and its gender sign for the menu", () => {
    const { host, kept } = dayCareHost();
    kept.push({ species: 16, level: 9, gained: 6, gender: "male" }, { species: 29, level: 4, gained: 0, gender: undefined });
    const state = run([["BufferDaycareMonStats", { arg0: 0, arg1: 1, arg2: 2, arg3: 0 }], ["BufferDaycareMonStats", { arg0: 3, arg1: 4, arg2: 5, arg3: 1 }], ["NPCMsg", { msg_id: 1 }], ["End"]], host).step();
    expect(state).toMatchObject({
      request: {
        buffers: {
          0: { kind: "species", id: 16 },
          1: { kind: "number", value: 9 },
          2: { kind: "text", text: "♂" },
          3: { kind: "species", id: 29 },
          4: { kind: "number", value: 4 },
          5: { kind: "text", text: "" },
        },
      },
    });
  });

  it("charges 100 plus 100 per level gained, refuses when the wallet is short and gives the Pokémon back", () => {
    const { host, kept } = dayCareHost({ wallet: 500 });
    kept.push({ species: 16, level: 9, gained: 6, gender: undefined }, { species: 19, level: 6, gained: 2, gender: undefined });
    const withdraw = (slot: number) =>
      run(
        [
          ["SetVar", { var: { variable: 0x8001 }, val: slot }],
          ["BufferDaycareWithdrawCost", { arg0: 0x8004, arg1: 0x8001 }],
          ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x8004 } }],
          ["HasEnoughMoneyVar", { var: { variable: 0x800c }, amount: 0x8004 }],
          ["CompareVarToValue", { var: { variable: 0x800c }, val: 1 }],
          ["GoToIf", { condition: 1, dest: { label: "L3" } }],
          ["End"],
          "L3:",
          ["RetrieveDaycareMon", { arg0: 0x8002, arg1: 0x8001 }],
          ["CopyVar", { dst: { variable: 0x4002 }, src: { variable: 0x8002 } }],
          ["SubMoneyVar", { var: { variable: 0x8004 } }],
          ["End"],
        ],
        host,
      ).step();
    // 700 for the first one: more than 500, nothing changes.
    withdraw(0);
    expect([host.vars.get(0x4001), host.wallet, kept.length]).toEqual([700, 500, 2]);
    // 300 for the second one.
    withdraw(1);
    expect([host.vars.get(0x4001), host.vars.get(0x4002), host.wallet, kept.map((k) => k.species)]).toEqual([300, 19, 200, [16]]);
    expect(host.party.at(-1)?.species).toBe(19);
  });

  it("BufferDaycareMonNicks names both slots and the player as the first one's trainer", () => {
    const { host, kept } = dayCareHost();
    kept.push({ species: 16, nickname: "Pidge", level: 9, gained: 6, gender: undefined }, { species: 19, level: 6, gained: 2, gender: undefined });
    const state = run([["BufferDaycareMonNicks"], ["NPCMsg", { msg_id: 2 }], ["End"]], host).step();
    expect(state).toMatchObject({ request: { buffers: { 0: { kind: "name", name: "Pidge" }, 1: { kind: "species", id: 19 }, 2: { kind: "player" } } } });
  });

  it("the money box and the yard's Pokémon only draw, so they do nothing here", () => {
    const { host } = dayCareHost();
    expect(run([["ShowMoneyBox", { arg0: 20, arg1: 2 }], ["UpdateMoneyBox"], ["HideMoneyBox"], ["UpdateDaycareMonObjects"], ["End"]], host).step()).toEqual({ kind: "done" });
  });
});

// Spec 029, item 029.2: the egg. The man (scr_seq 265 L1) and the Route 34 map script (CheckDaycareEgg).
describe("Day Care eggs (spec 029.2)", () => {
  function eggHost(over: Partial<FakeHost> = {}) {
    const { host, kept } = dayCareHost(over);
    const state = { egg: false, score: 1, given: 0 };
    host.daycareEgg = () => state.egg;
    host.daycareCompatibility = () => state.score;
    host.resetDaycareEgg = () => void (state.egg = false);
    host.giveDaycareEgg = () => {
      state.egg = false;
      state.given++;
      host.party.push({ species: 1, level: 1, hp: 11, egg: true });
    };
    host.partyIsEgg = (slot) => host.party[slot]?.egg === true;
    return { host, kept, state };
  }
  const read = (host: FakeHost, cmd: [string, Record<string, unknown>?]) => {
    run([cmd, ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x800c } }], ["End"]], host).step();
    return host.vars.get(0x4001) ?? 0;
  };

  it("GetDaycareState is 1 and CheckDaycareEgg 1 while an egg waits", () => {
    const { host, kept, state } = eggHost();
    kept.push({ species: 1, level: 5, gained: 0, gender: "male" }, { species: 1, level: 5, gained: 0, gender: "female" });
    expect(read(host, ["GetDaycareState", { arg0: 0x800c }])).toBe(3);
    expect(read(host, ["CheckDaycareEgg", { arg0: 0x800c }])).toBe(0);
    state.egg = true;
    expect(read(host, ["GetDaycareState", { arg0: 0x800c }])).toBe(1);
    expect(read(host, ["CheckDaycareEgg", { arg0: 0x800c }])).toBe(1);
  });

  it("GetDaycareCompatibility gives the host's score", () => {
    const { host, state } = eggHost();
    state.score = 2;
    expect(read(host, ["GetDaycareCompatibility", { arg0: 0x800c }])).toBe(2);
  });

  it("GiveDaycareEgg hands the egg over and ResetDaycareEgg throws it away", () => {
    const { host, state } = eggHost();
    state.egg = true;
    run([["GiveDaycareEgg"], ["End"]], host).step();
    expect([state.egg, state.given, host.party.at(-1)?.egg]).toEqual([false, 1, true]);
    state.egg = true;
    run([["ResetDaycareEgg"], ["End"]], host).step();
    expect([state.egg, state.given]).toEqual([false, 1]);
  });

  it("029.4: EggHatchAnim hatches the egg through the host and waits on the client's animation for its species", () => {
    const { host } = eggHost();
    let hatched = 0;
    host.hatchEgg = () => (hatched++, 172);
    const r = run([["EggHatchAnim"], ["End"]], host);
    expect(r.step()).toEqual({ kind: "blocked", request: { kind: "hatch", species: 172 } });
    r.resume();
    expect([r.state.kind, hatched]).toEqual(["done", 1]);
    // No egg at 0 cycles (or a host without eggs): nothing to show.
    host.hatchEgg = () => undefined;
    expect(run([["EggHatchAnim"], ["End"]], host).step().kind).toBe("done");
  });

  it("029.5: GiveEgg gives an egg of its species, GiveTogepiEgg a Togepi (175) egg with Extrasensory (326)", () => {
    const { host } = eggHost();
    const given: [number, number | undefined][] = [];
    host.giveEgg = (species, move) => void given.push([species, move]);
    run([["GiveEgg", { arg0: 179, arg1: 14 }], ["GiveTogepiEgg"], ["End"]], host).step();
    expect(given).toEqual([
      [179, undefined],
      [175, 326],
    ]);
  });

  it("an egg is not counted by PartyCountNotEgg nor alive, and GetPartyMonSpecies reads 0 for it", () => {
    const { host } = eggHost({ party: [{ species: 155, level: 5, hp: 20 }, { species: 1, level: 1, hp: 11, egg: true }] });
    host.aliveMons = (except) => host.party.filter((m, i) => m.hp > 0 && !m.egg && i !== except).length;
    expect(read(host, ["PartyCountNotEgg", { var: { variable: 0x800c } }])).toBe(1);
    expect(read(host, ["GetPartyCount", { var: { variable: 0x800c } }])).toBe(2);
    expect(read(host, ["GetPartyMonSpecies", { slot: 1, var: { variable: 0x800c } }])).toBe(0);
    expect(read(host, ["GetPartyMonSpecies", { slot: 0, var: { variable: 0x800c } }])).toBe(155);
  });
});
