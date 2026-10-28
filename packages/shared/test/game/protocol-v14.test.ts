import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 021, contracts/protocol-v14.md: the cutscene a script asks one client to stage.

const cutscene = (steps: unknown[], actors: unknown[] = [{ person: 3 }, "player"]) => ({ type: "script", id: 9, request: { kind: "cutscene", actors, steps } });

describe("protocol v14", () => {
  it("is at least version 14", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(14);
  });

  it.each([
    { kind: "walk", actor: "player", dir: "north", count: 3 },
    { kind: "face", actor: { person: 3 }, dir: "west" },
    { kind: "wait", ticks: 8 },
    { kind: "jump", actor: "companion", dir: "south", count: 1 },
    { kind: "show", actor: { person: 3 } },
    { kind: "hide", actor: { person: 3 } },
    { kind: "camera-move", x: 160, y: 96, ticks: 20 },
    { kind: "camera-lock", actor: { person: 3 } },
    { kind: "camera-release" },
    { kind: "camera-shake", amplitude: 4, ticks: 10 },
  ])("accepts the step %j", (step) => {
    expect(serverMessage.safeParse(cutscene([step])).success).toBe(true);
  });

  it.each([
    ["an unknown step", { kind: "dance" }],
    ["a negative count", { kind: "walk", actor: "player", dir: "north", count: -1 }],
    ["a direction that does not exist", { kind: "face", actor: "player", dir: "up" }],
    ["an actor that is neither a person nor player/companion", { kind: "show", actor: "rival" }],
  ])("refuses %s", (_, step) => {
    expect(serverMessage.safeParse(cutscene([step])).success).toBe(false);
  });

  it("refuses an actor outside the four kinds", () => {
    expect(serverMessage.safeParse(cutscene([], ["rival"])).success).toBe(false);
  });
});
