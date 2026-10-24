import { describe, expect, it } from "vitest";
import { AnimationFormatError, readAnimations } from "../../src/maps/animation.ts";
import { ByteWriter } from "../fixtures/byte-writer.ts";
import { patternAnimation, patternFile, rotation, scrollAnimation, scrollFile, type TrackSpec } from "../fixtures/maps/build-animation.ts";

const one: TrackSpec = { kind: "const", value: 0x1000 };
const zero: TrackSpec = { kind: "const", value: 0 };
const still = { kind: "const", value: rotation(0, 1) } as const;

describe("readAnimations (texture scroll, BTA0)", () => {
  it("reads constant tracks and per-frame s16 keyframes in 4.12 fixed point", () => {
    const water = scrollAnimation(4, [{ name: "en_sp1_3", tracks: [one, one, still, zero, { kind: "s16", values: [0, -0.25, -0.5, -0.75] }] }]);
    expect(readAnimations(scrollFile(["en_sp1"], [water]))).toEqual([
      {
        type: "scroll",
        material: "en_sp1_3",
        duration: 4,
        scaleS: { constant: 1 },
        scaleT: { constant: 1 },
        rotation: { constant: [0, 1] },
        translateS: { constant: 0 },
        translateT: { values: [0, -0.25, -0.5, -0.75] },
      },
    ]);
  });

  it("reads s32 keyframes, and rotation keyframes as a (sin, cos) pair per frame", () => {
    const anim = scrollAnimation(2, [
      { name: "m", tracks: [one, one, { kind: "s32", values: [1 / 4096, 1] }, { kind: "s32", values: [0, 0.5] }, zero] },
    ]);
    const [entry] = readAnimations(scrollFile(["a"], [anim]));
    expect(entry).toMatchObject({ translateS: { values: [0, 0.5] }, translateT: { constant: 0 }, rotation: { values: [[1 / 4096, 0], [1, 0]] } });
  });

  it("returns one entry per material, across animations, in file order", () => {
    const a = scrollAnimation(1, [{ name: "x", tracks: [one, one, still, zero, zero] }, { name: "y", tracks: [one, one, still, zero, zero] }]);
    const b = scrollAnimation(1, [{ name: "z", tracks: [one, one, still, zero, zero] }]);
    expect(readAnimations(scrollFile(["a", "b"], [a, b])).map((e) => e.material)).toEqual(["x", "y", "z"]);
  });

  it("refuses keyframes that run past the file", () => {
    const anim = scrollAnimation(3, [{ name: "m", tracks: [one, one, still, zero, { kind: "s16", values: [0, 1, 2] }] }]);
    const file = scrollFile(["a"], [anim]);
    expect(() => readAnimations(file.subarray(0, file.length - 2))).toThrow(AnimationFormatError);
  });

  it("refuses a track whose frame count differs from the animation's duration", () => {
    const anim = scrollAnimation(5, [{ name: "m", tracks: [one, one, still, zero, { kind: "s16", values: [0, 1, 2] }] }]);
    expect(() => readAnimations(scrollFile(["a"], [anim]))).toThrow(/m.*3.*5/);
  });
});

describe("readAnimations (texture pattern, BTP0)", () => {
  it("reads keyframes as frame, texture name and palette name", () => {
    const monitor = patternAnimation(8, ["pc.1", "pc.2"], ["pc.1_pl", "pc.2_pl"], [{ name: "pc_moni", keys: [[0, 0, 0], [4, 1, 1]] }]);
    expect(readAnimations(patternFile(["pc_mb"], [monitor]))).toEqual([
      {
        type: "pattern",
        material: "pc_moni",
        duration: 8,
        textures: ["pc.1", "pc.2"],
        palettes: ["pc.1_pl", "pc.2_pl"],
        keys: [{ frame: 0, texture: 0, palette: 0 }, { frame: 4, texture: 1, palette: 1 }],
      },
    ]);
  });

  it("refuses a keyframe pointing at a texture the animation does not list", () => {
    const anim = patternAnimation(4, ["a"], ["a_pl"], [{ name: "m", keys: [[0, 0, 0], [2, 3, 0]] }]);
    expect(() => readAnimations(patternFile(["x"], [anim]))).toThrow(/texture 3/);
  });

  it("refuses keyframes whose frames do not increase", () => {
    const anim = patternAnimation(4, ["a"], ["a_pl"], [{ name: "m", keys: [[2, 0, 0], [2, 0, 0]] }]);
    expect(() => readAnimations(patternFile(["x"], [anim]))).toThrow(/crescer/);
  });
});

describe("readAnimations (other files)", () => {
  it("ignores animations that do not touch textures", () => {
    expect(readAnimations(new ByteWriter().ascii("BCA0").u32(0).u32(0).u32(0).toBytes())).toEqual([]);
  });
});
