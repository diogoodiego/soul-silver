import { describe, expect, it } from "vitest";
import type { MapAnimation } from "@soulsilver/shared/maps";
import { readModels } from "../../src/maps/nsbmd.ts";
import { readPiece } from "../../src/maps/piece.ts";
import { buildMapScene, type BuildingSource } from "../../src/maps/scene.ts";
import { readTextureSet } from "../../src/maps/texture.ts";
import { texcoord, displayList, vtx16 } from "../fixtures/maps/build-gx.ts";
import { buildLand, FLAT_GROUND } from "../fixtures/maps/build-land.ts";
import { buildModel, buildTex0, type MaterialSpec } from "../fixtures/maps/build-nitro.ts";

const GREEN = 0x03e0;
const BLUE = 0x7c00;

/** Model with one triangle at the given model-space vertices and one material. */
function model(material: MaterialSpec, ...vertices: [number, number, number][]) {
  return buildModel({
    name: "m",
    nodes: [{ name: "n" }],
    sbc: [0x06, 0, 0, 0, 0x04, 0, 0x05, 0, 0x01],
    materials: [material],
    shapes: [displayList([[0x40, 0], ...vertices.flatMap((v) => [texcoord(1, 1), vtx16(...v)]), [0x41]])],
  });
}

const textures = (name: string, color: number) =>
  readTextureSet(buildTex0([{ name, format: 3, width: 8, height: 8, texels: new Uint8Array(32) }], [{ name: `${name}_pl`, colors: [color] }]), 0);

const area = textures("ground", GREEN);
const noBuildings: BuildingSource = () => {
  throw new Error("no buildings expected");
};

