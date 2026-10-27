import { describe, expect, it } from "vitest";
import { createRunner, MAX_DEPTH, MAX_STEPS } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

const run = (file: ReturnType<typeof makeScript>, host = fakeHost(), entry = 0) => {
  const runner = createRunner(host, SCRIPT_HANDLERS, { file, entry });
  return { runner, host, state: runner.step() };
};

describe("runner", () => {
  it("runs to End", () => {
    expect(run(makeScript([["SetFlag", { flag: { flag: 5 } }], ["End"]])).state).toEqual({ kind: "done" });
  });

  it("stops at a blocking command and goes on when resumed", () => {
    const { runner, host, state } = run(makeScript([["NPCMsg", { msg_id: { text: "0007:1" } }], ["SetFlag", { flag: { flag: 9 } }], ["End"]]));
    expect(state).toMatchObject({ kind: "blocked", request: { kind: "say", text: "0007:1" } });
    expect(host.flags.has(9)).toBe(false);
    expect(runner.resume()).toEqual({ kind: "done" });
    expect(host.flags.has(9)).toBe(true);
  });

  it("starts at the entry asked for", () => {
    const file = makeScript(["L1:", ["SetFlag", { flag: { flag: 1 } }], ["End"], "L2:", ["SetFlag", { flag: { flag: 2 } }], ["End"]], { entries: ["L1", "L2"] });
    const { host } = run(file, fakeHost(), 1);
    expect([...host.flags]).toEqual([2]);
  });

  it("reports a command it has no handler for, with where it is", () => {
    const file = makeScript([["SetFlag", { flag: { flag: 1 } }], ["NotAThing"], ["End"]], { file: 42 });
    expect(run(file).state).toEqual({ kind: "missing", command: "NotAThing", file: 42, entry: 0, index: 1 });
  });

  it("reports a command the decoder did not know as raw", () => {
    expect(run(makeScript([{ raw: true, id: 999 }])).state).toMatchObject({ kind: "missing", command: "raw:999", index: 0 });
  });

  it("aborts a jump to a label that does not exist", () => {
    expect(run(makeScript([["GoTo", { dest: { label: "L9" } }]])).state).toMatchObject({ kind: "aborted" });
  });

  it("aborts a script that never waits", () => {
    const state = run(makeScript(["L1:", ["AddVar", { var: { variable: 0x4001 }, var_or_addend: 1 }], ["GoTo", { dest: { label: "L1" } }]])).state;
    expect(state.kind === "aborted" && state.reason).toContain(String(MAX_STEPS));
  });

  it("aborts when calls nest too deep", () => {
    expect(run(makeScript(["L1:", ["Call", { sub: { label: "L1" } }]])).state).toMatchObject({ kind: "aborted" });
    expect(MAX_DEPTH).toBe(32);
  });

  it("aborts at the end of the code without End", () => {
    expect(run(makeScript([["SetFlag", { flag: { flag: 1 } }]])).state).toMatchObject({ kind: "aborted" });
  });

  it("shows where it is", () => {
    const { runner } = run(makeScript([["SetFlag", { flag: { flag: 1 } }], ["NPCMsg", { msg_id: { text: "0007:1" } }], ["End"]], { file: 3 }));
    expect(runner.snapshot()).toEqual({ file: 3, entry: 0, pc: 1, command: "NPCMsg", depth: 1 });
  });
});
