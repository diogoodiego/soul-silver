import { describe, expect, it } from "vitest";
import { createRunner, VAR_RESULT } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript, type FakeHost } from "./fixture.ts";

// One synthetic script per command group (spec 020, FR-005, SC-004).

type Lines = Parameters<typeof makeScript>[0];
const start = (lines: Lines, host: FakeHost = fakeHost()) => {
  const runner = createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines, { messageBank: 542 }), entry: 0 });
  return { runner, host, state: runner.step() };
};
const v = (id: number) => ({ variable: id });

describe("flags and variables", () => {
  it("sets, clears and checks flags", () => {
    const { host } = start([
      ["SetFlag", { flag: { flag: 7 } }],
      ["CheckFlag", { flag: { flag: 7 } }],
      ["GoToIf", { condition: 1, dest: { label: "L2" } }],
      ["End"],
      "L2:",
      ["ClearFlag", { flag: { flag: 7 } }],
      ["SetFlag", { flag: { flag: 8 } }],
      ["End"],
    ]);
    expect([...host.flags]).toEqual([8]);
  });

  it("sets, adds, subtracts and copies variables, wrapping at 16 bits", () => {
    const host = fakeHost();
    host.vars.set(0x4010, 4);
    start(
      [
        ["SetVar", { var: v(0x4001), val: 10 }],
        ["AddVar", { var: v(0x4001), var_or_addend: 5 }],
        ["AddVar", { var: v(0x4001), var_or_addend: 0x4010 }],
        ["SubVar", { var: v(0x4002), var_or_addend: 1 }],
        ["CopyVar", { dst: v(0x4003), src: v(0x4001) }],
        ["SetOrCopyVar", { dst: v(0x4004), src: v(0x4010) }],
        ["End"],
      ],
      host,
    );
    expect(Object.fromEntries(host.vars)).toEqual({ [0x4010]: 4, [0x4001]: 19, [0x4002]: 0xffff, [0x4003]: 19, [0x4004]: 4 });
  });

  it("keeps special variables out of the save", () => {
    const { host } = start([["SetVar", { var: v(VAR_RESULT), val: 3 }], ["End"]]);
    expect(host.vars.size).toBe(0);
  });

  it("writing to a number that is not a variable aborts", () => {
    expect(start([["SetVar", { var: 12, val: 1 }]]).state).toMatchObject({ kind: "aborted" });
  });
});

describe("messages", () => {
  it("NPCMsg waits for the player with the buffers filled so far", () => {
    const { state } = start([["BufferPlayersName", { slot: 0 }], ["BufferSpeciesName", { slot: 1, species: { species: 155 }, arg2: 0, arg3: 0 }], ["NPCMsg", { msg_id: { text: "0542:3" } }], ["End"]]);
    expect(state).toEqual({ kind: "blocked", request: { kind: "say", text: "0542:3", buffers: { 0: { kind: "player" }, 1: { kind: "species", id: 155 } } } });
  });

  it("BufferMonSpeciesName reads the party", () => {
    const host = fakeHost({ party: [{ species: 158, level: 5, hp: 20 }] });
    expect(start([["BufferMonSpeciesName", { slot: 1, party_pos: 0 }], ["NPCMsg", { msg_id: { text: "0542:3" } }]], host).state).toMatchObject({ request: { buffers: { 1: { kind: "species", id: 158 } } } });
  });

  it("GenderMsgBox picks the message by the save's character, from the file's bank", () => {
    expect(start([["GenderMsgBox", { arg0: 1, arg1: 2 }]]).state).toMatchObject({ request: { text: "0542:1" } });
    expect(start([["GenderMsgBox", { arg0: 1, arg1: 2 }]], fakeHost({ character: "female" })).state).toMatchObject({ request: { text: "0542:2" } });
  });

  it("WaitButton does not wait again after a message, CloseMsg tells the client", () => {
    const { runner, host } = start([["NPCMsg", { msg_id: { text: "0542:3" } }], ["WaitButton"], ["WaitABPress"], ["CloseMsg"], ["End"]]);
    expect(runner.resume()).toEqual({ kind: "done" });
    expect(host.events).toEqual([{ kind: "close-msg" }]);
  });

  it("YesNo stores 0 for yes and 1 for no", () => {
    const lines: Lines = [["YesNo", { arg0: VAR_RESULT }], ["CompareVarToValue", { var: v(VAR_RESULT), val: 0 }], ["GoToIf", { condition: 1, dest: { label: "L2" } }], ["End"], "L2:", ["SetFlag", { flag: { flag: 1 } }], ["End"]];
    const yes = start(lines);
    expect(yes.state).toEqual({ kind: "blocked", request: { kind: "yes-no" } });
    yes.runner.resume(0);
    expect(yes.host.flags.has(1)).toBe(true);
    const no = start(lines);
    no.runner.resume(1);
    expect(no.host.flags.has(1)).toBe(false);
  });

  it("GetMenuChoice right after a message is the touch-screen yes/no", () => {
    const { runner, host } = start([["GetMenuChoice", { arg0: VAR_RESULT }], ["CopyVar", { dst: v(0x4001), src: v(VAR_RESULT) }], ["End"]]);
    expect(runner.state).toEqual({ kind: "blocked", request: { kind: "yes-no" } });
    runner.resume(1);
    expect(host.vars.get(0x4001)).toBe(1);
  });

  it("GetPlayerGender is 0 for male and 1 for female", () => {
    expect(start([["GetPlayerGender", { var: v(0x4001) }], ["End"]], fakeHost({ character: "female" })).host.vars.get(0x4001)).toBe(1);
  });

  it("signposts and trainer tips show the text and wait for the player", () => {
    const { runner, host } = start([["SetSignpostMap", { type: 0, map: 3 }], ["DirectionSignpost", { message: { text: "0542:4" }, type: 0, map: 3, out: v(0x4001) }], ["WaitSignpost", { out: v(0x4001) }], ["TrainerTips", { message: { text: "0542:5" }, out: v(0x4002) }], ["SetSignpostAction", { cmd: 1 }], ["WaitSignpostAction"], ["End"]]);
    expect(runner.state).toMatchObject({ request: { kind: "say", text: "0542:4" } });
    expect(runner.resume()).toMatchObject({ request: { kind: "say", text: "0542:5" } });
    expect(runner.resume()).toEqual({ kind: "done" });
    expect(host.vars.get(0x4001)).toBe(0);
  });
});

