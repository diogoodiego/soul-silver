import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Item 032.3: the Lake of Rage's commands (map 88). Synthetic scripts and host (principle II).

describe("block 032 commands (item 032.3)", () => {
  it("OpenMsg, ScrCmd_775 (Lance flying off on Dragonite) and Dummy486 run on without a request or event", () => {
    const h = fakeHost();
    const file = makeScript([["OpenMsg"], ["ScrCmd_775", { arg0: 8, arg1: 10 }], ["Dummy486"], ["SetFlag", { flag: { flag: 484 } }], ["End"]]);
    expect(createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step().kind).toBe("done");
    expect(h.flags.has(484)).toBe(true);
    expect(h.events).toEqual([]);
  });
});

// Item 032.4: the Rocket HQ's commands (maps 247 and 248).
describe("Rocket HQ commands (item 032.4)", () => {
  it("RocketTrapBattle asks for a wild battle with the trap's species and level", () => {
    const file = makeScript([["RocketTrapBattle", { arg0: 100, arg1: 23 }], ["End"]]);
    expect(createRunner(fakeHost(), SCRIPT_HANDLERS, { file, entry: 0 }).step()).toEqual({ kind: "blocked", request: { kind: "wild", species: 100, level: 23 } });
  });

  it("ScrCmd_708 (trap), ScrCmd_709 (alarm), ScrCmd_710 and ScrCmd_530 run on without a request or event", () => {
    const h = fakeHost();
    const file = makeScript([["ScrCmd_708", { arg0: 1 }], ["ScrCmd_709"], ["ScrCmd_710"], ["ScrCmd_530", { arg0: 0, arg1: 1 }], ["SetFlag", { flag: { flag: 202 } }], ["End"]]);
    expect(createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step().kind).toBe("done");
    expect(h.flags.has(202)).toBe(true);
    expect(h.events).toEqual([]);
  });

  it("MovePerson moves a person to (x, z), keeping its facing", () => {
    const moved: unknown[][] = [];
    const h = fakeHost({ movePerson: (...a: unknown[]) => void moved.push(a) });
    const file = makeScript([["MovePerson", { arg0: 1, arg1: 33, arg2: 5 }], ["End"]]);
    createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step();
    expect(moved).toEqual([[1, 33, 5]]);
  });
});
