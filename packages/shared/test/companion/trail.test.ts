import { describe, expect, it } from "vitest";
import { behind, poseAt, pushPose, type Pose } from "../../src/companion/trail.ts";

const at = (x: number, y: number, extra: Partial<Pose> = {}): Pose => ({ area: "1", x, y, level: 0, facing: "east", hop: 0, ...extra });
const walk = (trail: Pose[], from: number, to: number, y = 0, keep = 64) => {
  for (let x = from; x <= to; x += 3) pushPose(trail, at(x, y), keep);
};

describe("trail", () => {
  it("keeps the companion the given distance behind along the path", () => {
    const trail: Pose[] = [];
    walk(trail, 0, 60);
    const p = poseAt(trail, 16)!;
    expect(p.x).toBeCloseTo(60 - 16);
    expect(p.facing).toBe("east");
  });

  it("follows corners instead of cutting them", () => {
    const trail: Pose[] = [];
    walk(trail, 0, 30);
    for (let y = 3; y <= 9; y += 3) pushPose(trail, at(30, y, { facing: "south" }), 64);
    const p = poseAt(trail, 16)!;
    // 9 px down the turn plus 7 px back along the row: on the row, not the diagonal.
    expect(p).toMatchObject({ x: 23, y: 0, facing: "east" });
  });

  it("does not move while the trainer stands still or only turns", () => {
    const trail: Pose[] = [];
    walk(trail, 0, 60);
    const before = poseAt(trail, 16);
    pushPose(trail, at(60, 0, { facing: "north" }), 64);
    expect(poseAt(trail, 16)).toEqual(before);
  });

  it("only ever visits points the trainer walked", () => {
    const trail: Pose[] = [];
    walk(trail, 0, 90);
    for (let back = 0; back <= 60; back += 5) expect(poseAt(trail, back)!.y).toBe(0);
  });

  it("carries the hop counter, so the companion hops the ledge where the trainer did", () => {
    const trail: Pose[] = [];
    walk(trail, 0, 30);
    for (let i = 1; i <= 4; i++) pushPose(trail, at(30 + 4 * i, 0, { hop: 7 - i }), 64);
    walk(trail, 49, 60);
    expect(poseAt(trail, 16)!.hop).toBeGreaterThan(0);
  });

  it("starts over on another map", () => {
    const trail: Pose[] = [];
    walk(trail, 0, 60);
    pushPose(trail, at(5, 5, { area: "2" }), 64);
    expect(trail).toHaveLength(1);
    expect(poseAt(trail, 16)).toBeUndefined();
  });

  it("forgets what lies past the kept length", () => {
    const trail: Pose[] = [];
    walk(trail, 0, 300, 0, 32);
    expect(trail[0]!.x).toBeGreaterThanOrEqual(300 - 32 - 3);
  });
});

describe("behind", () => {
  it("is the given distance opposite the facing", () => {
    expect(behind(at(50, 50, { facing: "north" }), 16, () => true)).toMatchObject({ x: 50, y: 66, facing: "north" });
  });

  it("falls back to the trainer's own spot when that is blocked", () => {
    expect(behind(at(50, 50), 16, () => false)).toMatchObject({ x: 50, y: 50 });
  });
});
