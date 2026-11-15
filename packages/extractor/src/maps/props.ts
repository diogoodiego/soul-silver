// Building models scripts place at run time (spec 024: the starter balls in Elm's lab), each drawn
// on its own as a map mesh whose origin is the model's, so the client can put it anywhere.
import { PIECE_TILES, type MapAnimation } from "@soulsilver/shared/maps";
import { buildMapMesh, type MapMesh } from "./mesh.ts";
import type { Model } from "./nsbmd.ts";
import { TILE_UNITS, type Piece } from "./piece.ts";
import { buildMapScene, type BuildingSource, type SceneWarning } from "./scene.ts";
import type { TextureSet } from "./texture.ts";

/** A piece's models are centered on it; this puts the building's origin at the mesh's 0. */
const HALF_PIECE = (PIECE_TILES * TILE_UNITS) / 2;

export function buildPropMesh(model: number, buildings: BuildingSource, areaTextures: TextureSet): { mesh: MapMesh; warnings: SceneWarning[] } {
  const piece: Piece = {
    permissions: new Array<number>(PIECE_TILES * PIECE_TILES).fill(0),
    buildings: [{ model, position: [-HALF_PIECE, 0, -HALF_PIECE], scale: [1, 1, 1] }],
    model: new Uint8Array(),
    tileHeights: Array.from({ length: PIECE_TILES * PIECE_TILES }, () => [0]),
  };
  const scene = buildMapScene({ cells: [{ x: 0, z: 0, piece }], areaTextures, buildings, animated: new Set() });
  return { mesh: buildMapMesh(model, scene.input), warnings: scene.warnings };
}

type Pattern = Extract<MapAnimation, { type: "pattern" }>;

/** Spec 030.5: the models with each material a texture pattern animates showing its last key (the pose it ends in). */
export function posePatterns(models: Model[], patterns: Pattern[]): Model[] {
  const last = new Map(patterns.map((p) => [p.material, p]));
  return models.map((model) => ({
    ...model,
    materials: model.materials.map((material) => {
      const p = last.get(material.name);
      const key = p?.keys.at(-1);
      return p && key ? { ...material, texture: p.textures[key.texture] ?? material.texture, palette: p.palettes[key.palette] ?? material.palette } : material;
    }),
  }));
}
