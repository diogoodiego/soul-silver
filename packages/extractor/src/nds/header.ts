import { readAscii, readU16, readU32 } from "../binary.ts";
import { crc16 } from "../rom/crc16.ts";

// DS cartridge header; see specs/003-rom-extraction-pipeline/research.md R1 and R4.

export class NdsFormatError extends Error {
  override name = "NdsFormatError";
}

export const NDS_HEADER_SIZE = 0x4000;
export const LOGO_CRC = 0xcf56;
const BANNER_SIZE = 0x840;
/** Bytes covered by the header CRC plus the CRC fields themselves. */
export const HEADER_CHECK_SIZE = 0x160;

export interface Section {
  offset: number;
  size: number;
}

export interface NdsHeader {
  title: string;
  gameCode: string;
  arm9: Section;
  arm7: Section;
  fnt: Section;
  fat: Section;
  y9: Section;
  y7: Section;
  banner: Section;
}

/** Checks the Nintendo logo CRC and the header CRC16; needs only the first 0x160 bytes. */
export function checkHeaderCrcs(bytes: Uint8Array): "ok" | "logo" | "header" {
  if (bytes.length < HEADER_CHECK_SIZE) return "header";
  if (readU16(bytes, 0x15c) !== LOGO_CRC) return "logo";
  if (readU16(bytes, 0x15e) !== crc16(bytes, 0, 0x15e)) return "header";
  return "ok";
}

export function readTitle(bytes: Uint8Array): string {
  return readAscii(bytes, 0x00, 12);
}

export function readGameCode(bytes: Uint8Array): string {
  return readAscii(bytes, 0x0c, 4);
}

/** Parses a full ROM's header and checks that every section lies inside the ROM. */
export function parseNdsHeader(rom: Uint8Array): NdsHeader {
  const crcs = checkHeaderCrcs(rom);
  if (crcs === "logo") throw new NdsFormatError("Invalid Nintendo logo CRC");
  if (crcs === "header") throw new NdsFormatError("Invalid header CRC");

  const section = (name: string, offsetField: number, sizeField: number | number[]): Section => {
    const offset = readU32(rom, offsetField);
    const size = typeof sizeField === "number" ? readU32(rom, sizeField) : sizeField[0]!;
    if (offset + size > rom.length) {
      throw new NdsFormatError(`Section ${name} (0x${offset.toString(16)} + 0x${size.toString(16)}) ends beyond the ROM`);
    }
    return { offset, size };
  };
  const bannerOffset = readU32(rom, 0x68);
  return {
    title: readTitle(rom),
    gameCode: readGameCode(rom),
    arm9: section("arm9", 0x20, 0x2c),
    arm7: section("arm7", 0x30, 0x3c),
    fnt: section("fnt", 0x40, 0x44),
    fat: section("fat", 0x48, 0x4c),
    y9: section("y9", 0x50, 0x54),
    y7: section("y7", 0x58, 0x5c),
    banner: bannerOffset === 0 ? { offset: 0, size: 0 } : section("banner", 0x68, [BANNER_SIZE]),
  };
}
