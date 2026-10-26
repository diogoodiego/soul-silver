import { readAscii, readU16, readU32 } from "../binary.ts";
import type { RgbaImage } from "../maps/png.ts";
import { GraphicsFormatError, type Ncgr } from "../sprites/nitro-gfx.ts";

// NSCR (background screen) files: a tile map over an NCGR, the DS 2D backgrounds (spec 017).

export interface Nscr {
  /** Size in pixels. */
  width: number;
  height: number;
  /** One u16 per 8x8 cell: tile index (bits 0–9), horizontal flip (10), vertical flip (11), palette bank (12–15). */
  cells: Uint16Array;
}

export function readNscr(bytes: Uint8Array): Nscr {
  if (bytes.length < 0x24 || readAscii(bytes, 0, 4) !== "RCSN") throw new GraphicsFormatError("Not a RCSN file");
  if (readAscii(bytes, 0x10, 4) !== "NRCS") throw new GraphicsFormatError("RCSN without a NRCS block");
  const width = readU16(bytes, 0x18);
  const height = readU16(bytes, 0x1a);
  const size = readU32(bytes, 0x20);
  const start = 0x24;
  if (start + size > bytes.length || size < (width / 8) * (height / 8) * 2) throw new GraphicsFormatError("NSCR cells exceed the file");
  const cells = new Uint16Array((width / 8) * (height / 8));
  for (let i = 0; i < cells.length; i++) cells[i] = readU16(bytes, start + i * 2);
  return { width, height, cells };
}

const five = (c: number) => (c << 3) | (c >> 2);

/** Draws a screen; index 0 of each palette bank is transparent. Tiles past the graphic stay transparent. */
export function renderScreen(gfx: Ncgr, palette: readonly number[], screen: Nscr): RgbaImage {
  const { width, height } = screen;
  const data = new Uint8Array(width * height * 4);
  const tileBytes = gfx.bitsPerPixel * 8;
  const tileCount = Math.floor(gfx.data.length / tileBytes);
  const cols = width / 8;
  screen.cells.forEach((cell, i) => {
    const tile = cell & 0x3ff;
    if (tile >= tileCount) return;
    const hflip = (cell & 0x400) !== 0;
    const vflip = (cell & 0x800) !== 0;
    const bank = gfx.bitsPerPixel === 4 ? (cell >> 12) * 16 : 0;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const p = y * 8 + x;
        const byte = gfx.data[tile * tileBytes + (gfx.bitsPerPixel === 4 ? p >> 1 : p)]!;
        const index = gfx.bitsPerPixel === 4 ? (p & 1 ? byte >> 4 : byte & 15) : byte;
        if (index === 0) continue;
        const color = palette[bank + index];
        if (color === undefined) continue;
        const px = (i % cols) * 8 + (hflip ? 7 - x : x);
        const py = Math.floor(i / cols) * 8 + (vflip ? 7 - y : y);
        data.set([five(color & 31), five((color >> 5) & 31), five((color >> 10) & 31), 255], (py * width + px) * 4);
      }
  });
  return { width, height, data };
}
