// Building models scripts place at run time (spec 024: the starter balls in Elm's lab), each drawn
// on its own as a map mesh whose origin is the model's, so the client can put it anywhere.
import { PIECE_TILES } from "@soulsilver/shared/maps";
import { buildMapMesh, type MapMesh } from "./mesh.ts";
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
