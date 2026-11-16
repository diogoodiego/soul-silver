import { MAP_TILE_PX } from "../maps/constants.ts";
import { MESH_VERTEX_FLOATS, type MapMeshFile, type MeshGroup } from "../maps/mesh.ts";
import type { CollisionMap } from "./movement.ts";
import type { WorldMap } from "./world-map.ts";

// Item V.3: a trainer battle inside a building is fought in a ring of its own, a square built from that building's
// floor and wall textures. The ring is an area of its own, "ring:<source map>:<battle>", that only the fighter enters.

/** Tiles per side: 16 to fight on and a wall all around. */
export const RING_TILES = 18;
const SIZE_PX = RING_TILES * MAP_TILE_PX;
const C = SIZE_PX / 2;
/** The fight's circle, inscribed in the floor. */
export const RING_RADIUS_PX = (RING_TILES / 2 - 1) * MAP_TILE_PX;
/** Where things stand: the player west, the trainer east, its Pokémon coming out in front of it. */
export const RING_SPOTS = {
  center: { x: C, y: C },
  player: { x: C - 5 * MAP_TILE_PX, y: C },
  side: { x: C + 3 * MAP_TILE_PX, y: C },
  trainer: { x: C + 5 * MAP_TILE_PX, y: C },
};

const PATTERN = /^ring:([^:]+):\d+$/;
export const ringArea = (source: string, battle: number) => `ring:${source}:${battle}`;
/** The map a ring was built from; undefined for any other area. */
export const ringSource = (area: string | undefined) => (area?.startsWith("ring:") ? PATTERN.exec(area)?.[1] : undefined);

const edge = (i: number) => i < RING_TILES || i >= RING_TILES * (RING_TILES - 1) || i % RING_TILES === 0 || i % RING_TILES === RING_TILES - 1;
const GRID: CollisionMap = {
  width: RING_TILES,
  height: RING_TILES,
  tiles: Array.from({ length: RING_TILES * RING_TILES }, (_, i) => (edge(i) ? { category: "blocked" as const, raw: 0x8000 } : { category: "free" as const, raw: 0 })),
};

/** The ring's collision: free floor, walled in; no warps, no wild Pokémon, nothing to ride or fly from. */
export const ringMap = (id: string): WorldMap => ({
  id,
  levels: [GRID],
  warps: [],
  neighbors: [],
  widthPx: SIZE_PX,
  heightPx: SIZE_PX,
  areaType: "indoor",
  bikeAllowed: false,
  flyAllowed: false,
  escapeRopeAllowed: false,
  incomingCalls: false,
});

type Vec = [number, number, number];
const WALL_PX = 2 * MAP_TILE_PX;
/** How far from the most common ground height a face still counts as floor (rugs, steps). */
const FLOOR_SLACK_PX = 4;

interface Pick {
  group: MeshGroup;
  area: number;
  /** uv as an affine function of two plane coordinates: [u: a, b, c], [v: a, b, c]; and the color of the sample. */
  uv: [Vec, Vec];
  color: Vec;
}

/** u = a·p + b·q + c through three points; undefined when they are in a line. */
function affine(p: number[], q: number[], u: number[]): Vec | undefined {
  const det = (p[1]! - p[0]!) * (q[2]! - q[0]!) - (p[2]! - p[0]!) * (q[1]! - q[0]!);
  if (Math.abs(det) < 1e-6) return undefined;
  const a = ((u[1]! - u[0]!) * (q[2]! - q[0]!) - (u[2]! - u[0]!) * (q[1]! - q[0]!)) / det;
  const b = ((p[1]! - p[0]!) * (u[2]! - u[0]!) - (p[2]! - p[0]!) * (u[1]! - u[0]!)) / det;
  return [a, b, u[0]! - a * p[0]! - b * q[0]!];
}

function mode(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].reduce((best, c) => (c[1] > best[1] ? c : best), [0, -1])[0];
}

/**
 * The floor and the wall of a building: of its opaque, tiling groups, the one with the most floor-facing area at
 * ground height, and the one with the most upright area. Each keeps its texture placement (uv per pixel and offset).
 */
