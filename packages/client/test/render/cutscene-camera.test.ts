import { describe, expect, it } from "vitest";
import type { CutsceneStep } from "@soulsilver/shared/game";
import { clampCamera } from "../../src/render/camera";
import { stage, WALK_MS_PER_TILE, type Pose } from "../../src/render/cutscene";

const at = (x: number, y: number): Pose => ({ x, y, facing: "south", visible: true, moving: false });
const start = new Map([
  ["player", at(0, 0)],
  ["p1", at(100, 0)],
]);
const run = (steps: CutsceneStep[], ms: number) => stage(steps, start, ms);

describe("cutscene staging (spec 021)", () => {
  it("walks an actor tile by tile and ends", () => {
    const steps: CutsceneStep[] = [{ kind: "walk", actor: { person: 1 }, dir: "east", count: 2 }];
    expect(run(steps, WALK_MS_PER_TILE).poses.get("p1")).toMatchObject({ x: 116, facing: "east", moving: true });
    const end = run(steps, 10_000);
    expect([end.poses.get("p1")!.x, end.done]).toEqual([132, true]);
  });

  it("moving the camera interpolates to the target in the time asked", () => {
    const steps: CutsceneStep[] = [{ kind: "camera-move", x: 200, y: 40, ticks: 10 }];
    expect(run(steps, 250).focus).toEqual({ x: 100, y: 20 });
    expect(run(steps, 500).focus).toEqual({ x: 200, y: 40 });
  });

  it("locking follows the target and releasing comes back to the player", () => {
    const locked: CutsceneStep[] = [{ kind: "camera-lock", actor: { person: 1 } }, { kind: "walk", actor: { person: 1 }, dir: "south", count: 1 }];
    expect(run(locked, 10_000).focus).toEqual({ x: 100, y: 16 });
    expect(run([...locked, { kind: "camera-release" }], 10_000).focus).toEqual({ x: 0, y: 0 });
  });

  it("shaking decays to nothing", () => {
    const steps: CutsceneStep[] = [{ kind: "camera-shake", amplitude: 4, ticks: 20 }];
    expect(Math.abs(run(steps, 30).focus.x)).toBeGreaterThan(0);
    expect(run(steps, 1000).focus).toEqual({ x: 0, y: 0 });
  });

  it("a moved focus still stays within the map bounds", () => {
    const focus = run([{ kind: "camera-move", x: -500, y: -500, ticks: 1 }], 1000).focus;
    expect(clampCamera(focus.x, focus.y, { left: 0, top: 0, right: 512, bottom: 512 })).toEqual({ x: 0, y: 0 });
  });

  it("hide and show change visibility; a wait holds the scene", () => {
    const steps: CutsceneStep[] = [{ kind: "hide", actor: { person: 1 } }, { kind: "wait", ticks: 4 }];
    expect(run(steps, 100)).toMatchObject({ done: false });
    expect(run(steps, 200).poses.get("p1")!.visible).toBe(false);
  });
});
