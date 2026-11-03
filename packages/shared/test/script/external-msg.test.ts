import { describe, expect, it } from "vitest";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { createRunner } from "../../src/script/runner.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Spec 024 US4 (research R3): the fixture's table is [752, 211, 30, 435].

const set = (variable: number, val: number): [string, Record<string, unknown>] => ["SetVar", { var: { variable }, val }];

describe("external messages", () => {
  it("GetStdMsgNaix picks the bank from the extracted table", () => {
    const host = fakeHost();
    createRunner(host, SCRIPT_HANDLERS, { file: makeScript([set(0x4000, 1), ["GetStdMsgNaix", { arg0: 0x4000, arg1: 0x4001 }], ["End"]]), entry: 0 }).step();
    expect(host.vars.get(0x4001)).toBe(211);
  });

  it("GetStdMsgNaix gives 0 past the end of the table", () => {
    const host = fakeHost({ vars: new Map([[0x4001, 9]]) });
    createRunner(host, SCRIPT_HANDLERS, { file: makeScript([set(0x4000, 4), ["GetStdMsgNaix", { arg0: 0x4000, arg1: 0x4001 }], ["End"]]), entry: 0 }).step();
    expect(host.vars.get(0x4001)).toBe(0);
  });

  it("MsgBoxExtern says that bank's message and waits for the player", () => {
    const runner = createRunner(fakeHost(), SCRIPT_HANDLERS, { file: makeScript([set(0x4001, 211), set(0x4002, 3), ["MsgBoxExtern", { arg0: 0x4001, arg1: 0x4002 }], ["End"]]), entry: 0 });
    expect(runner.step()).toEqual({ kind: "blocked", request: { kind: "say", text: "0211:3", buffers: {} } });
    expect(runner.resume()).toEqual({ kind: "done" });
  });
});
