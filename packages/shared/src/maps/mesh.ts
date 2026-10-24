import { z } from "zod";
import { GAME_DATA_FORMAT_VERSION, id, int } from "../game-data/common.ts";

// A map's 3D scene as the client draws it (replaces the pre-rendered layers of feature 006).
// mesh.json describes it; mesh.bin holds the vertices; textures/{i}.png the images, unfiltered.
// Units are pixels (one tile = MAP_TILE_PX), x east, y up, z south, from the map's north-west corner.

/** Float32 values per vertex in mesh.bin: x, y, z, u, v, r, g, b (uv over the group's first frame, color 0 to 1). */
export const MESH_VERTEX_FLOATS = 8;

const pair = z.tuple([z.number(), z.number()]);

/** One texture state: final uv = uv * scale + translate. */
const meshFrame = z.strictObject({ texture: id(), scale: pair, translate: pair });

const meshGroup = z.strictObject({
  /** One frame when static; when animated, one per ANIMATION_STEP_TICKS of the map's cycle, looped. */
  frames: z.array(meshFrame).min(1),
  repeat: z.tuple([z.boolean(), z.boolean()]),
  flip: z.tuple([z.boolean(), z.boolean()]),
  /** 1 opaque, below 1 translucent. */
  alpha: z.number().min(0).max(1),
  /** Drawn blended, after the opaque groups: alpha below 1 or texels neither transparent nor opaque. */
  translucent: z.boolean(),
  /** Vertex range in mesh.bin, three per triangle. */
  first: id(),
  count: int(3, 0xffffff),
});
export type MeshGroup = z.infer<typeof meshGroup>;

export const mapMeshFile = z
  .strictObject({
    kind: z.literal("map-mesh"),
    formatVersion: z.literal(GAME_DATA_FORMAT_VERSION),
    map: id(),
    /** Size in tiles. */
    width: int(1, 0xffff),
    height: int(1, 0xffff),
    /** Per level, the walkable ground height (pixels) of each tile, row by row: where entities stand. */
    ground: z.array(z.array(z.number())).min(1),
    textures: int(0, 0xffff),
    groups: z.array(meshGroup),
  })
  .superRefine((file, ctx) => {
    const cells = file.width * file.height;
    file.ground.forEach((level, i) => {
      if (level.length !== cells) ctx.addIssue({ code: "custom", path: ["ground", i], message: `esperado ${cells} alturas, recebido ${level.length}` });
    });
    file.groups.forEach((g, i) => {
      if (g.count % 3 !== 0) ctx.addIssue({ code: "custom", path: ["groups", i, "count"], message: "count deve ser múltiplo de 3" });
      g.frames.forEach((f, k) => {
        if (f.texture >= file.textures) ctx.addIssue({ code: "custom", path: ["groups", i, "frames", k, "texture"], message: "textura fora da lista" });
      });
    });
  });
export type MapMeshFile = z.infer<typeof mapMeshFile>;
