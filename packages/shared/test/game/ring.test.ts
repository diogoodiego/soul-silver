import { describe, expect, it } from "vitest";
import { RING_RADIUS_PX, RING_SPOTS, RING_TILES, ringArea, ringMap, ringMesh, ringSource } from "../../src/game/ring.ts";
import { tileAt } from "../../src/game/world-map.ts";
import { MESH_VERTEX_FLOATS, type MapMeshFile, type MeshGroup } from "../../src/maps/mesh.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Item V.3: the ring a trainer battle indoors is fought in, built from the building's own textures.

describe("the ring area", () => {
  it("names its source map and battle, and nothing else is a ring", () => {
    expect(ringSource(ringArea("60", 7))).toBe("60");
    expect(ringSource("60")).toBeUndefined();
    expect(ringSource("arena")).toBeUndefined();
    expect(ringSource("ring:60")).toBeUndefined();
    expect(ringSource(undefined)).toBeUndefined();
  });

  it("is a walled square of free floor, indoors, with the fighters inside the circle", () => {
    const id = ringArea("60", 1);
    const map = ringMap(id);
    expect(map).toMatchObject({ id, areaType: "indoor", warps: [], flyAllowed: false, bikeAllowed: false });
    const lookup = () => map;
    const cell = (tx: number, ty: number) => tileAt(lookup, id, 0, tx * 16 + 8, ty * 16 + 8)?.category;
    expect(cell(0, 5)).toBe("blocked");
    expect(cell(RING_TILES - 1, 5)).toBe("blocked");
    expect(cell(5, 0)).toBe("blocked");
    expect(cell(5, RING_TILES - 1)).toBe("blocked");
    expect(cell(1, 1)).toBe("free");
    expect(cell(RING_TILES - 2, RING_TILES - 2)).toBe("free");
    for (const spot of [RING_SPOTS.player, RING_SPOTS.side, RING_SPOTS.trainer]) {
      expect(Math.hypot(spot.x - RING_SPOTS.center.x, spot.y - RING_SPOTS.center.y)).toBeLessThan(RING_RADIUS_PX);
      expect(tileAt(lookup, id, 0, spot.x, spot.y)?.category).toBe("free");
    }
  });

  it("is protocol v33", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(33);
  });
});

/** Two triangles per quad, each vertex x, y, z, u, v, r, g, b. */
type V = [number, number, number, number, number];
const quad = (a: V, b: V, c: V, d: V) => [a, b, c, a, c, d].flatMap((v) => [...v, 0.5, 0.5, 0.5]);
const group = (texture: number, first: number, count: number, over: Partial<MeshGroup> = {}): MeshGroup => ({
  frames: [{ texture, scale: [1, 1], translate: [0, 0] }],
  repeat: [true, true],
  flip: [false, false],
  alpha: 1,
  translucent: false,
  first,
  count,
  ...over,
});

/**
 * A synthetic building, 4×4 tiles with its floor at height 8: a small rug (texture 0), the floor (texture 1, a
 * texel every 32 px), a clamped black ceiling with more area than any floor (texture 2), a wall (texture 3), and a
 * translucent pane larger than the wall (texture 4).
 */
function building(): { file: MapMeshFile; vertices: Float32Array } {
  const rug = quad([0, 8, 0, 0, 0], [16, 8, 0, 1, 0], [16, 8, 16, 1, 1], [0, 8, 16, 0, 1]);
  const floor = quad([0, 8, 0, 0, 0], [64, 8, 0, 2, 0], [64, 8, 64, 2, 2], [0, 8, 64, 0, 2]);
  const ceiling = quad([-64, 46, -64, 0, 0], [128, 46, -64, 0, 0], [128, 46, 128, 0, 0], [-64, 46, 128, 0, 0]);
  const wall = quad([0, 8, 0, 0, 1], [64, 8, 0, 4, 1], [64, 40, 0, 4, 0], [0, 40, 0, 0, 0]);
  const pane = quad([0, 0, 64, 0, 0], [64, 0, 64, 1, 0], [64, 99, 64, 1, 1], [0, 99, 64, 0, 1]);
  const all = [rug, floor, ceiling, wall, pane];
  const groups = all.map((_, i) => group(i, i * 6, 6, i === 2 ? { repeat: [false, false] } : i === 4 ? { alpha: 0.4, translucent: true } : {}));
  const file: MapMeshFile = { kind: "map-mesh", formatVersion: 1, map: 60, width: 4, height: 4, ground: [Array<number>(16).fill(8)], textures: 5, groups };
  return { file, vertices: new Float32Array(all.flat()) };
}

const vertexAt = (v: Float32Array, i: number) => Array.from(v.subarray(i * MESH_VERTEX_FLOATS, (i + 1) * MESH_VERTEX_FLOATS));

describe("the ring's scene", () => {
  it("takes the floor and wall textures of the building, keeping their placement", () => {
    const { file, vertices } = building();
    const ring = ringMesh(file, vertices)!;
    expect(ring.file).toMatchObject({ map: 60, width: RING_TILES, height: RING_TILES, textures: 5 });
    expect(ring.file.ground).toEqual([new Array(RING_TILES * RING_TILES).fill(0)]);
    expect(ring.file.groups.map((g) => g.frames[0]!.texture)).toEqual([1, 3]);
    expect(ring.vertices.length).toBe((6 + 18) * MESH_VERTEX_FLOATS);
    // The floor tiles at the building's rate: u = x / 32, v = z / 32; flat at height 0, with the building's tint.
    for (let i = 0; i < 6; i++) {
      const [x, y, z, u, v, r] = vertexAt(ring.vertices, i);
      expect(y).toBe(0);
      expect(u).toBeCloseTo(x! / 32);
      expect(v).toBeCloseTo(z! / 32);
      expect(r).toBeCloseTo(0.5);
    }
    // The wall: u = along / 16, v = (40 - y) / 32, standing from 0 up; the north wall (first 6) runs along x, the west and east along z.
    const ys = new Set<number>();
    for (let i = 6; i < 24; i++) {
      const [x, y, z, u, v] = vertexAt(ring.vertices, i);
      ys.add(y!);
      expect(u).toBeCloseTo((i < 12 ? x! : z!) / 16);
      expect(v).toBeCloseTo((40 - y!) / 32);
    }
    expect([...ys].sort((a, b) => a - b)).toEqual([0, 32]);
  });

  it("is a floor alone when the building has no wall, and nothing when it has no floor", () => {
    const { file, vertices } = building();
    const noWall = { ...file, groups: file.groups.filter((g) => g.frames[0]!.texture !== 3) };
    expect(ringMesh(noWall, vertices)!.file.groups.map((g) => g.frames[0]!.texture)).toEqual([1]);
    const noFloor = { ...file, groups: file.groups.filter((g) => g.frames[0]!.texture >= 2) };
    expect(ringMesh(noFloor, vertices)).toBeUndefined();
  });
});
