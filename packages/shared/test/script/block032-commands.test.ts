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
