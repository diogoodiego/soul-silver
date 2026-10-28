import { describe, expect, it } from "vitest";
import { createRunner, VAR_RESULT } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

const go = (lines: Parameters<typeof makeScript>[0], host = fakeHost()) => {
  const state = createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 }).step();
  return { state, host };
};
const flag = (n: number) => ["SetFlag", { flag: { flag: n } }] as [string, Record<string, unknown>];
const v = (id: number) => ({ variable: id });

describe("flow", () => {
  it("GoTo skips ahead", () => {
    expect([...go([["GoTo", { dest: { label: "L2" } }], flag(1), "L2:", flag(2), ["End"]]).host.flags]).toEqual([2]);
  });

  it("Call runs the subroutine and Return comes back", () => {
    expect([...go([["Call", { sub: { label: "L2" } }], flag(1), ["End"], "L2:", flag(2), ["Return"]]).host.flags]).toEqual([2, 1]);
  });

  it("Return with nothing to return to aborts", () => {
    expect(go([["Return"]]).state).toMatchObject({ kind: "aborted" });
  });

  // sConditionTable: < = > <= >= != against Compare(a, b) = 0 (a < b), 1 (equal), 2 (a > b).
  it.each([
    [0, 1, 2, true],
    [0, 2, 2, false],
    [1, 2, 2, true],
    [1, 3, 2, false],
    [2, 3, 2, true],
    [3, 2, 2, true],
    [3, 3, 2, false],
    [4, 2, 2, true],
    [4, 1, 2, false],
    [5, 1, 2, true],
    [5, 2, 2, false],
  ])("GoToIf condition %i with %i vs %i jumps: %s", (condition, a, b, jumps) => {
    const host = fakeHost();
    host.vars.set(0x4005, a);
    const { host: h } = go([["CompareVarToValue", { var: v(0x4005), val: b }], ["GoToIf", { condition, dest: { label: "L2" } }], flag(1), ["End"], "L2:", flag(2), ["End"]], host);
    expect(h.flags.has(2)).toBe(jumps);
  });

  it("CompareVarToVar compares two variables", () => {
    const host = fakeHost();
    host.vars.set(0x4001, 3);
    host.vars.set(0x4002, 3);
    expect(go([["CompareVarToVar", { a: 0x4001, b: 0x4002 }], ["GoToIf", { condition: 1, dest: { label: "L2" } }], ["End"], "L2:", flag(2), ["End"]], host).host.flags.has(2)).toBe(true);
  });

  it("CallIf calls only when the condition holds", () => {
    const lines = (val: number) => [["CompareVarToValue", { var: v(VAR_RESULT), val }], ["CallIf", { condition: 1, sub: { label: "L2" } }], flag(1), ["End"], "L2:", flag(2), ["Return"]] as Parameters<typeof makeScript>[0];
    expect([...go(lines(0)).host.flags]).toEqual([2, 1]);
    expect([...go(lines(1)).host.flags]).toEqual([1]);
  });

  it("CallStd runs a global script with its own comparison, then comes back", () => {
    const host = fakeHost();
    host.files.set(9, makeScript([["CompareVarToValue", { var: v(VAR_RESULT), val: 5 }], flag(3), ["End"]], { file: 9 }));
    host.std.set(2000, { file: 9, entry: 0 });
    // Before the call the result is equal; the global script's compare must not leak back.
    const { host: h, state } = go([["CompareVarToValue", { var: v(VAR_RESULT), val: 0 }], ["CallStd", { id: 2000 }], ["GoToIf", { condition: 1, dest: { label: "L2" } }], ["End"], "L2:", flag(4), ["End"]], host);
    expect(state).toEqual({ kind: "done" });
    expect([...h.flags]).toEqual([3, 4]);
  });

  it("command 21 (named RestartCurrentScript, the original's ReturnCommonScript) comes back from CallStd", () => {
    const host = fakeHost();
    // The Poké Mart greeting (std 2011): a message, then command 21; what follows it never runs.
    host.files.set(9, makeScript([flag(3), ["RestartCurrentScript"], flag(5), ["End"]], { file: 9 }));
    host.std.set(2000, { file: 9, entry: 0 });
    const { host: h, state } = go([["CallStd", { id: 2000 }], flag(4), ["End"]], host);
    expect(state).toEqual({ kind: "done" });
    expect([...h.flags]).toEqual([3, 4]);
  });

  it("CallStd to an unknown script aborts", () => {
    expect(go([["CallStd", { id: 2001 }]]).state).toMatchObject({ kind: "aborted" });
  });

  it("Noop and Dummy do nothing", () => {
    expect(go([["Noop"], ["Dummy"], ["End"]]).state).toEqual({ kind: "done" });
  });
});
