import { describe, expect, it } from "vitest";
import { ModelFormatError, readModels } from "../../src/maps/nsbmd.ts";
import { displayList, triangleList, vtx16 } from "../fixtures/maps/build-gx.ts";
import { buildModel, type ModelSpec } from "../fixtures/maps/build-nitro.ts";

// Bytecode helpers: NODEDESC, MAT, SHP, POSSCALE, RET.
const NODE = (node: number) => [0x06, node, 0, 0];
const MAT = (id: number) => [0x04, id];
const SHP = (id: number) => [0x05, id];
const RET = [0x01];

const one = (spec: Partial<ModelSpec>) =>
  readModels(
    buildModel({
      name: "map21_12c",
      nodes: [{ name: "n" }],
      sbc: [...NODE(0), ...MAT(0), ...SHP(0), ...RET],
      materials: [{ name: "m" }],
      shapes: [triangleList([1, 0, 0], [0, 1, 0], [0, 0, 1])],
      ...spec,
    }),
  )[0]!;

const positions = (model: ReturnType<typeof one>) => model.meshes.flatMap((m) => m.triangles.map((t) => t.map((v) => v.position)));

describe("readModels", () => {
  it("reads the model name and draws each shape with its material", () => {
    const model = one({});
    expect(model.name).toBe("map21_12c");
    expect(model.meshes).toHaveLength(1);
    expect(model.meshes[0]!.material).toBe(0);
    expect(positions(model)).toEqual([[[1, 0, 0], [0, 1, 0], [0, 0, 1]]]);
  });

  it("applies the node translation", () => {
    const model = one({ nodes: [{ name: "n", translation: [2, 0, -1] }] });
    expect(positions(model)[0]![0]).toEqual([3, 0, -1]);
  });

  it("applies the node scale after the rotation", () => {
    const model = one({ nodes: [{ name: "n", scale: [2, 3, 4] }] });
    expect(positions(model)[0]).toEqual([[2, 0, 0], [0, 3, 0], [0, 0, 4]]);
  });

  it("applies a pivot-compressed rotation (90 degrees about y)", () => {
    const model = one({ nodes: [{ name: "n", pivot: { select: 4, neg: 2, a: 0, b: 1 } }] });
    expect(positions(model)[0]![0]!.map((v) => v + 0)).toEqual([0, 0, -1]);
  });

  it("scales positions by posScale on 0x0b and undoes it on 0x2b", () => {
    const sbc = [...NODE(0), 0x0b, ...MAT(0), ...SHP(0), 0x2b, ...SHP(1), ...RET];
    const model = one({ posScale: 16, sbc, shapes: [triangleList([0.5, 0, 0], [0, 0, 0], [0, 0, 0.5]), triangleList([1, 0, 0], [0, 0, 0], [0, 0, 1])] });
    expect(positions(model).map((t) => t[0])).toEqual([[8, 0, 0], [1, 0, 0]]);
  });

  it("stores the matrix with NODEDESC 0x26 and restores it with MTX or a display list restore", () => {
    const sbc = [0x26, 0, 0, 0, 5, ...NODE(1), ...MAT(0), 0x03, 5, ...SHP(0), ...NODE(1), ...SHP(1), ...RET];
    const restoring = displayList([[0x14, 5], [0x40, 0], vtx16(0, 0, 0), vtx16(1, 0, 0), vtx16(0, 1, 0), [0x41]]);
    const model = one({
      nodes: [{ name: "a", translation: [1, 0, 0] }, { name: "b", translation: [0, 0, 3] }],
      sbc,
      shapes: [triangleList([0, 0, 0], [1, 0, 0], [0, 1, 0]), restoring],
    });
    expect(positions(model).map((t) => t[0])).toEqual([[1, 0, 0], [1, 0, 0]]);
  });

  it("links materials to texture and palette names, with wrap and alpha", () => {
    const model = one({
      materials: [{ name: "m", texture: "en_fs_a", palette: "en_fs_a_pl", repeat: [true, false], flip: [false, true], alpha: 22 }],
    });
    expect(model.materials[0]).toMatchObject({
      name: "m",
      texture: "en_fs_a",
      palette: "en_fs_a_pl",
      repeat: [true, false],
      flip: [false, true],
      alpha: 22,
    });
  });

  it("leaves texture null when no texture is linked to the material", () => {
    expect(one({}).materials[0]).toMatchObject({ texture: null, palette: null });
  });

  it("reads the texture matrix, defaulting to identity", () => {
    expect(one({}).materials[0]!.texMatrix).toEqual({ scale: [1, 1], rotation: [0, 1], translation: [0, 0] });
    const model = one({ materials: [{ name: "m", texMatrix: { scale: [2, 0.5], rotation: [0.5, 0.75], translation: [0.25, 0] } }] });
    expect(model.materials[0]!.texMatrix).toEqual({ scale: [2, 0.5], rotation: [0.5, 0.75], translation: [0.25, 0] });
  });

  it("refuses an unknown bytecode instruction", () => {
    expect(() => one({ sbc: [...NODE(0), 0x1f, ...RET] })).toThrow(ModelFormatError);
  });

  it("refuses a shape or material the model does not have", () => {
    expect(() => one({ sbc: [...NODE(0), ...MAT(0), ...SHP(3), ...RET] })).toThrow(ModelFormatError);
    expect(() => one({ sbc: [...NODE(0), ...MAT(4), ...SHP(0), ...RET] })).toThrow(ModelFormatError);
  });
});
