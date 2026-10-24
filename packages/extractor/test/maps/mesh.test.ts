import { describe, expect, it } from "vitest";
import { MESH_VERTEX_FLOATS } from "@soulsilver/shared/maps";
import { buildMapMesh } from "../../src/maps/mesh.ts";
import type { RgbaImage } from "../../src/maps/png.ts";
import type { SceneInput, SceneTriangle } from "../../src/maps/scene.ts";

const image = (w: number, h: number): RgbaImage => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });
const grass = image(8, 8);
const water = image(16, 4);
const water2 = image(16, 4);
water2.data[0] = 1;

function triangle(texture: RgbaImage, translation: [number, number] = [0, 0], alpha = 1): SceneTriangle {
  const v = (x: number, z: number) => ({ position: [x, 4, z] as [number, number, number], uv: [8, 4] as [number, number], color: [255, 0, 255] as [number, number, number] });
  return { vertices: [v(-256, -256), v(-240, -256), v(-256, -240)], sampler: { image: texture, repeat: [true, true], flip: [false, false] }, texMatrix: { scale: [1, 1], translation }, alpha };
}

const scene = (triangles: SceneTriangle[]): SceneInput => ({ width: 2, height: 1, origin: [-256, -256], levels: 2, ground: (x, _z, level) => x * 8 + level * 100, triangles });

describe("buildMapMesh", () => {
  it("writes vertices in pixels from the north-west corner, uv over the texture size, color 0 to 1", () => {
    const { vertices, file } = buildMapMesh(7, scene([triangle(grass)]));
    expect([...vertices.subarray(0, MESH_VERTEX_FLOATS)]).toEqual([0, 4, 0, 1, 0.5, 1, 0, 1]);
    expect(file).toMatchObject({ map: 7, width: 2, height: 1, textures: 1, groups: [{ frames: [{ texture: 0 }], first: 0, count: 3 }] });
  });

  it("lists the ground height of every tile on every level", () => {
    expect(buildMapMesh(0, scene([])).file.ground).toEqual([[0, 8], [100, 108]]);
  });

  it("groups triangles by texture state, sharing each image once", () => {
    const { file, textures } = buildMapMesh(0, scene([triangle(grass), triangle(water), triangle(grass), triangle(grass, [0, 0], 0.5)]));
    expect(textures).toEqual([grass, water]);
    expect(file.groups.map((g) => [g.frames[0]!.texture, g.alpha, g.first, g.count])).toEqual([[0, 1, 0, 6], [1, 1, 6, 3], [0, 0.5, 9, 3]]);
  });

  it("marks translucent the groups with alpha below 1 or texels that blend", () => {
    const shadow = image(1, 1);
    shadow.data.set([0, 0, 0, 128]);
    const { file } = buildMapMesh(0, scene([triangle(grass), triangle(grass, [0, 0], 0.5), triangle(shadow)]));
    expect(file.groups.map((g) => g.translucent)).toEqual([false, true, true]);
  });

  it("shares an image by content, so a scene decoded again does not look animated", () => {
    const t = triangle(grass);
    const { file, textures } = buildMapMesh(0, scene([{ ...t, frames: [triangle(image(8, 8))] }]));
    expect([textures.length, file.groups[0]!.frames.length]).toEqual([1, 1]);
  });

  it("gives frames only to triangles that change across the cycle", () => {
    const flowing = [triangle(water), triangle(water2, [0, 0.5])];
    const { file } = buildMapMesh(0, scene([{ ...triangle(grass), frames: [triangle(grass), triangle(grass)] }, { ...triangle(water), frames: flowing }]));
    expect(file.groups.map((g) => g.frames.map((f) => [f.texture, f.translate[1]]))).toEqual([[[0, 0]], [[1, 0], [2, 0.5]]]);
  });
});