describe("items and money", () => {
  it("gives, checks and takes items, answering in the result variable", () => {
    const { host } = start([
      ["GiveItem", { arg0: 17, arg1: 2, arg2: v(0x4001) }],
      ["HasItem", { arg0: 17, arg1: 2, arg2: v(0x4002) }],
      ["TakeItem", { arg0: 17, arg1: 1, arg2: v(0x4003) }],
      ["TakeItem", { arg0: 17, arg1: 5, arg2: v(0x4004) }],
      ["HasSpaceForItem", { arg0: 17, arg1: 999, arg2: v(0x4005) }],
      ["End"],
    ]);
    expect(Object.fromEntries(host.vars)).toEqual({ [0x4001]: 1, [0x4002]: 1, [0x4003]: 1, [0x4004]: 0, [0x4005]: 0 });
    expect(host.bag.get(17)).toBe(1);
  });

  it("adds and takes money and checks it", () => {
    const { host } = start([["AddMoney", { arg0: 500 }], ["SubMoneyImmediate", { arg0: 200 }], ["HasEnoughMoneyImmediate", { arg0: 0x4001, arg1: 3300 }], ["HasEnoughMoneyImmediate", { arg0: 0x4002, arg1: 3301 }], ["End"]]);
    expect(host.wallet).toBe(3300);
    expect([host.vars.get(0x4001), host.vars.get(0x4002)]).toEqual([1, 0]);
  });
});

describe("Pokémon", () => {
  it("GiveMon adds to the party and answers whether it could", () => {
    const { host } = start([["GiveMon", { species: { species: 25 }, level: 5, heldItem: { item: 0 }, form: 0, ability: 0, retvar: v(0x4001) }], ["GetPartyCount", { var: v(0x4002) }], ["End"]]);
    expect(host.party).toEqual([{ species: 25, level: 5, hp: 1 }]);
    expect(host.vars.get(0x4001)).toBe(1);
    expect(host.vars.get(0x4002)).toBe(1);
  });

  it("ChooseStarter asks for one of the three Johto starters and gives it at level 5", () => {
    const { runner, host } = start([["ChooseStarter"], ["GetPartyMonSpecies", { slot: 0, var: v(0x4001) }], ["SetStarterChoice", { arg0: 0x4001 }], ["GetStarterChoice", { var: v(0x4002) }], ["End"]]);
    expect(runner.state).toEqual({ kind: "blocked", request: { kind: "starter", species: [152, 155, 158] } });
    runner.resume(1);
    expect(host.party).toEqual([{ species: 155, level: 5, hp: 1 }]);
    expect(host.vars.get(0x4002)).toBe(155);
  });

  it("ChooseStarter gives nothing when the new-game starter is already in the party", () => {
    const host = fakeHost({ party: [{ species: 158, level: 5, hp: 20 }] });
    expect(start([["ChooseStarter"], ["End"]], host).state).toEqual({ kind: "done" });
    expect(host.party).toHaveLength(1);
  });

  it("HealParty heals, GetPartyLeadAlive finds the first standing member", () => {
    const host = fakeHost({ party: [{ species: 1, level: 5, hp: 0 }, { species: 4, level: 5, hp: 0 }] });
    start([["GetPartyLeadAlive", { arg0: 0x4001 }], ["HealParty"], ["GetPartyLeadAlive", { arg0: 0x4002 }], ["End"]], host);
    expect([host.vars.get(0x4001), host.vars.get(0x4002)]).toEqual([2, 0]);
    expect(host.party.every((m) => m.hp === 99)).toBe(true);
  });

  it("badges", () => {
    const { host } = start([["GiveBadge", { badge: 0 }], ["CheckBadge", { badge: 0, var: v(0x4001) }], ["CheckBadge", { badge: 1, var: v(0x4002) }], ["End"]]);
    expect([host.vars.get(0x4001), host.vars.get(0x4002)]).toEqual([1, 0]);
  });
});

