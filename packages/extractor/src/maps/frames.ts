import { MAP_TILE_PX, type AnimationRegion } from "@soulsilver/shared/maps";
import type { RgbaImage } from "./png.ts";
import type { LevelLayers } from "./render.ts";

// Animation frames of a map (specs/006-map-prerender, FR-009): only the region that changes
// between frames is kept, as a tile-aligned box, so a pond costs a pond, not the whole map.

export interface ChangedRegion {
  region: AnimationRegion;
  /** The region cut from every frame, frame 0 first. */
  crops: RgbaImage[];
}

function crop(image: RgbaImage, x: number, y: number, width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    data.set(image.data.subarray(((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4), row * width * 4);
  }
  return { width, height, data };
}

/** Pixel bounds of what differs between `a` and `b`, or undefined when they are equal. */
function diffBounds(a: RgbaImage, b: RgbaImage): [number, number, number, number] | undefined {
  let bounds: [number, number, number, number] | undefined;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2] && a.data[i + 3] === b.data[i + 3]) continue;
    const [x, y] = [(i / 4) % a.width, Math.floor(i / 4 / a.width)];
    bounds = bounds ? [Math.min(bounds[0], x), Math.min(bounds[1], y), Math.max(bounds[2], x), Math.max(bounds[3], y)] : [x, y, x, y];
  }
  return bounds;
}

/** `frames[k]` are the layers of frame k; one entry per level and layer that changes. */
export function changedRegions(frames: LevelLayers[][]): ChangedRegion[] {
  const out: ChangedRegion[] = [];
  for (const [index, first] of frames[0]!.entries()) {
    for (const layer of ["lower", "upper"] as const) {
      let box: [number, number, number, number] | undefined;
      for (const frame of frames.slice(1)) {
        const b = diffBounds(first[layer], frame[index]![layer]);
        if (b) box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
      }
      if (!box) continue;
      const [x, y] = [Math.floor(box[0] / MAP_TILE_PX) * MAP_TILE_PX, Math.floor(box[1] / MAP_TILE_PX) * MAP_TILE_PX];
      const [width, height] = [(Math.floor(box[2] / MAP_TILE_PX) + 1) * MAP_TILE_PX - x, (Math.floor(box[3] / MAP_TILE_PX) + 1) * MAP_TILE_PX - y];
      out.push({
        region: { level: first.level, layer, x, y, width, height },
        crops: frames.map((frame) => crop(frame[index]![layer], x, y, width, height)),
      });
    }
  }
  return out;
}
