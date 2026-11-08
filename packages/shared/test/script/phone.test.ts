import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Spec 026, T036: the phone's script commands go to the host (scrcmd_c.c): numbers are per player,
// GetPhoneBookRematch is the rematch trainer or 0, and a script's call rings on the Pokégear (block `call`).

const run = (lines: Parameters<typeof makeScript>[0], host = fakeHost()) => ({ state: createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 }).step(), host });

describe("phone commands (spec 026)", () => {
  it("RegisterGearNumber registers, CheckRegisteredPhoneNumber answers 1 and 0", () => {
    const { host } = run([["CheckRegisteredPhoneNumber", { arg0: 10, arg1: 0x4001 }], ["RegisterGearNumber", { arg0: 10 }], ["CheckRegisteredPhoneNumber", { arg0: 10, arg1: 0x4002 }], ["CheckRegisteredPhoneNumber", { arg0: 11, arg1: 0x4003 }], ["End"]]);
    expect([0x4001, 0x4002, 0x4003].map((v) => host.vars.get(v))).toEqual([0, 1, 0]);
    expect(host.contacts).toEqual([10]);
  });

  it("GetPhoneBookRematch is the host's rematch trainer, 0 when none; ScrCmd_462 ends the seeking", () => {
    const host = fakeHost({ rematches: new Map([[10, 279]]) });
    run([["GetPhoneBookRematch", { arg0: 10, arg1: 0x4001 }], ["GetPhoneBookRematch", { arg0: 11, arg1: 0x4002 }], ["ScrCmd_462", { arg0: 10 }], ["GetPhoneBookRematch", { arg0: 10, arg1: 0x4003 }], ["End"]], host);
    expect([0x4001, 0x4002, 0x4003].map((v) => host.vars.get(v))).toEqual([279, 0, 0]);
  });

  it("SetPhoneCall and RunPhoneCall ring the scripted call on the phone, not in a text box", () => {
    const { state } = run([["SetPhoneCall", { arg0: 1, arg1: 2, arg2: 0 }], ["RunPhoneCall"], ["End"]]);
    expect(state).toEqual({ kind: "blocked", request: { kind: "call", caller: 1, script: 2 } });
  });

  it("an unknown scripted call is still a missing command", () => {
    expect(run([["SetPhoneCall", { arg0: 0, arg1: 2, arg2: 0 }], ["RunPhoneCall"], ["End"]]).state).toMatchObject({ kind: "missing", command: "SetPhoneCall" });
  });
});
