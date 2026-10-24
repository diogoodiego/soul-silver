import type { RgbaImage } from "../maps/png.ts";
import type { Ncgr } from "./nitro-gfx.ts";

export class PaletteError extends Error {
  override name = "PaletteError";
}

const five = (c: number) => (c << 3) | (c >> 2);

/** Palette index of every pixel, row by row. */
export function pixelIndices(gfx: Ncgr, pixels: Uint8Array = gfx.data): Uint8Array {
  const width = gfx.tilesWide * 8;
  const height = gfx.tilesHigh * 8;
  const out = new Uint8Array(width * height);
  const bytesPerRow = gfx.bitsPerPixel === 4 ? width / 2 : width;
  const read = (offset: number, x: number) => {
    const byte = pixels[offset] ?? 0;
    return gfx.bitsPerPixel === 8 ? byte : x & 1 ? byte >> 4 : byte & 15;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let offset: number;
      if (gfx.scanned) offset = y * bytesPerRow + (gfx.bitsPerPixel === 4 ? x >> 1 : x);
      else {
        const tile = (y >> 3) * gfx.tilesWide + (x >> 3);
        const inTile = (y & 7) * 8 + (x & 7);
        offset = tile * (gfx.bitsPerPixel === 4 ? 32 : 64) + (gfx.bitsPerPixel === 4 ? inTile >> 1 : inTile);
      }
      out[y * width + x] = read(offset, gfx.scanned ? x : x & 7);
    }
  }
  return out;
}

/**
 * Indices + BGR555 palette -> RGBA. Index 0 is transparent (FR-012); the other colors are
 * expanded without artistic adjustment. Fails when the graphic uses an index the palette lacks.
 */
export function toRgba(indices: Uint8Array, width: number, height: number, palette: readonly number[], label: string): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i]!;
    if (index === 0) continue;
    const color = palette[index];
    if (color === undefined) throw new PaletteError(`${label}: the graphic uses color ${index} but the palette has ${palette.length}`);
    data.set([five(color & 31), five((color >> 5) & 31), five((color >> 10) & 31), 255], i * 4);
  }
  return { width, height, data };
}

/** Crops a region out of an image. */
export function crop(image: RgbaImage, x: number, y: number, w: number, h: number): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) data.set(image.data.subarray(((y + row) * image.width + x) * 4, ((y + row) * image.width + x + w) * 4), row * w * 4);
  return { width: w, height: h, data };
}

/**
 * Some graphics (icons, items, trainers) store 0xFFFF as their size; the width comes from the
 * caller and the height from the amount of pixel data.
 */
export function withWidth(gfx: Ncgr, tilesWide: number): Ncgr {
  const tileBytes = gfx.bitsPerPixel === 4 ? 32 : 64;
  const tiles = gfx.data.length / tileBytes;
  if (!Number.isInteger(tiles) || tiles % tilesWide !== 0) {
    throw new RangeError(`${gfx.data.length} bytes of pixels do not fill ${tilesWide} tiles per row`);
  }
  return { ...gfx, tilesWide, tilesHigh: tiles / tilesWide };
}