function pickSurfaces(source: MapMeshFile, vertices: Float32Array): { floor?: Pick; wall?: Pick } {
  const ground = mode(source.ground[0] ?? []);
  let floor: Pick | undefined;
  let wall: Pick | undefined;
  for (const group of source.groups) {
    if (group.alpha < 1 || group.translucent || !group.repeat[0] || !group.repeat[1]) continue;
    let up = 0;
    let side = 0;
    let upUv: [Vec, Vec] | undefined;
    let sideUv: [Vec, Vec] | undefined;
    let upColor: Vec = [1, 1, 1];
    let sideColor: Vec = [1, 1, 1];
    for (let t = group.first; t < group.first + group.count; t += 3) {
      const p = [0, 1, 2].map((k) => vertices.subarray((t + k) * MESH_VERTEX_FLOATS, (t + k + 1) * MESH_VERTEX_FLOATS));
      const a = [p[1]![0]! - p[0]![0]!, p[1]![1]! - p[0]![1]!, p[1]![2]! - p[0]![2]!];
      const b = [p[2]![0]! - p[0]![0]!, p[2]![1]! - p[0]![1]!, p[2]![2]! - p[0]![2]!];
      const n = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
      const twice = Math.hypot(n[0]!, n[1]!, n[2]!);
      if (twice < 1e-6) continue;
      const ny = Math.abs(n[1]!) / twice;
      const col = (k: number) => p.map((v) => v[k]!);
      const color: Vec = [p[0]![5]!, p[0]![6]!, p[0]![7]!];
      if (ny > 0.9 && Math.abs(p[0]![1]! - ground) <= FLOOR_SLACK_PX) {
        up += twice / 2;
        if (!upUv) {
          const u = affine(col(0), col(2), col(3));
          const v = affine(col(0), col(2), col(4));
          if (u && v) [upUv, upColor] = [[u, v], color];
        }
      } else if (ny < 0.1) {
        side += twice / 2;
        if (!sideUv) {
          // Along the wall: x for a wall facing north or south, z for one facing east or west.
          const along = Math.abs(n[0]!) > Math.abs(n[2]!) ? col(2) : col(0);
          const u = affine(along, col(1), col(3));
          const v = affine(along, col(1), col(4));
          if (u && v) [sideUv, sideColor] = [[u, v], color];
        }
      }
    }
    if (upUv && up > (floor?.area ?? 0)) floor = { group, area: up, uv: upUv, color: upColor };
    if (sideUv && side > (wall?.area ?? 0)) wall = { group, area: side, uv: sideUv, color: sideColor };
  }
  return { ...(floor ? { floor } : {}), ...(wall ? { wall } : {}) };
}

/**
 * The ring's 3D scene from the building's own mesh: a floor over the fighting tiles and walls on the north, west and
 * east edges (none on the south, where it would hide the fighters from the camera). It uses the source's textures by
 * the same indexes. Undefined when the building has no floor to borrow.
 */
export function ringMesh(source: MapMeshFile, vertices: Float32Array): { file: MapMeshFile; vertices: Float32Array } | undefined {
  const { floor, wall } = pickSurfaces(source, vertices);
  if (!floor) return undefined;
  const out: number[] = [];
  const at = (uv: [Vec, Vec], color: Vec, x: number, y: number, z: number, p: number, q: number) =>
    out.push(x, y, z, uv[0][0] * p + uv[0][1] * q + uv[0][2], uv[1][0] * p + uv[1][1] * q + uv[1][2], ...color);
  const lo = MAP_TILE_PX;
  const hi = SIZE_PX - MAP_TILE_PX;
  const floorQuad: [number, number][] = [[lo, lo], [hi, lo], [hi, hi], [lo, lo], [hi, hi], [lo, hi]];
  for (const [x, z] of floorQuad) at(floor.uv, floor.color, x, 0, z, x, z);
  const groups: MeshGroup[] = [{ ...floor.group, first: 0, count: 6 }];
  if (wall) {
    // [x0, z0] to [x1, z1] along the bottom, up WALL_PX; `alongX` picks the coordinate the wall's uv runs on.
    const walls: [number, number, number, number, boolean][] = [
      [lo, lo, hi, lo, true],
      [lo, lo, lo, hi, false],
      [hi, lo, hi, hi, false],
    ];
    for (const [x0, z0, x1, z1, alongX] of walls) {
      const corners: [number, number, number][] = [[x0, z0, 0], [x1, z1, 0], [x1, z1, WALL_PX], [x0, z0, 0], [x1, z1, WALL_PX], [x0, z0, WALL_PX]];
      for (const [x, z, y] of corners) at(wall.uv, wall.color, x, y, z, alongX ? x : z, y);
    }
    groups.push({ ...wall.group, first: 6, count: 18 });
  }
  const file: MapMeshFile = { ...source, width: RING_TILES, height: RING_TILES, ground: [new Array<number>(RING_TILES * RING_TILES).fill(0)], groups };
  return { file, vertices: new Float32Array(out) };
}