describe("world", () => {
  it("Warp blocks the script and the player goes to the map", () => {
    const host = fakeHost();
    host.vars.set(0x4001, 12);
    const { state } = start([["Warp", { arg0: 60, arg1: 0, arg2: 0x4001, arg3: 7, arg4: 1 }], ["End"]], host);
    expect(state).toEqual({ kind: "done" });
    expect(host.warps).toEqual([{ map: 60, x: 12, z: 7, facing: 1 }]);
  });

  it("FadeScreen tells the client, WaitFade waits for it", () => {
    const { runner, host } = start([["FadeScreen", { arg0: 6, speed: 1, direction: 0, color: 0 }], ["WaitFade"], ["End"]]);
    expect(host.events).toEqual([{ kind: "fade", type: 0, color: 0, duration: 6 }]);
    expect(runner.state).toEqual({ kind: "blocked", request: { kind: "wait-fade" } });
    expect(runner.resume()).toEqual({ kind: "done" });
  });

  it("Wait counts DS frames (30 a second) as server ticks and clears its variable", () => {
    const { runner, host } = start([["Wait", { frames: 30, var: v(0x4001) }], ["End"]]);
    expect(runner.state).toEqual({ kind: "blocked", request: { kind: "wait", ticks: 20 } });
    expect(host.vars.get(0x4001)).toBe(30);
    runner.resume();
    expect(host.vars.get(0x4001)).toBe(0);
  });

  it("sound effects, fanfares, cries and music", () => {
    const { runner, host } = start([["PlaySE", { arg0: 1500 }], ["WaitSE", { arg0: 1500 }], ["PlayFanfare", { fanfare: 1187 }], ["WaitFanfare"], ["PlayCry", { arg0: 155, arg1: 0 }], ["WaitCry"], ["PlayBGM", { bgm: 1000 }], ["StopBGM", { arg0: 0 }], ["End"]]);
    expect(runner.state).toEqual({ kind: "blocked", request: { kind: "wait-sound", sound: "se" } });
    expect(runner.resume()).toEqual({ kind: "blocked", request: { kind: "wait-sound", sound: "fanfare" } });
    expect(runner.resume()).toEqual({ kind: "blocked", request: { kind: "wait-sound", sound: "cry" } });
    expect(runner.resume()).toEqual({ kind: "done" });
    expect(host.events).toEqual([
      { kind: "sound", sound: "se", id: 1500 },
      { kind: "sound", sound: "fanfare", id: 1187 },
      { kind: "sound", sound: "cry", id: 155 },
      { kind: "bgm", id: 1000 },
      { kind: "bgm", id: null },
    ]);
  });

  it("locks are the server's: LockAll, ReleaseAll, Lock and Release do nothing", () => {
    expect(start([["LockAll"], ["Lock", { arg0: 1 }], ["Release", { arg0: 1 }], ["ReleaseAll"], ["End"]]).state).toEqual({ kind: "done" });
  });

  it("player and person position, facing, persons shown and hidden", () => {
    const { host } = start([
      ["GetPlayerCoords", { arg0: 0x4001, arg1: 0x4002 }],
      ["GetPlayerFacing", { arg0: v(0x4003) }],
      ["GetPersonCoords", { arg0: 1, arg1: 0x4004, arg2: 0x4005 }],
      ["GetPersonCoords", { arg0: 2, arg1: 0x4006, arg2: 0x4007 }],
      ["FacePlayer"],
      ["HidePerson", { arg0: 3 }],
      ["ShowPerson", { arg0: 4 }],
      ["GetWeekday", { arg0: 0x4008 }],
      ["End"],
    ]);
    expect(Object.fromEntries(host.vars)).toEqual({ [0x4001]: 10, [0x4002]: 20, [0x4003]: 1, [0x4004]: 3, [0x4005]: 4, [0x4006]: 255, [0x4007]: 255, [0x4008]: 2 });
    expect([host.faced, host.hidden, host.shown]).toEqual([1, [3], [4]]);
  });
});

describe("bridges to later specs", () => {
  it.each(["ApplyMovement", "WaitMovement", "TrainerBattle", "WildBattle", "MartBuy"])("%s goes to the host and ends the script when nothing implements it", (name) => {
    const { host, state } = start([[name, { arg0: 0 }], ["End"]]);
    expect(host.bridged).toEqual([name]);
    expect(state).toMatchObject({ kind: "missing", command: name });
  });

  it("goes on when the host implements it", () => {
    const host = fakeHost();
    host.supported.add("ApplyMovement");
    expect(start([["ApplyMovement", { arg0: 0 }], ["End"]], host).state).toEqual({ kind: "done" });
  });
});
