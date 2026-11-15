import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript, type FakeHost } from "./fixture.ts";

// Spec 030, item 030.3: the commands the Ruins of Alph's first visit runs (outside, research center).
// Synthetic scripts and host (principle II).

const read = (command: string, h: FakeHost) => {
  createRunner(h, SCRIPT_HANDLERS, { file: makeScript([[command, { arg0: 0x800c }], ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x800c } }], ["End"]]), entry: 0 }).step();
  return h.vars.get(0x4001);
};

describe("Ruins of Alph (spec 030.3)", () => {
  it("PlayerOnBikeCheck is 1 only on the bike", () => {
    const h = fakeHost();
    expect(read("PlayerOnBikeCheck", h)).toBe(0);
    h.onBike = () => true;
    expect(read("PlayerOnBikeCheck", h)).toBe(1);
  });

  it("ScrCmd_545 counts the Unown forms; CheckSeenAllLetterUnown is 1 from 26 letters", () => {
    const h = fakeHost();
    expect([read("ScrCmd_545", h), read("CheckSeenAllLetterUnown", h)]).toEqual([0, 0]);
    h.unownForms = () => 3;
    expect([read("ScrCmd_545", h), read("CheckSeenAllLetterUnown", h)]).toEqual([3, 0]);
    h.unownForms = () => 26;
    expect(read("CheckSeenAllLetterUnown", h)).toBe(1);
  });

  it("MoveWarp runs without ending the script", () => {
    const h = fakeHost();
    const state = createRunner(h, SCRIPT_HANDLERS, { file: makeScript([["MoveWarp", { arg0: 11, arg1: 418, arg2: 284 }], ["End"]]), entry: 0 }).step();
    expect(state.kind).toBe("done");
  });
});
