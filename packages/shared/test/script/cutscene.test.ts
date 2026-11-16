import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

const run = (lines: Parameters<typeof makeScript>[0], movements: Record<string, { action: string; count: number }[]>) => {
  const runner = createRunner(fakeHost(), SCRIPT_HANDLERS, { file: makeScript(lines, { movements }), entry: 0 });
  return { runner, state: runner.step() };
};
const apply = (actor: number) => ["ApplyMovement", { arg0: actor, movement: { movement: "M1" } }] as [string, Record<string, unknown>];

describe("cutscene commands (spec 021)", () => {
  it("ApplyMovement turns the movement list into steps for that actor", () => {
    const { state } = run([apply(3), ["WaitMovement"], ["End"]], {
      M1: [
        { action: "WalkNormalNorth", count: 2 },
        { action: "FaceEast", count: 1 },
        { action: "Delay8", count: 3 },
        { action: "JumpNearFastWest", count: 1 },
        { action: "SetInvisible", count: 1 },
        { action: "SetVisible", count: 1 },
        { action: "EmoteExclamationMark", count: 1 },
      ],
    });
    const actor = { person: 3 };
    expect(state).toEqual({
      kind: "blocked",
      request: {
        kind: "cutscene",
        actors: [actor],
        steps: [
          { kind: "walk", actor, dir: "north", count: 2 },
          { kind: "face", actor, dir: "east" },
          { kind: "wait", ticks: 16 },
          { kind: "jump", actor, dir: "west", count: 1 },
          { kind: "hide", actor },
          { kind: "show", actor },
        ],
      },
    });
  });

  it("names the player and the companion", () => {
    const steps = (actor: number) => (run([apply(actor), ["End"]], { M1: [{ action: "FaceSouth", count: 1 }] }).state as { request: { actors: unknown[] } }).request.actors;
    expect(steps(255)).toEqual(["player"]);
    expect(steps(253)).toEqual(["companion"]);
  });

  it("goes on once the client answers; WaitMovement has nothing left to wait for", () => {
    const { runner } = run([apply(1), ["WaitMovement"], ["End"]], { M1: [{ action: "WalkFastSouth", count: 1 }] });
    expect(runner.resume()).toEqual({ kind: "done" });
  });

  it("an unknown movement action ends the script as missing", () => {
    expect(run([apply(1), ["End"]], { M1: [{ action: "MoveAction_999", count: 1 }] }).state).toMatchObject({ kind: "missing", command: "ApplyMovement" });
  });

  it("ScreenShake becomes a camera step", () => {
    const { state } = run([["ScreenShake", { arg0: 2, arg1: 2, arg2: 30, arg3: 0 }], ["End"]], {});
    expect(state).toEqual({ kind: "blocked", request: { kind: "cutscene", actors: [], steps: [{ kind: "camera-shake", amplitude: 2, ticks: 20 }] } });
  });
});

describe("follower commands (spec 021)", () => {
  it("run without ending the script, and the party index is the lead", () => {
    const host = fakeHost({ party: [{ species: 1, level: 5, hp: 0 }, { species: 4, level: 5, hp: 10 }] });
    const lines: Parameters<typeof makeScript>[0] = [
      ["ToggleFollowingPokemonMovement", { flag: { flag: 1 } }],
      ["FollowingPokemonMovement", { movement: 48 }],
      ["WaitFollowingPokemonMovement"],
      // Spec 024: placing the follower beside the player after the starter scene.
      ["ScrCmd_605", { arg0: 3, arg1: 2 }],
      ["ScrCmd_608"],
      ["ScrCmd_609"],
      ["FollowerPokeIsEventTrigger", { arg0: 1, arg1: 0, arg2: 0x4001 }],
      ["GetFollowPokePartyIndex", { arg0: { variable: 0x4002 } }],
      ["End"],
    ];
    host.vars.set(0x4001, 9);
    expect(createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 }).step()).toEqual({ kind: "done" });
    expect([host.vars.get(0x4001), host.vars.get(0x4002)]).toEqual([0, 1]);
  });

  it("ScrCmd_609 runs and FadeOutBGM stops the music (spec 022, rival in Cherrygrove)", () => {
    const host = fakeHost();
    const lines: Parameters<typeof makeScript>[0] = [["ScrCmd_609"], ["FadeOutBGM", { target: 0, frames: 10 }], ["End"]];
    expect(createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 }).step()).toEqual({ kind: "done" });
    expect(host.events).toEqual([{ kind: "bgm", id: null }]);
  });

  it("WarpOut hides and WarpIn shows", () => {
    const { state } = run([apply(2), ["End"]], { M1: [{ action: "WarpOut", count: 1 }, { action: "WarpIn", count: 1 }] });
    expect((state as { request: { steps: { kind: string }[] } }).request.steps.map((s) => s.kind)).toEqual(["hide", "show"]);
  });
});
