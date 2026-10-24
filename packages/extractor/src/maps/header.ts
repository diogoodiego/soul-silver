import { MAP_FORMAT_VERSION, type MapHeader, type MapHeadersFile } from "@soulsilver/shared/maps";
import { readU16 } from "../binary.ts";

// Map headers: a table of 24-byte entries in the decompressed ARM9 (research.md R0).
// The offset is fixed because the extractor accepts a single ROM, checked by hash (003).

export class HeaderFormatError extends Error {
  override name = "HeaderFormatError";
}

export const MAP_HEADER_OFFSET = 0xf6be0;
export const MAP_HEADER_COUNT = 540;
export const MAP_HEADER_SIZE = 24;
const ENTRY = MAP_HEADER_SIZE;
const NO_ENCOUNTERS = 0xff;

/** Member counts of the archives the headers point into. */
export interface ArchiveCounts {
  areas: number;
  matrices: number;
  scripts: number;
  messages: number;
  events: number;
  encounters: number;
}

/** Area data byte 6 = 0: indoor (room models); byte 7 = 0: cave; otherwise outdoor. */
export function areaType(area: Uint8Array): MapHeader["areaType"] {
  if (area[6] === 0) return "indoor";
  return area[7] === 0 ? "cave" : "outdoor";
}

export function readMapHeaders(arm9: Uint8Array, areas: Uint8Array[], counts: ArchiveCounts, offset = MAP_HEADER_OFFSET): MapHeadersFile {
  if (offset + MAP_HEADER_COUNT * ENTRY > arm9.length) throw new HeaderFormatError("Map header table runs past the ARM9 code");
  const records = Array.from({ length: MAP_HEADER_COUNT }, (_, id): MapHeader => {
    const o = offset + id * ENTRY;
    const encounters = arm9[o]!;
    const fields = {
      area: arm9[o + 1]!,
      matrix: readU16(arm9, o + 4),
      scripts: readU16(arm9, o + 6),
      messages: readU16(arm9, o + 10),
      events: readU16(arm9, o + 16),
      encounters: encounters === NO_ENCOUNTERS ? 0 : encounters,
    };
    const limits: Record<keyof typeof fields, number> = {
      area: counts.areas,
      matrix: counts.matrices,
      scripts: counts.scripts,
      messages: counts.messages,
      events: counts.events,
      encounters: counts.encounters,
    };
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      if (fields[key] >= limits[key]) throw new HeaderFormatError(`Map header ${id}: ${key} ${fields[key]} is outside its archive (${limits[key]})`);
    }
    return {
      id,
      mapsec: arm9[o + 18]!,
      areaType: areaType(areas[fields.area]!),
      area: fields.area,
      matrix: fields.matrix,
      musicDay: readU16(arm9, o + 12),
      musicNight: readU16(arm9, o + 14),
      weather: arm9[o + 20]!,
      refs: {
        events: fields.events,
        scripts: fields.scripts,
        messages: fields.messages,
        encounters: encounters === NO_ENCOUNTERS ? null : encounters,
      },
    };
  });
  return { kind: "map-headers", formatVersion: MAP_FORMAT_VERSION, records };
}
