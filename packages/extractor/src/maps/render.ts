import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import type { RgbaImage } from "./png.ts";
import { createCanvas, drawTriangle, type ScreenVertex } from "./raster.ts";
import { TILE_UNITS } from "./piece.ts";

// Pre-renders a map scene into lower/upper layers per level (research.md R2, R4, R5).
// Oblique projection relative to the ground of each triangle's tile: ground of any height
// lands exactly on its grid block; what rises above it is drawn OBLIQUE_HEIGHT higher.

/** Screen pixels per world unit of height, relative to the tile's ground. */
export const OBLIQUE_HEIGHT = 0.75;

/** Geometry higher than this above its tile's ground (world units) goes to the upper layer. */
export const UPPER_MIN_HEIGHT = 16;

const PX = MAP_TILE_PX / TILE_UNITS;

export interface Sampler {
  image: RgbaImage;
  repeat: [boolean, boolean];
  flip: [boolean, boolean];
}

export interface SceneVertex {
  /** World units, y up, z south. */
  position: [number, number, number];
  /** Texels. */
  uv: [number, number];
  color: [number, number, number];
}

export interface SceneTriangle {
  vertices: [SceneVertex, SceneVertex, SceneVertex];
  sampler: Sampler;
  /** 1 opaque, below 1 translucent. */
  alpha: number;
}

export interface RenderInput {
  /** Map size in tiles. */
  width: number;
  height: number;
  /** World x, z of the north-west corner of tile (0, 0). */
  origin: [number, number];
  levels: number;
  /** Walkable ground height (world units) of a tile on a level. */
  ground: (tileX: number, tileZ: number, level: number) => number;
  triangles: SceneTriangle[];
}

export interface LevelLayers {
  level: number;
  lower: RgbaImage;
  upper: RgbaImage;
}

interface Projected {
  vertices: [ScreenVertex, ScreenVertex, ScreenVertex];
  triangle: SceneTriangle;
  depth: number;
}

function project(input: RenderInput, level: number): Projected[] {
  const [ox, oz] = input.origin;
  const out: Projected[] = [];
  for (const triangle of input.triangles) {
    const [a, b, c] = triangle.vertices;
    const cx = (a.position[0] + b.position[0] + c.position[0]) / 3;
    const cz = (a.position[2] + b.position[2] + c.position[2]) / 3;
    const tx = Math.min(input.width - 1, Math.max(0, Math.floor((cx - ox) / TILE_UNITS)));
    const tz = Math.min(input.height - 1, Math.max(0, Math.floor((cz - oz) / TILE_UNITS)));
    const ground = input.ground(tx, tz, level);
    // Geometry well below this level's floor (the path under a bridge) is hidden.
    if (Math.max(a.position[1], b.position[1], c.position[1]) < ground - UPPER_MIN_HEIGHT) continue;

    const vertices = triangle.vertices.map((v): ScreenVertex => {
      const h = v.position[1] - ground;
      const z = v.position[2] - oz;
      return {
        x: (v.position[0] - ox) * PX,
        y: (z - OBLIQUE_HEIGHT * h) * PX,
        z: -(h + OBLIQUE_HEIGHT * z),
        u: v.uv[0],
        v: v.uv[1],
        color: v.color,
        h,
      };
    }) as Projected["vertices"];
    out.push({ vertices, triangle, depth: (vertices[0].z + vertices[1].z + vertices[2].z) / 3 });
  }
  return out;
}

function draw(width: number, height: number, triangles: Projected[], accept?: (h: number) => boolean) {
  const canvas = createCanvas(width, height);
  const opaque = triangles.filter((t) => t.triangle.alpha >= 1);
  // Translucent triangles last, far to near, so each blends over what is behind it.
  const translucent = triangles.filter((t) => t.triangle.alpha < 1).sort((p, q) => q.depth - p.depth);
  for (const t of [...opaque, ...translucent]) {
    const { sampler, alpha } = t.triangle;
    drawTriangle(canvas, t.vertices, sampler.image, { repeat: sampler.repeat, flip: sampler.flip, alpha, accept });
  }
  return canvas;
}

export function renderLayers(input: RenderInput): LevelLayers[] {
  const width = input.width * MAP_TILE_PX;
  const height = input.height * MAP_TILE_PX;
  return Array.from({ length: input.levels }, (_, level) => {
    const projected = project(input, level);
    const full = draw(width, height, projected);
    const lower = draw(width, height, projected, (h) => h <= UPPER_MIN_HEIGHT);

    const upper = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      if (full.image.data[i * 4 + 3] !== 0 && full.heights[i]! > UPPER_MIN_HEIGHT) {
        upper.set(full.image.data.subarray(i * 4, i * 4 + 4), i * 4);
      }
    }
    return { level, lower: lower.image, upper: { width, height, data: upper } };
  });
}
