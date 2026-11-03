import { describe, expect, it } from "vitest";
import { PLAYER_NAME_MAX } from "../../src/game/limits.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { createRunner } from "../../src/script/runner.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Spec 024 US4 (research R3, R4). The scene in Elm's lab asks again while the variable holds 1.

const VAR = 0x4100;
const naming = (host = fakeHost()) => {
  const runner = createRunner(host, SCRIPT_HANDLERS, { file: makeScript([["SetVar", { var: { variable: VAR }, val: 1 }], ["NameRival", { arg0: VAR }], ["BufferRivalsName", { slot: 0 }], ["NPCMsg", { msg_id: 1 }], ["End"]]), entry: 0 });
  return { runner, host };
};

describe("NameRival", () => {
  it("asks for the rival's name", () => {
    expect(naming().runner.step()).toEqual({ kind: "blocked", request: { kind: "name", purpose: "rival" } });
  });

  it("keeps the name typed and clears the variable, so the scene goes on", () => {
    const { runner, host } = naming();
    runner.step();
    expect(runner.resume(0, "Blue")).toMatchObject({ request: { buffers: { 0: { kind: "rival", name: "Blue" } } } });
    expect(host.rival).toBe("Blue");
    expect(host.vars.get(VAR)).toBe(0);
  });

  it("takes the extracted default name when nothing is typed, as the original does", () => {
    const { runner, host } = naming();
    runner.step();
    expect(runner.resume(0, "  ")).toMatchObject({ request: { buffers: { 0: { kind: "rival", name: "Heart" } } } });
    expect(host.rival).toBe("Heart");
    expect(host.vars.get(VAR)).toBe(0);
  });

  it("cuts the name at the limit", () => {
    const { runner, host } = naming();
    runner.step();
    runner.resume(0, "x".repeat(PLAYER_NAME_MAX + 5));
    expect(host.rival).toHaveLength(PLAYER_NAME_MAX);
  });
});

describe("BufferRivalsName", () => {
  it("says the name the save holds, in the slot asked", () => {
    const host = fakeHost({ rival: "Blue" });
    const runner = createRunner(host, SCRIPT_HANDLERS, { file: makeScript([["BufferRivalsName", { slot: 2 }], ["NPCMsg", { msg_id: 1 }], ["End"]]), entry: 0 });
    expect(runner.step()).toMatchObject({ request: { buffers: { 2: { kind: "rival", name: "Blue" } } } });
  });
});
