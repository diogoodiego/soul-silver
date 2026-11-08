import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Spec 024: the commands the walkthrough's path to the Zephyr Badge runs (walkthrough.md), after
// pokeheartgold's scrcmd*.c. The ones for systems this game does not have yet do nothing.

const run = (lines: Parameters<typeof makeScript>[0], host = fakeHost()) => {
  const state = createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 }).step();
  return { state, host };
};

describe("story commands (spec 024)", () => {
  it("GetGameVersion reads SoulSilver (8)", () => {
    expect(run([["GetGameVersion", { arg0: 0x4001 }], ["End"]]).host.vars.get(0x4001)).toBe(8);
  });

  it("MonGetFriendship and GetPartyMonForm2 read the party member", () => {
    const host = fakeHost({ party: [{ species: 155, level: 5, hp: 20, friendship: 120 }] });
    run([["MonGetFriendship", { arg0: 0x4001, arg1: 0 }], ["GetPartyMonForm2", { arg0: 0, arg1: 0x4002 }], ["End"]], host);
    expect([host.vars.get(0x4001), host.vars.get(0x4002)]).toEqual([120, 0]);
  });

  it("BufferFriendsName names the friend of the other gender; BufferPartyMonSpeciesNameIndef the species", () => {
    const host = fakeHost({ party: [{ species: 155, level: 5, hp: 20 }] });
    const { state } = run([["BufferFriendsName", { slot: 0 }], ["BufferPartyMonSpeciesNameIndef", { arg0: 1, arg1: 0 }], ["NPCMsg", { msg_id: 1 }], ["End"]], host);
    expect(state).toMatchObject({ request: { buffers: { 0: { kind: "name", name: "Lyra" }, 1: { kind: "species", id: 155 } } } });
  });

  // Std 2008 (receive an item) in file 3: the pocket picks the message, the buffers name item and pocket.
  it("GetItemPocket reads the item's pocket; the item and pocket buffers name them", () => {
    const host = fakeHost();
    const lines: Parameters<typeof makeScript>[0] = [
      ["SetVar", { var: { variable: 0x8004 }, val: 17 }],
      ["GetItemPocket", { arg0: 0x8004, arg1: 0x4001 }],
      ["BufferItemName", { slot: 0, item: 0x8004 }],
      ["BufferItemNamePlural", { arg0: 1, arg1: 0x8004 }],
      ["BufferPocketName", { slot: 2, pocket: 0x4001 }],
      ["WaitButtonOrDelay", { arg0: 30 }],
      ["NPCMsg", { msg_id: 1 }],
      ["End"],
    ];
    const { state } = run(lines, host);
    expect(host.vars.get(0x4001)).toBe(1);
    expect(state).toMatchObject({ request: { buffers: { 0: { kind: "item", id: 17 }, 1: { kind: "item", id: 17 }, 2: { kind: "pocket", id: 1 } } } });
  });

  it("the phone, Pokégear, camera, spawn and sound commands run through", () => {
    const lines: Parameters<typeof makeScript>[0] = [
      ["RegisterGearNumber", { arg0: 1 }],
      ["CheckRegisteredPhoneNumber", { arg0: 1, arg1: 0x4001 }],
      ["GetPhoneBookRematch", { arg0: 1, arg1: 0x4002 }],
      ["UnsetPhoneCallTrigger", { arg0: 1 }],
      ["RegisterPokegearCard", { arg0: 1 }],
      ["GiveRunningShoes"],
      ["GivePokedex"],
      ["SetSpawn", { arg0: 1 }],
      ["ScrCmd_573"],
      ["ScrCmd_582", { arg0: 60, arg1: 1, arg2: 1 }],
      ["ScrCmd_307", { arg0: 0, arg1: 0, arg2: 1, arg3: 1, arg4: 0 }],
      ["ScrCmd_310", { arg0: 0 }],
      ["ScrCmd_311", { arg0: 0 }],
      ["ScrCmd_596", { arg0: 0x4003 }],
      ["ScrCmd_600"],
      ["StopSE", { arg0: 1500 }],
      ["ScrCmd_102", { arg0: 1, arg1: 1 }],
      ["ScrCmd_103"],
      ["CatchingTutorial"],
      ["WhiteOut"],
      ["VioletGymInit"],
      ["VioletGymElevator"],
      ["End"],
    ];
    const { state, host } = run(lines);
    expect(state).toEqual({ kind: "done" });
    // The number registered just before (spec 026); no rematch sought.
    expect([host.vars.get(0x4001), host.vars.get(0x4002), host.vars.get(0x4003)]).toEqual([1, 0, 0]);
  });
});
