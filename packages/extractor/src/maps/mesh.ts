import { createHash } from "node:crypto";
import { MAP_FORMAT_VERSION, MAP_TILE_PX, MESH_VERTEX_FLOATS, type MapMeshFile, type MeshGroup } from "@soulsilver/shared/maps";
import { TILE_UNITS } from "./piece.ts";
import type { RgbaImage } from "./png.ts";
import type { SceneInput, SceneTriangle } from "./scene.ts";

// Turns a map scene into what the client draws in 3D (shared/maps/mesh.ts): triangles grouped
// by texture state, vertices in pixels from the map's north-west corner, ground heights per tile.

const PX = MAP_TILE_PX / TILE_UNITS;

export interface MapMesh {
  file: MapMeshFile;
  vertices: Float32Array;
  textures: RgbaImage[];
}

/** A triangle whose texture state changes across its `frames` (scene.ts) gets one frame per tick. */
export function buildMapMesh(map: number, scene: SceneInput): MapMesh {
  const textures: RgbaImage[] = [];
  // By content: each scene of the cycle decodes its own images, and texture sets repeat images.
  const byContent = new Map<string, number>();
  const byImage = new Map<RgbaImage, number>();
  const textureId = (image: RgbaImage) => {
    let found = byImage.get(image);
    if (found !== undefined) return found;
    const key = `${image.width}x${image.height}:${createHash("sha1").update(image.data).digest("hex")}`;
    found = byContent.get(key);
    if (found === undefined) {
      found = textures.length;
      textures.push(image);
      byContent.set(key, found);
    }
    byImage.set(image, found);
    return found;
  };
  const frameOf = (t: Pick<SceneTriangle, "sampler" | "texMatrix">): MeshGroup["frames"][number] => ({
    texture: textureId(t.sampler.image),
    scale: [t.texMatrix.scale[0], t.texMatrix.scale[1]],
    translate: [t.texMatrix.translation[0], t.texMatrix.translation[1]],
  });

  const partial = new Map<RgbaImage, boolean>();
  /** Whether an image has texels that are neither transparent nor opaque, so they blend. */
  const blends = (image: RgbaImage) => {
    let found = partial.get(image);
    if (found === undefined) {
      found = false;
      for (let i = 3; i < image.data.length && !found; i += 4) found = image.data[i] !== 0 && image.data[i] !== 255;
      partial.set(image, found);
    }
    return found;
  };

  const groups = new Map<string, { group: Omit<MeshGroup, "first" | "count">; triangles: SceneTriangle[] }>();
  // A mesh's triangles share one frames array (scene.ts): its frames and their key are made once.
  // A mesh's triangles share one frames array and one still state (scene.ts): both are made once.
  const played = new Map<NonNullable<SceneTriangle["frames"]>, { frames: MeshGroup["frames"]; key: string } | undefined>();
  const playedOf = (t: SceneTriangle, still: string) => {
    if (!t.frames) return undefined;
    if (!played.has(t.frames)) {
      const frames = t.frames.map(frameOf);
      const keys = frames.map((f) => JSON.stringify(f));
      played.set(t.frames, keys.some((k) => k !== still) ? { frames, key: `[${keys.join(",")}]` } : undefined);
    }
    return played.get(t.frames);
  };
  scene.triangles.forEach((t) => {
    const still = frameOf(t);
    const stillKey = JSON.stringify(still);
    const moving = playedOf(t, stillKey);
    const shown = moving ? moving.frames : [still];
    const translucent = t.alpha < 1 || shown.some((f) => blends(textures[f.texture]!));
    const group = { frames: shown, repeat: t.sampler.repeat, flip: t.sampler.flip, alpha: t.alpha, translucent, ...(t.building !== undefined && { building: t.building }) };
    const key = JSON.stringify({ ...group, frames: moving ? moving.key : stillKey });
    const entry = groups.get(key) ?? { group, triangles: [] };
    entry.triangles.push(t);
    groups.set(key, entry);
  });

  const count = scene.triangles.length * 3;
  const vertices = new Float32Array(count * MESH_VERTEX_FLOATS);
  const [ox, oz] = scene.origin;
  const out: MeshGroup[] = [];
  let first = 0;
  for (const { group, triangles } of groups.values()) {
    const { width, height } = textures[group.frames[0]!.texture]!;
    let o = first * MESH_VERTEX_FLOATS;
    for (const t of triangles) {
      for (const v of t.vertices) {
        vertices.set(
          [(v.position[0] - ox) * PX, v.position[1] * PX, (v.position[2] - oz) * PX, v.uv[0] / width, v.uv[1] / height, v.color[0] / 255, v.color[1] / 255, v.color[2] / 255],
          o,
        );
        o += MESH_VERTEX_FLOATS;
      }
    }
    out.push({ ...group, first, count: triangles.length * 3 });
    first += triangles.length * 3;
  }

  const ground = Array.from({ length: scene.levels }, (_, level) =>
    Array.from({ length: scene.width * scene.height }, (_, i) => scene.ground(i % scene.width, Math.floor(i / scene.width), level) * PX),
  );
  return {
    file: { kind: "map-mesh", formatVersion: MAP_FORMAT_VERSION, map, width: scene.width, height: scene.height, ground, textures: textures.length, groups: out },
    vertices,
    textures,
  };
}
