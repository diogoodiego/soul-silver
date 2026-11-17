import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Block 034: Route 27 (map 31), the League's lobby (300) and the Hall of Fame (306). Synthetic scripts and host (principle II).

describe("block 034 commands", () => {
  it("ScrCmd_804 (Route 27, item 034.1) and ViewRankings (the League's rankings sign, item 034.3) run on without a request", () => {
    const h = fakeHost();
    const file = makeScript([["ScrCmd_804", { arg0: 1 }], ["ViewRankings", { arg0: 4, record: 0x8000 }], ["SetFlag", { flag: { flag: 360 } }], ["End"]]);
    expect(createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step().kind).toBe("done");
    expect(h.flags.has(360)).toBe(true);
    expect(h.events).toEqual([]);
  });

  it("HallOfFameAnim (item 034.4) records the party in the Hall of Fame", () => {
    let recorded = 0;
    const h = fakeHost({ recordHallOfFame: () => void recorded++ });
    const file = makeScript([["HallOfFameAnim", { num: 0x800c }], ["End"]]);
    expect(createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step().kind).toBe("done");
    expect(recorded).toBe(1);
  });

  it("HOFCredits (item 034.4) takes the player home, where a new game starts", () => {
    const h = fakeHost({ home: () => ({ map: 64, x: 6, z: 6, facing: 1 }) });
    const file = makeScript([["HOFCredits", { arg0: 0 }], ["End"]]);
    createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step();
    expect(h.warps).toEqual([{ map: 64, x: 6, z: 6, facing: 1 }]);
  });
});
