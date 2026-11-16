import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { movementSteps } from "../../src/script/handlers/cutscene.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Item 031.1: the commands the Burned Tower B1F's beasts scene lacked. Synthetic scripts and host (principle II).

describe("block 031 commands (item 031.1)", () => {
  it("ScrCmd_523 (a beast's cry animation) and CreateRoamer run without ending the script", () => {
    const h = fakeHost();
    const file = makeScript([
      ["ScrCmd_523", { arg0: 2, arg1: 2, arg2: 90, arg3: 2, arg4: 0 }],
      ["CreateRoamer", { arg0: 0 }],
      ["CreateRoamer", { arg0: 1 }],
      ["SetFlag", { flag: { flag: 457 } }],
      ["End"],
    ]);
    const state = createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step();
    expect(state.kind).toBe("done");
    expect(h.flags.has(457)).toBe(true);
  });

  it("the beasts' leaps (MoveAction_105 to 110) play as looks only: the steps after them stay", () => {
    for (let n = 105; n <= 110; n++) {
      const steps = movementSteps({ person: 2 }, [{ action: `MoveAction_${n}`, count: 1 }, { action: "SetInvisible", count: 1 }]);
      expect(steps).toEqual([{ kind: "hide", actor: { person: 2 } }]);
    }
  });
});
