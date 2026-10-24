import { PIECE_TILES } from "@soulsilver/shared/maps";
import { readAscii, readU16, readU32 } from "../binary.ts";

// Land data (one map piece): permissions, buildings, terrain model and BDHC heights.
// Layout and plane convention confirmed on the ROM (research.md R0).

export class PieceFormatError extends Error {
  override name = "PieceFormatError";
}

/** World units per tile side. */
export const TILE_UNITS = 16;

export interface Building {
  model: number;
  /** World units. */
  position: [number, number, number];
  scale: [number, number, number];
}

export interface Piece {
  /** PIECE_TILES^2 original permission values, row by row (z, then x). */
  permissions: number[];
  buildings: Building[];
  /** NSBMD bytes; empty when the piece has no model. */
  model: Uint8Array;
  /** Per tile, the heights (world units) of every surface over its center, lowest first. */
  tileHeights: number[][];
}

const fx32 = (b: Uint8Array, o: number) => (readU32(b, o) | 0) / 4096;

interface Plate {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  height: (x: number, z: number) => number;
}

function readPlates(b: Uint8Array, h: number): Plate[] {
  if (readAscii(b, h, 4) !== "BDHC") throw new PieceFormatError("Height section without BDHC magic");
  const [points, normals, constants, plates] = [4, 6, 8, 10].map((o) => readU16(b, h + o)) as [number, number, number, number];
  const pointAt = h + 16;
  const normalAt = pointAt + points * 8;
  const constantAt = normalAt + normals * 12;
  const plateAt = constantAt + constants * 4;
  return Array.from({ length: plates }, (_, i) => {
    const o = plateAt + i * 8;
    const [p1, p2, n, c] = [0, 2, 4, 6].map((k) => readU16(b, o + k)) as [number, number, number, number];
    const [ax, az, bx, bz] = [fx32(b, pointAt + p1 * 8), fx32(b, pointAt + p1 * 8 + 4), fx32(b, pointAt + p2 * 8), fx32(b, pointAt + p2 * 8 + 4)];
    const [nx, ny, nz] = [0, 4, 8].map((k) => fx32(b, normalAt + n * 12 + k)) as [number, number, number];
    const d = fx32(b, constantAt + c * 4);
    return {
      x0: Math.min(ax, bx),
      x1: Math.max(ax, bx),
      z0: Math.min(az, bz),
      z1: Math.max(az, bz),
      // "+ 0" turns -0 into 0.
      height: (x: number, z: number) => (ny === 0 ? 0 : -(nx * x + nz * z + d) / ny + 0),
    };
  });
}

export function readPiece(b: Uint8Array): Piece {
  if (b.length < 0x14 || readU16(b, 0x10) !== 0x1234) throw new PieceFormatError("Missing the HGSS land data header (0x1234)");
  const [permSize, buildSize, modelSize, heightSize] = [0, 4, 8, 12].map((o) => readU32(b, o)) as [number, number, number, number];
  const permAt = 0x14 + readU16(b, 0x12);
  const buildAt = permAt + permSize;
  const modelAt = buildAt + buildSize;
  const heightAt = modelAt + modelSize;
  if (heightAt + heightSize !== b.length) throw new PieceFormatError(`Sections add up to ${heightAt + heightSize} bytes, file has ${b.length}`);
  if (permSize !== PIECE_TILES * PIECE_TILES * 2) throw new PieceFormatError(`Permissions are ${permSize} bytes`);
  if (buildSize % 48 !== 0) throw new PieceFormatError(`Buildings are ${buildSize} bytes, not 48-byte records`);

  const permissions = Array.from({ length: PIECE_TILES * PIECE_TILES }, (_, i) => readU16(b, permAt + i * 2));
  const buildings = Array.from({ length: buildSize / 48 }, (_, i): Building => {
    const o = buildAt + i * 48;
    return {
      model: readU32(b, o),
      position: [fx32(b, o + 4), fx32(b, o + 8), fx32(b, o + 12)],
      scale: [fx32(b, o + 28), fx32(b, o + 32), fx32(b, o + 36)],
    };
  });

  const plates = heightSize > 0 ? readPlates(b, heightAt) : [];
  const half = (PIECE_TILES * TILE_UNITS) / 2;
  const tileHeights = Array.from({ length: PIECE_TILES * PIECE_TILES }, (_, i) => {
    const x = -half + (i % PIECE_TILES) * TILE_UNITS + TILE_UNITS / 2;
    const z = -half + Math.floor(i / PIECE_TILES) * TILE_UNITS + TILE_UNITS / 2;
    const heights: number[] = [];
    for (const p of plates) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const y = p.height(x, z);
      if (!heights.some((h) => Math.abs(h - y) < 0.5)) heights.push(y);
    }
    return heights.sort((a, c) => a - c);
  });

  return { permissions, buildings, model: b.subarray(modelAt, heightAt), tileHeights };
}
