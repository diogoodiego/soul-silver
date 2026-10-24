import type { MapArea } from "@soulsilver/shared/maps";
import { readAscii, readU16 } from "../binary.ts";

// Area matrix: u8 width, height, has map grid, has height grid, name length, name; then the
// u16 map grid, the u8 height grid and the u16 piece grid (research.md R0). 0xffff = empty.

export class MatrixFormatError extends Error {
  override name = "MatrixFormatError";
}

const EMPTY = 0xffff;

export function readMatrix(b: Uint8Array, id: number): MapArea {
  if (b.length < 5) throw new MatrixFormatError(`Matrix ${id}: header is truncated`);
  const [width, height, hasMaps, hasHeights, nameLength] = [b[0]!, b[1]!, b[2]!, b[3]!, b[4]!];
  const cells = width * height;
  const mapsAt = 5 + nameLength;
  const heightsAt = mapsAt + (hasMaps ? cells * 2 : 0);
  const piecesAt = heightsAt + (hasHeights ? cells : 0);
  if (piecesAt + cells * 2 !== b.length) throw new MatrixFormatError(`Matrix ${id}: ${width}x${height} grids need ${piecesAt + cells * 2} bytes, file has ${b.length}`);

  const grid = (at: number) => Array.from({ length: cells }, (_, i) => {
    const value = readU16(b, at + i * 2);
    return value === EMPTY ? null : value;
  });
  return {
    id,
    name: readAscii(b, 5, nameLength),
    width,
    height,
    pieces: grid(piecesAt),
    heights: hasHeights ? Array.from(b.subarray(heightsAt, heightsAt + cells)) : null,
    maps: hasMaps ? grid(mapsAt) : null,
  };
}
