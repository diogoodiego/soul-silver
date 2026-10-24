import { describe, expect, it } from "vitest";
import { readLevelScripts, readZone } from "../../src/events/zone.ts";
import { buildLevelScripts, buildZone } from "../fixtures/events/builders.ts";

describe("readZone", () => {
  it("reads npcs, warps, triggers and signs with their fields", () => {
    const zone = readZone(
      buildZone({
        objects: [{ id: 3, sprite: 40, movement: 2, type: 1, hideFlag: 0x123, script: 3001, facing: 1, param: [1, 2, 3], xRange: 2, yRange: 3, x: 10, z: 11, y: 4 }],
        warps: [{ x: 5, z: 6, header: 77, anchor: 2, y: 0 }],
        coords: [{ script: 2500, x: 8, z: 9, w: 2, h: 1, y: 0, value: 1, variable: 0x4020 }],
        bgs: [{ script: 2501, type: 1, x: 12, z: 13, y: 0, dir: 2 }],
      }),
      "zone 4",
    );
    expect(zone.objects).toEqual([{ id: 3, sprite: 40, movement: 2, type: 1, hideFlag: 0x123, script: 3001, facing: 1, param: [1, 2, 3], xRange: 2, yRange: 3, x: 10, z: 11, y: 4 }]);
    expect(zone.warps).toEqual([{ x: 5, z: 6, destMap: 77, destAnchor: 2, y: 0 }]);
    expect(zone.triggers).toEqual([{ script: 2500, x: 8, z: 9, w: 2, h: 1, y: 0, variable: 0x4020, value: 1 }]);
    expect(zone.signs).toEqual([{ script: 2501, kind: 1, x: 12, z: 13, y: 0, dir: 2 }]);
  });

  it("returns empty lists for a file with four empty lists", () => {
    expect(readZone(buildZone({}), "zone 0")).toEqual({ objects: [], warps: [], triggers: [], signs: [] });
  });

  it("reads signed coordinates", () => {
    const zone = readZone(buildZone({ coords: [{ x: 0xfffe, z: 0xffff }], objects: [{ facing: 0xffff }] }), "zone 1");
    expect(zone.triggers[0]).toMatchObject({ x: -2, z: -1 });
    expect(zone.objects[0]!.facing).toBe(-1);
  });

  it("fails with the member and the offset when a count runs past the file", () => {
    const bytes = buildZone({ objects: [{}] });
    new DataView(bytes.buffer).setUint32(4, 9, true);
    expect(() => readZone(bytes, "zone 12")).toThrow(/zone 12.*offset/);
  });

  it("fails when bytes are left over after the four lists", () => {
    const bytes = new Uint8Array([...buildZone({}), 1, 2]);
    expect(() => readZone(bytes, "zone 5")).toThrow(/zone 5.*2 bytes/);
  });
});

describe("readLevelScripts", () => {
  it("reads transition, resume and load scripts", () => {
    const result = readLevelScripts(buildLevelScripts({ fixed: [[2, 100], [3, 101], [4, 102]] }), "levels 1");
    expect(result).toEqual({ onTransition: 100, onResume: 101, onLoad: 102, frames: [] });
  });

  it("reads the frame table rows", () => {
    const result = readLevelScripts(buildLevelScripts({ fixed: [[4, 9]], frames: [[0x4001, 2, 50], [0x4002, 0x4003, 51]] }), "levels 2");
    expect(result.onLoad).toBe(9);
    expect(result.onTransition).toBeNull();
    expect(result.frames).toEqual([
      { variable: 0x4001, value: 2, script: 50 },
      { variable: 0x4002, value: 0x4003, script: 51 },
    ]);
  });

  it("treats a stub file as having no level scripts", () => {
    expect(readLevelScripts(new Uint8Array(4), "levels 3")).toEqual({ onTransition: null, onResume: null, onLoad: null, frames: [] });
  });

  it("fails when the record list has no end", () => {
    expect(() => readLevelScripts(new Uint8Array([2, 1, 0, 0, 0]), "levels 4")).toThrow(/levels 4/);
  });
});
