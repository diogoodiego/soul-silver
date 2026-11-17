import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Item 033.1: the Radio Tower takeover's commands (maps 112, 199, 200). Synthetic scripts and host (principle II).

describe("Whirl Islands commands (item 033.7)", () => {
  it("ShowLegendaryWing, the Tidal Bell and Lugia's arrival scene (maps 243, 244) run on without a request or event", () => {
    const h = fakeHost();
    const looks = [
      ["ShowLegendaryWing", { arg0: 1 }],
      ["ScrCmd_805"],
      ["LegendCutsceneClearBellAnimBegin"],
      ["LegendCutsceneClearBellRiseFromBag"],
      ["LegendCutsceneClearBellShimmer", { arg0: 1 }],
      ["LegendCutsceneWavesOrLeavesEffectBegin"],
      ["LegendCutsceneWavesOrLeavesEffectEnd"],
      ["LegendCutscenePanCameraTo", { arg0: 0 }],
      ["LegendCutsceneWaitCameraPan"],
      ["LegendCutsceneMoveCameraTo", { arg0: 1 }],
      ["LegendCutsceneLugiaEyeGlimmerEffect"],
      ["LegendCutsceneClearBellAnimEnd"],
      ["Cinematic", { arg0: 1 }],
      ["LegendCutsceneLugiaArrivesEffectBegin"],
      ["LegendCutsceneBirdFinalApproach"],
      ["LegendCutsceneLugiaArrivesEffectCameraPan"],
      ["LegendCutsceneLugiaArrivesEffectEnd"],
      ["ProcessSoundplate"],
    ] as const;
    const file = makeScript([...looks, ["SetFlag", { flag: { flag: 267 } }], ["End"]] as never);
    expect(createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step().kind).toBe("done");
    expect(h.flags.has(267)).toBe(true);
    expect(h.events).toEqual([]);
  });
});

describe("Radio Tower commands (item 033.1)", () => {
  it("RocketCostumeFlagAction (the disguise) and ScrCmd_109 (a person's movement type) run on without a request or event", () => {
    const h = fakeHost();
    const file = makeScript([["RocketCostumeFlagAction", { arg0: 1 }], ["ScrCmd_109", { arg0: 0, arg1: 9 }], ["RocketCostumeFlagAction", { arg0: 0 }], ["SetFlag", { flag: { flag: 150 } }], ["End"]]);
    expect(createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step().kind).toBe("done");
    expect(h.flags.has(150)).toBe(true);
    expect(h.events).toEqual([]);
  });

  it("ScrCmd_622 writes the person's facing (0 north, 1 south) into the variable", () => {
    const h = fakeHost({ personPosition: (id: number) => (id === 4 ? { x: 5, z: 16, facing: 1 } : undefined) });
    const file = makeScript([["ScrCmd_622", { arg0: 4, arg1: 0x4000 }], ["ScrCmd_622", { arg0: 9, arg1: 0x4001 }], ["End"]]);
    createRunner(h, SCRIPT_HANDLERS, { file, entry: 0 }).step();
    expect(h.vars.get(0x4000)).toBe(1);
    // Not on the map: 255, as GetPersonCoords.
    expect(h.vars.get(0x4001)).toBe(255);
  });
});
