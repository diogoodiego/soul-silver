import { MAP_TILE_PX, MESH_VERTEX_FLOATS, type MapMeshFile, type MeshGroup } from "@soulsilver/shared/maps";

/**
 * How far above its tile's ground a decal lies (flowers, paths, puddles sit 1 to 2 px up); the same
 * margin the grass clearing uses. Roofs and bridges sit tens of pixels up.
 */
export const GROUND_COVER_MAX_PX = 3;
/** |normal.y| above this is a horizontal triangle. */
const HORIZONTAL = 0.9;

/**
 * A group that lies on the ground: every triangle horizontal and no higher than GROUND_COVER_MAX_PX over
 * its tile's level-0 ground. It must not cast a shadow (lifted 1–2 px, its shadow would land beside it),
 * though it still receives one. Groups follow the ROM's materials, so flowers are groups of their own.
 */
export function groundCover(file: Pick<MapMeshFile, "width" | "height" | "ground">, vertices: Float32Array, group: Pick<MeshGroup, "first" | "count">): boolean {
  const ground = file.ground[0]!;
  const at = (i: number, k: number) => vertices[i * MESH_VERTEX_FLOATS + k]!;
  for (let t = group.first; t < group.first + group.count; t += 3) {
    const [ax, ay, az] = [at(t + 1, 0) - at(t, 0), at(t + 1, 1) - at(t, 1), at(t + 1, 2) - at(t, 2)];
    const [bx, by, bz] = [at(t + 2, 0) - at(t, 0), at(t + 2, 1) - at(t, 1), at(t + 2, 2) - at(t, 2)];
    const [nx, ny, nz] = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    const length = Math.hypot(nx, ny, nz);
    if (length > 0 && Math.abs(ny) / length <= HORIZONTAL) return false;
    // The tile under the triangle's center: a vertex on a tile edge would read the neighbour's ground.
    const tx = Math.min(file.width - 1, Math.max(0, Math.floor((at(t, 0) + at(t + 1, 0) + at(t + 2, 0)) / 3 / MAP_TILE_PX)));
    const tz = Math.min(file.height - 1, Math.max(0, Math.floor((at(t, 2) + at(t + 1, 2) + at(t + 2, 2)) / 3 / MAP_TILE_PX)));
    if (Math.max(at(t, 1), at(t + 1, 1), at(t + 2, 1)) - ground[tz * file.width + tx]! > GROUND_COVER_MAX_PX) return false;
  }
  return true;
}
