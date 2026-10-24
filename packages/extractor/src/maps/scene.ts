import { PIECE_TILES, type MapAnimation } from "@soulsilver/shared/maps";
import { readModels, type Model } from "./nsbmd.ts";
import type { Piece } from "./piece.ts";
import { TILE_UNITS } from "./piece.ts";
import type { RgbaImage } from "./png.ts";
import type { RenderInput, SceneTriangle } from "./render.ts";
import { decodeTexture, type TextureSet } from "./texture.ts";

// Assembles a map's render scene from its pieces: terrain models offset by cell, buildings
// at their positions, textures resolved by name (research.md R0, R4, R7).

const PIECE_UNITS = PIECE_TILES * TILE_UNITS;

export interface MapCell {
  /** Cell position in the area matrix. */
  x: number;
  z: number;
  piece: Piece;
}

/** A building model with its own textures, if it has any; undefined when the id is unknown. */
export type BuildingSource = (model: number) => { models: Model[]; textures?: TextureSet } | undefined;

export interface SceneWarning {
  code: "animated-texture" | "missing-texture" | "missing-model";
  detail: string;
}

export interface MapSceneInput {
  cells: MapCell[];
  areaTextures: TextureSet;
  buildings: BuildingSource;
  /** Material names animated by the ROM's texture animations. */
  animated: ReadonlySet<string>;
  /** Animations by material name; played when `time` is given. */
  animations?: ReadonlyMap<string, MapAnimation[]>;
  /** 0 up to and including 1: the fraction of each animation's own cycle. Absent: static. */
  time?: number;
}

/** Shown where a linked texture is missing from the ROM data: magenta, so it is easy to spot. */
const PLACEHOLDER: RgbaImage = { width: 1, height: 1, data: new Uint8Array([255, 0, 255, 255]) };
const WHITE: RgbaImage = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };

export interface MapGrid {
  /** Size in tiles. */
  width: number;
  height: number;
  /** World x, z of the north-west corner of tile (0, 0). */
  origin: [number, number];
  /** Piece and index (row by row) of a map tile, undefined outside every cell. */
  tile: (tx: number, tz: number) => { piece: Piece; index: number } | undefined;
}

/** The tile grid spanned by a map's cells. */
export function mapGrid(cells: MapCell[]): MapGrid {
  const minX = Math.min(...cells.map((c) => c.x));
  const minZ = Math.min(...cells.map((c) => c.z));
  const maxX = Math.max(...cells.map((c) => c.x));
  const maxZ = Math.max(...cells.map((c) => c.z));
  const byCell = new Map(cells.map((c) => [`${c.x - minX},${c.z - minZ}`, c.piece]));
  return {
    width: (maxX - minX + 1) * PIECE_TILES,
    height: (maxZ - minZ + 1) * PIECE_TILES,
    origin: [minX * PIECE_UNITS - PIECE_UNITS / 2, minZ * PIECE_UNITS - PIECE_UNITS / 2],
    tile: (tx, tz) => {
      const piece = byCell.get(`${Math.floor(tx / PIECE_TILES)},${Math.floor(tz / PIECE_TILES)}`);
      return piece && { piece, index: (tz % PIECE_TILES) * PIECE_TILES + (tx % PIECE_TILES) };
    },
  };
}

type Pattern = Extract<MapAnimation, { type: "pattern" }>;
type Scroll = Extract<MapAnimation, { type: "scroll" }>;

/** The frame an animation shows at `time` of its cycle (the last one at exactly 1). */
const frameAt = (a: MapAnimation, time: number) => Math.min(a.duration - 1, Math.floor(time * a.duration));

function keyAt(a: Pattern, time: number) {
  const frame = frameAt(a, time);
  return a.keys.findLast((k) => k.frame <= frame) ?? a.keys[0];
}

/** shortcut: rotation is not played (3 ROM materials animate it), add when the overworld needs it. */
function scrolled(base: { scale: [number, number]; translation: [number, number] }, playing: MapAnimation[], time: number | undefined) {
  const a = playing.find((p): p is Scroll => p.type === "scroll");
  if (!a || time === undefined) return base;
  const f = frameAt(a, time);
  const at = (t: Scroll["scaleS"]) => ("constant" in t ? t.constant : t.values[f]!);
  return { scale: [at(a.scaleS), at(a.scaleT)] as [number, number], translation: [at(a.translateS), at(a.translateT)] as [number, number] };
}