describe("buildMapScene", () => {
  it("lays out the map over its cells, in tiles, with the piece models offset by cell", () => {
    const land = buildLand({ model: model({ name: "g", texture: "ground" }, [-1, 0, -1], [1, 0, -1], [1, 0, 1]) });
    const { input } = buildMapScene({
      cells: [{ x: 3, z: 7, piece: readPiece(land) }, { x: 4, z: 7, piece: readPiece(land) }],
      areaTextures: area,
      buildings: noBuildings,
      animated: new Set(),
    });
    expect([input.width, input.height]).toEqual([64, 32]);
    expect(input.origin).toEqual([3 * 512 - 256, 7 * 512 - 256]);
    expect(input.triangles.map((t) => t.vertices[0].position)).toEqual([[3 * 512 - 1, 0, 7 * 512 - 1], [4 * 512 - 1, 0, 7 * 512 - 1]]);
    expect(input.triangles[0]!.sampler.image.data.subarray(0, 4)).toEqual(new Uint8Array([0, 255, 0, 255]));
  });

  it("places buildings at their position and scale, preferring the building's own textures", () => {
    const roof = textures("ground", BLUE);
    const building = readModels(model({ name: "r", texture: "ground" }, [1, 1, 0], [0, 0, 0], [0, 1, 0]));
    const land = buildLand({ buildings: [{ model: 21, position: [-24, 16, -128], scale: [2, 2, 2] }] });
    const { input } = buildMapScene({
      cells: [{ x: 0, z: 0, piece: readPiece(land) }],
      areaTextures: area,
      buildings: (id) => (id === 21 ? { models: building, textures: roof } : undefined),
      animated: new Set(),
    });
    expect(input.triangles[0]!.vertices[0].position).toEqual([-22, 18, -128]);
    expect(input.triangles[0]!.sampler.image.data.subarray(0, 4)).toEqual(new Uint8Array([0, 0, 255, 255]));
  });

  it("applies material alpha and the texture matrix to the texture coordinates", () => {
    const land = buildLand({ model: model({ name: "g", texture: "ground", alpha: 15, texMatrix: { scale: [2, 1], translation: [0.5, 0] } }, [0, 0, 0], [1, 0, 0], [0, 0, 1]) });
    const { input } = buildMapScene({ cells: [{ x: 0, z: 0, piece: readPiece(land) }], areaTextures: area, buildings: noBuildings, animated: new Set() });
    expect(input.triangles[0]!.alpha).toBeCloseTo(15 / 31);
    expect(input.triangles[0]!.vertices[0].uv).toEqual([1 * 2 + 0.5 * 8, 1]);
  });

  it("reports animated materials: no linked texture, or animated by the ROM's animations", () => {
    const land = buildLand({ model: model({ name: "ground" }, [0, 0, 0], [1, 0, 0], [0, 0, 1]) });
    const scene = buildMapScene({ cells: [{ x: 0, z: 0, piece: readPiece(land) }], areaTextures: area, buildings: noBuildings, animated: new Set() });
    expect(scene.warnings).toEqual([{ code: "animated-texture", detail: "ground" }]);
    expect(scene.input.triangles).toHaveLength(1);

    const scrolling = buildLand({ model: model({ name: "wind_lm3", texture: "ground" }, [0, 0, 0], [1, 0, 0], [0, 0, 1]) });
    const wind = buildMapScene({ cells: [{ x: 0, z: 0, piece: readPiece(scrolling) }], areaTextures: area, buildings: noBuildings, animated: new Set(["wind_lm3"]) });
    expect(wind.warnings).toEqual([{ code: "animated-texture", detail: "wind_lm3" }]);
  });

  it("draws an untextured material (no texture of its name anywhere) in plain white, without a warning", () => {
    const land = buildLand({ model: model({ name: "shade" }, [0, 0, 0], [1, 0, 0], [0, 0, 1]) });
    const scene = buildMapScene({ cells: [{ x: 0, z: 0, piece: readPiece(land) }], areaTextures: area, buildings: noBuildings, animated: new Set() });
    expect(scene.warnings).toEqual([]);
    expect(scene.input.triangles[0]!.sampler.image.data.subarray(0, 4)).toEqual(new Uint8Array([255, 255, 255, 255]));
  });

  it("does not spread every tile into one call, so large maps do not overflow the stack", () => {
    const cells = Array.from({ length: 2000 }, (_, i) => ({ x: i % 50, z: Math.floor(i / 50), piece: readPiece(buildLand()) }));
    expect(() => buildMapScene({ cells, areaTextures: area, buildings: noBuildings, animated: new Set() })).not.toThrow();
  });

  it("returns the names of the materials the map draws", () => {
    const land = buildLand({ model: model({ name: "g", texture: "ground" }, [0, 0, 0], [1, 0, 0], [0, 0, 1]) });
    const scene = buildMapScene({ cells: [{ x: 0, z: 0, piece: readPiece(land) }], areaTextures: area, buildings: noBuildings, animated: new Set() });
    expect([...scene.materials]).toEqual(["g"]);
  });

  it("reports a texture found nowhere, drawing it in a visible placeholder color", () => {
    const land = buildLand({ model: model({ name: "g", texture: "nowhere" }, [0, 0, 0], [1, 0, 0], [0, 0, 1]) });
    const scene = buildMapScene({ cells: [{ x: 0, z: 0, piece: readPiece(land) }], areaTextures: area, buildings: noBuildings, animated: new Set() });
    expect(scene.warnings).toEqual([{ code: "missing-texture", detail: "nowhere" }]);
    expect(scene.input.triangles[0]!.sampler.image.data.subarray(0, 4)).toEqual(new Uint8Array([255, 0, 255, 255]));
  });

  it("reports a building model the ROM does not have, and skips it", () => {
    const land = buildLand({ buildings: [{ model: 999, position: [0, 0, 0] }] });
    const scene = buildMapScene({ cells: [{ x: 0, z: 0, piece: readPiece(land) }], areaTextures: area, buildings: () => undefined, animated: new Set() });
    expect(scene.warnings).toEqual([{ code: "missing-model", detail: "999" }]);
  });

  it("gives one level per surface and the ground of each tile on each level", () => {
    const bridge = { from: [-256, -256], to: [-240, 256], normal: [0, 1, 0], d: -32 } as const;
    const land = buildLand({ plates: [FLAT_GROUND, { from: [...bridge.from], to: [...bridge.to], normal: [...bridge.normal], d: bridge.d }] });
    const { input } = buildMapScene({ cells: [{ x: 0, z: 0, piece: readPiece(land) }], areaTextures: area, buildings: noBuildings, animated: new Set() });
    expect(input.levels).toBe(2);
    expect([input.ground(0, 5, 0), input.ground(0, 5, 1), input.ground(1, 5, 1)]).toEqual([0, 32, 0]);
  });

  it("uses height 0 for a tile with no surface", () => {
    const land = buildLand({ plates: [] });
    const { input } = buildMapScene({ cells: [{ x: 0, z: 0, piece: readPiece(land) }], areaTextures: area, buildings: noBuildings, animated: new Set() });
    expect([input.levels, input.ground(3, 3, 0)]).toEqual([1, 0]);
  });

  describe("animated materials at a point of the cycle", () => {
    const cell = (material: MaterialSpec) => [{ x: 0, z: 0, piece: readPiece(buildLand({ model: model(material, [0, 0, 0], [1, 0, 0], [0, 0, 1]) })) }];
    const still = { constant: 1 };
    const scroll = (duration: number, translateS: { values: number[] }): MapAnimation => ({
      type: "scroll", material: "m", duration, scaleS: still, scaleT: still, rotation: { constant: [0, 1] }, translateS, translateT: { constant: 0 },
    });
    const at = (animations: MapAnimation[], time: number, material: MaterialSpec) =>
      buildMapScene({ cells: cell(material), areaTextures: area, buildings: noBuildings, animated: new Set(["m"]), animations: new Map([["m", animations]]), time }).input.triangles[0]!;

    it("shifts a scrolling material by the track value of the frame at that time", () => {
      const anim = scroll(2, { values: [0, 0.5] });
      expect(at([anim], 0, { name: "m", texture: "ground" }).vertices[0].uv).toEqual([1, 1]);
      expect(at([anim], 0.5, { name: "m", texture: "ground" }).vertices[0].uv).toEqual([1 + 0.5 * 8, 1]);
    });

    it("keeps the last frame for a time of exactly 1", () => {
      expect(at([scroll(2, { values: [0, 0.5] })], 1, { name: "m", texture: "ground" }).vertices[0].uv[0]).toBe(1 + 0.5 * 8);
    });

    it("swaps the texture of a pattern material at its keyframe", () => {
      const two = readTextureSet(
        buildTex0(
          [{ name: "a", format: 3, width: 8, height: 8, texels: new Uint8Array(32) }, { name: "b", format: 3, width: 8, height: 8, texels: new Uint8Array(32) }],
          [{ name: "a_pl", colors: [GREEN] }, { name: "b_pl", colors: [BLUE] }],
        ),
        0,
      );
      const pattern: MapAnimation = { type: "pattern", material: "m", duration: 8, textures: ["a", "b"], palettes: ["a_pl", "b_pl"], keys: [{ frame: 0, texture: 0, palette: 0 }, { frame: 4, texture: 1, palette: 1 }] };
      const color = (time: number) =>
        buildMapScene({ cells: cell({ name: "m" }), areaTextures: two, buildings: noBuildings, animated: new Set(["m"]), animations: new Map([["m", [pattern]]]), time })
          .input.triangles[0]!.sampler.image.data.subarray(0, 3);
      expect([...color(0.25)]).toEqual([0, 255, 0]);
      expect([...color(0.5)]).toEqual([0, 0, 255]);
    });
  });
});
