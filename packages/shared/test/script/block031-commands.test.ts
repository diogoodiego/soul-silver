import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { movementSteps } from "../../src/script/handlers/cutscene.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Item 031.1: the commands the Burned Tower B1F's beasts scene lacked. Synthetic scripts and host (principle II).

describe("block 031 commands (item 031.1)", () => {
  it("ScrCmd_523 (a beast's cry animation) runs without ending the script; CreateRoamer gives the host each roamer (item 031.2)", () => {
    const h = fakeHost();
    const roamers: number[] = [];
    h.createRoamer = (id) => void roamers.push(id);
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
    expect(roamers).toEqual([0, 1]);
  });

  it("the lighthouse elevator (item 031.5): the floor of where the player came from, then the other floor as the way out", () => {
    for (const [from, floor, to] of [
      [115, 0, 225],
      [225, 1, 115],
    ] as const) {
      const h = fakeHost();
      const set: number[][] = [];
      h.dynamicWarpMap = () => from;
      h.setDynamicWarp = (map, anchor) => void set.push([map, anchor]);
      // The shape of the lighthouse elevator's script (scr_seq 67): floor 0 goes up to 6F, floor 1 down to 1F.
      const file = makeScript([
        ["GetDynamicWarpFloorNo", { arg0: 16659 }],
        ["CompareVarToValue", { var: { variable: 16659 }, val: 0 }],
        ["GoToIf", { condition: 1, dest: { label: "L2" } }],
        ["SetDynamicWarp", { arg0: 115, arg1: 1, arg2: 5, arg3: 3, arg4: 1 }],
        ["GoTo", { dest: { label: "L3" } }],
        "L2:",
        ["SetDynamicWarp", { arg0: 225, arg1: 1, arg2: 5, arg3: 3, arg4: 1 }],
        "L3:",
        ["ElevatorAnim", { direction: 32772, distance: 5 }],
        ["MakeObjectVisible", { arg0: 255 }],
        ["ScrCmd_374", { arg0: 255 }],
        ["ScrCmd_459"],
        ["End"],
      ]);
      const runner = createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 });
      expect(runner.step()).toMatchObject({ kind: "blocked", request: { kind: "wait" } });
      expect(runner.resume().kind).toBe("done");
      expect(h.vars.get(16659)).toBe(floor);
      expect(set).toEqual([[to, 1]]);
    }
  });

  it("the beasts' leaps (MoveAction_105 to 110) and Suicune's (111, 112, item 031.2) play as looks only: the steps after them stay", () => {
    for (let n = 105; n <= 112; n++) {
      const steps = movementSteps({ person: 2 }, [{ action: `MoveAction_${n}`, count: 1 }, { action: "SetInvisible", count: 1 }]);
      expect(steps).toEqual([{ kind: "hide", actor: { person: 2 } }]);
    }
  });
});