export function buildMapScene({ cells, areaTextures, buildings, animated, animations, time }: MapSceneInput): {
  input: RenderInput;
  warnings: SceneWarning[];
  /** Names of the materials the map draws. */
  materials: Set<string>;
} {
  const materials = new Set<string>();
  const warnings = new Map<string, SceneWarning>();
  const warn = (code: SceneWarning["code"], detail: string) => warnings.set(`${code}:${detail}`, { code, detail });
  const images = new Map<string, RgbaImage>();

  /** Decoded texture called `name` in the first set that has it; undefined when none does. */
  function image(sets: TextureSet[], name: string, palette: string | null): RgbaImage | undefined {
    for (const [i, set] of sets.entries()) {
      const texture = set.textures.get(name);
      if (!texture) continue;
      const key = `${i}:${name}:${palette}`;
      let decoded = images.get(key);
      if (!decoded) {
        const colors = (palette && set.palettes.get(palette)) || set.palettes.get(`${name}_pl`) || set.palettes.values().next().value;
        decoded = decodeTexture(texture, colors);
        images.set(key, decoded);
      }
      return decoded;
    }
    return undefined;
  }

  /**
   * A linked texture, or the texture named like an animated material (its first frame).
   * A material with no linked texture and no texture of its name is plain color: white.
   */
  function resolveTexture(
    sets: TextureSet[],
    material: { name: string; texture: string | null; palette: string | null },
    animatedByName: boolean,
    warn: (code: SceneWarning["code"], detail: string) => void,
  ): RgbaImage {
    if (material.texture === null) {
      const frame = image(sets, material.name, material.palette);
      if (!frame) return WHITE;
      warn("animated-texture", material.name);
      return frame;
    }
    if (animatedByName) warn("animated-texture", material.name);
    const linked = image(sets, material.texture, material.palette);
    if (linked) return linked;
    warn("missing-texture", material.texture);
    return PLACEHOLDER;
  }

  const triangles: SceneTriangle[] = [];
  function add(models: Model[], sets: TextureSet[], offset: [number, number, number], scale: [number, number, number]) {
    for (const model of models) {
      for (const mesh of model.meshes) {
        const material = model.materials[mesh.material]!;
        materials.add(material.name);
        const playing = time === undefined ? [] : (animations?.get(material.name) ?? []);
        const pattern = playing.find((a): a is Pattern => a.type === "pattern");
        const key = pattern && keyAt(pattern, time!);
        const shown = key && pattern ? { ...material, texture: pattern.textures[key.texture]!, palette: pattern.palettes[key.palette]! } : material;
        const texture = resolveTexture(sets, shown, animated.has(material.name), warn);
        const sampler = { image: texture, repeat: material.repeat, flip: material.flip };
        const { scale: [ss, st], translation: [ts, tt] } = scrolled(material.texMatrix, playing, time);
        for (const t of mesh.triangles) {
          triangles.push({
            alpha: material.alpha / 31,
            sampler,
            vertices: t.map((v) => ({
              position: [0, 1, 2].map((k) => v.position[k]! * scale[k]! + offset[k]!) as [number, number, number],
              uv: [v.uv[0] * ss + ts * texture.width, v.uv[1] * st + tt * texture.height],
              color: v.color,
            })) as SceneTriangle["vertices"],
          });
        }
      }
    }
  }

  for (const cell of cells) {
    const offset: [number, number, number] = [cell.x * PIECE_UNITS, 0, cell.z * PIECE_UNITS];
    if (cell.piece.model.length > 0) add(readModels(cell.piece.model), [areaTextures], offset, [1, 1, 1]);
    for (const b of cell.piece.buildings) {
      const source = buildings(b.model);
      if (!source) {
        warn("missing-model", String(b.model));
        continue;
      }
      const position: [number, number, number] = [offset[0] + b.position[0], b.position[1], offset[2] + b.position[2]];
      add(source.models, source.textures ? [source.textures, areaTextures] : [areaTextures], position, b.scale);
    }
  }

  const grid = mapGrid(cells);
  // reduce, not Math.max(...spread): a large map has far more tiles than call arguments allowed.
  const levels = cells.reduce(
    (most, c) => c.piece.tileHeights.reduce((m, h) => Math.max(m, h.length), most),
    1,
  );

  return {
    input: {
      width: grid.width,
      height: grid.height,
      origin: grid.origin,
      levels,
      ground: (tx, tz, level) => {
        const at = grid.tile(tx, tz);
        const s = at ? at.piece.tileHeights[at.index]! : [];
        return s.length === 0 ? 0 : s[Math.min(level, s.length - 1)]!;
      },
      triangles,
    },
    warnings: [...warnings.values()],
    materials,
  };
}
