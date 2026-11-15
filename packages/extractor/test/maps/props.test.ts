import { describe, expect, it } from "vitest";
import { readModels } from "../../src/maps/nsbmd.ts";
import { buildPropMesh, posePatterns } from "../../src/maps/props.ts";
import { readTextureSet } from "../../src/maps/texture.ts";
import { texcoord, displayList, vtx16 } from "../fixtures/maps/build-gx.ts";
import { buildModel, buildTex0 } from "../fixtures/maps/build-nitro.ts";

// Spec 024: a building model a script places at run time (the starter balls), drawn on its own.

const textures = readTextureSet(buildTex0([{ name: "ball", format: 3, width: 8, height: 8, texels: new Uint8Array(32) }], [{ name: "ball_pl", colors: [0x001f] }]), 0);
const ball = readModels(
  buildModel({
    name: "b",
    nodes: [{ name: "n" }],
    sbc: [0x06, 0, 0, 0, 0x04, 0, 0x05, 0, 0x01],
    materials: [{ name: "m", texture: "ball" }],
    shapes: [displayList([[0x40, 0], texcoord(1, 1), vtx16(1, 2, 0), texcoord(1, 1), vtx16(0, 0, 0), texcoord(1, 1), vtx16(0, 2, 0), [0x41]])],
  }),
);

describe("buildPropMesh", () => {
  it("keeps the model's own coordinates, its origin at 0, in pixels", () => {
    const { mesh, warnings } = buildPropMesh(0x8d, (id) => (id === 0x8d ? { models: ball, textures } : undefined), textures);
    expect(warnings).toEqual([]);
    expect(mesh.file.map).toBe(0x8d);
    // x, y, z of each vertex; one world unit is one pixel.
    const stride = mesh.vertices.length / 3;
    const positions = [0, 1, 2].map((i) => [...mesh.vertices.subarray(i * stride, i * stride + 3)]);
    expect(positions).toEqual([[1, 2, 0], [0, 0, 0], [0, 2, 0]]);
  });

  it("warns when the archive has no such model", () => {
    expect(buildPropMesh(7, () => undefined, textures).warnings).toEqual([{ code: "missing-model", detail: "7" }]);
  });
});

// Spec 030.5: a building shown in an animation pose (the Azalea Gym's ropes and levers).
describe("posed buildings", () => {
  const bytes = buildModel({
    name: "b",
    nodes: [{ name: "n" }],
    sbc: [0x06, 0, 0, 0, 0x04, 0, 0x05, 0, 0x01],
    materials: [{ name: "m", texture: "ball" }],
    shapes: [displayList([[0x40, 0], texcoord(1, 1), vtx16(1, 2, 0), texcoord(1, 1), vtx16(0, 0, 0), texcoord(1, 1), vtx16(0, 2, 0), [0x41]])],
  });

  it("a joint pose that scales a node to nothing hides what it draws", () => {
    const hidden = readModels(bytes, new Map([[0, [0, 0, 0, 0, 0, 0, 0, -9, 0, 0, 0, 0]]]));
    const points = hidden[0]!.meshes.flatMap((m) => m.triangles.flat().map((v) => v.position));
    expect(points.every(([x, , z]) => x === 0 && z === 0)).toBe(true);
    expect(readModels(bytes)[0]!.meshes.flatMap((m) => m.triangles.flat()).some((v) => v.position[0] !== 0)).toBe(true);
  });

  it("a texture pattern pose shows each animated material at its last key", () => {
    const pattern = { type: "pattern" as const, material: "m", duration: 2, textures: ["off", "on"], palettes: ["off_pl", "on_pl"], keys: [{ frame: 0, texture: 0, palette: 0 }, { frame: 1, texture: 1, palette: 1 }] };
    const [posed] = posePatterns(readModels(bytes), [pattern]);
    expect(posed!.materials[0]).toMatchObject({ name: "m", texture: "on", palette: "on_pl" });
  });
});
